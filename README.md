# yxhpy Codex Extensions

Public catalog for optional Codex plugins, skills, and MCP-oriented tools.

## Contents

| Type | Name | Path | Purpose |
| --- | --- | --- | --- |
| Plugin + MCP | `task-gate` | `plugins/task-gate` | Converts raw prompts into numbered task plans before Codex executes. Includes `scripts/codex_gate.py` and an MCP stdio server. |
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
codex plugin add grok-augment@yxhpy-codex-extensions
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

- `task-gate` uses Python 3 and Claude credentials from Claude settings or environment.
- `task-gate` prefers Claude API in `auto` mode and falls back to Claude CLI when API planning fails.
- `grok-augment` expects the `grok` CLI on `PATH`, or set `GROK_AUGMENT_GROK_BIN=/path/to/grok`.
- `grok-augment` is deliberately non-mutating for code: it uses Grok for research, critique, creative direction, divergence, Grok-video-only briefs, and `video-generate` MP4 resources while Codex keeps file edits and verification.
- `agy-frontend` expects the `agy` CLI on `PATH`, or set `AGY_BIN=/path/to/agy`.

## Verification

Release checks used for this repository:

```bash
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/task-gate
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/grok-augment
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/agy-frontend
cd plugins/task-gate && ./scripts/docker_clean_test.sh
python3 plugins/grok-augment/scripts/clean_test.py
```

For host-specific releases, run a real macOS Codex smoke test in an isolated temporary workspace before publishing.
