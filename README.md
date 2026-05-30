# yxhpy Codex Extensions

Public catalog for optional Codex plugins and MCP-oriented tools.

## Contents

| Type | Name | Path | Purpose |
| --- | --- | --- | --- |
| Plugin + Scripts + Skills | `codex-augment-dispatcher` | `plugins/codex-augment-dispatcher` | Extensible external CLI adapter and Codex background-thread coordination hub; initial adapters cover Claude task gating, Grok augmentation, and AGY frontend implementation. |

## Install Plugin

Add this repository as a Codex plugin marketplace:

```bash
codex plugin marketplace add yxhpy/codex-extensions-marketplace --ref main
codex plugin list --marketplace yxhpy-codex-extensions
```

Install the merged plugin:

```bash
codex plugin add codex-augment-dispatcher@yxhpy-codex-extensions
```

Recommended project instructions:

- Merge [`AGENTS.md`](AGENTS.md) into the target project's existing
  `AGENTS.md`; keep project-specific rules first.
- These rules help Codex proactively choose `task-gate`, `thinking-gate`,
  `grok-augment`, or `agy-frontend` without waiting for explicit mentions.
- Mandatory gated execution does not require editing project `AGENTS.md`; use
  `scripts/codex_gate.ts` when the raw prompt must be classified before Codex
  receives execution tasks.
- The included thread fanout rules let Codex use read-only background threads
  for research, planning, frontend checks, and release review while one owner
  thread keeps responsibility for edits, tests, release gates, and final claims.

Update later:

```bash
codex plugin marketplace upgrade yxhpy-codex-extensions
codex plugin add codex-augment-dispatcher@yxhpy-codex-extensions
```

During development, do not publish or install this merge for normal use until the isolated release gates pass.

## Capabilities

This plugin is intentionally named generically so more external CLI adapters and Codex thread coordination rules can be added later without changing the install identity.

Initial adapters:

- Claude CLI task gating: `scripts/task_gate.ts` generates divergent ideas and numbered task plans, while `scripts/codex_gate.ts` can pass only the generated task plan into `codex exec` for gated execution rounds.
- Grok CLI augmentation: `scripts/grok_augment.ts` uses Grok for non-mutating research, critique, creative direction, divergence, Grok-video-only briefs, and real MP4 generation through a configured Grok-compatible `/v1/videos` endpoint.
- AGY CLI frontend workflow: `skills/agy-frontend` routes frontend build, edit, redesign, styling, layout, interaction, and visual verification through Antigravity CLI.

## Mandatory gated execution

`scripts/codex_gate.ts --execute "<raw prompt>"` now classifies the route before
Codex receives an execution prompt. The route can require `task-gate`,
`thinking-gate`, `grok-augment`, or `agy-frontend` for planning, stuck,
research/review, or frontend work.

When a route requires helper plugins, Codex's Detailed completion summary must
include a `Plugin evidence:` line naming every required plugin and the command,
tool, or transcript evidence. The follow-up gate rejects completion when that
Plugin evidence is missing, even if Codex reports the work as complete.

Future adapters should be added as focused skills and scripts with fake-binary tests, explicit dispatch rules, and the same no-secret/no-fallback boundaries.

Codex owns local file edits, verification, commits, and final claims. AGY can edit frontend files only inside the bounded AGY workflow; Codex still gathers context, supervises scope, runs checks, and reports evidence.

No secrets, raw credentials, private tokens, or unnecessary full-repo context should be passed to Claude, Grok, or AGY. No fallback provider is allowed for Grok, Grok Video, or image generation paths.

## Codex Background Threads

Use background threads as bounded assistants, not as release authority:

- Research thread: read-only context gathering or option comparison; use
  low/medium thinking and `grok-augment` for outside input when useful.
- Plan thread: advisory decomposition only; use `task-gate` in the owner thread
  for the final numbered task order before implementation.
- Review thread: release, regression, or security risk review; use high/xhigh
  thinking and verify every actionable claim locally after final edits.
- Frontend thread: pair with `agy-frontend` only inside explicit paths; Codex
  still owns browser checks and evidence.

Never run parallel writers against the same working tree. Prefer read-only
threads, or isolated worktrees for independent implementation experiments.
If a model override or background thread fails, retry once with default thread
settings and continue without treating the failed thread as evidence.

## Requirements

- Repository-owned scripts use TypeScript on Node.js with `node --experimental-strip-types`.
- Claude task gating expects the `claude` CLI on `PATH`, or set `TASK_GATE_CLAUDE_BIN=/path/to/claude`.
- Grok augmentation expects the `grok` CLI on `PATH`, or set `GROK_AUGMENT_GROK_BIN=/path/to/grok`.
- AGY frontend work expects the `agy` CLI on `PATH`, or set `AGY_BIN=/path/to/agy`.
- Grok video generation reads an API key from `GROK_VIDEO_API_KEY` by default when the local video endpoint requires one.

## Verification

Release checks used for this repository:

```bash
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/codex-augment-dispatcher
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/dispatch
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/task-gate
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/thinking-gate
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/grok-augment
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/agy-frontend
node --experimental-strip-types --test plugins/codex-augment-dispatcher/tests/*.ts
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/clean_test.ts
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/docker_clean_test.ts
```

For host-specific releases, run a real macOS Codex smoke test in an isolated temporary workspace before publishing.
