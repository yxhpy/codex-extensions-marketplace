# AGENTS.md

Merge this into a project's existing `AGENTS.md`. Keep project-specific rules
first; add these plugin routing rules after them.

## Frontend via AGY

For frontend work, use `agy-frontend`. AGY owns frontend implementation inside
the bounded workflow; Codex gathers context, passes explicit paths, verifies
locally, and reports evidence.

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

## Extending to More CLIs

For each new CLI adapter, add trigger terms, strengths, mutation boundary,
verification requirements, and secret-handling rules. Keep the plugin name
`codex-augment-dispatcher`.
