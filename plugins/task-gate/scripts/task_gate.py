#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Protocol
from urllib import error as urllib_error
from urllib import request as urllib_request


PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "tasks": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "title": {"type": "string", "minLength": 1},
                    "details": {"type": "string"},
                    "acceptance_criteria": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": ["title"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["tasks"],
    "additionalProperties": False,
}


class PlanError(RuntimeError):
    pass


class Thinker(Protocol):
    def think(self, prompt: str) -> str:
        pass


CLAUDE_SETTINGS_FILENAMES = ("settings.json", "settings.local.json")
CLAUDE_API_VERSION = "2023-06-01"
DEFAULT_CLAUDE_API_BASE_URL = "https://api.anthropic.com"


@dataclass(frozen=True)
class Task:
    id: int
    title: str
    details: str = ""
    acceptance_criteria: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {"id": self.id, "title": self.title}
        if self.details:
            data["details"] = self.details
        if self.acceptance_criteria:
            data["acceptance_criteria"] = self.acceptance_criteria
        return data


@dataclass(frozen=True)
class TaskPlan:
    source_prompt: str
    tasks: list[Task]

    def as_numbered_text(self) -> str:
        return "\n".join(f"{task.id}. {task.title}" for task in self.tasks)

    def to_dict(self) -> dict[str, Any]:
        return {
            "source_prompt": self.source_prompt,
            "tasks": [task.to_dict() for task in self.tasks],
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)


class ClaudeCliThinker:
    def __init__(
        self,
        command: str | None = None,
        runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
        timeout_seconds: int | None = None,
    ) -> None:
        self.command = command or os.environ.get("TASK_GATE_CLAUDE_BIN", "claude")
        self.runner = runner
        self.timeout_seconds = timeout_seconds or int(
            os.environ.get("TASK_GATE_CLAUDE_TIMEOUT", "120")
        )

    def think(self, prompt: str) -> str:
        args = [
            self.command,
            "--print",
            "--output-format",
            "text",
            "--no-session-persistence",
            "--disable-slash-commands",
            "--tools",
            "",
            "--json-schema",
            json.dumps(PLAN_SCHEMA, separators=(",", ":")),
            prompt,
        ]
        try:
            completed = self.runner(
                args,
                text=True,
                capture_output=True,
                timeout=self.timeout_seconds,
                check=True,
            )
        except FileNotFoundError as exc:
            raise PlanError(f"claude command not found: {self.command}") from exc
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or "").strip()
            message = stderr or f"claude exited with status {exc.returncode}"
            raise PlanError(message) from exc
        except subprocess.TimeoutExpired as exc:
            raise PlanError("claude task planning timed out") from exc

        output = (completed.stdout or "").strip()
        if not output:
            raise PlanError("claude returned an empty plan")
        return output


class ClaudeApiThinker:
    def __init__(
        self,
        env: dict[str, str] | None = None,
        urlopen: Callable[..., Any] = urllib_request.urlopen,
        timeout_seconds: int | None = None,
    ) -> None:
        self.env = env or build_claude_env()
        self.urlopen = urlopen
        self.timeout_seconds = timeout_seconds or int(
            self.env.get("TASK_GATE_CLAUDE_API_TIMEOUT")
            or self.env.get("TASK_GATE_CLAUDE_TIMEOUT")
            or "15"
        )
        self.model = (
            self.env.get("TASK_GATE_CLAUDE_MODEL")
            or self.env.get("ANTHROPIC_MODEL")
            or self.env.get("ANTHROPIC_DEFAULT_SONNET_MODEL_NAME")
            or self.env.get("ANTHROPIC_DEFAULT_SONNET_MODEL")
            or "claude-sonnet-4-5"
        )
        self.max_tokens = int(self.env.get("TASK_GATE_CLAUDE_MAX_TOKENS", "1024"))

    def is_configured(self) -> bool:
        return bool(self.env.get("ANTHROPIC_API_KEY") or self.env.get("ANTHROPIC_AUTH_TOKEN"))

    def think(self, prompt: str) -> str:
        if not self.is_configured():
            raise PlanError("Claude API credentials are not configured")

        last_output = ""
        for attempt in range(2):
            last_output = self._think_once(prompt)
            if last_output.strip():
                return last_output.strip()
        raise PlanError("Claude API returned an empty plan")

    def _think_once(self, prompt: str) -> str:
        payload = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "messages": [{"role": "user", "content": prompt}],
            "output_config": {
                "format": {
                    "type": "json_schema",
                    "schema": PLAN_SCHEMA,
                }
            },
        }
        request = urllib_request.Request(
            _claude_messages_url(self.env),
            data=json.dumps(payload).encode("utf-8"),
            headers=_claude_api_headers(self.env),
            method="POST",
        )
        try:
            with self.urlopen(
                request,
                timeout=self.timeout_seconds,
                context=_claude_ssl_context(self.env),
            ) as response:
                response_payload = json.loads(response.read().decode("utf-8"))
        except urllib_error.HTTPError as exc:
            raise PlanError(_http_error_message(exc)) from exc
        except urllib_error.URLError as exc:
            raise PlanError(f"Claude API request failed: {exc.reason}") from exc
        except TimeoutError as exc:
            raise PlanError("Claude API task planning timed out") from exc
        except OSError as exc:
            raise PlanError(f"Claude API request failed: {exc}") from exc
        except json.JSONDecodeError as exc:
            raise PlanError("Claude API returned invalid JSON") from exc

        return _extract_claude_message_text(response_payload)


class FallbackThinker:
    def __init__(self, primary: Thinker, fallback: Thinker) -> None:
        self.primary = primary
        self.fallback = fallback

    def think(self, prompt: str) -> str:
        try:
            return self.primary.think(prompt)
        except PlanError as exc:
            print(
                f"task-gate: primary thinker failed; falling back to CLI: {exc}",
                file=sys.stderr,
            )
            return self.fallback.think(prompt)


def build_default_thinker() -> Thinker:
    mode = os.environ.get("TASK_GATE_THINKER", "auto").strip().lower()
    if mode == "cli":
        return ClaudeCliThinker()
    if mode == "api":
        return ClaudeApiThinker()
    if mode and mode != "auto":
        raise PlanError("TASK_GATE_THINKER must be one of: auto, api, cli")

    api_thinker = ClaudeApiThinker()
    if api_thinker.is_configured():
        return FallbackThinker(primary=api_thinker, fallback=ClaudeCliThinker())
    return ClaudeCliThinker()


def load_claude_settings_env(paths: list[Path] | None = None) -> dict[str, str]:
    settings_env: dict[str, str] = {}
    for path in paths or default_claude_settings_paths():
        if not path.exists():
            continue
        try:
            payload = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        env = payload.get("env")
        if not isinstance(env, dict):
            continue
        for key, value in env.items():
            if isinstance(key, str) and isinstance(value, str):
                settings_env[key] = value
    return settings_env


def default_claude_settings_paths() -> list[Path]:
    home_settings = [Path.home() / ".claude" / name for name in CLAUDE_SETTINGS_FILENAMES]
    cwd_settings = [Path.cwd() / ".claude" / name for name in CLAUDE_SETTINGS_FILENAMES]
    return home_settings + cwd_settings


def build_claude_env() -> dict[str, str]:
    env = load_claude_settings_env()
    env.update({key: value for key, value in os.environ.items() if isinstance(value, str)})
    return env


def _claude_messages_url(env: dict[str, str]) -> str:
    base_url = (env.get("TASK_GATE_CLAUDE_BASE_URL") or env.get("ANTHROPIC_BASE_URL") or DEFAULT_CLAUDE_API_BASE_URL).rstrip("/")
    if base_url.endswith("/v1/messages"):
        return base_url
    return f"{base_url}/v1/messages"


def _claude_api_headers(env: dict[str, str]) -> dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "Anthropic-Version": env.get("ANTHROPIC_VERSION", CLAUDE_API_VERSION),
    }
    api_key = env.get("ANTHROPIC_API_KEY", "").strip()
    auth_token = env.get("ANTHROPIC_AUTH_TOKEN", "").strip()
    if api_key:
        headers["X-Api-Key"] = api_key
    if auth_token:
        headers["Authorization"] = auth_token if auth_token.lower().startswith("bearer ") else f"Bearer {auth_token}"
    betas = env.get("ANTHROPIC_BETAS", "").strip()
    if betas:
        headers["Anthropic-Beta"] = betas
    return headers


def _claude_ssl_context(env: dict[str, str]) -> ssl.SSLContext:
    if _truthy(env.get("TASK_GATE_CLAUDE_SSL_NO_VERIFY")):
        return ssl._create_unverified_context()

    cafile = env.get("TASK_GATE_CLAUDE_CA_BUNDLE") or os.environ.get("SSL_CERT_FILE")
    if cafile:
        return ssl.create_default_context(cafile=cafile)

    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _truthy(value: str | None) -> bool:
    return bool(value and value.strip().lower() in {"1", "true", "yes", "on"})


def _http_error_message(exc: urllib_error.HTTPError) -> str:
    try:
        body = exc.read().decode("utf-8", errors="replace").strip()
    except Exception:
        body = ""
    if body:
        return f"Claude API returned HTTP {exc.code}: {body[:500]}"
    return f"Claude API returned HTTP {exc.code}"


def _extract_claude_message_text(payload: dict[str, Any]) -> str:
    content = payload.get("content")
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text":
            text = block.get("text")
            if isinstance(text, str):
                parts.append(text)
    return "\n".join(parts)


class TaskPlanner:
    def __init__(self, thinker: Thinker | None = None, max_tasks: int = 8) -> None:
        self.thinker = thinker or build_default_thinker()
        self.max_tasks = max_tasks

    def plan(self, prompt: str) -> TaskPlan:
        if not prompt.strip():
            raise PlanError("prompt must not be blank")
        thinker_prompt = build_thinker_prompt(prompt, self.max_tasks)
        output = self.thinker.think(thinker_prompt)
        return parse_plan_output(output, source_prompt=prompt, max_tasks=self.max_tasks)


def build_thinker_prompt(prompt: str, max_tasks: int = 8) -> str:
    return (
        "You are Task Gate, a planning layer that converts a user's raw prompt "
        "into a short executable task list for Codex.\n"
        "Return only JSON matching this shape: "
        '{"tasks":[{"title":"Task title","details":"optional detail",'
        '"acceptance_criteria":["optional check"]}]}.\n'
        f"Use 1 to {max_tasks} tasks. Each task must be concrete and executable. "
        "Preserve exact filenames, literal text, commands, URLs, identifiers, "
        "and numeric values from the user prompt inside task titles, details, "
        "or acceptance criteria whenever they are needed for execution. "
        "Do not solve the task; only decompose it.\n\n"
        f"User prompt:\n{prompt.strip()}"
    )


def parse_plan_output(
    output: str,
    source_prompt: str,
    max_tasks: int = 8,
) -> TaskPlan:
    if not output.strip():
        raise PlanError("thinker returned an empty plan")

    parsed = _try_parse_json(output)
    if parsed is not None:
        tasks = _tasks_from_json(parsed, max_tasks=max_tasks)
    else:
        tasks = _tasks_from_numbered_text(output, max_tasks=max_tasks)

    if not tasks:
        raise PlanError("thinker did not produce any tasks")
    return TaskPlan(source_prompt=source_prompt, tasks=tasks)


def _try_parse_json(output: str) -> Any | None:
    text = output.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()
    else:
        object_match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if object_match:
            text = object_match.group(0)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _tasks_from_json(parsed: Any, max_tasks: int) -> list[Task]:
    if isinstance(parsed, dict) and isinstance(parsed.get("result"), str):
        nested = _try_parse_json(parsed["result"])
        if nested is not None:
            return _tasks_from_json(nested, max_tasks=max_tasks)

    if not isinstance(parsed, dict) or not isinstance(parsed.get("tasks"), list):
        raise PlanError('JSON plan must contain a "tasks" array')

    tasks: list[Task] = []
    for raw in parsed["tasks"][:max_tasks]:
        task = _task_from_raw(raw, len(tasks) + 1)
        if task is not None:
            tasks.append(task)
    return tasks


def _task_from_raw(raw: Any, task_id: int) -> Task | None:
    if isinstance(raw, str):
        title = raw.strip()
        return Task(id=task_id, title=title) if title else None

    if not isinstance(raw, dict):
        return None

    title = str(
        raw.get("title")
        or raw.get("task")
        or raw.get("description")
        or raw.get("name")
        or ""
    ).strip()
    if not title:
        return None

    details = str(raw.get("details") or raw.get("detail") or "").strip()
    raw_checks = raw.get("acceptance_criteria") or raw.get("checks") or []
    acceptance_criteria = [
        str(item).strip() for item in raw_checks if str(item).strip()
    ] if isinstance(raw_checks, list) else []
    return Task(
        id=task_id,
        title=title,
        details=details,
        acceptance_criteria=acceptance_criteria,
    )


def _tasks_from_numbered_text(output: str, max_tasks: int) -> list[Task]:
    tasks: list[Task] = []
    for line in output.splitlines():
        match = re.match(r"^\s*(?:\d+[\.)]|[-*])\s+(.+?)\s*$", line)
        if not match:
            continue
        title = match.group(1).strip()
        if title:
            tasks.append(Task(id=len(tasks) + 1, title=title))
        if len(tasks) >= max_tasks:
            break
    return tasks


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Convert a raw prompt into tasks.")
    parser.add_argument("prompt", nargs="*", help="Raw user prompt. Reads stdin if omitted.")
    parser.add_argument("--max-tasks", type=int, default=8)
    parser.add_argument("--json", action="store_true", help="Print JSON instead of text.")
    args = parser.parse_args(argv)

    prompt = " ".join(args.prompt).strip() or sys.stdin.read().strip()
    try:
        plan = TaskPlanner(max_tasks=args.max_tasks).plan(prompt)
    except PlanError as exc:
        print(f"task-gate: {exc}", file=sys.stderr)
        return 1

    print(plan.to_json() if args.json else plan.as_numbered_text())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
