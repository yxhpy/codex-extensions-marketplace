---
name: task-gate
description: Use for broad, multi-step, ambiguous, risky, or decomposition-first work before Codex executes; trigger on plan, decompose, break down, task list, 规划, 拆解, 分解任务, 复杂任务.
metadata:
  short-description: Plan or diverge with Claude
---

# Task Gate

Use this skill when work should be decomposed into numbered tasks before Codex
executes. Strong triggers include: plan, decompose, break down, task list,
step-by-step, broad work, multi-step work, ambiguous request, risky change,
release gate, migration, refactor plan, 规划, 拆解, 分解任务, 任务列表, 复杂任务.

Also use it when Codex does not know the next move, has no strong idea, is
looping on a weak approach, or needs several candidate directions before acting.

## Script Path Resolution

For Codex plugin installs, run commands from the plugin root. For Pi package
installs, resolve this skill directory first; the plugin root is `../..` from
this `SKILL.md`, so the same helper is `../../scripts/task_gate.ts` when
resolved relative to the skill directory.

## Divergent Thinking Workflow

1. Run the local script from the plugin root, or use the Pi-compatible
   skill-relative script path:

```bash
node --experimental-strip-types ../../scripts/task_gate.ts --think --json "<stuck prompt>"
```

2. Treat the returned `ideas` array as candidate directions, not an execution plan.
3. Compare tradeoffs, risks, and validation paths before choosing a direction.
4. Prefer the returned `recommendation` only when it fits the current user constraints and evidence.
5. Convert the chosen direction into small executable tasks before implementation.

## Task Planning Workflow

Use this workflow when the user wants Codex to work only after a prompt has been decomposed into tasks.

1. Run the local planner script from the plugin root, or use the Pi-compatible
   skill-relative script path:

```bash
node --experimental-strip-types ../../scripts/task_gate.ts --json "<raw user prompt>"
```

2. Treat the returned `tasks` array as the execution plan.
3. Execute tasks in numeric order.
4. Do not start implementation work from the raw prompt before a task plan exists.

## External Gate

For stronger gating outside Codex, use the wrapper script from the plugin root,
or the Pi-compatible skill-relative script path:

```bash
node --experimental-strip-types ../../scripts/codex_gate.ts --execute "<raw user prompt>"
```

That wrapper sends the raw prompt only to the planner, then passes only the numbered task plan into `codex exec`.
Each Codex execution prompt requires a detailed completion summary with work completed, verification, remaining work, blockers, and a completion verdict.
After every execution round, the wrapper sends Codex's summary and exit code back through Task Gate for a follow-up decision.
If Task Gate says the work is incomplete, the wrapper gives Codex the next numbered tasks and continues until completion or the configured safety limit is reached.
Use `--max-rounds <n>` to adjust that safety limit; hitting the limit exits nonzero instead of reporting success.

## Fallback

## CLI Backend

Thinking Gate calls the local Claude CLI directly. The default timeout is 300 seconds.

Useful overrides:

- `TASK_GATE_CLAUDE_BIN`
- `TASK_GATE_CLAUDE_TIMEOUT`
- `TASK_GATE_THINKER=cli`

Claude API mode and MCP mode are intentionally not part of the normal workflow.

## Script Reference

Task planning:

```bash
node --experimental-strip-types ../../scripts/task_gate.ts --json "<raw user prompt>"
```

Divergent thinking:

```bash
node --experimental-strip-types ../../scripts/task_gate.ts --think --json "<stuck prompt>"
```
