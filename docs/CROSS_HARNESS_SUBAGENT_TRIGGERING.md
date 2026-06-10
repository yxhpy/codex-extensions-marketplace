# Cross-Harness Subagent Fanout

<p align="center">
  <strong>Turn workflow packets into real worker runs across Codex, Claude Code, Grok, Pi, and cc-router.</strong><br />
  Practical recipes, setup notes, and evidence rules for making dynamic workflows more than simulated artifacts.
</p>

---

## Executive summary

`dynamic-workflow` creates a portable audit trail under `.agent-workflows/`:
packets, dependencies, approvals, result slots, graph metadata, replan events,
and final reports. It does **not** magically spawn every harness by itself.

Real fanout works when the owner agent does three explicit things:

1. Creates the workflow artifact.
2. Launches each `mode: "subagent"` packet through the active harness primitive
   or a documented CLI recipe.
3. Ingests each worker result with `record-result` before `verify --complete`.

```bash
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts new --json "<task>"
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts launch-packets --harness auto .agent-workflows/<id>
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts record-result --packet <packet-id> .agent-workflows/<id>
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts verify --complete .agent-workflows/<id>
```

## Why agents used to fall back to single-thread work

| Gap | Effect | Fix in this marketplace |
| --- | --- | --- |
| Dispatcher produced artifacts but not harness-specific spawn actions. | Owner agents often simulated or serialized work. | `launch-packets` prints concrete recipes for each harness. |
| Harness subagent UX differs widely. | Generic "use subagents" prompts were too vague. | Shipped Codex/Claude/Grok examples under `docs/examples/`. |
| Long skill context competed for attention. | Agents remembered planning but skipped fanout. | AGENTS/skills now emphasize packet launch + result ingestion. |
| Results were written to Markdown but not back to `workflow.json`. | `verify --complete` could not see real worker output. | `record-result` normalizes Markdown/JSON worker output into workflow state. |
| cc-router and dispatcher were unaware of each other. | Duplicate or conflicting control planes were possible. | cc-router/taskctl is documented as a valid packet execution backend with `.agent-workflows/` as portable audit trail. |

## Harness matrix

| Harness | Native strength | Recommended realization |
| --- | --- | --- |
| Grok | Strong task/subagent primitive with persona, capability mode, worktree isolation, and async tasks. | Use printed `task({ ... })` recipes for researcher/reviewer/verifier packets. |
| Claude Code | Strong file-based agents with frontmatter, `@` mentions, Agent tool, and background tasks. | Copy `docs/examples/claude-agents/*.md` into `.claude/agents/`, then use printed `@reliable-<role>` prompts. |
| Codex | Good CLI execution and custom agent TOML, but weaker first-class TUI spawning in many setups. | Copy `docs/examples/codex-agents/*.toml` into `.codex/agents/`; run printed `codex --profile deep-review ...` commands or use worktrees. |
| Pi | Good `subagent({ agent, task, model, async })` shape and package-installed skills. | Use printed Pi `subagent()` snippets and skill-relative script paths. |
| cc-router | Strict external worker orchestration through taskctl and artifact gates. | Treat `taskctl capability` as packet execution; copy results back into `.agent-workflows/`. |

## Setup quickstart

### Codex

```bash
mkdir -p .codex/agents
cp docs/examples/codex-agents/*.toml .codex/agents/
```

Then run `launch-packets --harness codex` and execute the printed commands.
Each worker should read `packets/<id>.md` and write `results/<id>.md`.

### Claude Code

```bash
mkdir -p .claude/agents
cp docs/examples/claude-agents/*.md .claude/agents/
```

Then use the printed `@reliable-researcher`, `@reliable-reviewer`,
`@reliable-implementer`, or `@reliable-verifier` prompt shape.

### Grok

Read `docs/examples/grok-agents/README.md`, then use the printed `Grok task:`
recipes. Prefer read-only or isolated worktree modes for research and review
packets.

### Pi

Install the package:

```bash
pi install git:github.com/yxhpy/codex-extensions-marketplace@main
```

Then use printed `subagent({ ... })` calls or equivalent Pi SDK/session calls.
When invoking repository scripts from a skill, resolve the active `SKILL.md`
folder and use paths like `../../scripts/dynamic_workflow.ts`.

### cc-router

Use the printed `taskctl capability` recipe as the worker launcher. Keep
`.agent-workflows/` as the portable trail even when cc-router also writes its
own local controller artifacts.

## Packet result contract

Every real worker should produce a compact result file:

````md
# Result <packet-id>

Status: success

## Summary

<what was decided or completed>

## Evidence

- <commands, files, screenshots, review notes>
- Plugin evidence: dynamic-workflow <role> via <harness primitive>

## Refined Result

```json
{
  "packetId": "<packet-id>",
  "verdict": "success",
  "executiveSummary": "Owner-readable compact summary.",
  "keyArtifacts": ["results/<packet-id>.md"],
  "evidencePointers": ["results/<packet-id>.md: evidence line"],
  "toolsUsedForSelfResolution": ["read:packet contract", "inspect:workflow.json executionSpec"],
  "openQuestions": [],
  "suggestedNextActions": ["continue"],
  "confidence": 0.85,
  "pluginEvidence": "Plugin evidence: dynamic-workflow <role> via <harness>",
  "completedAt": "2026-06-10T00:00:00Z"
}
```
````

If a worker only writes ordinary Markdown, `record-result` will still create a
fallback refined result. Prefer explicit `refined-json-v1` for better owner
context and stronger verification.

## Owner responsibilities

The owner thread remains accountable for:

- creating the workflow artifact before delegation
- launching or approving every worker packet
- ingesting worker results with `record-result`
- rejecting stale or unsafe worker output
- rerunning local tests, validators, browser checks, or release gates
- making final claims only after `verify --complete` passes

Subagents are assistants, not release authorities.

## Verification checklist

Run these checks when changing the fanout path:

```bash
node --experimental-strip-types --test tests/*.ts plugins/codex-augment-dispatcher/tests/*.ts
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts e2e --json "Plan a subagent workflow with approval gates and end-to-end verification"
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts launch-packets --harness auto .agent-workflows/<id>
```

For a live smoke test, execute at least one printed worker recipe, write
`results/<packet>.md`, ingest it with `record-result`, and confirm
`verify --complete` can see the real result.

## Future improvements

- Safe programmatic launch/wait adapters where harnesses expose stable APIs.
- MCP tool output that returns launch recipes as structured JSON.
- More metrics for real vs simulated packet execution.
- Deeper cc-router bridge metadata.
- Optional bootstrap scripts that copy example agents into a project.
