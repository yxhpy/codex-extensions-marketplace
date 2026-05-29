# yxhpy Codex Extensions

Public catalog for optional Codex plugins, skills, and MCP-oriented tools.

## Contents

| Type | Name | Path | Purpose |
| --- | --- | --- | --- |
| Plugin + Scripts | `task-gate` | `plugins/task-gate` | Gives Codex a divergent-thinking gate for stuck moments through local scripts, while retaining numbered task planning and the `scripts/codex_gate.ts` wrapper. |
| Plugin + Scripts | `grok-augment` | `plugins/grok-augment` | Lets Codex call Grok for non-mutating research, critique, creative direction, divergence, Grok-video-only briefs, and real MP4 generation. |
| Skill | `agy-frontend` | `skills/agy-frontend` | Routes frontend implementation through the Antigravity CLI and requires local visual verification. |

## Install Plugins

Add this repository as a Codex plugin marketplace:

```bash
codex plugin marketplace add yxhpy/codex-extensions-marketplace --ref main
codex plugin list --marketplace yxhpy-codex-extensions
```

Install only the plugin you want:

```bash
codex plugin add task-gate@yxhpy-codex-extensions
codex plugin add grok-augment@yxhpy-codex-extensions
```

Update later:

```bash
codex plugin marketplace upgrade yxhpy-codex-extensions
codex plugin add task-gate@yxhpy-codex-extensions
```

## Install Skills

Install `agy-frontend` with Codex's skill installer:

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --repo yxhpy/codex-extensions-marketplace \
  --path skills/agy-frontend \
  --method git
```

Restart Codex after installing a skill.

## Requirements

- Repository-owned scripts use TypeScript on Node.js with `node --experimental-strip-types`.
- `task-gate` uses Node.js and the local Claude CLI.
- `task-gate` runs `scripts/task_gate.ts --think --json` for divergent candidate ideas and `scripts/task_gate.ts --json` for numbered execution plans.
- `task-gate` runs `scripts/codex_gate.ts --execute` as an execution loop: Codex must produce a detailed completion summary, Task Gate reviews it, and incomplete work is converted into the next numbered tasks until completion or `--max-rounds` is reached.
- `task-gate` defaults to a 300 second Claude CLI timeout; override with `TASK_GATE_CLAUDE_TIMEOUT`.
- `grok-augment` expects the `grok` CLI on `PATH`, or set `GROK_AUGMENT_GROK_BIN=/path/to/grok`.
- `grok-augment` is deliberately non-mutating for code: it uses Grok for research, critique, creative direction, divergence, Grok-video-only briefs, and `video-generate` MP4 resources while Codex keeps file edits and verification.
- `agy-frontend` expects the `agy` CLI on `PATH`, or set `AGY_BIN=/path/to/agy`.

## Verification

Release checks used for this repository:

```bash
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/task-gate
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/grok-augment
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/agy-frontend
node --experimental-strip-types --test skills/agy-frontend/tests/*.ts plugins/task-gate/tests/*.ts plugins/grok-augment/tests/*.ts
cd plugins/task-gate && ./scripts/docker_clean_test.sh
node --experimental-strip-types plugins/grok-augment/scripts/clean_test.ts
```

For host-specific releases, run a real macOS Codex smoke test in an isolated temporary workspace before publishing.
