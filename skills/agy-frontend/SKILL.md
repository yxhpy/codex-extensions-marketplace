---
name: agy-frontend
description: "Use when building, modifying, redesigning, styling, debugging, reviewing, or visually verifying frontend UI, web apps, pages, components, dashboards, landing pages, games, HTML/CSS, React, Vue, Svelte, Tailwind, responsive layout, browser UX, or visual polish."
---

# AGY Frontend

For frontend-related work, Antigravity CLI (`agy`) owns the frontend implementation. Codex handles context gathering, prompt construction, supervision, verification, and final reporting.

## Hard Rule

Use the Antigravity CLI for all frontend build, edit, redesign, styling, layout, interaction, visual polish, and browser-rendered UI tasks. Resolve the binary with `AGY_BIN="${AGY_BIN:-agy}"`.

Do not hand-write the final frontend implementation in Codex unless one of these is true:
- The user explicitly says not to use `agy`.
- `agy` is unavailable after a version/auth smoke check and one retry.
- The task is a tiny non-visual text/config change and the user asks for speed over design.

If an exception is used, say so plainly in the final answer.

## Workflow

1. Inspect the project first: package manager, framework, entry files, design system, existing components, scripts, and local verification commands.
2. Decide the visual asset strategy before invoking `agy`. For image-led work, read `references/asset-pack.md`, generate or gather the asset pack first, and pass local paths plus roles to `agy`.
3. Pick the task mode: `landing`, `app`, `redesign`, or `game`. For visual-led landing/product/brand/portfolio work, read `references/taste-lite.md` and include only the relevant checks in the `agy` prompt.
4. Build a concrete `agy` prompt with: user request, allowed scope, exact files/directories, asset manifest, task mode, design constraints, repo conventions, expected verification, and "do not touch unrelated files".
5. Run `agy` with explicit workspace scope:

```bash
AGY_BIN="${AGY_BIN:-agy}"
"$AGY_BIN" \
  --add-dir "$PWD" \
  --print-timeout 30m \
  --print "<frontend task prompt>"
```

Use `--dangerously-skip-permissions` only when the user has asked for autonomous file edits or the task cannot proceed without approval prompts. Prefer a bounded prompt over broad permission.

6. If `agy` returns a plan instead of editing files, rerun with explicit approval to implement. If it returns instructions or a patch, apply the result carefully with local tools.
7. Verify locally: install-free checks first, then typecheck/lint/tests/build as appropriate, then browser or screenshot proof for visible UI. For static image-led pages, run `ASSET_MIN_IMAGES=<n> scripts/verify-static-frontend.sh <site-dir>` when applicable.
8. Report what `agy` did, what Codex verified, and any gap.

## Visual Asset Rule

Use real raster imagery for visual-led frontends. For landing pages, brand pages, product pages, portfolios, editorial pages, games, and high-polish demos, prefer GPT image generation or supplied real images for hero/product/environment assets before asking `agy` to implement the UI.

Do not default to a single generated image for full visual-led pages. Plan a small asset pack first: hero/product, section detail, mobile crop, texture/background, or cutout as appropriate. A single raster asset is acceptable only for a narrow proof-of-concept, a tiny component, or when the user explicitly asks for one image.

Use CSS/SVG for icons, diagrams, simple controls, vector logos, canvas effects, masks, particles, and decorative overlays. Do not rely on CSS/SVG alone for photoreal products, people, places, lifestyle scenes, rich textures, or premium hero imagery unless the user explicitly wants code-native art.

When generating images:
- Save assets inside the project, usually `assets/`, `public/`, or the local convention.
- Give `agy` exact asset paths and describe the intended crop, focal point, mood, and responsive behavior.
- Require accessible alt text, stable dimensions, mobile-safe crops, and no text baked into images unless the image is purely decorative.
- Keep AGY responsible for layout, animation, integration, and responsive polish; Codex remains responsible for asset generation, supervision, and browser verification.

## Prompt Template

```text
You are the frontend implementer for this local repo.
Implementation is approved. Edit the files now. Do not stop at a plan or ask for more approval unless a hard blocker prevents file edits.

Task:
<user request>

Mode:
<landing | app | redesign | game>

Scope:
- Work only in <paths>.
- Preserve existing framework, package manager, design system, and conventions.
- Do not change unrelated behavior or metadata.

Assets:
- Asset manifest: <role | local path | section | crop/focal point | alt text>.
- If a visual asset is provided, integrate it as a real image/media asset with stable dimensions, responsive crops, alt text, and fallback styling.
- Do not replace image-led hero/product visuals with CSS-only or SVG-only approximations unless explicitly requested.

Design bar:
- Make the actual usable interface, not a marketing placeholder.
- Keep layout responsive and text non-overlapping on mobile and desktop.
- Prefer real visual assets when the task needs visual richness.
- Avoid generic AI UI tropes, one-note palettes, and decorative clutter.
- For visual-led pages, satisfy the relevant checks from `references/taste-lite.md`.

Verification expected:
- Run <commands>.
- If a dev server is needed, state the URL and what to visually check.

Return:
- Files changed.
- Verification run and results.
- Any remaining risks.
```

## Frontend Skill Coordination

When `frontend-skill` or `frontend-design` also applies, use their design constraints as input to the `agy` prompt. `agy` still owns implementation; Codex verifies the result against those constraints.

## Verification References

- Read `references/asset-pack.md` before generating assets for image-led work.
- Read `references/frontend-verification.md` before final verification for visible UI work.
- Use `scripts/verify-static-frontend.sh` for static HTML/CSS/JS pages when a local server can be run.

## Failure Handling

If `agy` hangs or fails:
- Check `AGY_BIN="${AGY_BIN:-agy}"; "$AGY_BIN" --version`.
- Run a minimal auth smoke: `AGY_BIN="${AGY_BIN:-agy}"; "$AGY_BIN" --print-timeout 60s --print 'Reply only: OK'`.
- Retry once with a smaller prompt and explicit `--add-dir`.
- If still blocked, stop and report the blocker instead of silently doing the frontend work without `agy`.
