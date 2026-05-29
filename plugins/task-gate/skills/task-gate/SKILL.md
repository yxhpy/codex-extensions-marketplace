---
name: task-gate
description: Use when Codex is stuck, lacks a good next step, or needs divergent candidate ideas before acting; script-only workflow using local Claude CLI, with numbered task planning support before execution.
metadata:
  short-description: Diverge when Codex is stuck
---

# Thinking Gate

Use this skill when Codex does not know the next move, has no strong idea, is looping on a weak approach, or needs several candidate directions before acting.

## Divergent Thinking Workflow

1. Run the local script from the plugin root:

```bash
python3 scripts/task_gate.py --think --json "<stuck prompt>"
```

2. Treat the returned `ideas` array as candidate directions, not an execution plan.
3. Compare tradeoffs, risks, and validation paths before choosing a direction.
4. Prefer the returned `recommendation` only when it fits the current user constraints and evidence.
5. Convert the chosen direction into small executable tasks before implementation.

## Task Planning Workflow

Use this workflow when the user wants Codex to work only after a prompt has been decomposed into tasks.

1. Run the local planner script from the plugin root:

```bash
python3 scripts/task_gate.py --json "<raw user prompt>"
```

2. Treat the returned `tasks` array as the execution plan.
3. Execute tasks in numeric order.
4. Do not start implementation work from the raw prompt before a task plan exists.

## External Gate

For stronger gating outside Codex, use the wrapper script from the plugin root:

```bash
python3 scripts/codex_gate.py --execute "<raw user prompt>"
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
python3 scripts/task_gate.py --json "<raw user prompt>"
```

Divergent thinking:

```bash
python3 scripts/task_gate.py --think --json "<stuck prompt>"
```
