#!/usr/bin/env python3
"""Run SkillOpt with Codex CLI as an optimizer backend.

SkillOpt 0.1.0 ships Codex exec support for target rollouts, but its optimizer
backend registry only accepts chat API providers. This runner keeps the
third-party package untouched and installs a small in-memory compatibility
patch before importing the trainer/evaluator modules.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import uuid
from typing import Any


CODEX_CHAT_BACKEND = "codex_exec"
CHAT_BACKENDS = {
    "openai_chat",
    "claude_chat",
    "qwen_chat",
    "minimax_chat",
    CODEX_CHAT_BACKEND,
}

_optimizer_backend = os.environ.get("OPTIMIZER_BACKEND", CODEX_CHAT_BACKEND)
_optimizer_model = (
    os.environ.get("SKILLOPT_OPTIMIZER_MODEL")
    or os.environ.get("CODEX_MODEL")
    or ""
)


def _message_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        chunks: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                chunks.append(str(item.get("text", "")))
            else:
                chunks.append(json.dumps(item, ensure_ascii=False))
        return "\n".join(chunks)
    return str(content)


def _messages_to_prompt(messages: list[dict[str, Any]]) -> str:
    parts = [
        "You are the SkillOpt optimizer backend, running through Codex CLI.",
        "Follow the system/developer instructions exactly and return the final requested artifact only.",
    ]
    for message in messages:
        role = str(message.get("role", "user")).upper()
        text = _message_text(message.get("content", "")).strip()
        if text:
            parts.append(f"{role}:\n{text}")
    return "\n\n".join(parts)


def _compat_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "content": {"type": "string"},
            "tool_calls": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "arguments": {"type": "string"},
                    },
                    "required": ["name", "arguments"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["content", "tool_calls"],
        "additionalProperties": False,
    }


def _usage_from_jsonl(stdout: str) -> dict[str, int]:
    usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    for raw in stdout.splitlines():
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if payload.get("type") != "turn.completed":
            continue
        turn_usage = payload.get("usage") or {}
        prompt_tokens = int(turn_usage.get("input_tokens", 0) or 0)
        completion_tokens = int(turn_usage.get("output_tokens", 0) or 0)
        usage = {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        }
    return usage


def _codex_error(stdout: str, stderr: str) -> str:
    for raw in reversed(stdout.splitlines()):
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if payload.get("type") == "turn.failed":
            error = payload.get("error") or {}
            return str(error.get("message") or "Codex turn failed")
        if payload.get("type") == "error":
            return str(payload.get("message") or "Codex execution failed")
    return (stderr or stdout or "Codex execution failed").strip()


def _run_codex_cli(
    prompt: str,
    *,
    model: str,
    reasoning_effort: str | None = None,
    output_schema: dict[str, Any] | None = None,
    timeout: int | None = None,
) -> tuple[str, dict[str, int]]:
    codex_bin = (
        os.environ.get("SKILLOPT_CODEX_BIN")
        or os.environ.get("CODEX_EXEC_PATH")
        or os.environ.get("CODEX_CLI_BIN")
        or "codex"
    )
    sandbox = os.environ.get("SKILLOPT_CODEX_SANDBOX") or os.environ.get(
        "CODEX_EXEC_SANDBOX",
        "read-only",
    )
    profile = os.environ.get("SKILLOPT_CODEX_PROFILE") or os.environ.get(
        "CODEX_EXEC_PROFILE",
        "",
    )
    cwd = os.environ.get("SKILLOPT_CODEX_CWD") or os.getcwd()
    effort = (
        reasoning_effort
        or os.environ.get("SKILLOPT_CODEX_REASONING_EFFORT")
        or os.environ.get("CODEX_EXEC_REASONING_EFFORT")
        or ""
    )
    effort = "" if effort == "none" else effort
    effective_timeout = timeout or int(os.environ.get("SKILLOPT_CODEX_TIMEOUT", "900"))

    with tempfile.TemporaryDirectory(prefix="skillopt_codex_cli_") as temp_dir:
        output_path = os.path.join(temp_dir, "last_message.txt")
        cmd = [
            codex_bin,
            "exec",
            "--json",
            "--ephemeral",
            "--skip-git-repo-check",
            "--cd",
            cwd,
            "--sandbox",
            sandbox,
            "-c",
            'approval_policy="never"',
            "--output-last-message",
            output_path,
        ]
        if model:
            cmd.extend(["--model", model])
        if profile:
            cmd.extend(["--profile", profile])
        if effort:
            cmd.extend(["-c", f"model_reasoning_effort={json.dumps(effort)}"])
        if output_schema is not None:
            schema_path = os.path.join(temp_dir, "schema.json")
            with open(schema_path, "w", encoding="utf-8") as f:
                json.dump(output_schema, f, ensure_ascii=False)
            cmd.extend(["--output-schema", schema_path])
        cmd.append("-")

        proc = subprocess.run(
            cmd,
            input=prompt,
            text=True,
            capture_output=True,
            timeout=effective_timeout,
            check=False,
        )
        if proc.returncode != 0:
            raise RuntimeError(_codex_error(proc.stdout or "", proc.stderr or ""))
        last_message = ""
        if os.path.exists(output_path):
            with open(output_path, encoding="utf-8") as f:
                last_message = f.read().strip()
        if not last_message:
            raise RuntimeError("Codex CLI returned an empty final message")
        return last_message, _usage_from_jsonl(proc.stdout or "")


def _codex_chat_optimizer(
    system: str,
    user: str,
    max_completion_tokens: int = 16384,
    retries: int = 5,
    stage: str = "optimizer",
    reasoning_effort: str | None = None,
    timeout: int | None = None,
) -> tuple[str, dict[str, int]]:
    del max_completion_tokens
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    return _codex_chat_optimizer_messages(
        messages,
        retries=retries,
        stage=stage,
        reasoning_effort=reasoning_effort,
        timeout=timeout,
    )


def _codex_chat_optimizer_messages(
    messages: list[dict[str, Any]],
    max_completion_tokens: int = 16384,
    retries: int = 5,
    stage: str = "optimizer",
    reasoning_effort: str | None = None,
    *,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | dict[str, Any] | None = None,
    return_message: bool = False,
    timeout: int | None = None,
) -> tuple[Any, dict[str, int]]:
    del max_completion_tokens
    from skillopt.model.common import (
        CompatAssistantMessage,
        CompatToolCall,
        CompatToolFunction,
        tracker,
    )

    prompt = _messages_to_prompt(messages)
    structured = bool(tools) or return_message
    if tools:
        prompt += (
            "\n\nAvailable compatibility tools:\n"
            + json.dumps(tools, ensure_ascii=False, indent=2)
            + "\n\nIf a tool is needed, return JSON with `content` and `tool_calls`."
        )
    if tool_choice == "required":
        prompt += "\n\nTool choice policy: request at least one compatibility tool."
    elif isinstance(tool_choice, dict):
        name = ((tool_choice.get("function") or {}).get("name") or "").strip()
        if name:
            prompt += f"\n\nTool choice policy: request the compatibility tool `{name}`."

    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            response, usage = _run_codex_cli(
                prompt,
                model=_optimizer_model,
                reasoning_effort=reasoning_effort,
                output_schema=_compat_schema() if structured else None,
                timeout=timeout,
            )
            tracker.record(stage, usage["prompt_tokens"], usage["completion_tokens"])
            if not structured:
                return response, usage
            payload = json.loads(response)
            tool_calls = []
            for index, raw in enumerate(payload.get("tool_calls") or [], 1):
                if not isinstance(raw, dict):
                    continue
                arguments = raw.get("arguments", "{}")
                if not isinstance(arguments, str):
                    arguments = json.dumps(arguments, ensure_ascii=False)
                tool_calls.append(
                    CompatToolCall(
                        id=f"tool_{index}_{uuid.uuid4().hex[:12]}",
                        function=CompatToolFunction(
                            name=str(raw.get("name", "") or ""),
                            arguments=arguments,
                        ),
                    ),
                )
            message = CompatAssistantMessage(
                content=str(payload.get("content", "") or ""),
                tool_calls=tool_calls,
            )
            return (message if return_message else message.content), usage
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            time.sleep(min(2**attempt, 30))
    raise RuntimeError(f"Codex optimizer call failed after {retries} retries: {last_err}")


def install_codex_optimizer_patch() -> None:
    import skillopt.model as model
    from skillopt.model import backend_config
    from skillopt.model.common import normalize_backend_name

    original_set_optimizer_backend = model.set_optimizer_backend
    original_get_optimizer_backend = model.get_optimizer_backend
    original_chat_optimizer = model.chat_optimizer
    original_chat_optimizer_messages = model.chat_optimizer_messages
    original_set_optimizer_deployment = model.set_optimizer_deployment

    def set_optimizer_backend(backend: str | None) -> None:
        global _optimizer_backend
        normalized = normalize_backend_name(backend or CODEX_CHAT_BACKEND)
        if normalized == "codex":
            normalized = CODEX_CHAT_BACKEND
        if normalized == CODEX_CHAT_BACKEND:
            backend_config.OPTIMIZER_BACKEND = CODEX_CHAT_BACKEND
            os.environ["OPTIMIZER_BACKEND"] = CODEX_CHAT_BACKEND
            _optimizer_backend = CODEX_CHAT_BACKEND
            return
        original_set_optimizer_backend(normalized)
        _optimizer_backend = normalized

    def get_optimizer_backend() -> str:
        if _optimizer_backend == CODEX_CHAT_BACKEND:
            return CODEX_CHAT_BACKEND
        return original_get_optimizer_backend()

    def chat_optimizer(*args: Any, **kwargs: Any) -> tuple[str, dict[str, int]]:
        if get_optimizer_backend() == CODEX_CHAT_BACKEND:
            return _codex_chat_optimizer(*args, **kwargs)
        return original_chat_optimizer(*args, **kwargs)

    def chat_optimizer_messages(*args: Any, **kwargs: Any) -> tuple[Any, dict[str, int]]:
        if get_optimizer_backend() == CODEX_CHAT_BACKEND:
            return _codex_chat_optimizer_messages(*args, **kwargs)
        return original_chat_optimizer_messages(*args, **kwargs)

    def set_optimizer_deployment(deployment: str) -> None:
        global _optimizer_model
        if deployment:
            _optimizer_model = str(deployment)
            os.environ["SKILLOPT_OPTIMIZER_MODEL"] = str(deployment)
        original_set_optimizer_deployment(deployment)

    model.set_optimizer_backend = set_optimizer_backend
    model.get_optimizer_backend = get_optimizer_backend
    model.chat_optimizer = chat_optimizer
    model.chat_optimizer_messages = chat_optimizer_messages
    model.set_optimizer_deployment = set_optimizer_deployment
    backend_config.set_optimizer_backend = set_optimizer_backend
    backend_config.get_optimizer_backend = get_optimizer_backend
    backend_config.is_optimizer_chat_backend = lambda: get_optimizer_backend() in CHAT_BACKENDS


def _run_train(argv: list[str]) -> None:
    install_codex_optimizer_patch()
    import scripts.train as train

    sys.argv = ["skillopt-train", *argv]
    train.main()


def _run_eval(argv: list[str]) -> None:
    install_codex_optimizer_patch()
    import scripts.eval_only as eval_only

    sys.argv = ["skillopt-eval", *argv]
    eval_only.main()


def _run_validate(config_path: str) -> None:
    install_codex_optimizer_patch()
    from skillopt.config import flatten_config, load_config
    from skillopt.model import get_optimizer_backend, set_optimizer_backend

    cfg = flatten_config(load_config(config_path))
    set_optimizer_backend(cfg.get("optimizer_backend", CODEX_CHAT_BACKEND))
    payload = {
        "optimizer_backend": get_optimizer_backend(),
        "target_backend": cfg.get("target_backend"),
        "optimizer_model": cfg.get("optimizer_model"),
        "target_model": cfg.get("target_model"),
    }
    print(json.dumps(payload, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser(description="SkillOpt Codex CLI compatibility runner")
    parser.add_argument("command", choices=["train", "eval", "validate"])
    parser.add_argument("args", nargs=argparse.REMAINDER)
    parsed = parser.parse_args()

    if parsed.command == "train":
        _run_train(parsed.args)
        return
    if parsed.command == "eval":
        _run_eval(parsed.args)
        return
    config = "tools/skillopt/configs/dispatch-routing-smoke.yaml"
    rest = list(parsed.args)
    if rest[:1] == ["--config"] and len(rest) >= 2:
        config = rest[1]
    _run_validate(config)


if __name__ == "__main__":
    main()
