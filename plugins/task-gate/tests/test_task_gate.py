import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PLUGIN_ROOT))


class FakeThinker:
    def __init__(self, output):
        self.output = output
        self.prompts = []

    def think(self, prompt):
        self.prompts.append(prompt)
        return self.output


class TaskGateTests(unittest.TestCase):
    def test_planner_turns_prompt_into_numbered_tasks(self):
        from scripts.task_gate import TaskPlanner

        thinker = FakeThinker(
            json.dumps(
                {
                    "tasks": [
                        {"title": "Inspect the repository"},
                        {"title": "Implement the requested change"},
                        {"title": "Run focused verification"},
                    ]
                }
            )
        )

        plan = TaskPlanner(thinker=thinker).plan("Add task gating to this plugin")

        self.assertEqual([task.id for task in plan.tasks], [1, 2, 3])
        self.assertEqual(
            [task.title for task in plan.tasks],
            [
                "Inspect the repository",
                "Implement the requested change",
                "Run focused verification",
            ],
        )
        self.assertIn("Add task gating to this plugin", thinker.prompts[0])
        self.assertIn("Preserve exact filenames", thinker.prompts[0])
        self.assertEqual(
            plan.as_numbered_text(),
            "1. Inspect the repository\n2. Implement the requested change\n3. Run focused verification",
        )

    def test_parser_accepts_numbered_text_fallback(self):
        from scripts.task_gate import parse_plan_output

        plan = parse_plan_output(
            "1. Clarify scope\n2. Write tests\n3. Implement and verify",
            source_prompt="Build a gate",
        )

        self.assertEqual(
            [task.title for task in plan.tasks],
            ["Clarify scope", "Write tests", "Implement and verify"],
        )

    def test_parser_accepts_claude_cli_structured_output_envelope(self):
        from scripts.task_gate import parse_plan_output

        plan = parse_plan_output(
            json.dumps(
                {
                    "type": "result",
                    "result": "Natural language summary",
                    "structured_output": {
                        "tasks": [
                            {
                                "title": "Use the structured output field",
                                "details": "Claude CLI wraps JSON schema results here.",
                            }
                        ]
                    },
                }
            ),
            source_prompt="Plan with Claude CLI",
        )

        self.assertEqual(plan.tasks[0].title, "Use the structured output field")

    def test_thinking_planner_turns_stuck_prompt_into_candidate_ideas(self):
        from scripts.task_gate import ThinkingPlanner

        thinker = FakeThinker(
            json.dumps(
                {
                    "ideas": [
                        {
                            "title": "Trace the smallest failing surface",
                            "rationale": "A narrow reproduction can reveal the next move.",
                            "tradeoffs": ["Fast to run", "May miss systemic causes"],
                            "risks": ["Could overfit to one symptom"],
                            "validation": ["One focused test fails before implementation"],
                        },
                        {
                            "title": "Map adjacent approaches",
                            "rationale": "Comparing alternatives can unlock a better path.",
                        },
                    ],
                    "recommendation": "Start with the smallest failing surface.",
                    "next_tasks": [
                        {"title": "Write a failing characterization test"},
                        {"title": "Pick the cheapest reversible fix"},
                    ],
                }
            )
        )

        plan = ThinkingPlanner(thinker=thinker, max_ideas=7).think(
            "Codex is stuck and has no good next step"
        )

        self.assertEqual([idea.id for idea in plan.ideas], [1, 2])
        self.assertEqual(plan.ideas[0].title, "Trace the smallest failing surface")
        self.assertEqual(plan.ideas[0].tradeoffs, ["Fast to run", "May miss systemic causes"])
        self.assertEqual(plan.recommendation, "Start with the smallest failing surface.")
        self.assertEqual(
            [task.title for task in plan.next_tasks],
            ["Write a failing characterization test", "Pick the cheapest reversible fix"],
        )
        self.assertIn("divergent thinking mode", thinker.prompts[0])
        self.assertIn("Codex is stuck and has no good next step", thinker.prompts[0])

    def test_thinking_parser_accepts_claude_cli_structured_output_envelope(self):
        from scripts.task_gate import parse_thinking_output

        plan = parse_thinking_output(
            json.dumps(
                {
                    "type": "result",
                    "result": "Natural language summary",
                    "structured_output": {
                        "ideas": [
                            {
                                "title": "Read structured_output first",
                                "rationale": "Claude CLI returns schema data separately.",
                            }
                        ],
                        "next_tasks": [{"title": "Keep parser aligned"}],
                    },
                }
            ),
            source_prompt="Codex is stuck",
        )

        self.assertEqual(plan.ideas[0].title, "Read structured_output first")
        self.assertEqual(plan.next_tasks[0].title, "Keep parser aligned")

    def test_blank_prompt_is_rejected_before_calling_thinker(self):
        from scripts.task_gate import PlanError, TaskPlanner

        thinker = FakeThinker('{"tasks":["unused"]}')

        with self.assertRaisesRegex(PlanError, "prompt must not be blank"):
            TaskPlanner(thinker=thinker).plan("   ")

        self.assertEqual(thinker.prompts, [])

    def test_claude_cli_thinker_uses_noninteractive_structured_mode(self):
        from scripts.task_gate import ClaudeCliThinker

        calls = []

        def fake_runner(args, **kwargs):
            calls.append((args, kwargs))
            return types.SimpleNamespace(stdout='{"tasks":["Split prompt"]}', stderr="")

        thinker = ClaudeCliThinker(
            command="/fake/claude",
            runner=fake_runner,
            timeout_seconds=9,
        )

        self.assertEqual(thinker.think("Plan this"), '{"tasks":["Split prompt"]}')
        args, kwargs = calls[0]
        self.assertEqual(args[0], "/fake/claude")
        self.assertIn("--print", args)
        self.assertEqual(args[args.index("--output-format") + 1], "json")
        self.assertIn("--json-schema", args)
        self.assertNotIn("--tools", args)
        self.assertIn("Plan this", args[-1])
        self.assertEqual(kwargs["timeout"], 9)
        self.assertTrue(kwargs["capture_output"])

    def test_claude_cli_error_reports_stdout_when_stderr_is_empty(self):
        from scripts.task_gate import ClaudeCliThinker, PlanError

        def fake_runner(args, **kwargs):
            raise __import__("subprocess").CalledProcessError(
                returncode=1,
                cmd=args,
                output="Error: Exceeded USD budget",
                stderr="",
            )

        thinker = ClaudeCliThinker(command="/fake/claude", runner=fake_runner)

        with self.assertRaisesRegex(PlanError, "Exceeded USD budget"):
            thinker.think("Plan this")

    def test_claude_cli_thinker_defaults_to_long_timeout(self):
        from scripts.task_gate import ClaudeCliThinker

        with patch.dict(
            os.environ,
            {},
            clear=True,
        ):
            thinker = ClaudeCliThinker(command="/fake/claude")

        self.assertEqual(thinker.timeout_seconds, 300)

    def test_default_thinker_uses_cli_even_when_api_credentials_exist(self):
        from scripts.task_gate import ClaudeCliThinker, build_default_thinker

        with patch.dict(
            os.environ,
            {
                "ANTHROPIC_AUTH_TOKEN": "secret-token",
                "ANTHROPIC_BASE_URL": "https://example.test/anthropic",
                "ANTHROPIC_MODEL": "fast-model",
                "TASK_GATE_THINKER": "auto",
            },
            clear=True,
        ):
            thinker = build_default_thinker()

        self.assertIsInstance(thinker, ClaudeCliThinker)
        self.assertEqual(thinker.output_schema["required"], ["tasks"])

    def test_thinking_planner_default_thinker_uses_thinking_schema(self):
        from scripts.task_gate import THINK_SCHEMA, ThinkingPlanner

        with patch.dict(os.environ, {"TASK_GATE_THINKER": "auto"}, clear=True):
            planner = ThinkingPlanner()

        self.assertIs(planner.thinker.output_schema, THINK_SCHEMA)

    def test_codex_gate_dry_run_plans_without_executing_codex(self):
        from scripts.codex_gate import CodexGate, CodexExecutor
        from scripts.task_gate import TaskPlanner

        codex_calls = []
        gate = CodexGate(
            planner=TaskPlanner(thinker=FakeThinker('{"tasks":["Plan only"]}')),
            executor=CodexExecutor(command="/fake/codex", runner=codex_calls.append),
        )

        result = gate.run("Sensitive raw prompt", execute=False)

        self.assertEqual(result.exit_code, 0)
        self.assertEqual(codex_calls, [])
        self.assertIn("1. Plan only", result.output)

    def test_codex_gate_execute_sends_only_task_plan_to_codex(self):
        from scripts.codex_gate import CodexGate, CodexExecutor, FollowupDecision
        from scripts.task_gate import TaskPlanner

        codex_calls = []

        def fake_runner(args, **kwargs):
            codex_calls.append((args, kwargs))
            return types.SimpleNamespace(
                returncode=0,
                stdout="Detailed completion summary: complete",
                stderr="",
            )

        class CompleteFollowup:
            def assess(self, **kwargs):
                return FollowupDecision(complete=True, summary="All tasks are complete.")

        gate = CodexGate(
            planner=TaskPlanner(
                thinker=FakeThinker(
                    json.dumps(
                        {
                            "tasks": [
                                {"title": "Inspect files"},
                                {"title": "Run verification"},
                            ]
                        }
                    )
                )
            ),
            executor=CodexExecutor(command="/fake/codex", runner=fake_runner),
            followup_planner=CompleteFollowup(),
        )

        result = gate.run("Sensitive raw prompt", execute=True, cwd="/tmp/work")

        self.assertEqual(result.exit_code, 0)
        args, kwargs = codex_calls[0]
        self.assertEqual(args[:2], ["/fake/codex", "exec"])
        self.assertIn("-C", args)
        self.assertIn("/tmp/work", args)
        codex_prompt = args[-1]
        self.assertIn("1. Inspect files", codex_prompt)
        self.assertIn("2. Run verification", codex_prompt)
        self.assertNotIn("Sensitive raw prompt", codex_prompt)
        self.assertFalse(kwargs["check"])
        self.assertTrue(kwargs["capture_output"])
        self.assertIn("Detailed completion summary", codex_prompt)
        self.assertIn("Gate follow-up", result.output)

    def test_codex_gate_continues_with_gate_next_tasks_until_complete(self):
        from scripts.codex_gate import CodexGate, CodexExecutor, FollowupDecision
        from scripts.task_gate import Task, TaskPlan

        class StaticPlanner:
            def plan(self, prompt):
                return TaskPlan(source_prompt=prompt, tasks=[Task(id=1, title="Implement slice")])

        class Followup:
            def __init__(self):
                self.calls = []

            def assess(self, **kwargs):
                self.calls.append(kwargs)
                if kwargs["round_number"] == 1:
                    return FollowupDecision(
                        complete=False,
                        summary="Verification is still missing.",
                        next_tasks=[Task(id=1, title="Run verification")],
                    )
                return FollowupDecision(complete=True, summary="Verification passed.")

        codex_calls = []

        def fake_runner(args, **kwargs):
            codex_calls.append(args[-1])
            return types.SimpleNamespace(
                returncode=0,
                stdout=f"Detailed completion summary: round {len(codex_calls)}",
                stderr="",
            )

        followup = Followup()
        gate = CodexGate(
            planner=StaticPlanner(),
            executor=CodexExecutor(command="/fake/codex", runner=fake_runner),
            followup_planner=followup,
        )

        result = gate.run("Sensitive raw prompt", execute=True, max_rounds=3)

        self.assertEqual(result.exit_code, 0)
        self.assertEqual(len(codex_calls), 2)
        self.assertIn("1. Implement slice", codex_calls[0])
        self.assertIn("1. Run verification", codex_calls[1])
        self.assertNotIn("Sensitive raw prompt", codex_calls[0])
        self.assertNotIn("Sensitive raw prompt", codex_calls[1])
        self.assertEqual(len(followup.calls), 2)
        self.assertIn("round 1", followup.calls[0]["codex_output"])
        self.assertIn("Verification is still missing.", result.output)
        self.assertIn("Verification passed.", result.output)

    def test_codex_gate_returns_failure_when_max_rounds_reached_before_completion(self):
        from scripts.codex_gate import CodexGate, CodexExecutor, FollowupDecision
        from scripts.task_gate import Task, TaskPlan

        class StaticPlanner:
            def plan(self, prompt):
                return TaskPlan(source_prompt=prompt, tasks=[Task(id=1, title="Keep working")])

        class IncompleteFollowup:
            def assess(self, **kwargs):
                return FollowupDecision(
                    complete=False,
                    summary="More work remains.",
                    next_tasks=[Task(id=1, title="Continue the remaining work")],
                )

        codex_calls = []

        def fake_runner(args, **kwargs):
            codex_calls.append(args[-1])
            return types.SimpleNamespace(
                returncode=0,
                stdout="Detailed completion summary: incomplete",
                stderr="",
            )

        gate = CodexGate(
            planner=StaticPlanner(),
            executor=CodexExecutor(command="/fake/codex", runner=fake_runner),
            followup_planner=IncompleteFollowup(),
        )

        result = gate.run("Sensitive raw prompt", execute=True, max_rounds=2)

        self.assertEqual(result.exit_code, 1)
        self.assertEqual(len(codex_calls), 2)
        self.assertIn("max execution rounds reached before completion", result.output)

    def test_codex_execution_prompt_includes_details_and_acceptance_criteria(self):
        from scripts.codex_gate import build_codex_execution_prompt
        from scripts.task_gate import Task, TaskPlan

        plan = TaskPlan(
            source_prompt="Create a file with secret raw wording",
            tasks=[
                Task(
                    id=1,
                    title="Create ACTUAL_REMOTE_TEST_RESULT.txt",
                    details="Write TASK_GATE_REMOTE_CODEX_OK into ACTUAL_REMOTE_TEST_RESULT.txt.",
                    acceptance_criteria=[
                        "ACTUAL_REMOTE_TEST_RESULT.txt contains TASK_GATE_REMOTE_CODEX_OK"
                    ],
                )
            ],
        )

        codex_prompt = build_codex_execution_prompt(plan)

        self.assertIn("1. Create ACTUAL_REMOTE_TEST_RESULT.txt", codex_prompt)
        self.assertIn("Write TASK_GATE_REMOTE_CODEX_OK", codex_prompt)
        self.assertIn(
            "ACTUAL_REMOTE_TEST_RESULT.txt contains TASK_GATE_REMOTE_CODEX_OK",
            codex_prompt,
        )
        self.assertIn("Detailed completion summary", codex_prompt)
        self.assertIn("Completion verdict", codex_prompt)
        self.assertNotIn("secret raw wording", codex_prompt)


if __name__ == "__main__":
    unittest.main()
