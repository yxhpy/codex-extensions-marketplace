---
name: task-gate
description: Use when a raw user prompt must be converted into a numbered task list before Codex performs implementation, execution, or review work.
metadata:
  short-description: Plan prompts into numbered tasks
---

# Task Gate

Use this skill as the entry workflow when the user wants Codex to work only after a prompt has been decomposed into tasks.

## Workflow

1. Send the exact raw user prompt to the `task-gate` MCP tool `plan_prompt`.
2. Treat the returned `tasks` array as the execution plan.
3. Execute tasks in numeric order.
4. Do not start implementation work from the raw prompt before a task plan exists.

## External Gate

For stronger gating outside Codex, use the wrapper script from the plugin root:

```bash
python3 scripts/codex_gate.py --execute "<raw user prompt>"
```

That wrapper sends the raw prompt only to the planner, then passes only the numbered task plan into `codex exec`.

## Fallback

If the MCP tool is unavailable, run the local planner directly from the plugin root:

```bash
python3 scripts/task_gate.py --json "<raw user prompt>"
```

The default planner backend is `auto`: it uses Claude API directly when `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` is available from the process environment or Claude settings, then falls back to the local `claude` CLI when API credentials are absent.

Useful overrides:

- `TASK_GATE_THINKER=api|cli|auto`
- `TASK_GATE_CLAUDE_MODEL`
- `TASK_GATE_CLAUDE_BASE_URL`
- `TASK_GATE_CLAUDE_API_TIMEOUT`
- `TASK_GATE_CLAUDE_BIN`
 
Claude API env is read from `~/.claude/settings.json` / `settings.local.json` and project `.claude/settings*.json`, with process env taking precedence.
