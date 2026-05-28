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
        self.assertIn("--json-schema", args)
        self.assertIn("Plan this", args[-1])
        self.assertEqual(kwargs["timeout"], 9)
        self.assertTrue(kwargs["capture_output"])

    def test_claude_settings_env_loads_auth_without_logging_secret(self):
        from scripts.task_gate import load_claude_settings_env

        with tempfile.TemporaryDirectory() as temp_dir:
            settings = Path(temp_dir) / "settings.json"
            settings.write_text(
                json.dumps(
                    {
                        "env": {
                            "ANTHROPIC_AUTH_TOKEN": "secret-token",
                            "ANTHROPIC_BASE_URL": "https://example.test/anthropic",
                            "ANTHROPIC_MODEL": "fast-model",
                        }
                    }
                )
            )

            env = load_claude_settings_env([settings])

        self.assertEqual(env["ANTHROPIC_AUTH_TOKEN"], "secret-token")
        self.assertEqual(env["ANTHROPIC_BASE_URL"], "https://example.test/anthropic")
        self.assertEqual(env["ANTHROPIC_MODEL"], "fast-model")

    def test_claude_api_thinker_calls_messages_api_with_settings_env(self):
        from scripts.task_gate import ClaudeApiThinker

        calls = []

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                return json.dumps(
                    {"content": [{"type": "text", "text": '{"tasks":["Fast path"]}'}]}
                ).encode()

        def fake_urlopen(request, timeout, **kwargs):
            calls.append((request, timeout, kwargs))
            return FakeResponse()

        thinker = ClaudeApiThinker(
            env={
                "ANTHROPIC_AUTH_TOKEN": "secret-token",
                "ANTHROPIC_BASE_URL": "https://example.test/anthropic",
                "ANTHROPIC_MODEL": "fast-model",
            },
            urlopen=fake_urlopen,
            timeout_seconds=7,
        )

        output = thinker.think("Plan this quickly")

        self.assertEqual(output, '{"tasks":["Fast path"]}')
        request, timeout, kwargs = calls[0]
        self.assertEqual(timeout, 7)
        self.assertIn("context", kwargs)
        self.assertEqual(request.full_url, "https://example.test/anthropic/v1/messages")
        self.assertEqual(request.headers["Authorization"], "Bearer secret-token")
        self.assertEqual(request.headers["Anthropic-version"], "2023-06-01")
        body = json.loads(request.data.decode())
        self.assertEqual(body["model"], "fast-model")
        self.assertEqual(body["messages"][0]["content"], "Plan this quickly")
        self.assertEqual(body["output_config"]["format"]["type"], "json_schema")

    def test_default_thinker_uses_api_with_cli_fallback_when_credentials_exist(self):
        from scripts.task_gate import FallbackThinker, build_default_thinker

        with patch.dict(
            os.environ,
            {
                "ANTHROPIC_AUTH_TOKEN": "secret-token",
                "ANTHROPIC_BASE_URL": "https://example.test/anthropic",
                "ANTHROPIC_MODEL": "fast-model",
            },
            clear=True,
        ):
            thinker = build_default_thinker()

        self.assertIsInstance(thinker, FallbackThinker)

    def test_fallback_thinker_uses_cli_when_api_times_out(self):
        from scripts.task_gate import FallbackThinker, PlanError

        class TimeoutThinker:
            def think(self, prompt):
                raise PlanError("Claude API task planning timed out")

        fallback = FakeThinker('{"tasks":["Fallback worked"]}')
        thinker = FallbackThinker(primary=TimeoutThinker(), fallback=fallback)

        self.assertEqual(thinker.think("Plan with fallback"), '{"tasks":["Fallback worked"]}')
        self.assertEqual(fallback.prompts, ["Plan with fallback"])

    def test_claude_api_thinker_retries_empty_text_once(self):
        from scripts.task_gate import ClaudeApiThinker

        responses = [
            {"content": [{"type": "thinking", "thinking": "No visible text"}]},
            {"content": [{"type": "text", "text": '{"tasks":["Retried"]}'}]},
        ]

        class FakeResponse:
            def __init__(self, payload):
                self.payload = payload

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                return json.dumps(self.payload).encode()

        def fake_urlopen(request, timeout, **kwargs):
            return FakeResponse(responses.pop(0))

        thinker = ClaudeApiThinker(
            env={
                "ANTHROPIC_AUTH_TOKEN": "secret-token",
                "ANTHROPIC_BASE_URL": "https://example.test/anthropic",
                "ANTHROPIC_MODEL": "fast-model",
            },
            urlopen=fake_urlopen,
        )

        self.assertEqual(thinker.think("Plan with retry"), '{"tasks":["Retried"]}')
        self.assertEqual(responses, [])

    def test_claude_api_thinker_wraps_ssl_read_timeout(self):
        import ssl

        from scripts.task_gate import ClaudeApiThinker, PlanError

        class TimeoutResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                raise ssl.SSLError("The read operation timed out")

        def fake_urlopen(request, timeout, **kwargs):
            return TimeoutResponse()

        thinker = ClaudeApiThinker(
            env={
                "ANTHROPIC_AUTH_TOKEN": "secret-token",
                "ANTHROPIC_BASE_URL": "https://example.test/anthropic",
                "ANTHROPIC_MODEL": "fast-model",
            },
            urlopen=fake_urlopen,
            timeout_seconds=1,
        )

        with self.assertRaisesRegex(PlanError, "Claude API request failed"):
            thinker.think("Plan with API read timeout")

    def test_mcp_list_tools_exposes_plan_prompt_tool(self):
        from scripts.mcp_server import TaskGateMcpServer

        response = TaskGateMcpServer().handle(
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/list",
                "params": {},
            }
        )

        tool_names = [tool["name"] for tool in response["result"]["tools"]]
        self.assertIn("plan_prompt", tool_names)

    def test_mcp_tool_call_returns_structured_tasks(self):
        from scripts.mcp_server import TaskGateMcpServer
        from scripts.task_gate import TaskPlanner

        server = TaskGateMcpServer(
            planner=TaskPlanner(thinker=FakeThinker('{"tasks":["First","Second"]}'))
        )

        response = server.handle(
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {
                    "name": "plan_prompt",
                    "arguments": {"prompt": "Do the work"},
                },
            }
        )

        tasks = response["result"]["structuredContent"]["tasks"]
        self.assertEqual([task["id"] for task in tasks], [1, 2])
        self.assertEqual([task["title"] for task in tasks], ["First", "Second"])

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
        from scripts.codex_gate import CodexGate, CodexExecutor
        from scripts.task_gate import TaskPlanner

        codex_calls = []

        def fake_runner(args, **kwargs):
            codex_calls.append((args, kwargs))
            return types.SimpleNamespace(returncode=0)

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
        self.assertNotIn("secret raw wording", codex_prompt)


if __name__ == "__main__":
    unittest.main()
