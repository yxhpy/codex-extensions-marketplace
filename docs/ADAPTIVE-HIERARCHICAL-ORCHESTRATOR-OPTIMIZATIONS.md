# Proposal: Optimized Adaptive Hierarchical Orchestrator Architecture

**Status:** Optimization suggestions only (no logic implementation changes in this PR).  
**Goal:** Evolve the `dynamic-workflow` + `dispatch` + `reliable-agent-workflow` + core subagent primitives toward the user's requested live, adaptive, main-model-orchestrated model while integrating state-of-the-art public research on hierarchical multi-agent systems (HMAS), adaptive replanning, and graph-based execution.  
**Scope:** All changes in this PR are documentation, examples, AGENTS.md pointers, and a CHANGELOG entry. Concrete implementation (new scripts, schema extensions, MCP tools) left for follow-up PRs after review.  
**Cross-harness:** Suggestions preserve the portable `.agent-workflows/` canonical artifact and harness-specific recipes.

## 1. User's Desired Architecture (Restated for Precision)

The main model (primary Grok/owner session) must:

1. **First survey comprehensively**: Current task + *all* available agents (builtin `general-purpose`/`explore`/`plan` + custom `.grok/agents/`, personas from config/bundled, dynamic creation), tools (core + MCP via `search_tool`/`use_tool`), skills (via `grok inspect --json`, `/skills`, auto-trigger frontmatter `description`s, plugin skills), harness capabilities.
2. **Build structured flow upfront but flexible**: Decide parallel vs serial (explicit deps + batches). Pre-assign *per node/step* exactly which tools/skills/personas/subagent_type + capability_mode to use. Record in durable artifact.
3. **Delegate execution**: Launch node(s) exclusively via subagent (e.g. `spawn_subagent` / `task` tool or harness equivalent). Subagent receives bounded contract + "produce *refined* result only".
4. **Main sees only refined**: After subagent completes, main receives compact executive summary + evidence pointers + structured fields (no full raw transcript/context unless explicitly `resume_from` for repair). 
5. **Post-node adaptive judgment (the key loop)**: Main re-evaluates:
   - Does subsequent flow need modification (new info, blockers, opportunities)?
   - Is the *next* node too large/ambiguous? Re-split/decompose it (using tools or a dedicated small decomposer subagent).
   - Update the graph (insert/split/remove/re-parallelize nodes), re-assign specs if needed.
6. **Continue until complete**: Only the full workflow (all nodes + final verification + approvals) ends the run.
7. **Mid-flow questions**: Resolve exclusively via tools (grep/read/web_search/MCP/search_tool/run_terminal/spawn mini research subagent/ existing skills like `grok-augment` or `thinking-gate`/etc.). `ask_user_question` or escalations only for true product/ambiguity/stalemate that tools cannot address. Record every tool-based resolution.
8. **Optional supplements**: Deep research public/non-public patterns and integrate best ideas (hierarchical layers, adaptive replan triggers, quality evaluators, state machines, result compaction, etc.).

Current system approximates parts of this (`.agent-workflows/`, packets with deps + `mode: subagent`, `launch-packets`, LLM-proposed packets via Claude at `new` time + review round, owner integration of results, approval gates, `Plugin evidence`, refined summaries in subagent docs) but is mostly *upfront + collect* with manual owner re-planning rather than a first-class live adaptive loop with mandatory inventory + per-node tool/skill pre-assignment + enforced refined contracts + automatic re-split judgment.

## 2. Current State Gaps (Evidence from Codebase Audit)

- **Inventory not explicit first step**: `createWorkflow` / `detectDynamicWorkflow` does signal regex + optional Claude packet proposal. No dedicated "survey all agents/tools/skills/MCP" and persist structured `environment_inventory`. `grok inspect --json` and skill frontmatter exist but not wired into workflow artifact at creation.
- **Planning is largely static/one-shot**: `buildPackets` (rule-based + `planPacketsWithClaude` + `reviewPacketsWithClaude`) + `recommendedPacketIds`. `launch-packets` prints recipes. No live "after results, judge next node size and re-decompose" in the TS or mandated in SKILL contracts. Owner agent is expected to do this judgment via prompt instructions (AGENTS.md, dynamic-workflow/SKILL.md).
- **Pre-assignment of tools/skills per node weak**: Packets have `requiredPlugins`, `role`, `mode`, `expectedEvidence`. No `execution_spec: {subagent_type, persona, inject_skills: [], allowed_core_tools: [], output_contract: "refined-json-v1"}`.
- **Refined results encouraged but not strictly contracted/enforced for main context hygiene**: Sub docs say "parent receives the child's output (typically a summary)". Dispatcher expects files in `results/`. No standard refined schema + "executive + tools_used_for_resolution + suggested_replan" required in all role examples.
- **Replanning is implicit/owner-driven**: Reliable has repair loops until 0 open issues (good), but the top-level dynamic packet graph doesn't auto-adapt mid-execution. No "replan" action or post-result manager step in the default packets.
- **Parallel/serial + wait is owner-orchestrated**: Uses background + `get_command_or_subagent_output` + notifications, `wait_commands_or_subagents` tool exists in core but not surfaced in dispatcher helpers or examples.
- **Doubt resolution can still reach user too early**: Reliable SKILL says "Ask the user only for ... stalemate" and "escalate to the user". User's request: make tool exhaustion mandatory and logged first.
- **No built-in evaluator/replan trigger role**: Lybic-style continuous quality assessment missing as first-class (though verification packets and reliable reviewer exist).
- **Discovery surface for MCP/tools**: `search_tool` + `use_tool` + connected MCPs (e.g. grok_com_github) are powerful but not pre-surveyed in workflow creation for "what can I assign to nodes".
- **Artifacts good for audit but not optimized for live compact main context**: `workflow.json` + packets/results + final-report. Can be extended with `graph_versions/`, `condensed_execution_log.jsonl`, `replan_events/`.

See: [dynamic_workflow.ts](../plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts) (lines ~409-582 for Claude planning, ~949-1180 buildPackets, launchSuggestion ~1464), [dispatch/SKILL.md](../plugins/codex-augment-dispatcher/skills/dispatch/SKILL.md), [reliable-agent-workflow/SKILL.md](../plugins/codex-augment-dispatcher/skills/reliable-agent-workflow/SKILL.md) (phase loops, ask rules), [CROSS_HARNESS_SUBAGENT_TRIGGERING.md](../docs/CROSS_HARNESS_SUBAGENT_TRIGGERING.md), user-guide 16-subagents.md (task/spawn_subagent, personas, capability_mode, resume_from, background via Ctrl+G + get/wait), 20-background-tasks.md (monitor/scheduler), AGENTS.md.

## 3. Research Synthesis: Public (and Emerging) Patterns to Integrate (2025-2026)

Deep retrieval (arXiv, blogs, benchmarks, frameworks):

- **Hierarchical Multi-Agent Systems (HMAS)**: Tree/layered (Strategy/Leader/Supervisor → Planning/Manager → Execution/Workers). Leader decomposes, assigns by expertise, maintains global view while partitioning context (critical for main only seeing refined). See medium.com overview, IBM, LinkedIn analyses. Matches user's "main model first understands all, builds flow, delegates".

- **Agentic Lybic (arXiv:2509.11067, Sep 2025)**: Four-tier with *adaptive re-planning at core*:
  - Controller: global state, decision triggers, FSM.
  - Manager: intelligent task decomposition + *adaptive re-planning*.
  - Workers: specialized roles (Technician/Operator/Analyst).
  - Evaluator: continuous quality assessment + intervention triggers → replan on degradation.
  "Unlike static delegation schemes that fix agent roles and topology at runtime, Agentic Lybic can trigger re-planning when quality degrades".

- **OrchVis (arXiv:2510.24937, Oct 2025)**: Hierarchical goal alignment, task assignment, conflict resolution. Users (or here: main + tools) supervise without micromanaging; selective replan on conflicts. Visualization/audit (our `.agent-workflows/` + todos + tasks pane is analogous).

- **Adaptive Topology (AdaptOrch benchmark, arXiv:2602.16873)**: On SWE-bench Verified, *adaptive selection* of hybrid/parallel/hierarchical per task yielded +22.9% over best fixed baseline. Router chose 62% hybrid, 24% parallel, 14% hierarchical. Implication: the orchestrator should be allowed (and encouraged) to change structure mid-flow.

- **LangGraph (and graph/agent frameworks 2025+)**: 
  - Explicit state (TypedDict analog → our `workflow.json` + condensed log).
  - Nodes = agents/tools; conditional edges = routing/replan logic ("if next too big or quality low → decompose edge").
  - Persistence/checkpointing (durable execution across turns/compaction; our artifacts + scheduler).
  - Reflection/critique loops (plan → exec → critique → replan).
  - Interrupts / human-on-the-loop (map our approval gates + tiered autonomy: low-risk auto based on confidence in refined result; high-risk gate).
  - Map-reduce / parallel fanout with join.
  - "Expect the wrong output" + retries + state recovery.

- **Other recurring themes**: Supervisor pattern (main = supervisor), blackboard/shared artifacts for sub-comms (our packets/results + proposed blackboard/), result compaction for controller context, tool-use before escalation, hierarchical for scale + context window management, FSM or explicit graph for predictability + audit.

**Integration into suggestions below**: Controller/Manager = enhanced owner + new live helpers in dispatcher; Evaluator = first-class role + post-batch quality; adaptive replan + topology changes = core of post-node judgment; state machine flavor via versioned graph + events; refined results + strict contracts = the "partitioned context" enabler; inventory survey = strategy layer input.

Non-public / internal complements (from this ecosystem): the existing `spawn_subagent` + `resume_from` + `capability_mode` + worktree + `todo_write` + background/monitor/scheduler + `wait_commands_or_subagents` + plan-mode (for high-ambiguity) + MCP surfaces + `.agent-workflows/` portable trail + cc-router/taskctl as complementary strict external workers. The dispatcher already bridges these; we make the *live adaptive loop* first-class on top.

## 4. Concrete Optimization Suggestions (Actionable, Prioritized)

### 4.1 Mandatory Inventory/Survey Phase at Workflow Start (User Req #1)

- Enhance `dynamic_workflow.ts` (future): add `inventory` subcommand and call inside `createWorkflow` (or new `orchestrate new`).
- Run (and cache): `grok inspect --json`, parse skills (filter by "complex|workflow|agent|orchestrat|reliable|multi" etc. + all), known subagent_types/personas (from bundled + user-guide + `~/.grok/config.toml` parse), MCP tools (if any `search_tool` returns, list connected), core tools categories (the ones in system prompt: file, terminal, subagent, todo, scheduler, monitor, web/x search, image, MCP use, etc.), available harness adapters.
- Persist in `workflow.json`:
  ```json
  "environment_inventory": {
    "captured_at": "...",
    "skills": [{"name": "dynamic-workflow", "desc": "...", "source": "plugin"} , ...],
    "subagent_types": ["general-purpose", "explore", "plan"],
    "personas": ["implementer", "reviewer", "researcher", "security-auditor", ...],
    "core_tools_categories": ["filesystem", "terminal", "subagent", "todo", "scheduler", "mcp", "search", ...],
    "mcps": ["grok_com_github"],
    "harness": "grok"
  }
  ```
- In `01-orchestration` packet (and SKILL guidance): "Step 0: load and reason over environment_inventory. Use it to pre-assign realistic `execution_spec` for every packet."
- Benefit: main truly "understands current environment available agents/tools/skills" before building flow. Enables better pre-assignment and dynamic creation hints (e.g. "no security-auditor persona yet, consider creating one via config").

**Suggested addition to dispatch/SKILL.md and dynamic SKILL.md**: explicit "Inventory first" in routing order.

### 4.2 Richer Per-Node Pre-Assignment + Execution Contracts (User Req #2)

Extend `Packet` type (future minor schema bump):
```ts
execution_spec?: {
  subagent_type: "general-purpose" | "explore" | "plan";
  persona?: string;
  capability_mode?: "read-only" | "read-write" | "execute" | "all";
  inject_skills?: string[];   // e.g. ["grok-augment", "thinking-gate"]
  recommended_tools?: string[]; // high-level or specific
  worktree_isolation?: boolean;
  output_contract: "refined-json-v1" | "standard-evidence-md";
};
```
- During `new` / Claude packet planning: force inclusion of realistic specs drawn from inventory.
- `launch-packets` (and future programmatic launcher) emits full `task({ ..., subagent_type: spec..., persona: ..., prompt: "Follow packet + execution_spec + output_contract exactly. Produce refined only." })`.
- Update all `docs/examples/*` and grok-agents/*.md to show the new fields.

This makes "every step which tools or skill must be preset in advance" true and machine-readable.

### 4.3 Enforced Refined Results + Tool-First Doubt Resolution (User Req #4, #7)

Define (in doc + future types) a `RefinedResult` schema:
```json
{
  "packet_id": "...",
  "verdict": "success|partial|blocked",
  "executive_summary": "1-2 sentence for main context",
  "key_artifacts": ["results/xx.md", ".agent-workflows/yy.json"],
  "evidence_pointers": ["grep hit in foo.ts:42", "test passed: ..."],
  "tools_used_for_self_resolution": ["grep:pattern", "web_search:howto", "read:AGENTS.md", "spawn mini-researcher", "mcp:github search"],
  "open_questions": [{"q": "...", "resolved_via": "tool X or NEEDS_USER", "impact": "low"}],
  "suggested_next_actions": ["split node Z because ...", "add parallel research on W"],
  "confidence": 0.85,
  "cost_tokens_approx": 1234,
  "plugin_evidence": "dynamic-workflow researcher via ..."
}
```
- Mandate in every subagent prompt/contract (update SKILLs, role examples, reliable phases, launchSuggestion).
- Main loop *only* loads these (plus workflow.json snapshot) for judgment → keeps main context lean.
- In reliable + verifier: add checklist "Did implementer/reviewer demonstrate ≥N tool calls for any internal question before surfacing?"
- Record in results + evidence: "questions_resolved_by_tools": count + examples. This directly supports "if mid-way doubt use tools, non-necessary do not ask user".

Update `ask_user_question` usage guidance in reliable/AGENTS: "Only after tool exhaustion documented in refined result."

### 4.4 Live Adaptive Replan Loop as First-Class (Core of User Vision + Research)

**Recommended new helper surface** (future `scripts/adaptive_orchestrate.ts` or extension of dynamic_workflow "continue"/"step"):

Pseudo (owner/main agent follows or script assists):

```ts
// After create + approve + initial inventory + packet specs
while (!isComplete(workflow)) {
  const ready = getReadyPackets(workflow); // topo, no pending deps
  if (ready.length === 0) { ... }

  // Parallel where safe (independent + no write conflict)
  const launched = ready.map(p => spawnRefinedSubagent(p, workflow.environment_inventory));
  await waitForAll(launched); // core wait_commands_or_subagents or poll + notifications

  for (const r of getRefinedResults(launched)) {
    integrateRefined(r); // accept/reject/stale as today
    recordCompactEvent(r);
  }

  // THE ADAPTIVE JUDGMENT (main model only here, with tiny context)
  const judgment = await replanJudge({workflow, recentRefined});
  if (judgment.needs_replan || judgment.next_node_too_large) {
    const delta = await proposeGraphDelta(judgment); // can use task-gate/Claude or internal
    applySafeGraphUpdate(workflow, delta); // splice nodes, update deps, bump version
    recordReplanEvent(judgment.reason, delta);
    // small internal replans inside execute scope: auto; scope-expanding: re-gate
  }

  updateTodosFromGraph(); // visible in TUI Ctrl+T
  saveWorkflow();
}

runFinalVerify();
```

- Trigger replan on: (a) any refined suggests it, (b) next packet objective > complexity heuristic (or explicit "decompose me" flag), (c) evaluator (new standard role) reports quality < threshold or new risks, (d) conflicts (per OrchVis).
- Support topology change (parallel ↔ serial ↔ insert manager layer).
- Use `todo_write` at orchestrator level for the live phases + per-packet sub-todos.
- For long nodes: launch with `background: true` + `monitor` + scheduler heartbeat if needed.
- Nested: a packet can be "sub_dynamic_workflow": true → its subagent runs its own .agent-workflows subtree; parent only sees top refined.

**Add "evaluator" as standard recommended packet/role** (like Lybic) after groups of risky nodes or before release gate.

**Replan safety**: atomic writes, max_replans_per_node, diff of graph for review, preserve all history in artifact.

This turns the current "create once, launch, integrate at end" into the continuous "main judges + adapts after each (or batch) refined result".

### 4.5 State, Observability, and Tooling Improvements

- Artifact extensions (backward compat):
  - `graph.json` or versioned `graphs/v001.json` (full current DAG).
  - `condensed_log.jsonl` (only high-signal events + refined exec summaries).
  - `replan_events/` + `resolution_log.md` (tools used to avoid asks).
- Expose via MCP (dispatcher_mcp.ts): `workflow_inventory`, `workflow_replan_propose`, `launch_packet_programmatic` (returns task_id for wait), `get_refined`.
- Leverage core more: `todo_write` in 01-orchestration and post-replan; `scheduler_create` for periodic evaluator sweeps on long workflows; `monitor` for sub progress streams.
- Blackboard (optional): `.agent-workflows/<id>/blackboard/` for cross-packet facts (subs post, main or others read) without tight deps.
- Tiered autonomy (LangGraph-inspired): in judgment, if all recent refined have high confidence + low risk signals → auto-advance low-risk follow-on nodes (still record); else gate or insert reviewer.

### 4.6 Harness Recipes + Cross-Harness Updates

- Extend `launch-packets` (and new adaptive helper) output with full live-loop examples per harness (Grok `task` + wait, Claude background agents + polling artifacts, Pi subagent batches + async wait, Codex toml + exec, cc-router taskctl as one realization of packets).
- Update [CROSS_HARNESS_SUBAGENT_TRIGGERING.md](../docs/CROSS_HARNESS_SUBAGENT_TRIGGERING.md) and examples/ with "adaptive loop" recipes.
- Note cc-router/taskctl can be the "external strict workers" for certain packets while .agent-workflows remains the audit + main's refined view.

### 4.7 Documentation, Triggers, and Self-Improvement

- AGENTS.md: strengthen dynamic-workflow bullet: "Use for ... ; after initial packets, run live adaptive loop with inventory, pre-assigned specs, refined results only, post-node replan judgment (re-split large nodes, insert evaluators, adapt topology). Record all in .agent-workflows/."
- Add this doc to plugin trigger rules and "When multiple apply...".
- In dispatch/SKILL.md: add inventory + adaptive loop to routing order #1.
- SkillOpt tie-in: treat weak replan judgments, missed inventory usage, or unnecessary user asks as training signals for future dispatcher improvements (bounded edits only).
- New examples: `docs/examples/adaptive-loop-grok.md` (owner prompt skeleton using the new contracts).

### 4.8 Risks, Mitigations, Non-Goals

- **Context bloat / cost**: Strict refined + condensed log + "main only loads judgment-sized state" + depth limits. Mit: budgets in spec.
- **Runaway replanning**: Thresholds, max per node, "only replan on new evidence or explicit size flag".
- **Over-fragmentation**: Planner/replan must produce *meaningful* nodes (acceptance criteria, <N steps heuristic).
- **Harness gaps**: Fallback simulation always preserves the loop structure + artifacts (as today).
- **User asks**: Never remove legitimate product decisions; just make tool resolution the documented default path first.
- Non-goal for *this* PR: rewrite TS logic, change schema incompatibly, add new runtime deps. Only suggestions + scaffolding docs.

## 5. Proposed PR Contents (This PR) & Follow-Up Roadmap

**This PR delivers**:
- This document (`docs/ADAPTIVE-HIERARCHICAL-ORCHESTRATOR-OPTIMIZATIONS.md`).
- Pointer updates in `AGENTS.md` (dynamic-workflow section) and `docs/CROSS_HARNESS...`.
- Brief CHANGELOG entry under Unreleased.
- (Optional) tiny example skeleton in `docs/examples/` if it clarifies without new code.
- No changes to `*.ts` implementation, no new SKILL behavior, no tests that would require logic.

**Follow-up roadmap** (suggested order):
1. Inventory capture + persisted in artifact + orchestration prompt updates.
2. execution_spec + refined result contract + enforcement in validate/simulate + all examples/role files.
3. Live step/replan helper (script or pure prompt recipe) + todo integration + wait primitives surfaced.
4. Evaluator role + quality-triggered replan examples.
5. MCP surface extensions + programmatic launch/wait.
6. Harness recipe expansions + e2e tests for adaptive re-split scenarios (simulated first).
7. Visualization (mermaid in final-report or TUI integration).

## 6. Verification for This Proposal PR

- Local: `node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts e2e --json "..."` still passes (no breakage).
- Docs: `cat docs/ADAPTIVE-...` renders cleanly; links resolve.
- References: AGENTS.md and CROSS_HARNESS mention the new doc.
- No user-askable questions introduced; all is suggestion.
- Research citations/links included for traceability.

## 7. Conclusion

This proposal directly realizes the requested main-model-first inventory → structured (parallel/serial) pre-assigned flow → subagent execution → refined-result-only → adaptive judgment + re-split loop, while the entire run stays open until complete. By grounding in HMAS/Lybic/LangGraph/OrchVis patterns (Controller-Manager-Evaluator + adaptive replan + stateful conditional graphs + context partitioning via refined), we make the existing excellent Grok subagent + artifact + dispatcher foundation *even more powerful and aligned* without losing the portable cross-harness + owner-owns-edits invariants.

The suggestions are deliberately high-signal and implementable incrementally. Feedback on priority or alternative patterns welcome in PR review.

**Plugin evidence**: dynamic-workflow + dispatch + research (grok-augment style) via owner analysis of current sources + external retrievals; proposal recorded in `.agent-workflows/`-style doc for audit.

---

*Generated as pure suggestion vehicle. Implementation will follow consensus.*