---
title: UI/UX Closed-Loop Enhancements for yxhpy Codex Extensions
---

# UI/UX Closed-Loop: Requirements to Product Thinking to Low-Fidelity Prototypes to Polished UI/UX

This document describes how the `codex-augment-dispatcher` plugin (and future skills in this marketplace) provides a complete, reliable closed loop for UI/UX work in AI coding agents (Codex, Claude Code, Grok, Pi, Cursor, etc.).

**Core principle (per user request):** For external skills and capabilities, we use **references / integration guidance** (install commands, coordination notes, short principle summaries) rather than hardcoding or vendoring full external `SKILL.md` contents into this repo. This keeps the project lean, avoids duplication, allows upstreams to evolve independently, and uses the existing vendoring pattern (see `upstreams/` + `sync_reliable_agent_workflow.ts`) **only** for content we control or want tightly bundled.

The marketplace already has strong foundations:
- `agy-frontend` + `asset-slicer` + `gsap-animation` (distills official greensock/gsap-skills) for high-quality visual frontend impl, assets, and motion.
- `dynamic-workflow`, `task-gate`, `reliable-agent-workflow`, `grok-augment` for orchestration, planning, verification.
- Explicit coordination already present in agy-frontend SKILL.md: "When `frontend-skill`, `frontend-design`, or `gsap-animation` also applies, use their design and motion constraints..."

## The Closed Loop (需求 → 产品思维 → 低保真原型 → UI/UX)

1. **Requirements & Product Thinking**
   - Use product/research skills (e.g. to-prd, User Research, Customer Journey Map, Brainstorming from curated collections like aiuxplayground).
   - Use this marketplace's `task-gate` / `thinking-gate` + Grok's `/design` (or equivalent) for structured PRD/design-doc with Key Decisions + PR Plan + review-until-0-issues.
   - `grok-augment` for outside critique/research.

2. **Low-Fidelity Prototypes & Validation**
   - Recommend/install "Wireframe Prototyping" skill (e.g. from aj-geddes/useful-ai-prompts or aiuxplayground equivalents).
   - Produce sketches / interactive HTML prototypes, user flows, testing plans (tasks, metrics like completion rate/SUS).
   - Iterate with simulated or real feedback before any high-fi work. Follow best practices: start low-fi, mobile-first, include edges, document interactions.

3. **Design Direction, Systems & Aesthetics (High-fi foundation)**
   - `frontend-design` (anthropics/skills or equivalent) for BOLD aesthetic choice (Purpose/Tone/Differentiation), typography (distinctive, ban generic like Inter/Roboto), color (cohesive dominant+accents), spatial composition (asymmetry, negative space), motion principles, backgrounds/details. Avoids AI slop.
   - `ui-ux-pro-max` (nextlevelbuilder/ui-ux-pro-max-skill) for searchable DB: 50+ styles, 161 palettes, 57 fonts, 99 UX guidelines, product-type reasoning, priority rules (Accessibility CRITICAL first, then touch, perf, layout...).
   - Design system skills (Tailwind Design System, etc.) for tokens/CVA.
   - Bencium or similar for deeper UX fundamentals + refs.

4. **Visual Assets & Quality**
   - Use agent image/video gen (Grok `image_gen` / video) for hero/product assets (high quality, no baked text unless decorative).
   - `asset-slicer` (this marketplace) for custom icons/sprites: generate sheet with good gutters/flat bg, run deterministic slice with expected manifest + IoU/clean checks, gate on JSON report. Never pass dirty assets downstream.

5. **Motion & Interaction Polish**
   - `gsap-animation` (this repo, distills official) for briefs + verification.
   - Recommend full `greensock/gsap-skills` (npx skills add https://github.com/greensock/gsap-skills) for granular core/timeline/scrolltrigger/react etc. when deeper control needed.

6. **Implementation**
   - Route through `agy-frontend` (this repo) for delegation to specialist CLI (or direct if no agy).
   - In prompts, compose constraints from active externals (frontend-design aesthetics + Pro Max rules + DS) + local (taste-lite, asset manifest, scope, no-dev-server, verification requirements).
   - Use `dynamic-workflow` for multi-stage if complex.

7. **Review, Verification, Accessibility, Iteration (to 0 issues)**
   - External: Vercel web-design-guidelines / react-best-practices / composition-patterns (a11y, perf, arch correctness, 100+ rules).
   - AccessLint or WCAG skills for focused a11y (contrast, refactor, etc.) + any MCP tools.
   - Design Critique, Web Interface Guidelines.
   - Local: browser/screenshot proof, `verify-static-frontend.ts`, reduced-motion checks, responsive, build/lint, asset-slicer report.
   - Use reliable-agent-workflow or implement+multi-reviewer loops until 0 open issues. Owner agent always re-verifies locally.
   - `codex_gate.ts` or task-gate for mandatory gated execution with "Plugin evidence:".

When multiple stages apply, start with Dynamic Workflow artifact + fanout read-only threads for research/wireframe/review, use reliable for delivery contract, owner keeps edits/claims.

## Recommended External Skills & Exact Install Commands (引用, not vendored)

These are best-of-breed from research (Snyk Top 8, aiuxplayground.com/skills curation, official repos, cross-verified 2026). Install them alongside this marketplace's plugin. The ui-ux-closed-loop skill (and agy-frontend) will detect/coordinate when they are active.

**Core for aesthetics + knowledge (install these):**
- `frontend-design` (Anthropic): `npx skills add https://github.com/anthropics/skills --skill frontend-design`  (or codex plugin marketplace / Claude plugin add if available in their marketplace).
- `ui-ux-pro-max`: `npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max`

**For low-fi prototypes & product thinking:**
- Wireframe Prototyping and related (aiuxplayground family): `npx skills add https://github.com/aj-geddes/useful-ai-prompts --skill wireframe-prototyping` (or the canonical source from aiuxplayground.com/skills)
- to-prd, User Research, Journey Map, Design Critique, etc. from same collections.

**For motion (official, already distilled locally):**
- `greensock/gsap-skills`: `npx skills add https://github.com/greensock/gsap-skills` (multiple granular skills: gsap-core, gsap-scrolltrigger, gsap-react...)

**For correctness, a11y, perf (Vercel & focused):**
- Vercel agent-skills collection: `npx skills add https://github.com/vercel-labs/agent-skills` (then use web-design-guidelines, react-best-practices, composition-patterns, react-native-skills as needed).
- AccessLint: marketplace or npx for a11y specific.

**Cross-agent note:** The SKILL.md format + npx skills CLI works for Codex, Claude Code, Cursor, etc. For pure Codex, also use `codex plugin marketplace add <owner/repo>` where supported (this repo itself is an example). For Pi, use `pi install git:...` or local path where skills are supported.

Run installs in your global or project skill dir (e.g. ~/.codex/skills/ or project/.codex/skills/). See agent docs for discovery order.

## How the Reference Integration Works (no hardcode)

- New `ui-ux-closed-loop` skill (and updates to agy-frontend/gsap-animation) contain **guidance and dispatch rules** that name the external skills explicitly and say "when active, incorporate their [specific section, e.g. Design Thinking + bans on generic fonts]".
- Short `references/EXTERNAL-*.md` files contain: 1-sentence purpose, key 3-5 principles (paraphrased/summarized), exact install command + link to original repo/SKILL.md, version notes, how it plugs into this loop.
- **Do not** copy full verbatim long SKILL.md bodies of third-party skills here.
- For owned/controlled upstreams (like reliable-agent-workflow), we continue to use the `upstreams/*.json` + sync script + vendored copy in skills/ for self-contained reliability.
- Scripts can be added (e.g. a helper that prints/runs the recommended `npx skills add` list for "ui-ux bootstrap").
- AGENTS.md / README updates surface the triggers so the owner agent proactively uses the loop.
- Tests verify dispatch and that the skill produces correct coordination prompts (without assuming externals are present).

This matches the existing successful pattern (gsap distills + references official; agy already calls out `frontend-design`).

## Adding More Externals in Future

When a new high-quality external appears:
1. Add short reference doc in the ui-ux-closed-loop/references/ (or a shared references/ui-ux/).
2. Update the orchestrator SKILL.md and agy-frontend coordination section with trigger/coordination note.
3. Update this plan doc, README, AGENTS.md with the install command and one-line purpose.
4. Optionally add a smoke test or dispatch test.
5. No need to vendor the full content.

## Verification & Release

Existing release gates (validate_plugin.py, quick_validate for each skill, npm test, etc.) apply to new skill.
Add the new skill to the list in README verification section.
Owner must manually smoke test the loop (with externals installed) in Codex before claiming.

## Local Codex Usage (after installing this marketplace)

```bash
codex plugin marketplace add yxhpy/codex-extensions-marketplace --ref main
codex plugin add codex-augment-dispatcher@yxhpy-codex-extensions
# Then install externals as listed above using npx skills add ...

# Example usage
# "Use ui-ux-closed-loop to go from this PRD to low-fi HTML prototype then polished landing with real assets and GSAP motion. Coordinate with frontend-design and ui-ux-pro-max if installed."
```

Then merge the (updated) AGENTS.md into your project.

See the skill itself and references/ for detailed prompt templates and rules.

---

*This enhancement was added via reference-based design to fulfill the request for packaging more UI/UX power into the marketplace without hardcoding external skills.*
