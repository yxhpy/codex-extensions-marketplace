#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


PLUGIN_ROOT = Path(__file__).resolve().parents[1]


def run(args: list[str], **kwargs) -> subprocess.CompletedProcess[str]:
    print("+", " ".join(args), flush=True)
    return subprocess.run(args, text=True, check=True, **kwargs)


def validate_plugin_manifest() -> None:
    manifest_path = PLUGIN_ROOT / ".codex-plugin" / "plugin.json"
    manifest = json.loads(manifest_path.read_text())
    assert manifest["name"] == "task-gate"
    assert "mcpServers" not in manifest
    assert manifest["skills"] == "./skills/"
    assert "Thinking Gate" in manifest["interface"]["displayName"]
    assert "Brainstorming" in manifest["interface"]["capabilities"]
    assert len(manifest["interface"]["defaultPrompt"]) <= 3
    assert "MCP" not in manifest["interface"]["capabilities"]
    assert not (PLUGIN_ROOT / ".mcp.json").exists()
    assert not (PLUGIN_ROOT / "scripts" / "mcp_server.py").exists()


def validate_skill() -> None:
    skill_path = PLUGIN_ROOT / "skills" / "task-gate" / "SKILL.md"
    text = skill_path.read_text()
    assert text.startswith("---\n")
    assert "\nname: task-gate\n" in text
    assert "scripts/task_gate.py --think --json" in text
    assert "scripts/task_gate.py --json" in text
    assert "codex_gate.py --execute" in text

    thinking_skill_path = PLUGIN_ROOT / "skills" / "thinking-gate" / "SKILL.md"
    thinking_text = thinking_skill_path.read_text()
    assert "\nname: thinking-gate\n" in thinking_text
    assert "scripts/task_gate.py --think --json" in thinking_text
    trigger_terms = [
        "卡住",
        "没思路",
        "发散",
        "不知道下一步",
        "stuck",
        "no good next step",
        "brainstorm",
        "divergent",
    ]
    for term in trigger_terms:
        assert term in thinking_text


def run_unit_tests() -> None:
    suite = unittest.defaultTestLoader.discover(str(PLUGIN_ROOT / "tests"))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if not result.wasSuccessful():
        raise SystemExit(1)


def run_gate_smoke() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        fake_claude = Path(temp_dir) / "claude"
        fake_claude.write_text(
            "#!/bin/sh\n"
            "case \"$*\" in\n"
            "  *\"reviewing the end of a Codex execution round\"*)\n"
            "    printf '%s\\n' "
            "'{\"complete\":true,\"summary\":\"Docker gate follow-up complete.\",\"next_tasks\":[]}'\n"
            "    ;;\n"
            "  *)\n"
            "    printf '%s\\n' "
            "'{\"tasks\":[{\"title\":\"Plan in Docker\"},{\"title\":\"Verify in Docker\"}]}'\n"
            "    ;;\n"
            "esac\n"
        )
        fake_claude.chmod(0o755)

        env = os.environ.copy()
        env["TASK_GATE_THINKER"] = "cli"
        env["TASK_GATE_CLAUDE_BIN"] = str(fake_claude)
        env["TASK_GATE_CODEX_BIN"] = shutil.which("true") or "/usr/bin/true"
        completed = run(
            [
                "python3",
                "-B",
                "scripts/codex_gate.py",
                "--execute",
                "Raw prompt stays outside Codex",
            ],
            cwd=PLUGIN_ROOT,
            env=env,
            capture_output=True,
        )
        assert "1. Plan in Docker" in completed.stdout
        assert "2. Verify in Docker" in completed.stdout


def run_think_smoke() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        fake_claude = Path(temp_dir) / "claude"
        fake_claude.write_text(
            "#!/bin/sh\n"
            "printf '%s\\n' "
            "'{\"ideas\":[{\"title\":\"Try a smaller reversible check\","
            "\"rationale\":\"It can unstick Codex without overcommitting.\"}],"
            "\"recommendation\":\"Start with the reversible check.\","
            "\"next_tasks\":[{\"title\":\"Run one focused smoke\"}]}'\n"
        )
        fake_claude.chmod(0o755)

        env = os.environ.copy()
        env["TASK_GATE_THINKER"] = "cli"
        env["TASK_GATE_CLAUDE_BIN"] = str(fake_claude)
        completed = run(
            [
                "python3",
                "-B",
                "scripts/task_gate.py",
                "--think",
                "--json",
                "Codex is stuck with no good next step",
            ],
            cwd=PLUGIN_ROOT,
            env=env,
            capture_output=True,
        )
        payload = json.loads(completed.stdout)
        assert payload["ideas"][0]["title"] == "Try a smaller reversible check"
        assert payload["recommendation"] == "Start with the reversible check."


def main() -> int:
    validate_plugin_manifest()
    validate_skill()
    run(["python3", "-m", "py_compile", "scripts/task_gate.py", "scripts/codex_gate.py"], cwd=PLUGIN_ROOT)
    run_unit_tests()
    run_gate_smoke()
    run_think_smoke()
    print("clean test passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
