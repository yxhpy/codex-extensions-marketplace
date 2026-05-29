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
from typing import Any, Callable, Protocol


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

THINK_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "ideas": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "title": {"type": "string", "minLength": 1},
                    "rationale": {"type": "string"},
                    "tradeoffs": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "risks": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "validation": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": ["title"],
                "additionalProperties": False,
            },
        },
        "recommendation": {"type": "string"},
        "next_tasks": PLAN_SCHEMA["properties"]["tasks"],
    },
    "required": ["ideas"],
    "additionalProperties": False,
}


class PlanError(RuntimeError):
    pass


class Thinker(Protocol):
    def think(self, prompt: str) -> str:
        pass


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


@dataclass(frozen=True)
class Idea:
    id: int
    title: str
    rationale: str = ""
    tradeoffs: list[str] = field(default_factory=list)
    risks: list[str] = field(default_factory=list)
    validation: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {"id": self.id, "title": self.title}
        if self.rationale:
            data["rationale"] = self.rationale
        if self.tradeoffs:
            data["tradeoffs"] = self.tradeoffs
        if self.risks:
            data["risks"] = self.risks
        if self.validation:
            data["validation"] = self.validation
        return data


@dataclass(frozen=True)
class ThinkingPlan:
    source_prompt: str
    ideas: list[Idea]
    recommendation: str = ""
    next_tasks: list[Task] = field(default_factory=list)

    def as_markdown(self) -> str:
        lines = ["Ideas:"]
        for idea in self.ideas:
            lines.append(f"{idea.id}. {idea.title}")
            if idea.rationale:
                lines.append(f"   Rationale: {idea.rationale}")
            if idea.tradeoffs:
                lines.append("   Tradeoffs:")
                lines.extend(f"   - {item}" for item in idea.tradeoffs)
            if idea.risks:
                lines.append("   Risks:")
                lines.extend(f"   - {item}" for item in idea.risks)
            if idea.validation:
                lines.append("   Validation:")
                lines.extend(f"   - {item}" for item in idea.validation)

        if self.recommendation:
            lines.extend(["", "Recommendation:", self.recommendation])

        if self.next_tasks:
            lines.extend(["", "Next tasks:"])
            lines.extend(f"{task.id}. {task.title}" for task in self.next_tasks)

        return "\n".join(lines)

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "source_prompt": self.source_prompt,
            "ideas": [idea.to_dict() for idea in self.ideas],
        }
        if self.recommendation:
            data["recommendation"] = self.recommendation
        if self.next_tasks:
            data["next_tasks"] = [task.to_dict() for task in self.next_tasks]
        return data

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)


class ClaudeCliThinker:
    def __init__(
        self,
        command: str | None = None,
        runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
        timeout_seconds: int | None = None,
        output_schema: dict[str, Any] | None = None,
    ) -> None:
        self.command = command or os.environ.get("TASK_GATE_CLAUDE_BIN", "claude")
        self.runner = runner
        self.timeout_seconds = timeout_seconds or int(
            os.environ.get("TASK_GATE_CLAUDE_TIMEOUT", "300")
        )
        self.output_schema = output_schema or PLAN_SCHEMA

    def think(self, prompt: str) -> str:
        args = [
            self.command,
            "--print",
            "--output-format",
            "json",
            "--no-session-persistence",
            "--disable-slash-commands",
            "--json-schema",
            json.dumps(self.output_schema, separators=(",", ":")),
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
            stdout = (exc.stdout or "").strip()
            message = stderr or stdout or f"claude exited with status {exc.returncode}"
            raise PlanError(message) from exc
        except subprocess.TimeoutExpired as exc:
            raise PlanError("claude task planning timed out") from exc

        output = (completed.stdout or "").strip()
        if not output:
            raise PlanError("claude returned an empty plan")
        return output


def build_default_thinker(output_schema: dict[str, Any] | None = None) -> Thinker:
    mode = os.environ.get("TASK_GATE_THINKER", "cli").strip().lower()
    if mode not in {"", "auto", "cli"}:
        raise PlanError("TASK_GATE_THINKER must be cli or auto")
    return ClaudeCliThinker(output_schema=output_schema)


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


class ThinkingPlanner:
    def __init__(
        self,
        thinker: Thinker | None = None,
        max_ideas: int = 7,
        max_next_tasks: int = 3,
    ) -> None:
        self.thinker = thinker or build_default_thinker(THINK_SCHEMA)
        self.max_ideas = max_ideas
        self.max_next_tasks = max_next_tasks

    def think(self, prompt: str) -> ThinkingPlan:
        if not prompt.strip():
            raise PlanError("prompt must not be blank")
        thinker_prompt = build_thinking_prompt(prompt, self.max_ideas, self.max_next_tasks)
        output = self.thinker.think(thinker_prompt)
        return parse_thinking_output(
            output,
            source_prompt=prompt,
            max_ideas=self.max_ideas,
            max_next_tasks=self.max_next_tasks,
        )


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


def build_thinking_prompt(
    prompt: str,
    max_ideas: int = 7,
    max_next_tasks: int = 3,
) -> str:
    return (
        "You are Task Gate in divergent thinking mode. Codex is stuck, lacks a "
        "good next step, or needs better options before acting.\n"
        "Return only JSON matching this shape: "
        '{"ideas":[{"title":"Candidate direction","rationale":"why it helps",'
        '"tradeoffs":["cost or benefit"],"risks":["what can go wrong"],'
        '"validation":["how to test the idea"]}],'
        '"recommendation":"best first path","next_tasks":[{"title":"concrete next task"}]}.\n'
        f"Generate 3 to {max_ideas} meaningfully different candidate ideas unless "
        "the prompt clearly needs fewer. Include at most "
        f"{max_next_tasks} next_tasks. Preserve exact filenames, literal text, "
        "commands, URLs, identifiers, and numeric values from the user prompt "
        "whenever they constrain the options. Do not execute the task; open up "
        "the solution space, compare directions, and recommend the smallest "
        "reversible next move.\n\n"
        f"Stuck prompt:\n{prompt.strip()}"
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


def parse_thinking_output(
    output: str,
    source_prompt: str,
    max_ideas: int = 7,
    max_next_tasks: int = 3,
) -> ThinkingPlan:
    if not output.strip():
        raise PlanError("thinker returned an empty thinking plan")

    parsed = _try_parse_json(output)
    if parsed is not None:
        ideas, recommendation, next_tasks = _thinking_from_json(
            parsed,
            max_ideas=max_ideas,
            max_next_tasks=max_next_tasks,
        )
    else:
        ideas = _ideas_from_numbered_text(output, max_ideas=max_ideas)
        recommendation = ""
        next_tasks = []

    if not ideas:
        raise PlanError("thinker did not produce any ideas")
    return ThinkingPlan(
        source_prompt=source_prompt,
        ideas=ideas,
        recommendation=recommendation,
        next_tasks=next_tasks,
    )


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
    if isinstance(parsed, dict) and isinstance(parsed.get("structured_output"), dict):
        return _tasks_from_json(parsed["structured_output"], max_tasks=max_tasks)

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


def _thinking_from_json(
    parsed: Any,
    max_ideas: int,
    max_next_tasks: int,
) -> tuple[list[Idea], str, list[Task]]:
    if isinstance(parsed, dict) and isinstance(parsed.get("structured_output"), dict):
        return _thinking_from_json(
            parsed["structured_output"],
            max_ideas=max_ideas,
            max_next_tasks=max_next_tasks,
        )

    if isinstance(parsed, dict) and isinstance(parsed.get("result"), str):
        nested = _try_parse_json(parsed["result"])
        if nested is not None:
            return _thinking_from_json(
                nested,
                max_ideas=max_ideas,
                max_next_tasks=max_next_tasks,
            )

    if not isinstance(parsed, dict):
        raise PlanError('JSON thinking plan must contain an "ideas" array')

    raw_ideas = (
        parsed.get("ideas")
        or parsed.get("directions")
        or parsed.get("options")
        or parsed.get("candidates")
    )
    if not isinstance(raw_ideas, list):
        raise PlanError('JSON thinking plan must contain an "ideas" array')

    ideas: list[Idea] = []
    for raw in raw_ideas[:max_ideas]:
        idea = _idea_from_raw(raw, len(ideas) + 1)
        if idea is not None:
            ideas.append(idea)

    recommendation = str(
        parsed.get("recommendation")
        or parsed.get("recommended_path")
        or parsed.get("recommended")
        or ""
    ).strip()

    raw_next_tasks = parsed.get("next_tasks") or parsed.get("tasks") or []
    next_tasks: list[Task] = []
    if isinstance(raw_next_tasks, list):
        for raw in raw_next_tasks[:max_next_tasks]:
            task = _task_from_raw(raw, len(next_tasks) + 1)
            if task is not None:
                next_tasks.append(task)

    return ideas, recommendation, next_tasks


def _idea_from_raw(raw: Any, idea_id: int) -> Idea | None:
    if isinstance(raw, str):
        title = raw.strip()
        return Idea(id=idea_id, title=title) if title else None

    if not isinstance(raw, dict):
        return None

    title = str(
        raw.get("title")
        or raw.get("idea")
        or raw.get("direction")
        or raw.get("option")
        or raw.get("name")
        or ""
    ).strip()
    if not title:
        return None

    rationale = str(
        raw.get("rationale")
        or raw.get("why")
        or raw.get("details")
        or raw.get("detail")
        or ""
    ).strip()
    tradeoffs = _string_list(
        raw.get("tradeoffs")
        or raw.get("trade_offs")
        or raw.get("trade-offs")
        or raw.get("costs")
        or []
    )
    risks = _string_list(raw.get("risks") or raw.get("risk") or [])
    validation = _string_list(
        raw.get("validation")
        or raw.get("verification")
        or raw.get("checks")
        or []
    )
    return Idea(
        id=idea_id,
        title=title,
        rationale=rationale,
        tradeoffs=tradeoffs,
        risks=risks,
        validation=validation,
    )


def _ideas_from_numbered_text(output: str, max_ideas: int) -> list[Idea]:
    ideas: list[Idea] = []
    for line in output.splitlines():
        match = re.match(r"^\s*(?:\d+[\.)]|[-*])\s+(.+?)\s*$", line)
        if not match:
            continue
        title = match.group(1).strip()
        if title:
            ideas.append(Idea(id=len(ideas) + 1, title=title))
        if len(ideas) >= max_ideas:
            break
    return ideas


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
    acceptance_criteria = _string_list(raw_checks)
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


def _string_list(raw: Any) -> list[str]:
    if isinstance(raw, list):
        return [str(item).strip() for item in raw if str(item).strip()]
    if isinstance(raw, str) and raw.strip():
        return [raw.strip()]
    return []


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Plan or brainstorm a raw prompt.")
    parser.add_argument("prompt", nargs="*", help="Raw user prompt. Reads stdin if omitted.")
    parser.add_argument("--max-tasks", type=int, default=8)
    parser.add_argument("--max-ideas", type=int, default=7)
    parser.add_argument(
        "--think",
        action="store_true",
        help="Generate divergent candidate ideas instead of an execution task list.",
    )
    parser.add_argument("--json", action="store_true", help="Print JSON instead of text.")
    args = parser.parse_args(argv)

    prompt = " ".join(args.prompt).strip() or sys.stdin.read().strip()
    try:
        if args.think:
            thinking_plan = ThinkingPlanner(max_ideas=args.max_ideas).think(prompt)
            print(thinking_plan.to_json() if args.json else thinking_plan.as_markdown())
            return 0
        plan = TaskPlanner(max_tasks=args.max_tasks).plan(prompt)
    except PlanError as exc:
        print(f"task-gate: {exc}", file=sys.stderr)
        return 1

    print(plan.to_json() if args.json else plan.as_numbered_text())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
