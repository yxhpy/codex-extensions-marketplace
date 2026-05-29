#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
if str(PLUGIN_ROOT) not in sys.path:
    sys.path.insert(0, str(PLUGIN_ROOT))

from scripts.task_gate import (  # noqa: E402
    PLAN_SCHEMA,
    PlanError,
    Task,
    TaskPlan,
    TaskPlanner,
    Thinker,
    build_default_thinker,
)


FOLLOWUP_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "complete": {"type": "boolean"},
        "summary": {"type": "string"},
        "next_tasks": PLAN_SCHEMA["properties"]["tasks"],
    },
    "required": ["complete", "summary"],
    "additionalProperties": False,
}


@dataclass(frozen=True)
class GateResult:
    exit_code: int
    output: str = ""


@dataclass(frozen=True)
class CodexRunResult:
    exit_code: int
    output: str = ""


@dataclass(frozen=True)
class FollowupDecision:
    complete: bool
    summary: str = ""
    next_tasks: list[Task] = field(default_factory=list)


class CodexExecutor:
    def __init__(
        self,
        command: str | None = None,
        runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
    ) -> None:
        self.command = command or os.environ.get("TASK_GATE_CODEX_BIN", "codex")
        self.runner = runner

    def execute(
        self,
        codex_prompt: str,
        cwd: str | None = None,
        extra_args: list[str] | None = None,
    ) -> CodexRunResult:
        args = [self.command, "exec", "--skip-git-repo-check"]
        if cwd:
            args.extend(["-C", cwd])
        if extra_args:
            args.extend(extra_args)
        args.append(codex_prompt)

        try:
            completed = self.runner(args, text=True, check=False, capture_output=True)
        except FileNotFoundError as exc:
            raise PlanError(f"codex command not found: {self.command}") from exc

        stdout = (getattr(completed, "stdout", "") or "").strip()
        stderr = (getattr(completed, "stderr", "") or "").strip()
        output = "\n".join(part for part in [stdout, stderr] if part)
        return CodexRunResult(
            exit_code=int(getattr(completed, "returncode", 0)),
            output=output,
        )


class FollowupPlanner:
    def __init__(self, thinker: Thinker | None = None, max_tasks: int = 8) -> None:
        self.thinker = thinker or build_default_thinker(FOLLOWUP_SCHEMA)
        self.max_tasks = max_tasks

    def assess(
        self,
        *,
        plan: TaskPlan,
        codex_output: str,
        exit_code: int,
        round_number: int,
    ) -> FollowupDecision:
        prompt = build_followup_prompt(
            plan=plan,
            codex_output=codex_output,
            exit_code=exit_code,
            round_number=round_number,
            max_tasks=self.max_tasks,
        )
        output = self.thinker.think(prompt)
        return parse_followup_output(output, max_tasks=self.max_tasks)


class CodexGate:
    def __init__(
        self,
        planner: TaskPlanner | None = None,
        executor: CodexExecutor | None = None,
        followup_planner: FollowupPlanner | None = None,
    ) -> None:
        self.planner = planner or TaskPlanner()
        self.executor = executor or CodexExecutor()
        self.followup_planner = followup_planner or FollowupPlanner()

    def run(
        self,
        prompt: str,
        execute: bool = False,
        cwd: str | None = None,
        codex_args: list[str] | None = None,
        max_rounds: int = 3,
    ) -> GateResult:
        try:
            plan = self.planner.plan(prompt)
        except PlanError as exc:
            return GateResult(exit_code=1, output=f"task-gate: {exc}")

        if not execute:
            return GateResult(exit_code=0, output=plan.as_numbered_text())

        if max_rounds < 1:
            return GateResult(exit_code=1, output="task-gate: max_rounds must be at least 1")

        current_plan = plan
        reports = ["Initial task plan:", plan.as_numbered_text()]
        for round_number in range(1, max_rounds + 1):
            codex_prompt = build_codex_execution_prompt(
                current_plan,
                round_number=round_number,
            )
            try:
                run_result = self.executor.execute(
                    codex_prompt,
                    cwd=cwd,
                    extra_args=codex_args,
                )
                decision = self.followup_planner.assess(
                    plan=current_plan,
                    codex_output=run_result.output,
                    exit_code=run_result.exit_code,
                    round_number=round_number,
                )
            except PlanError as exc:
                reports.append(f"task-gate: {exc}")
                return GateResult(exit_code=1, output="\n\n".join(reports))

            reports.append(_format_round_report(round_number, run_result, decision))
            if decision.complete and run_result.exit_code == 0:
                reports.append("Task Gate completion verdict: complete.")
                return GateResult(exit_code=0, output="\n\n".join(reports))

            if decision.complete and run_result.exit_code != 0:
                reports.append(
                    "Task Gate marked the work complete, but Codex exited nonzero; "
                    "continuing because completion is not proven."
                )

            if not decision.next_tasks:
                reports.append(
                    "task-gate: task is not complete and Gate returned no next tasks."
                )
                return GateResult(exit_code=1, output="\n\n".join(reports))

            current_plan = TaskPlan(
                source_prompt=f"Gate follow-up after execution round {round_number}",
                tasks=decision.next_tasks,
            )

        reports.append(
            "task-gate: max execution rounds reached before completion; "
            "refusing to report success while work remains."
        )
        return GateResult(exit_code=1, output="\n\n".join(reports))


def build_codex_execution_prompt(plan: TaskPlan, round_number: int = 1) -> str:
    return (
        "Task Gate has already converted the user's raw request into the "
        "authorized task plan below. Execute only these numbered tasks in order.\n"
        f"This is execution round {round_number}.\n\n"
        f"{_format_execution_plan(plan)}\n\n"
        "Execution rules:\n"
        "- Treat the numbered plan as the task boundary.\n"
        "- Do not reinterpret the original raw request; it is intentionally absent.\n"
        "- If a required task is missing or unsafe, stop and report the blocker.\n"
        "- Before claiming completion, run suitable verification and report evidence.\n"
        "- At the end of your response, always include a Detailed completion summary.\n\n"
        "Detailed completion summary requirements:\n"
        "- Work completed: list the concrete tasks handled and files or commands involved.\n"
        "- Verification: list commands, checks, and exact results, or say why they were not run.\n"
        "- Remaining work: list any unfinished task, missing verification, or uncertainty.\n"
        "- Blockers: list blockers or write none.\n"
        "- Completion verdict: write complete only when all authorized tasks and verification are done; otherwise write incomplete.\n"
        "This detailed summary is mandatory because Task Gate will read it to decide the next tasks."
    )


def build_followup_prompt(
    *,
    plan: TaskPlan,
    codex_output: str,
    exit_code: int,
    round_number: int,
    max_tasks: int = 8,
) -> str:
    return (
        "You are Task Gate reviewing the end of a Codex execution round. "
        "The raw user prompt is intentionally absent; use only the authorized "
        "task plan and Codex's detailed completion summary.\n"
        "Return only JSON matching this shape: "
        '{"complete":false,"summary":"detailed assessment",'
        '"next_tasks":[{"title":"next task","details":"optional detail",'
        '"acceptance_criteria":["optional check"]}]}.\n'
        f"If complete is false, provide 1 to {max_tasks} concrete next_tasks "
        "so Codex can continue. If complete is true, next_tasks may be empty. "
        "Do not mark complete when verification is missing, Codex exited nonzero, "
        "or the summary says work remains.\n\n"
        f"Execution round: {round_number}\n"
        f"Codex exit code: {exit_code}\n\n"
        "Authorized task plan:\n"
        f"{_format_execution_plan(plan)}\n\n"
        "Codex detailed completion summary and output:\n"
        f"{_clip_text(codex_output)}"
    )


def parse_followup_output(output: str, max_tasks: int = 8) -> FollowupDecision:
    parsed = _try_parse_json(output)
    if parsed is None:
        raise PlanError("follow-up gate returned invalid JSON")
    return _followup_from_json(parsed, max_tasks=max_tasks)


def _followup_from_json(parsed: Any, max_tasks: int) -> FollowupDecision:
    if isinstance(parsed, dict) and isinstance(parsed.get("structured_output"), dict):
        return _followup_from_json(parsed["structured_output"], max_tasks=max_tasks)

    if isinstance(parsed, dict) and isinstance(parsed.get("result"), str):
        nested = _try_parse_json(parsed["result"])
        if nested is not None:
            return _followup_from_json(nested, max_tasks=max_tasks)

    if not isinstance(parsed, dict):
        raise PlanError("follow-up gate JSON must be an object")

    complete = _bool_from_raw(
        parsed.get("complete")
        if "complete" in parsed
        else parsed.get("is_complete", parsed.get("done"))
    )
    summary = str(parsed.get("summary") or parsed.get("assessment") or "").strip()
    raw_tasks = parsed.get("next_tasks") or parsed.get("tasks") or []

    next_tasks: list[Task] = []
    if isinstance(raw_tasks, list):
        for raw in raw_tasks[:max_tasks]:
            task = _task_from_raw(raw, len(next_tasks) + 1)
            if task is not None:
                next_tasks.append(task)

    return FollowupDecision(complete=complete, summary=summary, next_tasks=next_tasks)


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


def _bool_from_raw(raw: Any) -> bool:
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, str):
        normalized = raw.strip().lower()
        if normalized in {"true", "yes", "done", "complete", "completed"}:
            return True
        if normalized in {"false", "no", "incomplete", "remaining", "blocked"}:
            return False
    raise PlanError('follow-up gate JSON must contain boolean "complete"')


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
    return Task(
        id=task_id,
        title=title,
        details=details,
        acceptance_criteria=_string_list(raw_checks),
    )


def _string_list(raw: Any) -> list[str]:
    if isinstance(raw, list):
        return [str(item).strip() for item in raw if str(item).strip()]
    if isinstance(raw, str) and raw.strip():
        return [raw.strip()]
    return []


def _clip_text(text: str) -> str:
    try:
        limit = int(os.environ.get("TASK_GATE_CODEX_OUTPUT_CHARS", "12000"))
    except ValueError:
        limit = 12000
    if len(text) <= limit:
        return text
    omitted = len(text) - limit
    return f"[omitted {omitted} earlier chars]\n{text[-limit:]}"


def _format_round_report(
    round_number: int,
    run_result: CodexRunResult,
    decision: FollowupDecision,
) -> str:
    lines = [
        f"Execution round {round_number}",
        f"Codex exit code: {run_result.exit_code}",
        "Codex detailed completion summary:",
        _indent(run_result.output or "<no output>"),
        "Gate follow-up:",
        _indent(decision.summary or "<no summary>"),
    ]
    if decision.next_tasks:
        lines.append("Gate next tasks:")
        next_plan = TaskPlan(source_prompt="", tasks=decision.next_tasks)
        lines.append(_indent(next_plan.as_numbered_text()))
    return "\n".join(lines)


def _indent(text: str) -> str:
    return "\n".join(f"  {line}" if line else "" for line in text.splitlines())


def _format_execution_plan(plan: TaskPlan) -> str:
    lines: list[str] = []
    for task in plan.tasks:
        lines.append(f"{task.id}. {task.title}")
        if task.details:
            lines.append(f"   Details: {task.details}")
        if task.acceptance_criteria:
            lines.append("   Acceptance criteria:")
            for criterion in task.acceptance_criteria:
                lines.append(f"   - {criterion}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Plan a raw prompt first, then optionally execute the plan with Codex."
    )
    parser.add_argument("prompt", nargs="*", help="Raw prompt. Reads stdin if omitted.")
    parser.add_argument("--execute", action="store_true", help="Run codex exec with the plan.")
    parser.add_argument("--cwd", default=os.getcwd(), help="Workspace for codex exec.")
    parser.add_argument("--max-tasks", type=int, default=8)
    parser.add_argument(
        "--max-rounds",
        type=int,
        default=3,
        help="Maximum Codex execute -> Gate follow-up rounds before returning incomplete.",
    )
    parser.add_argument(
        "--codex-arg",
        action="append",
        default=[],
        help="Extra argument passed to codex exec. Repeat for multiple args.",
    )
    args = parser.parse_args(argv)

    prompt = " ".join(args.prompt).strip() or sys.stdin.read().strip()
    gate = CodexGate(
        planner=TaskPlanner(max_tasks=args.max_tasks),
        followup_planner=FollowupPlanner(max_tasks=args.max_tasks),
    )
    result = gate.run(
        prompt,
        execute=args.execute,
        cwd=args.cwd,
        codex_args=args.codex_arg,
        max_rounds=args.max_rounds,
    )
    stream = sys.stdout if result.exit_code == 0 else sys.stderr
    if result.output:
        print(result.output, file=stream)
    return result.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
