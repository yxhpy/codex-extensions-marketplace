---
name: reliable-agent-workflow
description: Run a reliable multi-agent engineering workflow with design review, implementation review, zero-open-issue repair loops, independent verification, artifact tracking, and memory capture. Use for complex coding tasks, refactors, migrations, debugging, architecture work, high-risk changes, or when the user asks for design-review-implement, best-of-N, check-work, zero issues, subagents, e2e verification, or reliable agent delivery.
---

# Reliable Agent Workflow

Use this skill when correctness matters more than speed. Treat the user request as a verifiable delivery goal, not a one-shot answer.

## Core Contract

1. **Orchestrate first.** The main agent coordinates, tracks state, reads artifacts, and makes decisions. It should not do substantive design, implementation, or review work when a suitable subagent mechanism is available.
2. **Use persistent artifacts.** Every run has fixed file paths for design, reviews, verification, and summaries. Subagents write to those paths; the orchestrator reads and parses them.
3. **Loop until zero open issues.** Finish only when reviewers/verifiers report `0 open issues`. Do not impose a fixed iteration cap. Escalate to the user for stalemate, repeated tool failure, or unresolved product trade-offs.
4. **Verify independently.** A verifier must trace the original requirements, inspect the actual files/diff/state, and run relevant tests or checks.
5. **Do not claim tool actions before doing them.** If saying a subagent/test/build/review is starting, issue the corresponding tool call in the same turn first; summarize only after results return.
6. **Keep changes surgical.** Touch only files needed for the request. Remove only artifacts or dead code created by this workflow.

## Harness Adapter

Use the strongest equivalent available in the current agent harness:

| Capability | Preferred behavior |
| --- | --- |
| Subagents | Spawn/resume dedicated writer, implementer, reviewer, specialist, and verifier agents. Reuse the same agent/thread for revisions when possible. |
| Isolation | Use an isolated git worktree for parallel candidates or risky implementation when available. |
| Todos | Create a small phase scaffold before work; mark exactly one phase in progress; update immediately as phases complete. |
| File I/O | Tell subagents to write markdown artifacts to exact paths, then read those paths yourself. |
| Questions | Ask the user only for ambiguity, needs-user-input issues, or stalemates. Present options and trade-offs. |

Known tool names vary by harness:

- Grok: `spawn_subagent`, `resume_from`, `todo_write`, `ask_user_question`, worktree isolation.
- Pi: `subagent`, `todo`, `read`, `bash`, `edit`, `write`, `goal_complete` when a goal is active.
- Claude Code: `Task`/subagents when available, `TodoWrite`, `Read`, `Bash`, `Edit`, `Write`.
- Codex: use available agent/subagent features if present; otherwise use the single-agent fallback below and clearly label it.
- Gemini CLI / Agy CLI: for frontend page/UI specialist roles, use local `gemini` and `agy` CLI sessions when those commands are installed; if they are not available locally, fallback to the current harness itself.

If no subagent feature exists, do **not** fake independence. Use a `single-agent fallback`: complete one role at a time, write the same artifacts, run an explicit adversarial self-review pass, and ask the user before high-risk production changes.

## Role-Specific Model Routing

Use role-specific model routing to reduce latency and cost without weakening the review and verification contract. This skill does **not** encode model routing in `SKILL.md` frontmatter; keep frontmatter limited to `name` and `description` for cross-harness compatibility. Choose models through the current harness settings, agent definitions, CLI flags, or orchestration tool. Treat all model names below as editable examples: confirm exact model IDs and capabilities with the user's account, provider docs, and `pi --list-models` before pinning them.

Recommended routing presets, updated from current OpenAI/Codex and Gemini docs:

| Workflow role | Default model family | Effort/thinking | Routing intent |
| --- | --- | --- | --- |
| Orchestrator, artifact merger, simple final summary | inherit current model or use a fast default | low to medium | Keep coordination responsive; raise effort only for ambiguous product decisions. |
| Scout, context-builder, docs/research specialist | GPT fast tier such as `gpt-5.4-mini` | low to medium | Fast read-only exploration, source gathering, and summarization. |
| Design writer or design reviewer | strong GPT tier such as `gpt-5.5` | medium to high | Stronger reasoning for architecture, risk, and requirement trade-offs. |
| Worker/implementer, non-frontend | `gpt-5.5`; use `gpt-5.3-codex-spark` for near-instant coding iteration when available | medium | Keep normal implementation on GPT-family models unless the task is specifically frontend page/UI work, which uses the frontend CLI routing rule below when local CLIs are available. |
| Frontend page/UI implementer | Local Gemini CLI (`gemini`) plus local Agy CLI (`agy`) when installed; fallback to the current harness itself | medium to high | Prefer dedicated local frontend-capable CLI sessions for pages, screens, components, forms, layout/CSS, and visual polish; if no local Gemini/Agy CLI is available, keep the original harness worker/model route. |
| General reviewer, test reviewer, verifier | strong GPT tier such as `gpt-5.5` | high | Spend more reasoning on edge cases, regressions, test gaps, and plan alignment. |
| Security reviewer, oracle, high-risk verifier | strongest available GPT-series reviewer, such as `gpt-5.5` or `gpt-5.5-pro` when available | high to xhigh | Use only when the task is security-sensitive, architectural, or high blast-radius. |
| Best-of-N low-risk candidates | `gpt-5.4-mini` or `gpt-5.3-codex-spark` | low to medium | Parallelize cheap candidate generation, then review the winner with a stronger model. |

Frontend CLI routing rule (applies to all harnesses):

- For any task whose substantive work is frontend page/UI, screens, components, forms, styling, layout/CSS, or visual polish, prefer local CLI execution before harness-native model routing. Detect only command availability with checks such as `command -v gemini` and `command -v agy`; do not print secrets or config file contents:

  ```bash
  for cmd in gemini agy; do
    if command -v "$cmd" >/dev/null 2>&1; then
      echo "$cmd: available"
    else
      echo "$cmd: not found"
    fi
  done
  ```

- If both CLIs are available, use `gemini` for the primary frontend implementer or candidate and `agy` for an independent frontend reviewer, alternate candidate, or repair verifier. If only one is available, use the available CLI for the frontend role. If neither is available, fallback to the current harness itself: the original Codex, Claude Code, Grok, Pi, or single-agent worker/model route.
- Non-interactive examples:

  ```bash
  gemini -p "Frontend implementer: implement the approved page/UI change, keep edits minimal, and run focused checks."
  agy --print "Frontend reviewer: inspect the page/UI diff for behavior, accessibility, layout, and regression risks."
  ```

- Keep non-frontend roles on GPT-family/default routes unless the user explicitly asks to run the whole workflow through another CLI.

Harness-specific handling:

- **Codex:** Prefer first-class custom agents in `.codex/agents/<role>.toml` or `~/.codex/agents/<role>.toml`. Current OpenAI Codex docs recommend starting most Codex tasks with `gpt-5.5`, using `gpt-5.4-mini` for faster/lower-cost lighter work or subagents, and using `gpt-5.3-codex-spark` for near-instant coding iteration when the account exposes it. Each agent can set `model` and `model_reasoning_effort`; omitted optional fields inherit from the parent session. Keep parent sandbox and approval restrictions in mind because runtime restrictions still apply to spawned children. Example editable agent files:

  ```toml
  # .codex/agents/reviewer.toml
  name = "reviewer"
  description = "Read-only reviewer focused on correctness, security, and missing tests."
  model = "gpt-5.5"
  model_reasoning_effort = "high"
  sandbox_mode = "read-only"
  developer_instructions = """
  Inspect the real diff and report evidence-backed findings only.
  Do not edit files.
  """
  ```

  ```toml
  # .codex/agents/docs_researcher.toml
  name = "docs_researcher"
  description = "Fast documentation and API behavior researcher."
  model = "gpt-5.4-mini"
  model_reasoning_effort = "medium"
  sandbox_mode = "read-only"
  developer_instructions = "Return concise source-backed guidance without code edits."
  ```

  ```toml
  # .codex/agents/implementer.toml
  name = "implementer"
  description = "Single-writer implementation agent for approved plans."
  model = "gpt-5.5"
  model_reasoning_effort = "medium"
  developer_instructions = "Make the smallest approved code change and run focused validation."
  ```

  For one-off parent sessions, use `codex --model gpt-5.5`, `codex -c model='"gpt-5.5"'`, or a profile such as `codex --profile deep-review`, then ask Codex to spawn the named role agents explicitly.

- **Claude Code:** Use Claude-compatible model aliases or full Claude model IDs in subagent/skill configuration, not raw GPT model names. Normal Claude Code model values are `haiku`, `sonnet`, `opus`, `inherit`, or full Claude/Bedrock/Vertex/Foundry model identifiers. Translate current GPT tiers instead: `gpt-5.4-mini`-style fast scouts map to `haiku` or low-effort `sonnet`; `gpt-5.5` reviewers map to high-effort `sonnet` or `opus`; highest-risk oracle/verifier roles map to `opus` with high/xhigh effort. GPT names are only valid if an approved Anthropic-compatible gateway explicitly remaps them. Example project subagent frontmatter:

  ```markdown
  ---
  name: verifier
  description: Independent verifier for reliable-agent-workflow runs
  model: opus
  ---

  Verify the actual diff against the original requirements. Do not implement fixes.
  ```

  Do not add Claude-only `model` or `effort` keys to this shared `SKILL.md`; use `.claude/agents/`, `.claude/settings.json`, `claude --model opus --effort high`, `/model`, `/effort`, `CLAUDE_CODE_SUBAGENT_MODEL`, or `CLAUDE_CODE_EFFORT_LEVEL` outside the skill package when the user approves it.

- **Pi:** Pi can run GPT/OpenAI-capable models and Gemini-capable models through configured providers, `~/.pi/agent/models.json`, settings, CLI flags, SDK sessions, and extensions. Core Pi skills do not route roles through skill frontmatter. Without a subagent extension, run separate role sessions or SDK sessions, for example:

  ```bash
  pi -p --model openai-codex/gpt-5.4-mini:low "Scout this repo and write context.md"
  pi -p --model openai-codex/gpt-5.5:high "Verify the final diff against the requirements"
  ```

  For Pi's harness-native fallback after local `gemini`/`agy` CLIs are unavailable, detect Gemini capability without exposing secrets. Check only key presence for direct Google Gemini (`google` in `~/.pi/agent/auth.json` or `GEMINI_API_KEY`) and Vercel AI Gateway (`vercel-ai-gateway` in `auth.json` or `AI_GATEWAY_API_KEY`). Never print token values, auth file contents, or full environment values.

  ```bash
  node -e "const fs=require('fs'),os=require('os'),path=require('path'); const p=path.join(os.homedir(),'.pi','agent','auth.json'); const auth=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{}; console.log({ googleGemini: Boolean(auth.google || process.env.GEMINI_API_KEY), vercelAIGateway: Boolean(auth['vercel-ai-gateway'] || process.env.AI_GATEWAY_API_KEY) });"
  pi --list-models gemini
  ```

  If direct Google Gemini is present, `pi --list-models gemini` lists the model, and the local frontend CLIs are not available, Pi may still prefer Gemini for frontend page/UI implementation as its own fallback route:

  ```typescript
  subagent({
    agent: "worker",
    task: "Implement the approved frontend page/UI using Pi's native Gemini fallback. Keep the rest of the workflow on GPT-family models.",
    model: "google/gemini-3.5-flash:medium",
    async: true
  })
  ```

  For complex agentic frontend work with heavy tool use, use `google/gemini-3.1-pro-preview:high` or `google/gemini-3.1-pro-preview-customtools:high` only when the model is listed. If Vercel AI Gateway is the available credential, use a prefixed Gateway model when listed:

  ```typescript
  subagent({
    agent: "worker",
    task: "Implement the approved frontend page/UI through AI Gateway. Keep non-frontend roles on GPT.",
    model: "vercel-ai-gateway/google/gemini-3.5-flash:medium",
    async: true
  })
  ```

  If no local Gemini/Agy CLI and no Gemini-capable Pi credential or listed Gemini model is available, frontend workers fall back to the normal GPT-family implementer route, such as `openai-codex/gpt-5.5:medium`. Do **not** globally override the generic `worker` to Gemini in `.pi/settings.json`; use the Gemini override only for frontend page/UI worker launches.

  When the `pi-subagents` extension is available, route non-frontend runs with the supported `model` field, per task in parallel fanout, or persistent `subagents.agentOverrides` in `.pi/settings.json` or `~/.pi/agent/settings.json`. Builtin agents inherit the current Pi default model unless an override is provided. For one-off tool calls, encode Pi thinking level in the model pattern suffix when needed.

  ```typescript
  subagent({
    agent: "reviewer",
    task: "Review the current diff for correctness. Do not edit files.",
    model: "openai-codex/gpt-5.5:high",
    async: true
  })
  ```

  ```typescript
  subagent({
    tasks: [
      { agent: "scout", task: "Map relevant files.", model: "openai-codex/gpt-5.4-mini:low" },
      { agent: "reviewer", task: "Review tests and regressions.", model: "openai-codex/gpt-5.5:high" }
    ],
    concurrency: 2,
    context: "fresh",
    async: true
  })
  ```

  ```json
  {
    "subagents": {
      "agentOverrides": {
        "scout": { "model": "openai-codex/gpt-5.4-mini", "thinking": "low" },
        "context-builder": { "model": "openai-codex/gpt-5.4-mini", "thinking": "low" },
        "researcher": { "model": "openai-codex/gpt-5.4-mini", "thinking": "medium" },
        "planner": { "model": "openai-codex/gpt-5.5", "thinking": "medium" },
        "worker": { "model": "openai-codex/gpt-5.5", "thinking": "medium" },
        "reviewer": { "model": "openai-codex/gpt-5.5", "thinking": "high" },
        "oracle": { "model": "openai-codex/gpt-5.5", "thinking": "high" }
      }
    }
  }
  ```

  Use project `.pi/settings.json` for repo-specific GPT defaults and user `~/.pi/agent/settings.json` for global defaults. Do not mutate real global config during this workflow unless the user explicitly asks; otherwise provide the snippet for the user to copy. If a model is missing, run `pi --list-models`, update Pi if needed, and configure the provider in `~/.pi/agent/models.json` before relying on it.

- **Grok:** Use model aliases in `~/.grok/config.toml` and select the alias per role with headless `-m/--model` or the TUI `/model` command. Public Grok docs do not guarantee Claude-style per-subagent `model` frontmatter precedence, so verify with `grok inspect` and a small local spawned-agent test before relying on automatic subagent routing. Editable GPT alias example:

  ```toml
  [model.gpt-review]
  model = "gpt-5.5"
  base_url = "https://api.openai.com/v1"
  name = "GPT reviewer"
  env_key = "OPENAI_API_KEY"

  [model.gpt-scout]
  model = "gpt-5.4-mini"
  base_url = "https://api.openai.com/v1"
  name = "GPT scout"
  env_key = "OPENAI_API_KEY"

  [models]
  default = "gpt-scout"
  ```

  Then run role-specific sessions such as `grok inspect`, `grok -p "Review this diff" -m gpt-review`, or `grok -p "Map the codebase" -m gpt-scout`. Custom OpenAI endpoints may not provide Grok-specific tools or reasoning semantics, so treat this as provider routing rather than a guarantee of identical behavior.

## Setup

1. Restate the objective as success criteria and assumptions. Ask before proceeding if requirements are ambiguous.
2. Generate a stable `RUN_ID` such as timestamp plus short random suffix.
3. Choose an artifact directory:
   - In a git repo: `.agent-runs/reliable-agent-workflow/<RUN_ID>/`
   - Outside a repo: a temp directory named `reliable-agent-workflow-<RUN_ID>`
4. Create these fixed artifact paths and keep them for the full run:
   - `design.md`
   - `design-review.md`
   - `implementation-summary.md`
   - `review-round-<N>-<role>.md`
   - `merged-review-round-<N>.md`
   - `verification-round-<N>.md`
   - `final-report.md`
5. Initialize todos with these phase IDs when todo tooling exists:
   - `requirements`
   - `design`
   - `implement`
   - `review-round-1`
   - `fix-round-1`
   - `verify-round-1`
   - `finalize`
6. Load prior memory if present. Prefer `.agent-memory/reliable-agent-workflow.md` in the repo root. Summarize only reusable patterns; do not copy stale file-specific advice blindly.

## Workflow Decision Tree

- **Tiny, low-risk answer-only task:** use normal direct assistance; this skill may be overkill.
- **Code change, bug fix, refactor, migration, architecture, security, tests, CI, or docs with consequences:** run the full workflow.
- **Multiple plausible approaches:** run Best-of-N before implementation review.
- **User already provides a detailed plan/design:** skip new design writing, but run plan-alignment review before implementation.
- **User asks only to check existing work:** run only the independent verification phase.

## Phase 1: Requirements and Design

Skip design only for clearly tiny changes or when the user explicitly provides an approved design.

1. Spawn or assume a **design writer** role.
2. Prompt it with the requirements, assumptions, constraints, prior memory brief, and exact output path `design.md`.
3. Require the design to include:
   - `## Requirements Checklist`
   - `## Proposed Approach`
   - `## Key Decisions`
   - `## Risks and Mitigations`
   - `## Open Questions`
   - `## PR Plan` or `## Implementation Plan`
4. Spawn or assume a **design reviewer** role.
5. Prompt it to read `design.md` and write `design-review.md` with this structure:

```markdown
# Design Review

## Verdict
PASS | FAIL

## Issues
- ID: D-001
  Severity: critical | high | medium | low | nit
  Status: open | addressed | wontfix | needs-user-input
  Section: <design section>
  Description: <problem>
  Suggestion: <fix>

## Summary
<short summary>
```

6. The orchestrator reads `design-review.md` and counts issues by status.
7. If `needs-user-input` exists, ask the user with concise options.
8. If a reviewer reopens an issue the writer marked `wontfix`, treat it as a stalemate and ask the user to decide.
9. Otherwise resume the same writer to revise `design.md` until the design reviewer reports `0 open issues` and no `needs-user-input`.

## Phase 2: Implementation

1. Spawn or assume an **implementer** role. Use worktree isolation when parallel work or risk justifies it.
2. Prompt it with:
   - user request
   - final `design.md` or approved plan
   - prior memory brief
   - exact output path `implementation-summary.md`
   - instruction to keep changes minimal and run local checks it can reasonably run
3. The implementer must write `implementation-summary.md` with:
   - files changed
   - behavior changed
   - tests/checks run and outcomes
   - known risks or skipped checks
   - any questions or pushback
4. If the implementer reports blockers, ask the user only if the blocker cannot be resolved with available code/docs/tools.

## Phase 3: Review and Repair Loop

Use reviewer count based on risk:

- Effort 1: one general reviewer.
- Effort 2-3: general reviewer plus test/plan-alignment reviewer.
- Effort 4-5 or security-sensitive work: multiple independent general reviewers plus security, test, and plan-alignment specialists.

Specialist triggers:

- Security reviewer: auth, authorization, input parsing, secrets, network, storage, payment, permissions.
- Test reviewer: new logic, bug fix, migration, public API, regression risk.
- Plan-alignment reviewer: any task based on a design document or PR plan.
- Performance reviewer: hot paths, large data, UI rendering, latency, memory, concurrency.

For each review round:

1. Spawn independent reviewers in parallel when possible.
2. Give each reviewer only the task, design/plan, diff or changed files, implementation summary, and exact output path `review-round-<N>-<role>.md`.
3. Require this structure:

```markdown
# Review Round <N> - <Role>

## Verdict
PASS | FAIL

## Issues
- ID: R<N>-001
  Severity: critical | high | medium | low | nit
  Status: open | addressed | wontfix | needs-user-input
  File/Area: <path or area>
  Description: <problem>
  Evidence: <specific code, diff, command output, or reasoning>
  Suggestion: <minimal fix>

## Checks Run
- <command or inspection>: PASS | FAIL | not run (<reason>)
```

4. The orchestrator reads every review file and creates `merged-review-round-<N>.md` grouped by reviewer and severity.
5. If every reviewer says `PASS` and the merged file has `0 open issues`, proceed to verification.
6. Otherwise resume the same implementer with the merged review. It must:
   - fix every open issue, or
   - mark an issue `wontfix` with a technical reason, or
   - mark `needs-user-input` with exact choices.
7. Re-review after fixes. Do not stop for nits. Escalate stalemates to the user.

## Phase 4: Independent Verification

Spawn or assume a **verifier** role that did not implement the change when possible.

The verifier must write `verification-round-<N>.md` and end with exactly one of:

- `VERDICT: PASS`
- `VERDICT: FAIL`

Verifier checklist:

1. Reconstruct the original user requirements into a checklist.
2. Trace what actually changed against that checklist.
3. Inspect relevant files, diffs, configs, generated artifacts, or external state.
4. Run relevant tests/builds/lints/e2e checks. If a check cannot run, explain why and whether that is acceptable.
5. Add custom smoke checks for edge cases when existing tests are insufficient.
6. Identify overreach: unrelated edits, speculative features, or cleanup outside the request.
7. List every issue with severity, evidence, and minimal fix.

If verification fails, resume the implementer to fix issues, then run another verification round. Continue until `VERDICT: PASS` or escalate a concrete blocker.

## Phase 5: Memory Capture

After successful verification, update memory only with reusable lessons:

- Generalize away file names, variable names, and task-specific details.
- Categorize patterns such as Error Handling, Testing, Security, Code Quality, Performance, Tooling, or Process.
- Cap memory to a small, useful set: keep the most repeated and recent patterns.
- Use an atomic write where possible: write temp file then rename.

Do not store secrets, user-private data, or raw transcripts in memory.

## Phase 6: Final Report

Write `final-report.md` and summarize to the user:

```markdown
# Reliable Agent Workflow Report

## Result
PASS | BLOCKED

## What Changed
<concise summary>

## Evidence
- Design review: <rounds, final verdict>
- Implementation review: <rounds, reviewers, final verdict>
- Verification: <commands/checks and results>

## Artifacts
- <path list>

## Open Risks
- <none or concrete residual risks>

## Memory Updated
- yes/no and categories
```

If a `/goal` or equivalent active goal exists, mark it complete only after the final report is `PASS` and no required work remains.

## Best-of-N Variant

Use when the task has multiple plausible implementations or the user asks for parallel candidates.

1. Spawn `N` independent implementers in isolated worktrees. Default `N=3`, allowed range `2-10`.
2. Give each implementer the same requirements but no knowledge of other candidates.
3. Require each to write a candidate summary with approach, changed files, tests, risks, and final commit/diff pointer.
4. Evaluate candidates with this priority: correctness, simplicity, maintainability, safety, test coverage, performance, aesthetics if UI.
5. Pick one winner, explain why, and apply only the winning changes.
6. Run the normal review and verification loops on the winner.

## Compaction and Resume Rules

If context is compacted or a run is resumed:

1. Re-read `final-report.md` if present; otherwise read design, review, implementation, and verification artifacts.
2. Rebuild the todo state from artifact status, not from memory of prior chat turns.
3. Resume the same subagent/thread IDs when the harness supports it.
4. If subagent IDs are lost, start new agents with the artifacts as briefing and label the run as resumed after compaction.

## Hard Stop Conditions

Stop and ask the user when:

- A reviewer/verifier needs product, legal, security, or business input.
- Two roles disagree after one explicit pushback/re-review cycle.
- Required credentials, network, repository access, or approvals are missing.
- Tests fail for reasons unrelated to the requested change and fixing them would expand scope.
- Publishing, deploying, deleting, spending money, or modifying production systems is required.
