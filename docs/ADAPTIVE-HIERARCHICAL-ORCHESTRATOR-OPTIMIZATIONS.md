# Adaptive Hierarchical Orchestrator Implementation Notes

This document tracks the PR #3 requirement set and the implemented dispatcher
behavior for evolving `dynamic-workflow` into a live adaptive hierarchical
orchestrator.

## Target Requirements

The owner model should:

1. Survey the task and available environment first: agents, personas, skills,
   core tools, MCP surfaces, and harness adapters.
2. Build a parallel/serial packet graph with dependencies and pre-assigned
   execution specs per node.
3. Delegate packet execution through subagents where available.
4. Receive compact refined results only, with evidence pointers instead of raw
   transcripts.
5. Perform post-node adaptive judgment after each result or batch.
6. Split, reorder, insert evaluator packets, or continue based on fresh evidence.
7. Keep the run open until all nodes, approvals, and verification complete.
8. Resolve doubts with tools first; ask the user only after documented tool
   exhaustion or a true product decision.

## Implemented Surfaces

`scripts/dynamic_workflow.ts` now persists these fields in `workflow.json`:

- `environmentInventory`: local skill frontmatter, subagent types, personas,
  core tool categories, MCP notes, detected harness, and available commands on
  `PATH`.
- `packets[].executionSpec`: subagent type, persona, capability mode, injected
  skills, recommended tools, worktree isolation, output contract, refined result
  fields, and stop conditions.
- `adaptive`: graph version, max replan count, refined result contract,
  tool-first policy, replan events, condensed log, and completion policy.
- `results[].refined`: compact `refined-json-v1` results with executive summary,
  artifacts, evidence pointers, tools used for self-resolution, open questions,
  suggested next actions, confidence, and Plugin evidence.

The script also writes derived artifacts:

- `graph.json`: current packet DAG with execution specs.
- `condensed_log.jsonl`: compact owner-context execution events.
- `replan_events/*.json`: post-node adaptive judgments and replan records.

## CLI Commands

Existing commands remain supported:

```bash
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts detect --json "<task>"
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts new --json "<task>"
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts launch-packets --harness auto .agent-workflows/<id>
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts simulate .agent-workflows/<id>
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts verify --complete .agent-workflows/<id>
```

New adaptive helper commands:

```bash
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts inventory --json .agent-workflows/<id>
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts refined-results --json .agent-workflows/<id>
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts adaptive-step --packet 02-research --action continue .agent-workflows/<id> "next node is small enough; continue"
```

## MCP Tools

`scripts/dispatcher_mcp.ts` exposes the adaptive surfaces for harnesses that
prefer MCP calls:

- `workflow_inventory`
- `workflow_refined_results`
- `workflow_replan_propose`
- `workflow_launch_packet`

Existing MCP tools remain:

- `dispatch_classify`
- `workflow_create`
- `workflow_approve`
- `workflow_verify`
- `reliable_stage_contract`

## Cross-Harness Call Chain

`launch-packets` now includes the execution spec and refined result contract in
all launch recipes:

- Grok: `task({ subagent_type, persona, capability_mode, worktree, prompt })`
- Claude: `@reliable-<role>` or Agent tool style prompts
- Codex: `codex --profile deep-review` with copied `.codex/agents/*.toml`
- Pi: `subagent({ agent, task, model, async: true })`
- cc-router: `taskctl capability`

Every recipe instructs the worker to write `refined-json-v1` to
`results/<packet>.md`, include `toolsUsedForSelfResolution`, suggest replans,
and emit `Plugin evidence:`.

## Completion Gate

`verify --complete` now requires:

- all approvals granted
- every packet completed
- every packet has a result
- every result has a refined result
- every required plugin has successful evidence
- at least one passing verification record
- at least one adaptive judgment/replan event
- at least one condensed log entry
- final verdict is complete

This keeps the workflow active until the graph and its verification evidence are
actually complete.

## Remaining Future Work

The current implementation is deterministic and artifact-first. Future work can
add live programmatic subagent launch/wait helpers, deeper MCP discovery via the
active harness, graph visualization, and stricter provider-specific adapters.
