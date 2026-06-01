---
name: dynamic-workflow
description: Platform-neutral AI-agent dynamic workflow orchestration for broad, risky, approval-gated, subagent/packet, reusable, or end-to-end verified work. Trigger on dynamic workflow, workflow artifact, subagent, background thread, agent thread, worker agent, fanout, parallel agents, swarm, approval gate, packet/result, goal mode, 端到端, 编排, 多代理, 子代理, 后台线程, 审批门禁.
metadata:
  short-description: Orchestrate auditable agent workflows
---

# Agent Dynamic Workflow

Use this skill to turn complex work into a supervised, auditable AI-agent
workflow that can run on any platform with subagent support. It is intentionally
not tied to one agent brand: if real subagents are unavailable, simulate packets
serially with owner-agent notes and result files.

## Decision Rule

Use dynamic workflow orchestration when at least two are true:

- The task has independent research, implementation, review, migration, QA,
  docs, assets, or design tracks.
- The task is broad enough that an explicit success contract would reduce drift.
- The task has risk: destructive edits, external writes, deploys, secrets,
  production data, billing, user accounts, or repo-wide changes.
- Verification benefits from a separate pass from implementation.
- The workflow could become a reusable recipe for future tasks.
- The user explicitly asks for a workflow, swarm, subagents, background
  threads, agent threads, worker agents, fanout, delegation, parallel review,
  parallel agents, goal mode, approval gates, packet/result flow, or
  end-to-end verification.

If the task is small, do it directly and state that full workflow orchestration
was unnecessary.

## Script Path Resolution

For installed plugin use, run commands from the plugin root. For Pi package
installs, resolve this skill directory first; the plugin root is `../..` from
this `SKILL.md`, so the helper is available at `../../scripts/dynamic_workflow.ts`.

## Workflow Artifact Contract

Prefer a local artifact directory:

```text
.agent-workflows/<workflow-id>/
|-- workflow.json
|-- plan.md
|-- orchestration.md
|-- packets/
|-- results/
`-- final-report.md
```

`workflow.json` is the durable source of truth and records:

- schema version, prompt hash, redacted prompt summary, state, and timestamps
- deterministic route signals and required helper plugins
- approval records for plan, execution, and release/finalization
- packets with role, mode, dependencies, plugin requirements, and evidence
- packet results, structured plugin evidence, verification records, and verdict

## Operating Workflow

1. Restate the goal, success criteria, constraints, and risk profile.
2. Detect whether dynamic orchestration is needed:

```bash
node --experimental-strip-types ../../scripts/dynamic_workflow.ts detect --json "<task>"
```

3. Create the artifact before delegating:

```bash
node --experimental-strip-types ../../scripts/dynamic_workflow.ts new --json "<task>"
```

4. Stop at pending approval gates. Continue only with read-only planning until
   explicit approval exists for risky execution:

```bash
node --experimental-strip-types ../../scripts/dynamic_workflow.ts approve --scope execute .agent-workflows/<workflow-id>
```

5. Execute packets with real subagents when the current platform supports them.
   Prefer subagent/thread fanout for independent read-only research, review,
   validation, assets, or frontend checks; otherwise simulate packet ownership
   serially, preserving packet/result notes.
6. Integrate packet results explicitly; accept, reject, or mark stale outputs.
7. Verify the final state:

```bash
node --experimental-strip-types ../../scripts/dynamic_workflow.ts verify --complete .agent-workflows/<workflow-id>
```

For deterministic local smoke testing without real subagents, use:

```bash
node --experimental-strip-types ../../scripts/dynamic_workflow.ts e2e --json "<task>"
```

## Approval Gates

Ask one clear approval question before:

- deleting, overwriting, mass-renaming, or force-pushing
- running migrations, broad codemods, dependency upgrades, or release scripts
- deploying, publishing, emailing, posting, or changing external systems
- touching credentials, secrets, production data, billing, or user accounts
- spawning many agents, long-running expensive jobs, or paid external calls
- making irreversible repository or workspace operations

If approval is denied or unavailable, continue only with safe read-only
planning, local drafts, or non-destructive checks.

## Subagents And Simulated Packets

Real subagent mode:

- Give each subagent one packet with explicit objective, allowed files/sources,
  do/do-not rules, dependencies, expected evidence, and stop conditions.
- Do not let multiple writers mutate the same files or working tree.
- Treat subagent output as advisory until the owner agent re-checks the final
  files and commands.

Simulated packet mode:

- The owner agent writes packet notes under `packets/` and results under
  `results/`.
- Each result must include status, summary, evidence, blockers, and verification
  still needed.
- Simulated packets are acceptable evidence for orchestration mechanics, not for
  external provider availability.

## Verification

Use the narrowest reliable checks first, then broaden as risk warrants:

- script dry run or deterministic simulation
- unit tests, lint, typecheck, or build
- browser/UI smoke test for frontend work
- source-citation check for research tasks
- migration dry run for data changes
- final artifact verification with `verify --complete`

Do not mark the workflow complete until every required approval is granted,
every packet has a result, every required helper plugin has structured evidence,
and verification records prove the original success criteria.

## Boundaries

- Platform-neutral by design: do not name the workflow after one agent runtime.
- No fallback provider is allowed for provider-specific helper routes.
- Do not pass secrets, raw credentials, private tokens, or unnecessary repo
  context to external CLIs or subagents.
- The owner agent owns local edits, integration, verification, commits, release
  decisions, and final claims.
