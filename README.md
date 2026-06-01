# yxhpy Codex Extensions

Public catalog for optional Codex plugins and MCP-oriented tools.

## Contents

| Type | Name | Path | Purpose |
| --- | --- | --- | --- |
| Plugin + Scripts + Skills | `codex-augment-dispatcher` | `plugins/codex-augment-dispatcher` | Extensible agent dynamic-workflow, external CLI adapter, deterministic generated-asset workflow, and owner-agent coordination hub; adapters cover platform-neutral workflow artifacts, Claude task gating, Grok augmentation, AGY frontend implementation, and asset slicing. |
| Pi Extension | `codex_generate_image` | `extensions/codex-image-gen` | Generate bitmap images from Pi through the OpenAI Codex Responses backend using the existing `openai-codex` login; backend image model is gpt-image-2. |
| Pi Extension | `xai_grok_x_search`, `xai_grok_video_generate` | `extensions/xai-grok` | Search X and generate Grok Imagine videos from Pi using xAI API keys or Pi-owned xAI OAuth, without depending on Hermes. |

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
- These rules help the owner agent proactively choose `dynamic-workflow`,
  `task-gate`, `thinking-gate`, `grok-augment`, `agy-frontend`, or
  `asset-slicer` without waiting for explicit mentions.
- Mandatory gated execution does not require editing project `AGENTS.md`; use
  `scripts/codex_gate.ts` when the raw prompt must be classified before Codex
  receives execution tasks.
- The included thread/subagent fanout rules let the owner agent use read-only
  background workers for research, planning, frontend checks, and release review
  while one owner thread keeps responsibility for edits, tests, release gates,
  integration, and final claims.

Update later:

```bash
codex plugin marketplace upgrade yxhpy-codex-extensions
codex plugin add codex-augment-dispatcher@yxhpy-codex-extensions
```

During development, do not publish or install this merge for normal use until the isolated release gates pass.

## Install in Pi

Install the same repository as a Pi package to expose the bundled dispatcher
skills to Pi sessions:

```bash
pi install git:github.com/yxhpy/codex-extensions-marketplace@main
pi list
```

For local development, install the checkout path instead:

```bash
pi install /path/to/codex-extensions-marketplace
```

Pi loads the skills from `plugins/codex-augment-dispatcher/skills`, the
Codex image generation extension from `extensions/codex-image-gen/index.ts`,
and the standalone xAI/Grok extension from `extensions/xai-grok/index.ts`.
The helper scripts remain repository-owned TypeScript scripts; when a Pi-loaded
skill needs to invoke one, resolve the active `SKILL.md` directory and use the
documented skill-relative path such as `../../scripts/task_gate.ts`.

### Codex image generation in Pi

After installing the Pi package, run `/login` and select **ChatGPT Plus/Pro
(Codex)**. Then ask for a bitmap asset, or explicitly ask the agent to use
`codex_generate_image`. The tool reuses Pi's `openai-codex` credential, calls
Codex's Responses backend with `image_generation`, and saves the generated file
according to its save mode.

Optional config file paths:

- Global: `~/.pi/agent/extensions/codex-image-gen.json`
- Project: `<project>/.pi/extensions/codex-image-gen.json`

Example:

```json
{
  "save": "project",
  "model": "gpt-5.5",
  "quality": "low",
  "size": "1024x1024"
}
```

### xAI/Grok X Search and video in Pi

The `extensions/xai-grok` Pi extension is independent of Hermes. It never shells
out to Hermes and never reads `~/.hermes/auth.json`. It resolves xAI credentials
from `XAI_API_KEY` / `PI_XAI_API_KEY`, from optional Pi config, or from Pi-owned
OAuth credentials created with `/xai-grok-login`.

Available tools:

- `xai_grok_x_search`: calls xAI `/v1/responses` with the native `x_search` tool.
- `xai_grok_video_generate`: starts `/v1/videos/generations`, polls the request,
  and downloads the completed MP4 into the workspace by default.

Optional config file paths:

- Global: `~/.pi/agent/extensions/xai-grok.json`
- Project: `<project>/.pi/extensions/xai-grok.json`

Example:

```json
{
  "baseUrl": "https://api.x.ai/v1",
  "searchModel": "grok-4.3",
  "videoModel": "grok-imagine-video",
  "videoOutputDir": "assets/generated/videos"
}
```

## Capabilities

This plugin keeps its install identity stable while adding platform-neutral agent workflow orchestration, more external CLI adapters, and thread/subagent coordination rules.

Initial adapters:

- Agent dynamic workflow orchestration: `skills/dynamic-workflow` and `scripts/dynamic_workflow.ts` create durable `.agent-workflows/<id>/` artifacts with approval gates, packet/result lifecycle, structured evidence, simulated-packet fallback, and final verification.
- Claude CLI task gating: `scripts/task_gate.ts` generates divergent ideas and numbered task plans, while `scripts/codex_gate.ts` can pass only the generated task plan into `codex exec` for Codex-specific gated execution rounds.
- Grok CLI augmentation: `scripts/grok_augment.ts` uses Grok for non-mutating research, critique, creative direction, divergence, Grok-video-only briefs, and real MP4 generation through a configured Grok-compatible `/v1/videos` endpoint.
- AGY CLI frontend workflow: `skills/agy-frontend` routes frontend build, edit, redesign, styling, layout, interaction, and visual implementation through Antigravity CLI, while explicitly forbidding AGY from starting blocking frontend dev/preview servers.
- Asset slicing workflow: `skills/asset-slicer` and `scripts/asset_slice.ts` split generated icon/sprite sheets into deterministic PNG slices, remove background pixels, and fail on dirty borders, clipped assets, insufficient gutters, count mismatches, or expected-box drift.

## Mandatory gated execution

`scripts/codex_gate.ts --execute "<raw prompt>"` now classifies the route before
Codex receives an execution prompt. The route can require `dynamic-workflow`,
`task-gate`, `thinking-gate`, `grok-augment`, `agy-frontend`, or `asset-slicer`
for workflow orchestration, planning, stuck, research/review, frontend work, or
generated asset slicing.

When a route requires helper plugins, Codex's Detailed completion summary must
include a `Plugin evidence:` line naming every required plugin and the command,
tool, or transcript evidence. The follow-up gate rejects completion when that
Plugin evidence is missing, even if Codex reports the work as complete.

Future adapters should be added as focused skills and scripts with fake-binary tests, explicit dispatch rules, and the same no-secret/no-fallback boundaries.

The owner agent owns local file edits, integration, verification, commits, and final claims. AGY can edit frontend files only inside the bounded AGY workflow and must not start or keep alive dev/preview servers; the owner agent still gathers context, supervises scope, runs checks, and reports evidence.

No secrets, raw credentials, private tokens, or unnecessary full-repo context should be passed to Claude, Grok, or AGY. No fallback provider is allowed for Grok, Grok Video, or image generation paths. Generated icon/sprite sheets must pass `asset-slicer` before their individual assets are treated as frontend-ready.

## Agent Threads And Subagents

Use background threads or subagents as bounded assistants, not as release authority:

- Research thread: read-only context gathering or option comparison; use
  low/medium thinking and `grok-augment` for outside input when useful.
- Plan thread: advisory decomposition only; use `task-gate` in the owner thread
  for the final numbered task order before implementation.
- Review thread: release, regression, or security risk review; use high/xhigh
  thinking and verify every actionable claim locally after final edits.
- Frontend thread: pair with `agy-frontend` only inside explicit paths; forbid
  AGY from starting dev/preview servers. The owner agent still owns browser
  checks and evidence.

Never run parallel writers against the same working tree. Prefer read-only
threads, or isolated worktrees for independent implementation experiments.
If a model override or background thread fails, retry once with default thread
settings and continue without treating the failed thread as evidence.

## Requirements

- Repository-owned scripts use TypeScript on Node.js with `node --experimental-strip-types`.
- Claude task gating expects the `claude` CLI on `PATH`, or set `TASK_GATE_CLAUDE_BIN=/path/to/claude`.
- Grok augmentation expects the `grok` CLI on `PATH`, or set `GROK_AUGMENT_GROK_BIN=/path/to/grok`.
- AGY frontend work expects the `agy` CLI on `PATH`, or set `AGY_BIN=/path/to/agy`.
- Dynamic workflow orchestration uses repository-owned TypeScript only: `node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts e2e --json "Plan a subagent workflow with approval gates"`.
- Asset slicing uses repository-owned TypeScript only: `node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/asset_slice.ts <sheet.png> --out-dir <dir> --expect-count <n>`.
- Grok augmentation reads an API key from `GROK_VIDEO_API_KEY` by default when the local video endpoint requires one.
- The standalone Pi xAI/Grok extension reads `XAI_API_KEY` / `PI_XAI_API_KEY`, optional Pi config, or its own `/xai-grok-login` OAuth credentials; it does not require Hermes.

## Verification

Release checks used for this repository:

```bash
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/codex-augment-dispatcher
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/dispatch
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/dynamic-workflow
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/task-gate
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/thinking-gate
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/grok-augment
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/agy-frontend
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/asset-slicer
node --experimental-strip-types --test tests/*.ts plugins/codex-augment-dispatcher/tests/*.ts
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts e2e --json "Plan a subagent workflow with approval gates and end-to-end verification"
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/clean_test.ts
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/docker_clean_test.ts
```

For host-specific releases, run a real macOS Codex smoke test in an isolated temporary workspace before publishing.
