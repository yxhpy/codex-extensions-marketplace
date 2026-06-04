---
name: dispatch
description: Use before any non-trivial agent task to classify whether `reliable-agent-workflow`, `dynamic-workflow`, `task-gate`, `thinking-gate`, `grok-augment`, `agy-frontend`, `ui-ux-closed-loop`, `gsap-animation`, `asset-slicer`, or `mcp-generator` should run; route helper CLIs/tools/MCP surfaces while the owner agent keeps execution and verification authority.
---

# Codex Augment Dispatcher

Use this skill before non-trivial agent work when dynamic workflows, external CLI adapters, or helper CLI routing might apply. Also use it when the user says
to use plugins, augment the owner agent, improve routing, dispatch work, fan out
threads, use subagents, or require Plugin evidence.

It is the front door for deciding whether `reliable-agent-workflow`,
`dynamic-workflow`, `task-gate`, `thinking-gate`, `grok-augment`,
`agy-frontend`, `ui-ux-closed-loop`, `gsap-animation`, `asset-slicer`, or `mcp-generator` should run before
implementation or final claims.

When answering a route-classification question that asks for comma-separated
route names, return only the required route names in canonical route order:
`dynamic-workflow`, `reliable-agent-workflow`, `task-gate`, `thinking-gate`,
`grok-augment`, `agy-frontend`, `ui-ux-closed-loop`, `gsap-animation`,
`asset-slicer`, `mcp-generator`. Separate names with comma plus one space.

Initial adapters and trigger language:

- `reliable-agent-workflow`: cross-harness reliable engineering delivery for Codex, Claude Code, Grok, Pi, and similar CLI tools; trigger on complex coding, refactors, migrations, debugging, architecture work, deep analysis, optimization plans, SkillOpt-style skill optimization, high-risk changes, design-review-implement, Best-of-N, check-work, zero-open-issue repair loops, independent verification, e2e verification, 可靠交付, 深度分析, 优化方案, 技能优化, 质量门禁, 发布准备.
- `dynamic-workflow`: complex multi-track work, workflow artifacts, workflow scripts, Claude Code dynamic workflows, ultracode, `.claude/workflows`, `.atomic`, native workflow bridges, approval gates, subagent/packet orchestration, background threads, agent threads, worker agents, fanout, delegation, parallel review/research/QA, end-to-end verification, adaptive hierarchical orchestrator, environment inventory, execution_spec, refined results, post-node replan, tool-first resolution, 工作流, 工作流脚本, 原生动态工作流, 桥接, 编排, 多代理, 子代理, 后台线程, 审批门禁, 端到端, 自适应编排, 环境盘点, 精炼结果, 重规划.
- `task-gate`: plan, decompose, break down, multi-step, ambiguous, risky, 规划, 拆解, 分解任务, 复杂任务.
- `thinking-gate`: stuck, looping, brainstorm, no idea, divergent thinking, 卡住, 没思路, 头脑风暴, 换个思路.
- `grok-augment`: current research, external critique, risk review, creative/product/frontend direction, Grok video, 最新, 调研, 外部评审, 创意方向.
- `agy-frontend`: frontend, UI, landing page, redesign, CSS, animation, responsive, browser visual verification, 前端, 落地页, 动效, 视觉检查. **Important for reference-driven work**: prompts involving "reference site", "match this design/screenshot", "visual fidelity to [external reference]", "looks exactly like [the provided reference]" should also trigger `dynamic-workflow` + `task-gate` + an independent `style-review` subagent packet (fidelity + no-unintended-refactor check) *before* AGY impl. Do not default to agy-only for visual matching tasks.
- `ui-ux-closed-loop`: full UI/UX design loop from requirements/product thinking through low-fidelity wireframes or prototypes to polished UI/frontend; reference external skills by install guidance and summaries rather than vendoring their full contents; trigger on UI/UX design, product-to-UI, low-fi prototype, wireframe, design system, visual design loop, 页面需求, 产品思维, 低保真原型, 设计闭环.
- `gsap-animation`: webpage animation, UI motion, GSAP, ScrollTrigger, timeline choreography, parallax, React/Vue/Svelte animation, 动效, 滚动动画, 视差.
- `asset-slicer`: generated icon sheets, sprite sheets, multi-asset images, generated icons, generate-then-slice icon pipelines, crop drift, dirty cuts, 切图, 切分图标, 多素材切分, 生成图标.
- `mcp-generator`: MCP helper scaffolds, skill/MCP pairs, dispatcher-compatible tool surfaces, stdio JSON-RPC tools, route adapters, MCP 生成, MCP 骨架.

Adapter backends:

- cross-harness reliable delivery through the vendored latest `reliable-agent-workflow` skill from `https://github.com/yxhpy/reliable-agent-workflow-skill`, with sync/freshness checks through `scripts/sync_reliable_agent_workflow.ts`.
- Deterministic agent dynamic workflow artifacts, approval gates, packet/result lifecycle, environment inventory, per-packet execution specs, refined result contracts, adaptive replan events, condensed logs, and simulation through `scripts/dynamic_workflow.ts`.
- Claude CLI for numbered task planning, divergent thinking, and follow-up review through `scripts/task_gate.ts` and `scripts/codex_gate.ts`.
- Grok CLI for non-mutating research, critique, creative direction, divergence, Grok-video-only briefs, and Grok video generation through `scripts/grok_augment.ts`.
- AGY CLI for frontend build, edit, redesign, styling, interaction, and browser-rendered UI implementation through the `agy-frontend` skill. AGY must not start or keep alive frontend dev/preview servers; Codex handles bounded server-based verification after AGY exits.
- UI/UX closed-loop orchestration through `skills/ui-ux-closed-loop`, which coordinates requirements, product thinking, low-fidelity prototypes, polished UI implementation constraints, assets, motion, review, and external skill references while keeping the owner agent as final verifier.
- GSAP motion design guidance through the `gsap-animation` skill. It distills `greensock/gsap-skills` into owner-agent/AGY prompt constraints for webpage animation, ScrollTrigger, framework cleanup, accessibility, and performance; it is advisory and non-mutating.
- Deterministic asset slicing for generated icon/sprite sheets through the `asset-slicer` skill and `scripts/asset_slice.ts`.
- Minimal stdio MCP exposure through `scripts/dispatcher_mcp.ts`, with tools for dispatch classification, workflow create/approve/verify, adaptive inventory/refined-result/replan/launch helpers, and reliable-stage contracts. It is script-only by default and does not add manifest `mcpServers` wiring.
- MCP/skill scaffold guidance through the `mcp-generator` skill.

## Script Path Resolution

For Codex plugin installs, run commands from the plugin root. For Pi package
installs, resolve the active skill directory first; the plugin root is `../..`
from every bundled `SKILL.md`, so helper scripts can be called with
`../../scripts/<name>.ts` when resolved relative to the skill directory.

The owner agent owns local file edits, integration, verification, commits, and final claims. AGY CLI may edit frontend files only when the AGY frontend workflow is explicitly selected; it must not launch blocking dev/preview servers. The owner agent still gathers context, supervises scope, runs verification, and reports evidence.

## Mandatory Gate

For gated execution through `scripts/codex_gate.ts`, the raw prompt is first
classified with a route classification step before Codex receives any execution
prompt. The route decision lists required helper plugins for dynamic workflows,
planning, stuck, research, review, frontend work, GSAP motion, or assets. If the route requires plugins, Codex's
Detailed completion summary must include a `Plugin evidence:` line that names
each required plugin and the exact command, tool, or transcript evidence.

The follow-up gate rejects completion when required Plugin evidence is missing,
even if Codex says the work is complete. This makes plugin use mandatory for
plugin-demanding routes without requiring project `AGENTS.md` changes.

## SkillOpt-Style Skill Optimization

When a request mentions SkillOpt, self-evolving agent skills, skill
optimization/training/tuning, optimizing `SKILL.md`, or 优化 skill/技能优化:

- Treat missed routes, failed helper calls, weak prompts, and missing
  verification as training examples.
- Make bounded add/delete/replace edits. Prefer fixing dispatcher signals,
  concise skill trigger text, helper boundaries, and tests over broad rewrites.
- Do not rewrite vendored upstream skills unless the sync metadata and release
  checks are intentionally updated.
- Accept edits only after held-out prompt checks, `quick_validate`, relevant
  unit tests, and workflow evidence pass. Record rejected or unvalidated ideas
  in workflow artifacts, not deployed skill text.
- Keep deployable skills compact; move optimizer notes, logs, and rationale to
  `.agent-workflows/`, `.agent-runs/`, or references loaded only when needed.

## Routing Order

1. If the task is complex, multi-track, approval-gated, subagent-oriented, background-thread/fanout-oriented, reusable, adaptive/hierarchical, or requires end-to-end proof, create an agent dynamic workflow first. For adaptive work, inspect the generated environment inventory, execution specs, refined-result contract, `graph.json`, `condensed_log.jsonl`, and `replan_events/` before launching packets:

```bash
node --experimental-strip-types ../../scripts/dynamic_workflow.ts detect --json "<raw task>"
node --experimental-strip-types ../../scripts/dynamic_workflow.ts new --json "<raw task>"
node --experimental-strip-types ../../scripts/dynamic_workflow.ts inventory --json .agent-workflows/<workflow-id>
node --experimental-strip-types ../../scripts/dynamic_workflow.ts launch-packets --harness auto .agent-workflows/<workflow-id>
```

Use real subagents when the platform supports them, especially for independent read-only research, review, validation, frontend, or asset tracks; otherwise use simulated packets and preserve `packets/`, `results/`, `workflow.json`, `graph.json`, `condensed_log.jsonl`, `replan_events/`, and `final-report.md` as audit evidence. After packet results, record adaptive judgment with `adaptive-step` or the MCP `workflow_replan_propose` tool.

2. If the task needs reliable engineering delivery, deep analysis, an optimization plan, design-review-implement loops, Best-of-N, check-work, zero-open-issue repair loops, or independent verification, use `reliable-agent-workflow`. It is cross-harness and applies to Codex, Claude Code, Grok, Pi, and similar CLI tools; if no platform subagent mechanism is available, use its single-agent fallback and write the same artifacts.

3. If the task needs current research, an outside critique, creative product/frontend direction, divergent candidate paths, or Grok-video-only briefs, run Grok CLI first:

```bash
node --experimental-strip-types ../../scripts/grok_augment.ts inspect --json
node --experimental-strip-types ../../scripts/grok_augment.ts critic --json "<redacted summary>"
```

Treat Grok output as advisory until the owner agent verifies it locally. Do not pass secrets, raw credentials, private tokens, or unnecessary full-repo context to Grok CLI.

4. If the task is broad, ambiguous, multi-step, risky, or should be decomposed before execution, run Claude CLI task gating:

```bash
node --experimental-strip-types ../../scripts/task_gate.ts --json "<raw task>"
```

Execute the returned numbered tasks in order. For stuck/uncertain work, use:

```bash
node --experimental-strip-types ../../scripts/task_gate.ts --think --json "<stuck point>"
```

4a. If the task asks for an MCP helper, dispatcher-compatible tool surface,
skill/MCP pair, or adapter scaffold, use `mcp-generator`. Prefer a small
repository-owned TypeScript script and fake stdio tests before adding manifest
registration.

5. If the task involves generated icon sheets, sprite sheets, multi-asset bitmap slicing, generated icons, generate-then-slice asset pipelines, dirty cuts, crop drift, or 切图/切分图标, use the `asset-slicer` skill. Custom icons default to image_gen sheet generation followed by `scripts/asset_slice.ts`; treat a failed report as a blocker before passing assets to AGY.

6. If the task involves webpage animation, UI motion, GSAP, ScrollTrigger, parallax, timeline choreography, or framework animation, use the `gsap-animation` skill. When implementation is also required, pair it with `agy-frontend` and pass a Motion / GSAP brief; verify reduced-motion, cleanup, performance, and scroll positions locally.

7. If the task is a full UI/UX design loop from requirements/product thinking through low-fidelity prototype or wireframe to polished frontend/UI, use `ui-ux-closed-loop`. It references external skills such as `frontend-design`, `ui-ux-pro-max`, wireframe prototyping, Vercel guidelines, and full GSAP skills only as install guidance and compact coordination notes; do not copy their long `SKILL.md` bodies into this repo.

8. If the task is frontend build/edit/style/debug/review/visual verification, use the `agy-frontend` skill. Build a bounded prompt, set explicit workspace scope with `--add-dir`, tell AGY not to start any frontend dev/preview server, and verify locally after AGY returns.

9. If multiple helpers are relevant, create the dynamic workflow first, run `reliable-agent-workflow` for the delivery contract when applicable, use Grok CLI for outside critique/research, then Claude CLI to convert the chosen direction into numbered tasks.

10. If platform-native workflow skills apply in the active agent session, including Superpowers-style gates when present, follow them as workflow gates. This dispatcher does not replace them; it selects helper CLIs while preserving planning, TDD, review, and verification discipline.

## Agent Thread And Subagent Fanout

Use background threads or subagents when independent read-only work can shorten
the critical path. Keep one owner agent thread responsible for file edits, test
commands, commits, release gates, and final claims.

Recommended thread roles:

- `research`: low/medium thinking for read-only context, current-source checks,
  and option comparison. Use Grok first for outside critique or creative/current
  research, but stop waiting after roughly one minute with no usable output.
- `plan`: task decomposition for broad or risky work. Use `task-gate` in the
  owner thread for the final numbered plan; background plan threads are
  advisory only.
- `review`: high/xhigh thinking for release, regression, security, and
  cross-file risk review. The owner thread must re-check every actionable claim
  against final files and fresh command output.
- `frontend`: route frontend implementation through `agy-frontend` with explicit
  bounded paths, forbid AGY from starting dev/preview servers, then have the
  owner agent verify locally with tests and browser evidence. For webpage
  animation, pair with `gsap-animation` and include a GSAP motion brief. For
  visual-led assets, prohibit SVG/emoji defaults and use high-quality
  image_gen/Grok Video assets; custom icons default to image_gen sheets sliced
  with `asset-slicer`.
- `design-loop`: for full visual product work, use `ui-ux-closed-loop` to
  coordinate requirements, product thinking, low-fidelity prototypes, design
  constraints, implementation handoff, external references, and verification;
  owner drives product decisions, local edits, and final claims.
- `assets`: run deterministic `asset-slicer` checks for generated icon/sprite
  sheets before AGY or frontend code consumes the sliced files. Treat icon
  generation requests as image_gen → `asset-slicer` by default, not SVG or emoji.
- `stuck`: use `thinking-gate` for divergent ideas when Codex is looping or
  lacks a good next move, then convert the chosen idea into concrete tasks.

Do not run parallel writers against the same working tree. Use read-only thread
prompts by default, or isolated worktrees for independent implementation
experiments. If a model override, subagent, or background thread fails, retry
once with default settings and continue without treating that failed thread as
evidence.

## Adding Future CLI Adapters

Add future CLI adapters without renaming this plugin:

1. Add a focused skill under `skills/<adapter-name>/SKILL.md` that defines when to use that CLI/tool, what it may and may not do, and what the owner agent must verify.
2. Add a script under `scripts/` only when deterministic CLI wrapping, output parsing, fake-binary testing, or repeated command construction is needed.
3. Add tests under `tests/` that use fake binaries or local mock servers by default; purely instructional skills like `gsap-animation` should still have static tests proving trigger, routing, and verification text.
4. Update this dispatch skill with the adapter's trigger conditions, boundaries, and verification commands.
5. Keep provider-specific credentials in environment variables and never print token contents.

## Boundaries

- No fallback provider is allowed. If Grok, Claude, AGY, image generation, or Grok Video is unavailable, report the blocker instead of silently substituting another provider.
- Do not add permissive mutation modes to Grok CLI calls.
- Do not use Grok CLI, Claude CLI, or AGY CLI as committers, release gates, or final verifiers.
- Do not install, publish, or enable this plugin for normal use until isolated release testing passes.
- Keep CLI-specific flags isolated: Claude task gating uses Claude structured output flags, Grok augmentation uses Grok single-turn prompts, and AGY frontend work uses the AGY workflow prompt.

## Verification

Before claiming completion, run the relevant checks:

```bash
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/codex-augment-dispatcher
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/dispatch
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/reliable-agent-workflow
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/dynamic-workflow
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/mcp-generator
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/ui-ux-closed-loop
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-augment-dispatcher/skills/gsap-animation
node --experimental-strip-types --check plugins/codex-augment-dispatcher/scripts/dispatcher_mcp.ts
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/sync_reliable_agent_workflow.ts check --remote
node --experimental-strip-types --test tests/*.ts plugins/codex-augment-dispatcher/tests/*.ts
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts e2e --json "Plan a risky subagent migration with approval gates and end-to-end verification"
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/clean_test.ts
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/docker_clean_test.ts
```
