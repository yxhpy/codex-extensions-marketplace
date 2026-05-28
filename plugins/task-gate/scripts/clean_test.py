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
    assert manifest["mcpServers"] == "./.mcp.json"
    assert manifest["skills"] == "./skills/"
    assert "Task Gate" in manifest["interface"]["displayName"]

    mcp = json.loads((PLUGIN_ROOT / ".mcp.json").read_text())
    server = mcp["mcpServers"]["task-gate"]
    assert server["command"] == "python3"
    assert server["args"] == ["./scripts/mcp_server.py"]
    assert server["cwd"] == "."


def validate_skill() -> None:
    skill_path = PLUGIN_ROOT / "skills" / "task-gate" / "SKILL.md"
    text = skill_path.read_text()
    assert text.startswith("---\n")
    assert "\nname: task-gate\n" in text
    assert "plan_prompt" in text
    assert "codex_gate.py --execute" in text


def run_unit_tests() -> None:
    suite = unittest.defaultTestLoader.discover(str(PLUGIN_ROOT / "tests"))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if not result.wasSuccessful():
        raise SystemExit(1)


def run_mcp_smoke() -> None:
    payload = '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n'
    completed = run(
        ["python3", "-B", "scripts/mcp_server.py"],
        cwd=PLUGIN_ROOT,
        input=payload,
        capture_output=True,
    )
    response = json.loads(completed.stdout)
    tools = response["result"]["tools"]
    assert tools[0]["name"] == "plan_prompt"


def run_gate_smoke() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        fake_claude = Path(temp_dir) / "claude"
        fake_claude.write_text(
            "#!/bin/sh\n"
            "printf '%s\\n' "
            "'{\"tasks\":[{\"title\":\"Plan in Docker\"},{\"title\":\"Verify in Docker\"}]}'\n"
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


def main() -> int:
    validate_plugin_manifest()
    validate_skill()
    run(["python3", "-m", "py_compile", "scripts/task_gate.py", "scripts/mcp_server.py", "scripts/codex_gate.py"], cwd=PLUGIN_ROOT)
    run_unit_tests()
    run_mcp_smoke()
    run_gate_smoke()
    print("clean test passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
