---
name: dispatch
description: Route Codex tasks across extensible external CLI adapters while keeping Codex responsible for local execution and verification.
---

# Codex Augment Dispatcher

Use this skill when a Codex task may benefit from one or more external CLI adapters.

Initial adapters:

- Claude CLI for numbered task planning, divergent thinking, and follow-up review through `scripts/task_gate.ts` and `scripts/codex_gate.ts`.
- Grok CLI for non-mutating research, critique, creative direction, divergence, Grok-video-only briefs, and Grok video generation through `scripts/grok_augment.ts`.
- AGY CLI for frontend build, edit, redesign, styling, interaction, and browser-rendered UI implementation through the `agy-frontend` skill.

Codex owns local file edits, verification, commits, and final claims. AGY CLI may edit frontend files only when the AGY frontend workflow is explicitly selected; Codex still gathers context, supervises scope, runs verification, and reports evidence.

## Mandatory Gate

For gated execution through `scripts/codex_gate.ts`, the raw prompt is first
classified with a route classification step before Codex receives any execution
prompt. The route decision lists required helper plugins for planning, stuck,
research, review, or frontend work. If the route requires plugins, Codex's
Detailed completion summary must include a `Plugin evidence:` line that names
each required plugin and the exact command, tool, or transcript evidence.

The follow-up gate rejects completion when required Plugin evidence is missing,
even if Codex says the work is complete. This makes plugin use mandatory for
plugin-demanding routes without requiring project `AGENTS.md` changes.

## Routing Order

1. If the task needs current research, an outside critique, creative product/frontend direction, divergent candidate paths, or Grok-video-only briefs, run Grok CLI first:

```bash
node --experimental-strip-types scripts/grok_augment.ts inspect --json
node --experimental-strip-types scripts/grok_augment.ts critic --json "<redacted summary>"
```

Treat Grok output as advisory until Codex verifies it locally. Do not pass secrets, raw credentials, private tokens, or unnecessary full-repo context to Grok CLI.

2. If the task is broad, ambiguous, multi-step, risky, or should be decomposed before execution, run Claude CLI task gating:

```bash
node --experimental-strip-types scripts/task_gate.ts --json "<raw task>"
```

Execute the returned numbered tasks in order. For stuck/uncertain work, use:

```bash
node --experimental-strip-types scripts/task_gate.ts --think --json "<stuck point>"
```

3. If the task is frontend build/edit/style/debug/review/visual verification, use the `agy-frontend` skill. Build a bounded prompt, set explicit workspace scope with `--add-dir`, and verify locally after AGY returns.

4. If both Grok and Claude are relevant, use Grok CLI for outside critique/research first, then Claude CLI to convert the chosen direction into numbered tasks.

5. If Superpowers skills apply in the active Codex session, follow them as workflow gates. This dispatcher does not replace Superpowers; it selects helper CLIs while preserving Superpowers planning, TDD, review, and verification discipline.

## Codex Thread Fanout

Use Codex background threads when independent read-only work can shorten the
critical path. Keep one owner Codex thread responsible for file edits, test
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
  bounded paths, then have Codex verify locally with tests and browser evidence.
- `stuck`: use `thinking-gate` for divergent ideas when Codex is looping or
  lacks a good next move, then convert the chosen idea into concrete tasks.

Do not run parallel writers against the same working tree. Use read-only thread
prompts by default, or isolated worktrees for independent implementation
experiments. If a model override or background thread fails, retry once with the
default thread settings and continue without treating that failed thread as
evidence.

## Adding Future CLI Adapters

Add future CLI adapters without renaming this plugin:

1. Add a focused skill under `skills/<adapter-name>/SKILL.md` that defines when to use that CLI, what it may and may not do, and what Codex must verify.
2. Add a script under `scripts/` only when deterministic CLI wrapping, output parsing, fake-binary testing, or repeated command construction is needed.
3. Add tests under `tests/` that use fake binaries or local mock servers by default.
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
node --experimental-strip-types --test plugins/codex-augment-dispatcher/tests/*.ts
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/clean_test.ts
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/docker_clean_test.ts
```
