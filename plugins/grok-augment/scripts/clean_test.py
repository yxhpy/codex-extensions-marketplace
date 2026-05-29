#!/usr/bin/env python3
from __future__ import annotations

import os
import stat
import subprocess
import sys
import tempfile
from pathlib import Path


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PLUGIN_ROOT.parents[1]


def run(args: list[str], env: dict[str, str] | None = None) -> None:
    completed = subprocess.run(
        args,
        cwd=REPO_ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        sys.stderr.write(completed.stdout)
        sys.stderr.write(completed.stderr)
        raise SystemExit(completed.returncode)
    sys.stdout.write(completed.stdout)
    sys.stderr.write(completed.stderr)


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        fake_home = root / "home"
        fake_codex_home = root / "codex"
        fake_bin = root / "bin"
        fake_home.mkdir()
        fake_codex_home.mkdir()
        fake_bin.mkdir()
        fake_grok = fake_bin / "grok"
        fake_grok.write_text(
            "#!/bin/sh\n"
            "case \"$*\" in\n"
            "  *--version*) echo 'grok 0.0.clean-test'; exit 0 ;;\n"
            "  *models*) echo 'grok-build'; exit 0 ;;\n"
            "  *) echo 'CLEAN_TEST_GROK_RESPONSE'; exit 0 ;;\n"
            "esac\n",
            encoding="utf-8",
        )
        fake_grok.chmod(fake_grok.stat().st_mode | stat.S_IXUSR)
        env = os.environ.copy()
        env.update(
            {
                "HOME": str(fake_home),
                "CODEX_HOME": str(fake_codex_home),
                "GROK_AUGMENT_GROK_BIN": str(fake_grok),
            }
        )
        run(["python3", "-m", "unittest", "discover", "-s", "plugins/grok-augment/tests"], env)
        run(["python3", str(PLUGIN_ROOT / "scripts/grok_augment.py"), "inspect", "--json"], env)
        run(
            [
                "python3",
                str(PLUGIN_ROOT / "scripts/grok_augment.py"),
                "--json",
                "video",
                "one safe closed-loop test shot",
            ],
            env,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
