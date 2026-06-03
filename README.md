# yxhpy Codex Extensions

Public catalog for optional Codex plugins and MCP-oriented tools.

## Contents

| Type | Name | Path | Purpose |
| --- | --- | --- | --- |
| Plugin + Scripts + Skills | `codex-augment-dispatcher` | `plugins/codex-augment-dispatcher` | Extensible reliable-agent workflow, dynamic-workflow, MCP helper, subagent fanout, external CLI adapter, high-quality media guidance, GSAP motion guidance, deterministic generated-asset workflow, and owner-agent coordination hub; adapters cover cross-harness reliable delivery for Pi/Codex/Claude Code/Grok, platform-neutral workflow artifacts, Claude task gating, Grok augmentation, AGY frontend implementation, generated icon slicing, GSAP animation briefs, dispatcher MCP, mcp-generator, and asset slicing. **Now also includes ui-ux-closed-loop for full requirements-to-product-thinking-to-low-fi-prototype-to-polished-UI/UX orchestration with external skill references.** |
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

To enable *real* (not just simulated) subagent fanout, copy the harness-specific examples from `docs/examples/` (Codex .toml, Claude .md frontmatter agents, Grok personas) into your project or global config. See the full research + recipes in `docs/CROSS_HARNESS_SUBAGENT_TRIGGERING.md`. After `dynamic_workflow.ts new`, run:

```bash
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts launch-packets --harness codex .agent-workflows/<id>
```

This emits the exact native spawn commands (Grok task+persona, Claude Agent/@mention, Codex with tomls + profile, Pi subagent(), or cc-router taskctl fallback) so the owner can (or the harness can auto) execute the subagent-mode packets and record evidence.

Recommended project instructions:

- Merge [`AGENTS.md`](AGENTS.md) into the target project's existing
  `AGENTS.md`; keep project-specific rules first.
- These rules help the owner agent proactively choose `dynamic-workflow`,
  `reliable-agent-workflow`, `dynamic-workflow`, `task-gate`,
  `thinking-gate`, `grok-augment`, `agy-frontend`, `gsap-animation`,
  `asset-slicer`, `ui-ux-closed-loop`, or `mcp-generator` without waiting for explicit mentions.
- Mandatory gated execution does not require editing project `AGENTS.md`; use
  `scripts/codex_gate.ts` when the raw prompt must be classified before Codex
  receives execution tasks.
- The included thread/subagent fanout rules make background workers easier to
  trigger for independent research, planning, frontend checks, validation, and
  release review while one owner thread keeps responsibility for edits, tests,
  release gates, integration, and final claims.

Update later:

```bash
codex plugin marketplace upgrade yxhpy-codex-extensions
codex plugin add codex-augment-dispatcher@yxhpy-codex-extensions
```

During development, do not publish or install this merge for normal use until the isolated release gates pass.

## UI/UX Design Closed Loop (Requirements → Product Thinking → Low-fi Prototypes → Polished UI/UX)

This marketplace now provides orchestration for the complete visual/product design flow while **referencing** (not hardcoding) best external skills for depth. See the new `ui-ux-closed-loop` skill inside the dispatcher and `docs/UI-UX-CLOSED-LOOP.md` for the full workflow, exact install commands for externals (npx skills add ...), coordination rules, and philosophy.

Key local pieces that stay self-contained:
- `agy-frontend`: specialist delegation for frontend impl + strict real generated media (image_gen/Grok Video) + no SVG/emoji defaults + taste rules.
- `asset-slicer`: deterministic quality gate for generated icon/sprite sheets.
- `gsap-animation`: distilled motion guidance + verification (references the official greensock/gsap-skills).

External references (install separately for best results; the loop skill will compose their rules when active):
- `frontend-design` (anthropics) for bold non-generic aesthetics.
- `ui-ux-pro-max` for design intelligence DB (styles, palettes, UX guidelines, priority rules).
- Wireframe Prototyping skills for low-fi stage.
- Vercel guidelines for correctness/a11y/perf review.
- Official GSAP skills for deep animation.
- And more (product research, critique, DS, a11y) as listed in the docs.

Install the externals with the skills CLI (works across Codex, Claude Code, Cursor...):
```bash
npx skills add https://github.com/anthropics/skills --skill frontend-design
npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max
npx skills add https://github.com/greensock/gsap-skills
# ... see docs/UI-UX-CLOSED-LOOP.md for the full curated list and commands
```

The dispatcher plugin already anticipates this: agy-frontend SKILL.md says to use `frontend-design` constraints when present.

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
  "quality": "high",
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
  defaults to broadly supported 720p output, and downloads the completed MP4
  into the workspace by default.

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

Grok video generation defaults to `720p` because some xAI teams cannot access `1080p`. Request `1080p` only when the user's xAI team explicitly supports it.

## Capabilities

This plugin keeps its install identity stable while adding cross-harness reliable engineering delivery, platform-neutral agent workflow orchestration, stronger subagent/thread fanout routing, MCP helper surfaces, high-quality media defaults, more external CLI adapters, and thread/subagent coordination rules.

Initial adapters:

- Reliable agent workflow: `skills/reliable-agent-workflow` vendors the latest `yxhpy/reliable-agent-workflow-skill` content and applies to Pi, Codex, Claude Code, Grok, and similar CLI tools. It triggers on complex coding, refactors, migrations, debugging, architecture work, deep analysis, optimization plans, high-risk changes, design-review-implement, Best-of-N, check-work, zero-open-issue loops, independent verification, and e2e verification. `scripts/sync_reliable_agent_workflow.ts` can sync or verify the bundled skill against the upstream GitHub HEAD.
- Agent dynamic workflow orchestration: `skills/dynamic-workflow` and `scripts/dynamic_workflow.ts` create durable `.agent-workflows/<id>/` artifacts with approval gates, packet/result lifecycle, structured evidence, simulated-packet fallback, and final verification. Prompts mentioning subagents, background threads, agent threads, worker agents, fanout, delegation, packets, workflow scripts, Claude Code Dynamic Workflows, `ultracode`, `.claude/workflows`, `.atomic`, or parallel review/research/QA trigger this path more reliably. `.agent-workflows/` stays canonical; native layouts are optional bridge metadata.
- Claude CLI task gating: `scripts/task_gate.ts` generates divergent ideas and numbered task plans, while `scripts/codex_gate.ts` can pass only the generated task plan into `codex exec` for Codex-specific gated execution rounds.
- Grok CLI augmentation: `scripts/grok_augment.ts` uses Grok for non-mutating research, critique, creative direction, divergence, Grok-video-only briefs, and real MP4 generation through a configured Grok-compatible `/v1/videos` endpoint.
- AGY CLI frontend workflow: `skills/agy-frontend` routes frontend build, edit, redesign, styling, layout, interaction, and visual implementation through Antigravity CLI, while explicitly forbidding AGY from starting blocking frontend dev/preview servers. SVG and emoji are prohibited as default visual assets; visual-led work defaults to high-quality image_gen/Grok Video assets.
- GSAP animation guidance: `skills/gsap-animation` distills `greensock/gsap-skills` into motion briefs for webpage animation, ScrollTrigger, framework lifecycle cleanup, accessibility, and performance; AGY still owns frontend implementation and the owner agent verifies locally.
- Asset slicing workflow: `skills/asset-slicer` and `scripts/asset_slice.ts` split generated icon/sprite sheets into deterministic PNG slices, remove background pixels, and fail on dirty borders, clipped assets, insufficient gutters, count mismatches, or expected-box drift. Custom icons default to image_gen sheet generation followed by `asset-slicer` rather than SVG or emoji.
- Dispatcher MCP surface: `scripts/dispatcher_mcp.ts` is a minimal stdio JSON-RPC tool surface exposing dispatch classification, workflow create/approve/verify, and reliable-stage contracts. It is script-only by default and does not add manifest-level `mcpServers` wiring.
- MCP generator guidance: `skills/mcp-generator` helps create small dispatcher-compatible MCP or skill/MCP scaffolds with owner-agent verification boundaries and fake stdio tests.
- **UI/UX closed loop (new)**: `skills/ui-ux-closed-loop` orchestrates the full flow from requirements/product thinking/low-fi prototypes (referencing external wireframe + research skills) through aesthetics (frontend-design), design intelligence (ui-ux-pro-max), assets (local + slicer), motion (gsap), impl (agy-frontend composed with externals), to review/verification (Vercel guidelines + local evidence loops). External skills are integrated as references/install guidance only.

## Mandatory gated execution

`scripts/codex_gate.ts --execute "<raw prompt>"` now classifies the route before
Codex receives an execution prompt. The route can require `dynamic-workflow`,
`reliable-agent-workflow`, `dynamic-workflow`, `task-gate`, `thinking-gate`,
`grok-augment`, `agy-frontend`, `gsap-animation`, `asset-slicer`, `ui-ux-closed-loop`, or
`mcp-generator` for
reliable delivery, workflow orchestration, planning, stuck, research/review,
frontend work, GSAP motion, generated asset slicing, or MCP helper scaffolding.

When a route requires helper plugins, Codex's Detailed completion summary must
include a `Plugin evidence:` line naming every required plugin and the command,
tool, or transcript evidence. The follow-up gate rejects completion when that
Plugin evidence is missing, even if Codex reports the work as complete.

Future adapters should be added as focused skills and scripts with fake-binary tests, explicit dispatch rules, and the same no-secret/no-fallback boundaries. Instructional skills without a CLI, such as `gsap-animation` or `reliable-agent-workflow`, should still include static routing and verification tests.

The owner agent owns local file edits, integration, verification, commits, and final claims. AGY can edit frontend files only inside the bounded AGY workflow and must not start or keep alive dev/preview servers; the owner agent still gathers context, supervises scope, runs checks, and reports evidence.

No secrets, raw credentials, private tokens, or unnecessary full-repo context should be passed to Claude, Grok, or AGY. `reliable-agent-workflow` is cross-harness guidance and must preserve the invoking harness's permission, sandbox, and model constraints. No fallback provider is allowed for Grok, Grok Video, or image generation paths. Generated icon/sprite sheets must pass `asset-slicer` before their individual assets are treated as frontend-ready. SVG and emoji are not default visual assets for frontend polish; generate high-quality image/video assets instead.

## Agent Threads And Subagents

Use background threads or subagents as bounded assistants by default for independent work, not as release authority:

- Research thread: read-only context gathering or option comparison; use
  low/medium thinking and `grok-augment` for outside input when useful.
- Reliable thread/workflow: use `reliable-agent-workflow` for cross-harness
  design, implementation review, repair-until-zero-open-issues, independent
  verification, artifact tracking, and memory capture. It is valid for Pi,
  Codex, Claude Code, Grok, and similar CLI tools.
- Plan thread: advisory decomposition only; use `task-gate` in the owner thread
  for the final numbered task order before implementation.
- Review thread: release, regression, or security risk review; use high/xhigh
  thinking and verify every actionable claim locally after final edits.
- Frontend thread: pair with `agy-frontend` only inside explicit paths; forbid
  AGY from starting dev/preview servers. The owner agent still owns browser
  checks and evidence.
- Asset/media thread: for visual-led work, generate high-quality image/video
  assets first; custom icons default to an image_gen sheet sliced with
  `asset-slicer`, not SVG or emoji.

Never run parallel writers against the same working tree. Prefer read-only
threads, or isolated worktrees for independent implementation experiments.
If a model override or background thread fails, retry once with default thread
settings and continue without treating the failed thread as evidence.

## Requirements

- Repository-owned scripts use TypeScript on Node.js with `node --experimental-strip-types`.
- Claude task gating expects the `claude` CLI on `PATH`, or set `TASK_GATE_CLAUDE_BIN=/path/to/claude`.
- Grok augmentation expects the `grok` CLI on `PATH`, or set `GROK_AUGMENT_GROK_BIN=/path/to/grok`.
- AGY frontend work expects the `agy` CLI on `PATH`, or set `AGY_BIN=/path/to/agy`.
- Reliable agent workflow is vendored from `https://github.com/yxhpy/reliable-agent-workflow-skill`; check freshness with `node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/sync_reliable_agent_workflow.ts check --remote` and sync with `... sync --remote`.
- Dynamic workflow orchestration uses repository-owned TypeScript only: `node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts e2e --json "Plan a subagent workflow with approval gates"`.
- Dispatcher MCP uses repository-owned TypeScript only: `node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dispatcher_mcp.ts` with line-delimited JSON-RPC requests on stdin.
- Asset slicing uses repository-owned TypeScript only: `node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/asset_slice.ts <sheet.png> --out-dir <dir> --expect-count <n>`.
- Grok augmentation reads an API key from `GROK_VIDEO_API_KEY` by default when the local video endpoint requires one and defaults Grok Video helper generation to high quality.
- The standalone Pi xAI/Grok extension reads `XAI_API_KEY` / `PI_XAI_API_KEY`, optional Pi config, or its own `/xai-grok-login` OAuth credentials; it does not require Hermes.

## Verification

Release checks used for this repository:

```bash
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/codex-augment-dispatcher
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/dispatch
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/reliable-agent-workflow
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/dynamic-workflow
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/task-gate
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/thinking-gate
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/grok-augment
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/agy-frontend
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/gsap-animation
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/asset-slicer
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/mcp-generator
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/ui-ux-closed-loop
npm ci
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/sync_reliable_agent_workflow.ts check --remote
node --experimental-strip-types --check plugins/codex-augment-dispatcher/scripts/dispatcher_mcp.ts
node --experimental-strip-types --test tests/*.ts plugins/codex-augment-dispatcher/tests/*.ts
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts e2e --json "Plan a subagent workflow with approval gates and end-to-end verification"
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/clean_test.ts
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/docker_clean_test.ts
```

The shortcut release gate is:

```bash
npm run release:check
```

For host-specific releases, run a real macOS Codex smoke test in an isolated temporary workspace before publishing.
