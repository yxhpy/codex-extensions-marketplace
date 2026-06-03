# AGENTS.md

Merge this into a project's existing `AGENTS.md`. Keep project-specific rules
first; add these plugin routing rules after them.

## Frontend via AGY

For frontend work, use `agy-frontend`. AGY owns frontend implementation inside
the bounded workflow; the owner agent gathers context, passes explicit paths,
verifies locally, and reports evidence. AGY must not start or keep alive
frontend dev/preview servers; the owner agent handles any bounded server-based
verification after AGY exits.

## UI/UX Closed Loop (new)

For full page requirements → product thinking → low-fidelity prototypes → polished UI/UX, use `ui-ux-closed-loop` (provided by this plugin). It orchestrates the stages, references best external skills (installed separately via npx skills add etc.; see docs/UI-UX-CLOSED-LOOP.md for the curated list and exact commands), and composes their constraints with local capabilities (agy-frontend for impl, asset-slicer for icons, gsap-animation for motion, dynamic-workflow/task-gate/reliable for structure/verification).

Key: externals are **references** (install + use their rules when active). Do not assume they are present; the skill falls back gracefully and recommends them. The loop produces artifacts, evidence, and "Plugin evidence:" lines.

## Plugin Trigger Rules

Use plugins proactively. Explicit plugin names are strong hints, not required.

- `dynamic-workflow`: broad multi-track work, subagents/parallel agents,
  background threads, agent threads, worker agents, fanout, delegation,
  parallel review/research/QA, workflow artifacts, packet/result orchestration,
  approval gates, reusable recipes, or end-to-end verification. Use real
  subagents when available and simulated packets otherwise; keep artifacts
  under `.agent-workflows/`.
  **Dynamic packet composition**: When Claude CLI is available (TASK_GATE_CLAUDE_BIN or DYNAMIC_WORKFLOW_CLAUDE_BIN), the packet graph is *dynamically proposed by Claude itself* from the raw prompt (semantic understanding, not just regex), followed by a model review round for the plan. If the review agrees, the LLM-composed structure is used (with safety normalization). This greatly improves hit rate and adaptability vs static templates. Fallback to rule-based detection + templates when no Claude.
  **See also**: `docs/ADAPTIVE-HIERARCHICAL-ORCHESTRATOR-OPTIMIZATIONS.md` for live adaptive loop, mandatory inventory survey of agents/tools/skills/MCPs, per-node pre-assigned execution specs + refined result contracts, post-node main-model replan judgment (re-split large nodes, adapt topology), tool-first doubt resolution (minimize `ask_user_question`), and integration of HMAS/Lybic/LangGraph/OrchVis patterns. Use for evolving the orchestrator toward main-only-sees-refined + continuous adaptation until full completion.
- `reliable-agent-workflow`: complex coding, refactors, migrations, debugging,
  architecture work, deep analysis, optimization plans, high-risk changes,
  design-review-implement, Best-of-N, check-work, zero-open-issue repair loops,
  independent verification, or e2e verification. It is cross-harness and
  applies to Pi, Codex, Claude Code, Grok, and similar CLI tools; use its
  single-agent fallback when no real subagent mechanism is available.
- `thinking-gate`: stuck, uncertain, repeated failures, competing approaches,
  or needs brainstorming. Compare candidates before choosing.
- `task-gate`: broad, multi-step, ambiguous, risky, or user asks to decompose.
  Execute returned numbered tasks in order.
- `grok-augment`: current research, outside critique, risk review,
  product/frontend direction, creative paths, or Grok video briefs/generation.
  Non-mutating only; redact secrets and unnecessary repo context.
- `agy-frontend`: frontend build, edit, redesign, styling, layout, interaction,
  browser UI work, visual verification, or visual asset integration. Bound
  paths and verify the result. SVG and emoji are prohibited as default visual
  assets; use high-quality image_gen/Grok Video media instead.

**Reference site / visual fidelity work (critical rule)**: When the task involves matching an external reference site (or design) for a static page, component, or small app — even if described as "single page static frontend + local visual verification" — **do NOT treat it as a pure agy-frontend task**. 

Such tasks have obvious parallel independent tracks:
- Reference style research (read-only: palette, typography, layout, components via screenshots + CSS).
- Local implementation (agy-frontend, strictly bounded).
- Independent visual similarity / fidelity review (MUST use a separate `review` subagent or reliable-reviewer packet; NOT the owner and NOT AGY).
- Mobile / interaction / a11y QA.

Per dynamic-workflow rules: create the `.agent-workflows/` artifact first. Explicitly allocate a "style-review" packet assigned to an independent reviewer. This packet must approve *before* AGY impl begins, and must explicitly check "fidelity to reference" *and* "no unintended complete refactor". 

AGY is an implementation helper only. Self-performed screenshots + CSS sampling + iterations by the same thread/agent does not count as independent review. The owner thread owns final evidence and claims, but the style acceptance must come from the independent packet.

Always record the independent review evidence in the workflow results/. Owner must re-verify locally after.
- `gsap-animation`: webpage animation, UI motion, GSAP, ScrollTrigger,
  timeline choreography, parallax, React/Vue/Svelte animation, 动效,
  滚动动画, or 视差. Pair with AGY for implementation and verify reduced
  motion, cleanup, performance, and scroll positions.
- `asset-slicer`: generated icon sheets, sprite sheets, multi-asset images,
  generated icons, generate-then-slice pipelines, dirty cuts, crop drift, 切图,
  or 切分图标. Custom icons default to image_gen sheet generation, then
  deterministic slicing; gate on the JSON report before AGY or frontend code
  consumes the assets.
- `mcp-generator`: MCP helper scaffolds, skill/MCP pairs, dispatcher-compatible
  tool surfaces, stdio JSON-RPC tools, or adapter skeletons. Keep surfaces
  minimal, script-only by default, and covered by fake stdio tests before adding
  install-time MCP registration.
- `ui-ux-closed-loop` (new): full requirements/product/low-fi-prototype/UI/UX closed loop. Use for visual product work that needs the complete chain. It will activate external references (frontend-design, ui-ux-pro-max, wireframe-prototyping, Vercel guidelines, etc.) by name and compose their rules with local agy/asset/gsap/dispatch skills. See docs/UI-UX-CLOSED-LOOP.md for the exact externals and install steps.

When multiple apply, create a Dynamic Workflow artifact first, fan out real
subagents for independent read-only research/review/validation when available,
use `reliable-agent-workflow` for the delivery contract when applicable, use
Grok for outside input, then Task Gate for the execution plan. The owner agent
owns edits, integration, tests, commits, and final claims.

## Agent Thread And Subagent Fanout

Use background threads or platform subagents to speed up broad work, but keep
one main owner-agent thread responsible for file edits, integration, test
results, release decisions, and final claims.

Thread roles:

- `workflow`: create or update `.agent-workflows/<id>/` artifacts, approval
  records, packets, results, structured evidence, and final reports for complex
  work. Use `dynamic-workflow` before other helpers when orchestration,
  subagents, background threads, worker agents, fanout, or approval gates are
  mentioned. For Claude Code Dynamic Workflows, `ultracode`, workflow scripts,
  `.claude/workflows/`, or `.atomic/`, keep `.agent-workflows/` as the canonical
  audit trail and record native bridge evidence as metadata.
- `reliable`: run `reliable-agent-workflow` for cross-harness reliable delivery
  with design, review, repair-until-zero-open-issues, independent verification,
  artifact tracking, and memory capture. Keep it generic for Pi, Codex, Claude
  Code, Grok, and similar CLI tools.
- `research`: read-only context gathering, current-source checks, option
  comparison, or ecosystem notes. Prefer a fast/default model with low or
  medium thinking. Use `grok-augment` first when outside critique, creative
  direction, or current research would help; stop waiting after roughly one
  minute with no usable output.
- `plan`: numbered decomposition for broad, risky, or ambiguous tasks. Use
  `task-gate` in the owner thread before implementation starts; background
  plan threads may advise, but the owner thread chooses the final task order.
- `review`: independent risk review, release-readiness review, or regression
  audit. Prefer the strongest available model with high or xhigh thinking.
  Treat review output as stale until the owner thread re-checks the exact
  files and commands after final edits.
- `frontend`: UI implementation, redesign, styling, interaction, or browser
  visual verification. Use `agy-frontend` with explicit bounded paths. AGY may
  edit only inside the approved frontend scope and must not start blocking
  dev/preview servers; the owner agent still verifies locally. For webpage
  animation, also use `gsap-animation` and pass a GSAP motion brief.
- `assets`: generated icon/sprite sheet slicing, dirty-cut cleanup, crop drift,
  and expected-count checks. Use `asset-slicer`; treat failed reports as
  blockers instead of hand-waving visual acceptance. Do not use SVG or emoji as
  default icon assets; generate an icon sheet and slice it.
- `mcp`: dispatcher-compatible MCP helper or skill/MCP scaffolding. Use
  `mcp-generator`, prefer repository-owned TypeScript stdio scripts, and verify
  `initialize`, `tools/list`, and `tools/call` with fake/local tests.
- `subagent`: execute one bounded packet with explicit dependencies, allowed
  paths/sources, do/do-not rules, expected evidence, and stop conditions. Treat
  output as advisory until the owner agent re-checks final files and commands.
- `stuck`: divergent thinking when the owner agent is looping or lacks a good next step.
  Use `thinking-gate`, then convert the chosen idea into concrete tasks before
  editing.
- `design-loop` (new for UI/UX): the full product-to-prototype-to-UI closed loop. Use `ui-ux-closed-loop` skill. Fan out research/wireframe stages read-only; owner drives decisions, asset gen, and final claims.

Model and thinking guidance:

- Use low/medium thinking for read-only search, docs comparison, narrow smoke
  checks, and formatting recommendations.
- Use high/xhigh thinking for architecture tradeoffs, security-sensitive
  changes, release gates, cross-file review, and decisions that could affect
  installed plugins or user machines.
- Use model overrides only when the thread tool supports them in the active
  agent environment. If an override fails or a background thread returns a
  system error, retry once with the default model, then continue without using
  that thread as evidence.

Concurrency boundaries:

- Do not let multiple threads write the same working tree. Use read-only
  prompts by default, or isolated worktrees for truly independent
  implementation experiments.
- Do not pass secrets, raw credentials, private tokens, or unnecessary repo
  context into background threads or external CLIs.
- Do not publish, close findings, or claim release readiness from thread or
  subagent output alone. The owner thread must rerun the relevant local tests,
  validators, browser checks, install checks, or remote release gates after the
  final edit.

## Extending to More CLIs

For each new CLI adapter or instructional design skill, add trigger terms,
strengths, mutation boundary, verification requirements, and secret-handling
rules. Keep the plugin name `codex-augment-dispatcher`.

## Subagent Fanout Across Harnesses (Codex, Claude Code, Grok, Pi, cc-router)

See docs/CROSS_HARNESS_SUBAGENT_TRIGGERING.md for the full research on why
"manual use workflow / subagent" was hard even with the dispatcher, the
differences in native primitives (Grok task+persona+worktree, Claude .claude/agents
+ Agent tool + fork, Pi subagent(), Codex tomls + explicit spawn or codex exec),
and the complementary role of cc-router/taskctl external workers.

**Actionable:** Copy docs/examples/*/ into your tree. After creating a
.agent-workflows/ artifact, use the new `launch-packets` command (or the
exact recipes in the doc) to drive real fanout for packets marked subagent.
Always record results + "Plugin evidence: ..." lines. Owner thread owns
integration and final claims.

The dispatcher keeps .agent-workflows/ as the portable canonical trail even
when you realize some packets via cc-router taskctl capabilities.
