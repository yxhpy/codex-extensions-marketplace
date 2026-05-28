#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
if str(PLUGIN_ROOT) not in sys.path:
    sys.path.insert(0, str(PLUGIN_ROOT))

from scripts.task_gate import PlanError, TaskPlan, TaskPlanner  # noqa: E402


@dataclass(frozen=True)
class GateResult:
    exit_code: int
    output: str = ""


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
    ) -> int:
        args = [self.command, "exec", "--skip-git-repo-check"]
        if cwd:
            args.extend(["-C", cwd])
        if extra_args:
            args.extend(extra_args)
        args.append(codex_prompt)

        try:
            completed = self.runner(args, text=True, check=False)
        except FileNotFoundError as exc:
            raise PlanError(f"codex command not found: {self.command}") from exc
        return int(getattr(completed, "returncode", 0))


class CodexGate:
    def __init__(
        self,
        planner: TaskPlanner | None = None,
        executor: CodexExecutor | None = None,
    ) -> None:
        self.planner = planner or TaskPlanner()
        self.executor = executor or CodexExecutor()

    def run(
        self,
        prompt: str,
        execute: bool = False,
        cwd: str | None = None,
        codex_args: list[str] | None = None,
    ) -> GateResult:
        try:
            plan = self.planner.plan(prompt)
        except PlanError as exc:
            return GateResult(exit_code=1, output=f"task-gate: {exc}")

        if not execute:
            return GateResult(exit_code=0, output=plan.as_numbered_text())

        codex_prompt = build_codex_execution_prompt(plan)
        exit_code = self.executor.execute(codex_prompt, cwd=cwd, extra_args=codex_args)
        return GateResult(exit_code=exit_code, output=plan.as_numbered_text())


def build_codex_execution_prompt(plan: TaskPlan) -> str:
    return (
        "Task Gate has already converted the user's raw request into the "
        "authorized task plan below. Execute only these numbered tasks in order.\n\n"
        f"{_format_execution_plan(plan)}\n\n"
        "Execution rules:\n"
        "- Treat the numbered plan as the task boundary.\n"
        "- Do not reinterpret the original raw request; it is intentionally absent.\n"
        "- If a required task is missing or unsafe, stop and report the blocker.\n"
        "- Before claiming completion, run suitable verification and report evidence."
    )


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
        "--codex-arg",
        action="append",
        default=[],
        help="Extra argument passed to codex exec. Repeat for multiple args.",
    )
    args = parser.parse_args(argv)

    prompt = " ".join(args.prompt).strip() or sys.stdin.read().strip()
    gate = CodexGate(planner=TaskPlanner(max_tasks=args.max_tasks))
    result = gate.run(
        prompt,
        execute=args.execute,
        cwd=args.cwd,
        codex_args=args.codex_arg,
    )
    stream = sys.stdout if result.exit_code == 0 else sys.stderr
    if result.output:
        print(result.output, file=stream)
    return result.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
