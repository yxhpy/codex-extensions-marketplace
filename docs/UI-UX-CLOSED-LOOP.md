---
title: UI/UX Closed-Loop Reference
---

# UI/UX Closed Loop

<p align="center">
  <strong>Requirements → product thinking → low-fi prototype → polished UI/UX → verified release evidence.</strong><br />
  A reference-based design workflow for Codex, Claude Code, Grok, Pi, Cursor, and similar agent harnesses.
</p>

---

## Design principle

This marketplace coordinates strong UI/UX work without copying large third-party
skills into the repo.

| We do | We do not |
| --- | --- |
| Reference external skills by name, install command, source link, and short usage notes. | Vendor or duplicate full external `SKILL.md` files. |
| Compose active external rules with local skills such as `agy-frontend`, `asset-slicer`, and `gsap-animation`. | Pretend external skills are installed when they are not. |
| Keep `.agent-workflows/` and local verification as the canonical evidence trail. | Let a design helper become the final release authority. |

This keeps the plugin lean, lets upstream skills evolve independently, and
preserves the owner agent as the verifier.


## Auto-routing and bootstrap

The dispatcher includes a lightweight UI/UX auto-router so users can enter a
plain requirement such as "this page is ugly and has no planning; redesign it"
without naming any skill. The router classifies:

- full-page, redesign, product-facing, high-polish, ugly/no-planning,
  wireframe/prototype, or design-system requests as `ui-ux-closed-loop`;
- tiny bounded visual changes as the lightweight `agy-frontend` path;
- motion and generated-asset work as add-ons through `gsap-animation` and
  `asset-slicer`.

When Codex trusts/enables plugin hooks, `SessionStart` automatically creates the
project `AGENTS.md` UI/UX routing snippet if no project instructions are found.
This safe local write can be disabled with `CODEX_AUGMENT_AUTO_AGENTS=0` or
`CODEX_AUGMENT_DISABLE_AUTO_AGENTS=1`.

Codex plugin manifests do not run arbitrary postinstall commands. Networked
external skill installation is opt-in: authorize it once with
`CODEX_AUGMENT_AUTO_INSTALL_UIUX_SKILLS=1` or:

```bash
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/uiux_bootstrap.ts --cwd <project> --authorize-auto-install --no-install-skills
```

After authorization, the model/hook may run the external skill bootstrap
automatically; users do not need to memorize the command. Revoke with
`--revoke-auto-install --no-install-skills`.
## The loop

| Stage | Goal | Recommended helpers | Evidence |
| --- | --- | --- | --- |
| 1. Requirements | Clarify audience, job-to-be-done, constraints, success metrics, and risks. | `task-gate`, `thinking-gate`, `grok-augment`, product/research external skills | PRD/design brief, assumptions, open questions |
| 2. Low-fi prototype | Explore flows before visual polish. | Wireframe Prototyping, user research, journey-map skills | Wireframes, task flows, feedback plan, validation metrics |
| 3. Visual direction | Choose a distinctive aesthetic system. | `frontend-design`, `ui-ux-pro-max`, design-system skills | Tone, typography, palette, layout rules, anti-slop constraints |
| 4. Assets | Generate and validate production-ready media. | image_gen/Grok Video, `asset-slicer` | Asset manifest, slicing JSON report, clean gutters/count checks |
| 5. Motion | Add purposeful interaction and animation. | `gsap-animation`, official `greensock/gsap-skills` | Motion brief, reduced-motion behavior, performance notes |
| 6. Implementation | Build within bounded paths. | `agy-frontend` plus active external constraints | Diff, AGY transcript, local build/browser evidence |
| 7. Review | Catch visual, a11y, perf, and product regressions. | Vercel skills, AccessLint/WCAG, `reliable-agent-workflow` | Screenshot proof, a11y/perf checklist, zero-open-issue review |

When several stages apply, create a `dynamic-workflow` artifact first, fan out
read-only research/review packets where useful, and keep the owner thread in
charge of edits, integration, tests, and final claims.

## Core local pieces

- `ui-ux-closed-loop`: orchestrates this end-to-end flow and records evidence.
- `agy-frontend`: implements bounded frontend changes; it must not keep dev
  servers alive.
- `asset-slicer`: turns generated icon/sprite sheets into deterministic PNG
  assets and blocks dirty cuts.
- `gsap-animation`: provides concise GSAP/ScrollTrigger motion constraints and
  verification requirements.
- `dynamic-workflow`, `task-gate`, `reliable-agent-workflow`, `grok-augment`:
  structure planning, critique, packet orchestration, and release-grade review.

## Recommended external references

Install only the externals you need. The dispatcher composes them when active
and falls back gracefully when they are absent.

### Aesthetics and design intelligence

```bash
npx skills add https://github.com/anthropics/skills --skill frontend-design
npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max
```

| Skill | Use for |
| --- | --- |
| `frontend-design` | Bold non-generic visual direction, typography, color, spatial composition, motion taste, and anti-slop checks. |
| `ui-ux-pro-max` | Product-type reasoning, style/palette/font databases, UX guidelines, and priority rules such as accessibility first. |

### Prototyping and product thinking

```bash
npx skills add https://github.com/aj-geddes/useful-ai-prompts --skill wireframe-prototyping
```

Use wireframe/product skills for low-fi HTML prototypes, journey maps, user
research prompts, testing plans, completion-rate/SUS metrics, and feedback
loops before high-fidelity work.

### Motion

```bash
npx skills add https://github.com/greensock/gsap-skills
```

Use the official GSAP skills for deeper timeline, ScrollTrigger, React, and
plugin-specific detail. The local `gsap-animation` skill remains the compact
owner-agent brief and verification layer.

### Correctness, accessibility, and performance

```bash
npx skills add https://github.com/vercel-labs/agent-skills
```

Use Vercel web-design, React, composition, accessibility, and performance
references for final review. Pair them with local browser/screenshot evidence,
`verify-static-frontend.ts`, reduced-motion checks, build/lint output, and
asset-slicer reports.

## Prompt handoff template

Use this compact handoff when passing the loop into implementation:

```text
Goal: <user outcome + product context>
Scope: <exact files/dirs AGY or owner may edit>
Design direction: <frontend-design tone, typography, palette, layout rules>
UX rules: <ui-ux-pro-max or product-specific constraints>
Prototype evidence: <wireframe/user flow paths>
Assets: <manifest + asset-slicer report>
Motion: <GSAP brief + reduced-motion requirements>
Verification: screenshot evidence, responsive checks, a11y/perf notes, build/test output
Boundary: no SVG/emoji defaults, no blocking dev server, owner verifies locally
Plugin evidence: ui-ux-closed-loop + active external references + local helpers
```

## How reference integration works

1. Add a short `references/EXTERNAL-*.md` note for a new external: purpose,
   source link, install command, a few paraphrased principles, and how it plugs
   into this loop.
2. Update the orchestrator skill with trigger/coordination notes.
3. Update README/AGENTS guidance with one-line purpose and install command.
4. Add a static smoke test if the reference becomes part of core routing.
5. Do **not** copy the full third-party skill body.

Owned or tightly controlled upstreams are different: `reliable-agent-workflow`
uses `upstreams/*.json` plus a sync script because this marketplace intentionally
vendors that delivery contract.

## Verification before release

At minimum, run the local release checks that match the touched surface:

```bash
node --experimental-strip-types --test tests/*.ts plugins/codex-augment-dispatcher/tests/*.ts
node --experimental-strip-types plugins/codex-augment-dispatcher/scripts/dynamic_workflow.ts e2e --json "Plan a UI/UX workflow with prototype, frontend implementation, and verification"
```

For a real UI/UX change, also capture browser screenshots, responsive evidence,
asset-slicer reports, reduced-motion behavior, and any external-skill notes used.

## Local Codex usage

```bash
codex plugin marketplace add yxhpy/codex-extensions-marketplace --ref main
codex plugin add codex-augment-dispatcher@yxhpy-codex-extensions
# Then install only the external references you want with npx skills add ...
```

Example request:

```text
Use ui-ux-closed-loop to turn this PRD into a low-fi prototype, then a polished landing page with real assets and GSAP motion. Coordinate with frontend-design and ui-ux-pro-max if installed.
```

Merge this repo's `AGENTS.md` into the target project so the owner agent can
route the loop proactively.
