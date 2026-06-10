# yxhpy Codex Extensions

<p align="center">
  <strong>One owner agent. Many specialist helpers. A durable audit trail.</strong><br />
  A polished marketplace for Codex/Pi extensions, MCP-ready workflows, real subagent fanout, media tools, and release-grade verification.
</p>

<p align="center">
  <code>v0.1.23</code> · <code>Node >= 22.18</code> · <code>Codex plugin</code> · <code>Pi package</code> · <code>MCP-ready</code>
</p>

---

## Why this repo exists

Modern coding agents are powerful, but serious work needs structure: planning,
review, fanout, evidence, and release gates. This marketplace packages those
patterns into a stable dispatcher plugin plus a few focused Pi extensions.

> **Core idea:** keep one owner agent accountable for edits, tests, release
> decisions, and final claims while routing specialist work through explicit,
> auditable helpers.

## At a glance

| You want to... | Use this | What it gives you |
| --- | --- | --- |
| Orchestrate complex work | `dynamic-workflow` | `.agent-workflows/<id>/`, packet graph, approvals, refined results, adaptive logs, `verify --complete` |
| Deliver risky engineering changes | `reliable-agent-workflow` | Design → review → repair → independent verification → zero-open-issue loop |
| Fan out real workers | `launch-packets` + `record-result` | Harness-specific worker recipes for Codex, Claude Code, Grok, Pi, and cc-router, then result ingestion back into `workflow.json` |
| Gate Codex execution | `task-gate` / `codex_gate.ts` | Route classification, numbered plans, follow-up completion checks, required `Plugin evidence:` |
| Add frontend polish | `agy-frontend` + `gsap-animation` | Bounded frontend delegation, no blocking dev servers, motion briefs, reduced-motion/perf checks |
| Generate and slice assets | `codex_generate_image` + `asset-slicer` | high-quality image_gen/Grok Video defaults, PNG sheet slicing, deterministic quality gates |
| Use Grok capabilities | `grok-augment` + `xai-grok` | Non-mutating research/critique, Grok video briefs, X Search, Grok Imagine video generation |
| Build full UI/UX loops | `ui-ux-closed-loop` | Requirements → product thinking → low-fi prototype → polished UI/UX with external skill references |
| Expose helper tools | `dispatcher_mcp.ts` | Minimal stdio JSON-RPC tools for classification, workflows, verification, and reliable contracts |

## Repository map

| Type | Name | Path | Role |
| --- | --- | --- | --- |
| Plugin + scripts + skills | `codex-augment-dispatcher` | `plugins/codex-augment-dispatcher` | The main orchestration hub: reliable delivery, dynamic workflow artifacts, MCP helpers, subagent fanout, task gates, Grok augmentation, AGY frontend, GSAP motion, asset slicing, and UI/UX closed loops. |
| Pi extension | `codex_generate_image` | `extensions/codex-image-gen` | Generate bitmap assets through the OpenAI Codex Responses backend using Pi's existing `openai-codex` login. |
| Pi extension | `xai_grok_x_search`, `xai_grok_video_generate` | `extensions/xai-grok` | Use xAI X Search and Grok Imagine video generation from Pi without relying on Hermes. |
| Docs | Cross-harness recipes | `docs/CROSS_HARNESS_SUBAGENT_TRIGGERING.md` | Exact recipes and setup notes for real subagent fanout across Codex, Claude Code, Grok, Pi, and cc-router. |
| Docs | UI/UX loop | `docs/UI-UX-CLOSED-LOOP.md` | Reference-based integration for external design, wireframe, accessibility, and motion skills. |

---

## Install Plugin

Add this repository as a Codex plugin marketplace:

```bash
codex plugin marketplace add yxhpy/codex-extensions-marketplace --ref main
codex plugin list --marketplace yxhpy-codex-extensions
```

Install the merged dispatcher plugin:

```bash
codex plugin add codex-augment-dispatcher@yxhpy-codex-extensions
```

Update later:

```bash
codex plugin marketplace upgrade yxhpy-codex-extensions
codex plugin add codex-augment-dispatcher@yxhpy-codex-extensions
```

> During development, do not publish or install this merge for normal use until
> the isolated release gates pass.

## Real subagent fanout

To enable **real** subagent fanout instead of only simulated packets, copy the
harness-specific examples from `docs/examples/` into your target project or
global agent config:

- Codex: `.codex/agents/*.toml`
- Claude Code: `.claude/agents/*.md`
- Grok: persona/config notes in `docs/examples/grok-agents/`
- Pi: `subagent({ ... })` recipes printed by the workflow launcher
- cc-router: `taskctl capability` bridge recipes

Create a workflow, print launch recipes, let workers write results, then ingest
those results:

```bash
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts new --json "Plan a risky subagent migration with approval gates"
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts launch-packets --harness auto .agent-workflows/<id>
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts record-result --packet <packet-id> .agent-workflows/<id>
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts verify --complete .agent-workflows/<id>
```

`record-result` is the real-worker bridge: it normalizes Markdown/JSON worker
outputs into `workflow.json`, `results[].refined`, plugin evidence, verification
records, condensed logs, adaptive judgments, `graph.json`, and `final-report.md`.
Use `--harness auto` to print recipes for all supported harnesses.

See `docs/CROSS_HARNESS_SUBAGENT_TRIGGERING.md` for the full research and exact
spawn commands across Pi, Codex, Claude Code, Grok, and cc-router.

## Recommended project instructions

Merge [`AGENTS.md`](AGENTS.md) into the target project's existing `AGENTS.md`;
keep project-specific rules first. These rules help the owner agent proactively choose
`dynamic-workflow`, `reliable-agent-workflow`, `task-gate`, `thinking-gate`,
`grok-augment`, `agy-frontend`, `gsap-animation`, `asset-slicer`,
`ui-ux-closed-loop`, or `mcp-generator` without waiting for explicit mentions.

The included thread/subagent fanout rules make background workers easier to
trigger for independent research, planning, frontend checks, validation, and
release review while one owner thread keeps responsibility for edits, tests,
release gates, integration, and final claims.

Mandatory gated execution does not require editing project `AGENTS.md`; use
`scripts/codex_gate.ts` when the raw prompt must be classified before Codex
receives execution tasks.

---

## UI/UX Design Closed Loop (Requirements → Product Thinking → Low-fi Prototypes → Polished UI/UX)

The dispatcher can run a complete visual/product design loop while
**referencing** external best-of-breed skills instead of hardcoding their full
content.

Local pieces that stay self-contained:

- `agy-frontend`: bounded frontend implementation, strict real generated media,
  no SVG/emoji defaults, taste checks, and no blocking dev servers.
- `asset-slicer`: deterministic quality gate for generated icon/sprite sheets.
- `gsap-animation`: compact motion guidance and verification, referencing the
  official Greensock skills when deeper detail is installed.

External references to install separately for best results:

| External skill | Purpose |
| --- | --- |
| `frontend-design` | Bold, non-generic aesthetics and strong visual direction. |
| `ui-ux-pro-max` | Design intelligence: styles, palettes, UX guidelines, product-type reasoning. |
| Wireframe Prototyping | Low-fi flows, tasks, validation metrics, and prototype iteration. |
| Vercel guidelines | Web correctness, accessibility, performance, and React quality review. |
| Official GSAP skills | Deeper animation and ScrollTrigger patterns. |

Install core externals with the skills CLI:

```bash
npx skills add https://github.com/anthropics/skills --skill frontend-design
npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max
npx skills add https://github.com/greensock/gsap-skills
# See docs/UI-UX-CLOSED-LOOP.md for the full curated list and commands.
```

The dispatcher plugin already anticipates this: `agy-frontend` composes active
`frontend-design`, `ui-ux-pro-max`, `asset-slicer`, and `gsap-animation`
constraints into the implementation prompt while the owner agent verifies.

## Install in Pi

Install the same repository as a Pi package to expose the bundled dispatcher
skills and extensions to Pi sessions:

```bash
pi install git:github.com/yxhpy/codex-extensions-marketplace@main
pi list
```

For local development, install the checkout path instead:

```bash
pi install /path/to/codex-extensions-marketplace
```

Pi loads:

- skills from `plugins/codex-augment-dispatcher/skills`
- Codex image generation from `extensions/codex-image-gen/index.ts`
- xAI/Grok tools from `extensions/xai-grok/index.ts`

Helper scripts remain repository-owned TypeScript scripts. When a Pi-loaded
skill needs to invoke one, resolve the active `SKILL.md` directory and use the
skill-relative path such as `../../scripts/task_gate.ts`.

### Codex image generation in Pi

After installing the Pi package, run `/login` and select **ChatGPT Plus/Pro
(Codex)**. Then ask for a bitmap asset, or explicitly ask the agent to use
`codex_generate_image`. The tool reuses Pi's `openai-codex` credential, calls
Codex's Responses backend with `image_generation`, and saves the generated file
according to its save mode.

Optional config paths:

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
from `XAI_API_KEY` / `PI_XAI_API_KEY`, optional Pi config, or Pi-owned OAuth
credentials created with `/xai-grok-login`.

Available tools:

- `xai_grok_x_search`: calls xAI `/v1/responses` with the native `x_search` tool.
- `xai_grok_video_generate`: starts `/v1/videos/generations`, polls the request,
  defaults to broadly supported 720p output, and downloads the completed MP4.

Optional config paths:

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

Grok video generation defaults to `720p` because some xAI teams cannot access
`1080p`. Request `1080p` only when the user's xAI team explicitly supports it.

---

## Capability map

### Orchestration and verification

- `dynamic-workflow`: creates durable workflow artifacts with approvals,
  packet/result lifecycle, `record-result` ingestion, structured evidence,
  simulated fallback, adaptive condensed logs, and final verification.
- `reliable-agent-workflow`: vendors the latest
  `yxhpy/reliable-agent-workflow-skill` and applies to Pi, Codex, Claude Code,
  Grok, and similar CLIs for complex coding, refactors, migrations, debugging,
  architecture work, deep analysis, optimization plans, Best-of-N,
  zero-open-issue loops, independent verification, and e2e verification.
- `task-gate` / `thinking-gate`: produce numbered plans or divergent ideas
  before execution.
- `dispatcher_mcp.ts`: exposes dispatch classification, workflow
  create/approve/verify, launch hints, refined results, and reliable-stage
  contracts as a minimal stdio JSON-RPC surface.

### Frontend, motion, and assets

- `agy-frontend`: routes frontend build, edit, redesign, styling, layout,
  interaction, and visual implementation through AGY while forbidding blocking
  dev/preview servers.
- `gsap-animation`: distills `greensock/gsap-skills` into motion briefs for
  GSAP/ScrollTrigger, lifecycle cleanup, accessibility, and performance.
- `asset-slicer`: splits generated icon/sprite sheets into deterministic PNG
  slices and fails on dirty borders, clipped assets, insufficient gutters,
  count mismatches, or expected-box drift.
- SVG and emoji are prohibited as default visual assets for frontend polish;
  visual-led work defaults to high-quality image_gen/Grok Video assets.

### External adapters and future extensions

- `grok-augment`: non-mutating research, critique, creative direction,
  divergence, Grok-video-only briefs, and real MP4 generation through a
  configured Grok-compatible `/v1/videos` endpoint.
- `mcp-generator`: guidance for small dispatcher-compatible MCP or skill/MCP
  scaffolds with owner-agent verification boundaries and fake stdio tests.
- `ui-ux-closed-loop`: references external skills such as `frontend-design`,
  `ui-ux-pro-max`, wireframe prototyping, Vercel guidelines, and official GSAP
  skills via install guidance and composition rather than vendoring full text.

## Mandatory gated execution

`scripts/codex_gate.ts --execute "<raw prompt>"` classifies the route before
Codex receives an execution prompt. The route can require `dynamic-workflow`,
`reliable-agent-workflow`, `task-gate`, `thinking-gate`, `grok-augment`,
`agy-frontend`, `gsap-animation`, `asset-slicer`, `ui-ux-closed-loop`, or
`mcp-generator` for reliable delivery, workflow orchestration, planning, stuck
brainstorming, research/review, frontend work, GSAP motion, generated asset
slicing, or MCP helper scaffolding.

When a route requires helper plugins, Codex's Detailed completion summary must
include a `Plugin evidence:` line naming every required plugin and the command,
tool, or transcript evidence. The follow-up gate rejects completion when that
Plugin evidence is missing, even if Codex reports the work as complete.

Future adapters should be added as focused skills and scripts with fake-binary
tests, explicit dispatch rules, and the same no-secret/no-fallback boundaries.
The owner agent owns local file edits, integration, verification, commits, and
final claims.

No secrets, raw credentials, private tokens, or unnecessary full-repo context
should be passed to Claude, Grok, or AGY. No fallback provider is allowed for
Grok, Grok Video, or image generation paths. Generated icon/sprite sheets must
pass `asset-slicer` and `asset_slice.ts` before assets are treated as
frontend-ready.

## Agent Threads And Subagents

Use background threads or subagents as bounded assistants by default for
independent work, not as release authority:

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
threads, or isolated worktrees for independent implementation experiments. If a
model override or background thread fails, retry once with default settings and
continue without treating the failed thread as evidence.

## Requirements

| Requirement | Notes |
| --- | --- |
| Node.js | Repository scripts use TypeScript with `node --experimental-strip-types`; Node `>=22.18` is required. |
| Claude CLI | `task-gate` expects `claude` on `PATH`, or set `TASK_GATE_CLAUDE_BIN=/path/to/claude`. |
| Grok CLI | `grok-augment` expects `grok` on `PATH`, or set `GROK_AUGMENT_GROK_BIN=/path/to/grok`. |
| AGY CLI | Frontend work expects `agy` on `PATH`, or set `AGY_BIN=/path/to/agy`. |
| Reliable sync | Check the vendored reliable workflow with `node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/sync_reliable_agent_workflow.ts check --remote`. |
| Dynamic workflow | Smoke test with `node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts e2e --json "Plan a subagent workflow with approval gates"`. |
| Dispatcher MCP | Run `node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dispatcher_mcp.ts` with line-delimited JSON-RPC on stdin. |
| Asset slicing | Run `node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/asset_slice.ts <sheet.png> --out-dir <dir> --expect-count <n>`. |
| xAI/Grok | The Pi extension reads `XAI_API_KEY` / `PI_XAI_API_KEY`, optional Pi config, or `/xai-grok-login` OAuth credentials. |

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

For host-specific releases, run a real macOS Codex smoke test in an isolated
temporary workspace before publishing.
