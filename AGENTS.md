# AGENTS.md

Merge this into a project's existing `AGENTS.md`. Keep project-specific rules
first; add these plugin routing rules after them.

## Frontend via AGY

For frontend work, use `agy-frontend`. AGY owns frontend implementation inside
the bounded workflow; Codex gathers context, passes explicit paths, verifies
locally, and reports evidence. AGY must not start or keep alive frontend
dev/preview servers; Codex handles any bounded server-based verification after
AGY exits.

## Plugin Trigger Rules

Use plugins proactively. Explicit plugin names are strong hints, not required.

- `thinking-gate`: stuck, uncertain, repeated failures, competing approaches,
  or needs brainstorming. Compare candidates before choosing.
- `task-gate`: broad, multi-step, ambiguous, risky, or user asks to decompose.
  Execute returned numbered tasks in order.
- `grok-augment`: current research, outside critique, risk review,
  product/frontend direction, creative paths, or Grok video briefs/generation.
  Non-mutating only; redact secrets and unnecessary repo context.
- `agy-frontend`: frontend build, edit, redesign, styling, layout, interaction,
  browser UI work, or visual verification. Bound paths and verify the result.

When multiple apply, use Grok for outside input first, then Task Gate for the
execution plan. Codex owns edits, tests, commits, and final claims.

## Codex Thread Fanout

Use Codex background threads to speed up broad work, but keep one main Codex
thread as the owner for file edits, test results, release decisions, and final
claims.

Thread roles:

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
  dev/preview servers; Codex still verifies locally.
- `stuck`: divergent thinking when Codex is looping or lacks a good next step.
  Use `thinking-gate`, then convert the chosen idea into concrete tasks before
  editing.

Model and thinking guidance:

- Use low/medium thinking for read-only search, docs comparison, narrow smoke
  checks, and formatting recommendations.
- Use high/xhigh thinking for architecture tradeoffs, security-sensitive
  changes, release gates, cross-file review, and decisions that could affect
  installed plugins or user machines.
- Use model overrides only when the thread tool supports them in the active
  Codex environment. If an override fails or a background thread returns a
  system error, retry once with the default model, then continue without using
  that thread as evidence.

Concurrency boundaries:

- Do not let multiple threads write the same working tree. Use read-only
  prompts by default, or isolated worktrees for truly independent
  implementation experiments.
- Do not pass secrets, raw credentials, private tokens, or unnecessary repo
  context into background threads or external CLIs.
- Do not publish, close findings, or claim release readiness from thread output
  alone. The owner thread must rerun the relevant local tests, validators,
  browser checks, install checks, or remote release gates after the final edit.

## Extending to More CLIs

For each new CLI adapter, add trigger terms, strengths, mutation boundary,
verification requirements, and secret-handling rules. Keep the plugin name
`codex-augment-dispatcher`.
