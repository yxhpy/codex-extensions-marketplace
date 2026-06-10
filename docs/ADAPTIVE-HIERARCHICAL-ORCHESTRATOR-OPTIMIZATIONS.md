# Adaptive Hierarchical Orchestrator

<p align="center">
  <strong>Inventory first. Execute packets second. Replan from evidence until the graph is complete.</strong>
</p>

This document summarizes how `dynamic-workflow` evolved into an adaptive,
artifact-first orchestrator for real and simulated agent work.

---

## Operating model

| Step | What happens | Artifact evidence |
| --- | --- | --- |
| 1. Survey | Capture available skills, tools, personas, harness adapters, MCP notes, and constraints. | `workflow.json.environmentInventory` |
| 2. Plan graph | Build serial/parallel packets with dependencies and execution specs. | `workflow.json.packets`, `graph.json` |
| 3. Delegate | Run owner, subagent, or simulated packets using the best available harness. | `packets/<id>.md`, launcher recipes |
| 4. Refine | Workers return compact `refined-json-v1` instead of raw transcript dumps. | `results/<id>.md`, `results[].refined` |
| 5. Ingest | Real worker outputs are normalized back into the workflow. | `record-result`, plugin evidence, verification records |
| 6. Replan | The owner records post-node adaptive judgments and graph decisions. | `replan_events/*.json`, `condensed_log.jsonl` |
| 7. Verify | Completion requires approvals, packet results, refined outputs, plugin evidence, adaptive logs, and final PASS. | `verify --complete`, `final-report.md` |

## Target behavior

The owner model should:

1. Survey the environment before splitting work: agents, personas, skills, MCPs,
   core tools, and harness adapters.
2. Build a packet graph with dependencies and pre-assigned execution specs.
3. Delegate packets through real subagents where available, or use deterministic
   simulation with explicit evidence when real fanout is unavailable.
4. Receive compact refined results with evidence pointers instead of large raw
   transcripts.
5. Perform a post-node adaptive judgment after each result or batch.
6. Continue, split, reorder, insert evaluator packets, or block based on fresh
   evidence.
7. Keep the run open until every node, approval, result, and verification gate
   is complete.
8. Resolve doubts with tools first and ask the user only for genuine product or
   permission decisions.

## Persisted workflow surfaces

`scripts/dynamic_workflow.ts` writes these core fields to `workflow.json`:

| Field | Purpose |
| --- | --- |
| `environmentInventory` | Local skills, subagent types, personas, core tool categories, MCP notes, detected harness, and command availability. |
| `packets[].executionSpec` | Subagent type, persona, capability mode, injected skills, recommended tools, worktree isolation, output contract, refined fields, and stop conditions. |
| `adaptive` | Graph version, replan count, refined-result contract, tool-first policy, replan events, condensed log, and completion policy. |
| `results[].refined` | Compact `refined-json-v1` summaries with artifacts, evidence pointers, tools used, open questions, next actions, confidence, and Plugin evidence. |

Derived files:

- `graph.json` — current packet DAG and execution specs.
- `condensed_log.jsonl` — compact owner-context execution events.
- `replan_events/*.json` — post-node adaptive judgments.
- `final-report.md` — final verdict, accepted results, plugin evidence, and risks.

## CLI quick paths

### Create and inspect a workflow

```bash
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts detect --json "<task>"
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts new --json "<task>"
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts inventory --json .agent-workflows/<id>
```

### Launch or simulate packets

```bash
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts launch-packets --harness auto .agent-workflows/<id>
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts simulate .agent-workflows/<id>
```

### Ingest real worker results

```bash
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts record-result --packet <packet-id> .agent-workflows/<id>
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts record-result --packet <packet-id> --result-file <file> .agent-workflows/<id>
```

`record-result` accepts whole-file JSON, fenced JSON / `refined-json-v1`,
`## Refined Result` sections, and Markdown fallback. It updates packet status,
`workflow.results`, `results[].refined`, plugin evidence, verification,
condensed logs, adaptive judgments, `graph.json`, and `final-report.md`.

### Replan and verify

```bash
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts refined-results --json .agent-workflows/<id>
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts adaptive-step --packet 02-research --action continue .agent-workflows/<id> "next node is small enough; continue"
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts verify --complete .agent-workflows/<id>
```

## MCP surface

`plugins/codex-augment-dispatcher/scripts/dispatcher_mcp.ts` exposes adaptive
workflow helpers for harnesses that prefer MCP calls:

| MCP tool | Purpose |
| --- | --- |
| `dispatch_classify` | Classify a prompt into dispatcher routes. |
| `workflow_create` | Create a workflow artifact. |
| `workflow_approve` | Grant workflow approvals. |
| `workflow_verify` | Validate structure or full completion. |
| `workflow_inventory` | Return captured environment inventory. |
| `workflow_refined_results` | Return compact refined packet results. |
| `workflow_replan_propose` | Record or propose adaptive judgments. |
| `workflow_launch_packet` | Return launch suggestions for packet fanout. |
| `reliable_stage_contract` | Return reliable-agent-workflow stage contract notes. |

## Cross-harness launch chain

`launch-packets` prints recipes that include the execution spec and refined
result contract for each supported harness:

| Harness | Recipe shape |
| --- | --- |
| Grok | `task({ subagent_type, persona, capability_mode, worktree, prompt })` |
| Claude Code | `@reliable-<role>` or Agent tool style prompts |
| Codex | `codex --profile deep-review` with copied `.codex/agents/*.toml` |
| Pi | `subagent({ agent, task, model, async: true })` |
| cc-router | `taskctl capability` bridge |

Every worker should write `refined-json-v1` to `results/<packet>.md`, include
`toolsUsedForSelfResolution`, suggest next actions, and emit `Plugin evidence:`.

## Completion gate

`verify --complete` requires:

- all approvals granted
- every packet completed
- every packet has a result
- every result has a refined result
- every required plugin has successful evidence
- at least one passing verification record
- at least one adaptive judgment/replan event
- at least one condensed log entry
- `finalVerdict === "complete"`

This prevents a workflow from claiming PASS before the graph and its evidence
are actually complete.

## Future work

- Programmatic launch/wait helpers for harnesses that expose safe subagent APIs.
- Deeper MCP discovery from the active harness.
- Graph visualization.
- Provider-specific validation for launch recipes.
- More metrics around real-vs-simulated packet execution.
