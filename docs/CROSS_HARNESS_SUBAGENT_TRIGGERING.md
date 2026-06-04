# Cross-Harness Subagent and Dynamic Workflow Triggering: Research, Gaps, and Fixes

## Executive Summary (for PR)

Deep research across Codex, Claude Code, Grok (this TUI/ACP), Pi, AGY, and the complementary cc-router-codex control plane revealed why "use workflow", "dynamic-workflow", "subagent", "fanout", or "background threads" often fails to produce real parallel subagents even when the dispatcher plugin is installed and the prompt explicitly references it.

**Root causes (ranked):**
1. **Dispatcher is "orchestration + classification + artifacts" only.** It creates `.agent-workflows/<id>/` with packets (many marked `mode: "subagent"`), runs detect/new/approve via scripts, and relies 100% on the *owner agent's harness-native subagent primitive* (or simulated fallback) to actually execute the packets. No built-in spawner in the TS scripts for most cases.
2. **Harness subagent UX varies wildly in ease + setup cost:**
   - Grok (this env): Excellent native (`task` / spawn_subagent tool + subagent_type + persona + capability_mode + worktree isolation + resume_from + depth limits + tasks pane). Low friction once instructed.
   - Claude Code: Very strong (`.claude/agents/*.md` with rich YAML: tools, model, hooks, mcpServers, skills, isolation: worktree, memory, background, permissionMode; built-ins like Explore/Plan; @-mention, Agent tool, fork mode for context inherit, background tasks). But requires files in right scope.
   - Pi: Good (`subagent({agent, task, model, async})` in TS/JS, SDK, extensions like pi-subagents; model overrides in settings).
   - Codex: Weakest out-of-box. Docs recommend `.codex/agents/<role>.toml` + "ask Codex to spawn named role agents explicitly" (via --model/--profile or in prompt), plus codex exec for workers. No first-class `spawn_subagent` tool exposed in TUI for most users. Single-agent fallback is common. Custom agents tomls are almost never present (verified: no `~/.codex/agents` or project ones in active envs).
3. **Prompt / attention / conflict problems:** Long injected SKILL.md (reliable alone is thousands of lines when fully loaded) + competing control planes (e.g. cc-router-codex's "controller-only + taskctl capability gates + workflow_policy that can reject and force roles via external Codex workers + focus_guard + hooks on UserPromptSubmit/SessionStart") dilute the "fanout the packets using native subagents" instructions. Agent often reads dispatch/reliable then chooses "single-agent reliable delivery".
4. **Missing concrete recipes + bootstrap:** Skills say "use real when platform supports; else simulate + write artifacts". No per-harness "exact spawn call / command / @mention / toml for these packet roles" that the owner can copy-paste or auto-invoke. No shipped example agent definitions. No cross-harness launcher helper. cc-router's external orchestration (separate worker processes + SQLite taskctl + strict artifact prerequisites) is a valid realization of "packets" but invisible to the dispatcher (and vice-versa).
5. **Verification and "Plugin evidence"** helps for gates but doesn't force the fanout step itself.
6. **"Now" factors:** Recent plugin v0.1.19 additions (ui-ux etc.) increased prompt size; Codex 0.136 sessions show heavy skill loading via shell reads inside loops; user's heavy use of cc-router in many projects (including those with svn/codexstatus etc.); no merge of marketplace AGENTS.md into project ones.

**Evidence sources (this session + clone):**
- Full reads of dispatch/dynamic/reliable SKILL.md, dynamic_workflow.ts (SIGNALS detector, buildPackets with mode, simulate vs real), codex_gate.ts, task_gate.ts, grok_augment.ts, dispatcher_mcp.ts.
- Session rollout jsonl (huge injected reliable text, agent deciding single-agent after reading dispatch, shell reads of SKILLs).
- cc-router code (taskctl.py roles, worker_runner, workflow_policy gates with Codex classifier, hooks injecting controller rules, asset parallel only via ThreadPool not general subagents).
- No .codex/agents anywhere (confirmed via recursive searches).
- Grok user-guide/16-subagents.md (rich native support).
- Claude Code subagents docs (fetched; extremely capable file-based + frontmatter).
- Pi examples in reliable SKILL.
- Tests showing "platform-neutral" intent + simulated e2e.
- Marketplace AGENTS.md + README emphasizing merge + "use real subagents when available".

**The modification plan (implemented in this PR + future):**
- Make triggering *actionable and harness-specific* with concrete spawn recipes + examples.
- Provide bootstrap/setup for the missing agent defs (Codex tomls, Claude .md, Grok config/personas).
- Add a lightweight cross-harness packet launcher helper (script that outputs or executes spawns for current harness, falling back to documented simulation).
- Document the relationship with cc-router/taskctl as complementary (dispatcher for routing + canonical .agent-workflows audit trail; cc-router for strict external gated workers when desired).
- Strengthen detection, owner instructions, and evidence requirements around actual fanout (not just artifact creation).
- Ship examples + new cross-harness doc so users (and future harnesses) have a reference.
- Minor: shorten/highlight trigger text where possible, add MCP-driven spawn path notes.

This makes "manual specify use workflow" far more likely to result in real (or properly simulated + evidenced) fanout across Codex/Claude/Grok/Pi.

See the rest of this doc for full research details, exact proposed/ implemented diffs, and verification steps.

## Detailed Research per CLI

### Codex (the original complaint)
- Injection: Plugin skills become part of developer instructions (visible in jsonl as long base text + agent shell-catting the SKILL.md on demand).
- Subagent path: "use available... otherwise single-agent fallback". Recommends .codex/agents/*.toml (name, model=..., model_reasoning_effort, sandbox_mode, developer_instructions) + explicit "ask to spawn" after `codex --profile` or in prompt. codex_gate uses `codex exec --skip-git-repo-check`.
- Reality in user's env: No tomls present (global or C:\project\svn etc.). Base prompt biases pragmatic/single. cc-router hooks may be active in some projects. Agent can create artifacts but rarely actually forks parallel (often serial or "single reliable").
- Scripts: codex_gate.ts for pre-classify + evidence enforcement before exec.
- Trigger words in detector: explicit-workflow signal catches "subagents", "background threads", "fanout", "workflow artifacts", "dynamic-workflow", Chinese equivalents, etc.

### Claude Code
- Rich native: Built-in Explore (read-only Haiku), Plan, general-purpose. Custom via .claude/agents/*.md (YAML frontmatter: name, description (for auto-delegate), tools/disallowedTools, model, permissionMode, hooks, mcpServers, skills (preload), memory (user/project/local), isolation: worktree, background, effort, color, initialPrompt). @-mention or natural lang or Agent tool. Fork mode (CLAUDE_CODE_FORK_SUBAGENT) for context inherit. Background tasks. SubagentStop hooks etc.
- Dispatcher already recognizes: "Claude Code Dynamic Workflows, ultracode, .claude/workflows, .atomic" → native interop metadata in workflow.json while keeping .agent-workflows canonical.
- Task gate uses Claude CLI for planning (structured output).
- Gap: No example .claude/agents/ files shipped that map to dispatcher's roles (researcher, reviewer, implementer, etc.). Instructions say "use .claude/agents/..." but no concrete files or "here is the exact frontmatter for a reliable-reviewer that matches our packets".
- cc-router often used *with* Claude as the controller (exactly the "main is controller, delegate to workers" model).

### Grok (this environment / ACP / TUI)
- Excellent: `task` tool (or spawn_subagent per system tools) with subagent_type (general-purpose, explore, plan), persona (implementer, reviewer, researcher, security-auditor, ... with IO contracts), capability_mode (read-only/read-write/execute/all), worktree isolation, resume_from for chaining, depth limits, tasks pane (Ctrl+T), subagent catalog (Ctrl+Shift+A).
- Config: ~/.grok/config.toml for [subagents], models, roles, personas. Agents in ~/.grok/agents/ or .grok/agents/*.md (similar to Claude).
- Dispatcher has grok-augment.ts (for research/critique/video, using GROK_AUGMENT_GROK_BIN or configured), and reliable mentions model aliases + grok inspect -p "..." -m alias.
- Gap: Skills mention Grok for "non-mutating research" and model aliases, but lack "exact task tool call + persona + worktree for a 'research' packet" or "how owner uses spawn_subagent to realize the dynamic packets". No shipped .grok/agents/ examples. (This PR adds them.)
- cc-router also supports Grok as controller in some paths.

### Pi
- `subagent({ agent: "worker"|"reviewer"|"scout", task: "...", model: "openai-codex/...", thinking: "low", async: true })` (and batches, agentOverrides in .pi/settings.json).
- Extensions for subagents. pi install for packages/skills. Codex image gen + xai-grok extensions in this marketplace.
- Dispatcher supports via Pi package install + skill loading from plugins/.../skills.
- Gap: Similar, high-level mentions but no "copy this exact subagent() call for the 'assets' packet" recipes. Pi-specific bootstrap notes are in reliable but could be more prominent + example configs.

### AGY / Gemini CLI / others
- AGY used for bounded frontend (no dev servers, real media only). Gemini for some frontend specialist roles in reliable.
- Less general subagent fanout; more "external CLI adapter" in the dispatcher (agy-frontend skill routes to it).

### cc-router-codex as complementary (not competitor)
- Philosophy: Main (Claude/Grok) = controller only. Production = exactly one taskctl capability at a time (roles: requirements, architect, uiux, assetgen, fullstack, tester, reviewer, closer...). Workers = separate Codex (or other) CLI invocations via worker_runner + codex_exec (supports app-server broker for speed/freshness, parallel for assets via ThreadPool, timeouts, log parsing for fatals).
- Strong workflow_policy (Codex LLM classifier for traits + gates; deterministic fallback; many tests for "must have prior artifact or reject").
- Hooks enforce (PreToolUse write blocks, UserPromptSubmit routing + focus start, Stop guard until focus complete).
- Produces auditable artifacts in .claude/artifacts/ + taskctl.sqlite3 + experience capture.
- Can be seen as a *very strict, external, role-based realization of dynamic/reliable packets* with extra prerequisites (MVP before greenfield, asset brief + manifest before prototype, etc.).
- Dispatcher and cc-router share author DNA (yxhpy) and goals (reliable, auditable, owner owns edits/verification) but different mechanisms. Current state: zero awareness of each other → potential for both to try to route the same prompt.
- Opportunity: Dispatcher can treat "taskctl capability" as one valid way to "execute a packet". cc-router can learn .agent-workflows as canonical portable trail. Shared roles/personas. Docs to choose/combine.

## Proposed & Implemented Changes (this PR)

### 1. New comprehensive research + plan doc (this file)
- Ships the analysis so future contributors/harnesses understand the model.
- Includes "how to combine with cc-router".

### 2. Actionable spawn recipes in core SKILLs (edits to reliable-agent-workflow/SKILL.md, dynamic-workflow/SKILL.md, dispatch/SKILL.md)
- After each harness section, add "Explicit spawn / delegation recipes for packets" with copy-paste examples:
  - Grok: exact task tool invocation with subagent_type + persona + capability_mode + worktree + resume_from for research/reviewer/implementer packets.
  - Claude Code: Agent(...) call or @-mention + reference to example .claude/agents/ file; or define inline.
  - Codex: `codex --profile deep-review -c '...' "You are the reviewer agent defined in .codex/agents/reviewer.toml. Packet: ... Write to exact path."` (or spawn via whatever TUI exposes); fallback parallel codex exec in worktrees.
  - Pi: exact subagent({}) calls.
  - General: "For packets with mode:'subagent', owner MUST either call the native primitive or run the documented external CLI in background + record result in results/<packet>.md + evidence."
- Strengthen "when multiple, create dynamic first, fanout read-only research/review in parallel, then integrate in owner".
- Add note on using dispatcher's MCP (dispatcher_mcp.ts) or scripts for classification if harness supports tool/MCP surfaces.

### 3. Shipped example agent definitions (new files under docs/examples/)
- `codex-agents/reviewer.toml`, `implementer.toml`, `researcher.toml`, `verifier.toml` (ready to copy to project/.codex/agents/ or ~/.codex/agents/).
- `claude-agents/reliable-reviewer.md`, `reliable-researcher.md`, `reliable-implementer.md`, `reliable-verifier.md` (full frontmatter + prompt body matching packet objectives + "write to exact path" contracts).
- `grok-agents/` or notes + sample personas/roles in toml for config.
- README section: "To enable real subagents on Codex/Claude/Grok: copy the examples/ into your project, then explicitly tell the owner to use them for the workflow packets."

### 4. Cross-harness packet launcher helper (new script + integration)
- `scripts/launch_packet.ts` (or extend dynamic_workflow.ts with `launch-packets <workflow-dir>` subcommand):
  - Accepts an explicit harness (`codex|claude|grok|pi|cc-router`) or `auto`, which prints recipes for all supported harnesses.
  - For each packet in workflow.json, if mode subagent and not yet completed, outputs the exact spawn command / tool call / subagent() recipe for that role. The owner or native harness then executes it and captures output to results/<id>.md + evidence.
  - For Codex: uses codex exec with injected "you are the <role> from toml".
  - For Claude: prints claude -p "@reliable-reviewer ..." or the Agent call.
  - For Grok: prints the task tool JSON.
  - For simulation fallback: the existing simulate command remains available.
  - Recipes require Plugin evidence lines in the subagent output.
- Update e2e / tests to exercise (at least the "print commands" path).
- In dispatch: after "create dynamic first", "then run launch-packets or manually spawn per the recipes".

### 5. Bootstrap / setup helper
- `scripts/bootstrap_harness_agents.ts` (node --experimental-strip-types ... --harness codex|claude|grok|pi --target . ):
  - Copies appropriate examples/ into project tree (or global).
  - For Codex: creates the tomls if missing.
  - For Claude: creates .claude/agents/ + basic settings suggestion.
  - Updates local AGENTS.md snippet with "include the dispatcher rules + use these agents for packets".
  - Prints verification commands.

### 6. Docs + AGENTS + README updates
- Link new CROSS_HARNESS... doc prominently in README "Capabilities", install, and "Agent Threads And Subagents" sections.
- In marketplace AGENTS.md: add short "See docs/CROSS_HARNESS_SUBAGENT_TRIGGERING.md for harness-specific spawn recipes and cc-router interop."
- Add note in dispatch about "if cc-router/taskctl is active in the project, you may realize packets via `taskctl.py capability --role <matching>` and still record results + evidence in the .agent-workflows/ for portable audit."

### 7. Minor robustness
- In dynamic_workflow detector/build: make "subagent" mode packets always recommend a concrete harness spawn + simulation as explicit alternative.
- Strengthen "Plugin evidence:" to require "fanout: <harness-primitive or taskctl or simulated>" line.
- Add smoke test that the new examples validate (quick frontmatter or toml parse).
- (Future) Make dispatcher_mcp.ts expose a "suggest_spawns" tool that returns the recipe JSON for current context.

### Files Changed in this PR (initial set)
- docs/CROSS_HARNESS_SUBAGENT_TRIGGERING.md (new, this research+plan)
- docs/examples/codex-agents/*.toml (4 files, new)
- docs/examples/claude-agents/*.md (3 files, new)
- docs/examples/grok-agents/README.md + notes (new)
- plugins/codex-augment-dispatcher/skills/reliable-agent-workflow/SKILL.md (edit: add explicit recipes section)
- plugins/codex-augment-dispatcher/skills/dynamic-workflow/SKILL.md (edit: similar + launcher mention)
- plugins/codex-augment-dispatcher/skills/dispatch/SKILL.md (edit: cross-ref + cc-router note)
- README.md (edit: links + "setup the examples for real fanout")
- AGENTS.md (edit: link to cross doc)
- plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts (edit: add launch-packets skeleton command + harness detection)
- (optional) new scripts/bootstrap_harness_agents.ts (skeleton that prints/copies)

These changes make the "manual workflow" path produce *visible, harness-appropriate fanout commands/artifacts/evidence* instead of vague "use subagents".

## Verification Steps (for reviewer + future releases)
1. `npm run release:check` (or the python validates + node tests + e2e).
2. For Codex: copy examples/codex-agents/* to a temp project/.codex/agents/, run a dynamic prompt with "use workflow subagents", observe agent creates .agent-workflows, then follows the printed spawn recipes (or auto via launch), produces evidence.
3. Similar for Claude (install examples to .claude/agents, use @ or Agent).
4. Grok: use the spawn syntax in this env against a packet.
5. Pi: check subagent() examples.
6. With cc-router installed: run a task, see both .agent-workflows (portable) + .claude/ taskctl artifacts (strict gates), no conflict.
7. Check that "Plugin evidence:" now includes the fanout primitive used.
8. Session logs / context size: the new examples are opt-in (users copy only what they need); core SKILL additions are concise recipes.

## Future Work (out of this PR scope but noted)
- Full auto-spawn in launch-packets for Grok (call the task tool if the script runs inside a Grok session that exposes it via env/bridge).
- MCP server wiring for the dispatcher so harnesses can discover "suggest-spawns" as a tool.
- Sync more with vendored reliable-agent-workflow-skill upstream.
- Per-harness quickstart installers (e.g. npx or pi that also drops the agent defs).
- Metrics in workflow.json for "real subagent count vs simulated".

This PR closes the "even manual doesn't trigger real subagents reliably" gap by turning high-level guidance into copy-paste + auto-suggested actions + shipped setup artifacts, while respecting the diversity (and strengths) of each CLI's native capabilities and co-existing control planes like cc-router.

---

*Research performed in context of yxhpy/codex-extensions-marketplace v0.1.19 + user's active Codex + cc-router + Grok TUI setup. All code paths, logs, and external docs (Claude subagents) reviewed.*

## Appendix: Key Code Pointers
- Detector: plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts:324 (detectDynamicWorkflow, SIGNALS.explicit-workflow)
- Packet building + modes: same file, buildPackets ~751
- Reliable harness section: plugins/.../skills/reliable-agent-workflow/SKILL.md:82 (the long table)
- cc-router entry: cc-router-codex/claude-plugin/scripts/cc_router_codex/taskctl.py (roles, create_capability_job), workflow_policy.py
- Grok subagents: ~/.grok/docs/user-guide/16-subagents.md (and system tools: spawn_subagent etc.)
- Claude: fetched docs (rich frontmatter model)

(End of plan doc. The PR implements the "Implemented in this PR" items above.)

---

## Adaptive Loop Extension

For adaptive hierarchical orchestrator work, `dynamic_workflow.ts` now records
the environment inventory, packet `executionSpec`, refined result contract,
`graph.json`, `condensed_log.jsonl`, and `replan_events/` in the canonical
`.agent-workflows/<id>/` artifact.

Before launching cross-harness workers:

```bash
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts inventory --json .agent-workflows/<id>
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts launch-packets --harness auto .agent-workflows/<id>
```

After each result or batch, the owner records the compact judgment:

```bash
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts refined-results --json .agent-workflows/<id>
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts adaptive-step --packet <packet-id> --action continue .agent-workflows/<id> "<judgment>"
```

Equivalent MCP tools are `workflow_inventory`, `workflow_launch_packet`,
`workflow_refined_results`, and `workflow_replan_propose`. The owner still owns
edits, integration, final verification, and release claims.
