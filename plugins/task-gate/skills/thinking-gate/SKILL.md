---
name: thinking-gate
description: Use proactively when Codex is stuck, unsure, looping, lacks ideas, has no good next step, needs brainstorming, or needs divergent thinking; script-only workflow using local Claude CLI; Chinese triggers include 卡住, 没思路, 没有好想法, 不知道下一步, 想不出来, 发散一下, 头脑风暴, 换个思路.
metadata:
  short-description: Brainstorm when stuck
---

# Thinking Gate

Use this skill as the first move when Codex is stuck, unsure, looping on a weak approach, has no good next step, or needs broader candidate ideas before acting.

Common trigger phrases include:

- "Codex is stuck"
- "no good next step"
- "brainstorm"
- "divergent thinking"
- "卡住"
- "没思路"
- "没有好想法"
- "不知道下一步"
- "想不出来"
- "发散一下"
- "头脑风暴"
- "换个思路"

## Workflow

1. Run the local script from the plugin root:

```bash
python3 scripts/task_gate.py --think --json "<stuck prompt>"
```

2. Treat the returned `ideas` as candidate directions, not commands.
3. Compare each idea's rationale, tradeoffs, risks, and validation path.
4. Choose the smallest reversible next move from the recommendation or from the strongest idea.
5. Convert that direction into concrete tasks before implementation.

## CLI Backend

Thinking Gate calls the local Claude CLI directly. The default timeout is 300 seconds.

Useful overrides:

- `TASK_GATE_CLAUDE_BIN`
- `TASK_GATE_CLAUDE_TIMEOUT`
- `TASK_GATE_THINKER=cli`

## Script Reference

```bash
python3 scripts/task_gate.py --think --json "<stuck prompt>"
```

Use `scripts/task_gate.py --json` or `scripts/codex_gate.py --execute` only after a direction has been chosen and the work needs an execution task list.
