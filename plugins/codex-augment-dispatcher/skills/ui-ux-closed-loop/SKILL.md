---
name: ui-ux-closed-loop
description: "Full UI/UX closed loop orchestrator. Trigger on UI/UX design, product requirements to prototype to polished interface, low fidelity wireframe, design system, frontend aesthetics, visual design loop, 页面需求 to 产品思维 to 低保真原型 to UI/UX, full design flow. Coordinates local (agy-frontend, asset-slicer, gsap) with external best-of-breed skills via references (do not hardcode their full content)."
---

# UI/UX Closed Loop Orchestrator

Provides the end-to-end workflow from page requirements / product thinking / low-fidelity prototypes through design decisions, assets, motion, implementation, review, and verification to polished, production-grade UI/UX. 

**Reference-based integration (core rule):** This skill and the dispatcher **reference** external skills by name, install command, and coordination guidance. We do **not** vendor or duplicate their full SKILL.md content here (see docs/UI-UX-CLOSED-LOOP.md for philosophy and the existing gsap-animation + agy-frontend "frontend-design" pattern). When an external is installed and active in the agent, its rules take precedence for its domain; this skill composes them with local capabilities.

Strong triggers: UI/UX, frontend design, landing page redesign, visual polish, wireframe, prototype, design system, product to UI flow, low-fi, high-fi, 低保真, 设计系统, 视觉设计, 动效工程, 关闭环路.

## Prerequisites & External References (安装引用)

Before or during the loop, ensure relevant externals are installed (they are discovered automatically by most agents when in ~/.*/skills/ or project skills dir). This skill will note them in prompts.

**Must-have for quality aesthetics & knowledge (install once):**
- frontend-design (anthropics): `npx skills add https://github.com/anthropics/skills --skill frontend-design`
  - Provides: BOLD aesthetic direction (purpose/tone/diff), distinctive typography (ban generic Inter/Roboto etc.), cohesive color, spatial composition, high-impact motion, rich details. See references/EXTERNAL-FRONTEND-DESIGN.md .
- ui-ux-pro-max (nextlevelbuilder): `npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max`
  - Provides: searchable DB of 50+ styles, palettes, font pairings, 99 UX guidelines, product-type rules, priority checks (a11y #1). Use its --design-system output and priority rules.

**For low-fi / early validation:**
- Wireframe Prototyping (aiuxplayground family): `npx skills add <canonical repo from aiuxplayground.com/skills> --skill wireframe-prototyping`
  - Low/medium/hi fidelity ladder, HTML prototypes, flows, testing plans (tasks, metrics, feedback). Start here, mobile-first, iterate before visuals.

**For motion (official + local distill):**
- Full gsap-skills: `npx skills add https://github.com/greensock/gsap-skills`
- This repo's `gsap-animation` (always available via the dispatcher) distills the key briefs + verification. Prefer the full for granular when needed.

**For engineering correctness & a11y:**
- Vercel collection: `npx skills add https://github.com/vercel-labs/agent-skills` (web-design-guidelines, react-*, composition-patterns).
- AccessLint or WCAG-focused skills for deep a11y audits/refactors.

**Product / research (for stage 1):**
- to-prd, User Research, Journey Map, Design Critique etc. from aiuxplayground or equivalent curated sets.

**Local always-on from this plugin (no extra install):**
- agy-frontend (impl delegation + visual media rules + taste)
- asset-slicer (generated asset quality gate)
- dynamic-workflow / task-gate / reliable-agent-workflow / grok-augment (orchestration, planning, verification, research)
- Others as dispatched by the main plugin.

Run the installs for your agent (Codex uses ~/.codex/skills/ or plugin mechanisms; see agent docs). After install, `codex plugin list` or equivalent to confirm.

## Workflow (orchestrated stages)

The owner agent (or dynamic-workflow) owns the overall thread. Use this skill to classify and drive the loop. Always produce evidence (screenshots, reports, "Plugin evidence:" lines).

1. **Requirements to Product Thinking**
   - Gather/analyze request into PRD or design doc (use task-gate, external to-prd/research skills, Grok /design or equivalent for structured output with PR Plan + Key Decisions + review loop to 0 issues).
   - Define success metrics, audience, constraints, user flows/journeys.
   - Output: .agent-workflows/<id>/prd-or-design.md or similar artifact.

2. **Low-Fidelity Prototypes & Validation**
   - Invoke wireframe-prototyping (external) or equivalent: produce low-fi (text/ascii or basic HTML) wireframes, component templates, interaction flows.
   - Define test plan (5 users, tasks, metrics: completion >80%, time, SUS>70, quotes).
   - Iterate: run "tests", collect feedback (simulated or real), refine. Do not proceed to visuals until validated.
   - Use local task-gate / dynamic-workflow for structure.

3. **Design Direction & Systems**
   - Activate frontend-design (external) for aesthetic direction: choose tone, commit to memorable POV, apply typography/color/spatial rules, ban slop.
   - Activate ui-ux-pro-max (external) : run design-system query for the product type; apply priority rules (a11y first).
   - Local: read taste-lite.md and asset-pack.md for visual-led constraints.
   - Decide media strategy (real generated images/videos first).
   - Output: DESIGN.md or design-system/MASTER.md + page overrides.

4. **Assets (generate then gate)**
   - Generate hero/product/section assets with high-quality image_gen / Grok Video (unbounded count, proper crops/alt, no baked UI text).
   - For icons/sprites/badges: generate sheet (flat bg, gutters, one asset per island), then `asset-slicer` with --expect-count + optional manifest. Gate strictly on the JSON report (clean borders, no overlap, alignment). Only clean slices go to impl.
   - Save to conventional assets/ or public/ ; record manifest with role, path, crop, motion, alt.

5. **Motion Briefs**
   - If animation/scroll/parallax/GSAP: use local gsap-animation (or full external) to produce concise brief (timelines, ScrollTrigger, reduced-motion, cleanup, framework patterns, transform props).
   - Include in impl prompt.

6. **Implementation (delegate + compose)**
   - Use agy-frontend (local): build prompt with user request + scope (exact paths) + asset manifest + mode + design constraints from active externals (frontend-design + Pro Max + DS) + GSAP brief + "no dev server" + verification requirements + "preserve conventions".
   - Run the specialist (agy or direct). 
   - If plan returned, approve explicitly then re-run.
   - Local owns any bounded server for final visual proof.

7. **Review, Verify, Iterate to Zero Issues**
   - Run non-blocking checks (type/lint/build).
   - Visual: browser screenshots/video (or static verify script), check against taste-lite / frontend-design rules / Pro Max priorities / reduced-motion / responsive / a11y.
   - External correctness: web-design-guidelines audit, AccessLint, etc.
   - Use reliable-agent-workflow or multi-reviewer (implement + review loops) for complex changes. Require "Plugin evidence:" for any helper used.
   - Fix until owner re-verifies 0 issues locally. Escalate product tradeoffs to user.
   - Update artifacts and PR plan.

## Prompt Composition Template (use when driving agy or direct impl)

(Combine with agy-frontend template + add:)

Design constraints (from active externals):
- Aesthetic: [from frontend-design: bold [tone] direction, distinctive fonts pairing, dominant color + accents, asymmetry/negative space, high-impact staggered motion...]
- Knowledge & rules: [from ui-ux-pro-max: palette X for [product type], priority 1 a11y contrast 4.5:1, touch 44px, ... specific anti-patterns avoided]
- DS: [tokens, components from Tailwind DS or Pro Max output]
- Motion: [gsap brief]
- Assets: [manifest with paths + roles + crops + alts]

Verification: after edits, provide screenshot evidence + checklist results + "Used frontend-design + ui-ux-pro-max + asset-slicer + gsap-animation" line.

## Coordination with Other Local Skills

- Pair with agy-frontend for the impl step (this skill provides the upstream stages and external constraints to feed it).
- Use dynamic-workflow for the overall multi-stage packet if the request mentions subagents/fanout/parallel review.
- Use task-gate for numbered plan after low-fi or design direction.
- Use reliable-agent-workflow when the UI work is high-risk or needs cross-harness verification.
- grok-augment for creative direction or external critique during design stage.
- asset-slicer and image gen are mandatory for visual assets.

## Verification Expected from Owner Agent

- All stages produce artifacts under .agent-workflows/ or project docs/.
- Final deliverable includes: design rationale, prototype evidence, asset manifest + slicer report, motion brief, impl diff, verification screenshots/reports, "Plugin evidence: ui-ux-closed-loop + frontend-design@... + ..." .
- Browser visual proof (or static) for the key screens/states.
- No placeholders, no low-contrast, responsive on 390/1440 etc., a11y basics, reduced-motion safe path.

## Failure / Missing External Handling

If a recommended external is not installed, fall back to local equivalents + explicit note in output ("frontend-design not detected; used built-in taste-lite + basic contrast rules. Recommend installing for better results.").

Do not invent or hallucinate rules from externals that are not loaded.

## Extending

Future externals added only as references + short notes in this skill + docs/UI-UX-CLOSED-LOOP.md. See the plan doc for process.

## References

- docs/UI-UX-CLOSED-LOOP.md (installs, full philosophy)
- plugins/codex-augment-dispatcher/skills/agy-frontend/references/*.md and SKILL.md (for impl step)
- plugins/codex-augment-dispatcher/skills/gsap-animation/SKILL.md
- plugins/codex-augment-dispatcher/skills/asset-slicer/SKILL.md
- External originals (do not duplicate here): links in the references/ subdir of this skill.
