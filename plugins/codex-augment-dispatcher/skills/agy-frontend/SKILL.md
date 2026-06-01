---
name: agy-frontend
description: "AGY frontend implementer. Trigger on frontend, UI, landing page, redesign, styling, CSS, animation, interaction, responsive, browser visual verification, React/Vue/Svelte/Tailwind, 前端, 落地页, 动效, 视觉检查."
---

# AGY Frontend

For frontend-related work, Antigravity CLI (`agy`) owns the frontend implementation. Codex handles context gathering, prompt construction, supervision, verification, and final reporting.

Strong triggers include: frontend, UI, landing page, website, page, component,
dashboard, game UI, redesign, restyle, CSS, Tailwind, animation, interaction,
responsive, browser visual verification, screenshot proof, React, Vue, Svelte,
HTML/CSS, 前端, 落地页, 页面, 组件, 动效, 视觉检查, 响应式.

## Hard Rule

Use the Antigravity CLI for all frontend build, edit, redesign, styling, layout, interaction, visual polish, and browser-rendered UI tasks. Resolve the binary with `AGY_BIN="${AGY_BIN:-agy}"`.

AGY must not start, run, or keep alive frontend dev servers or preview servers (`npm run dev`, `vite --host`, `next dev`, `astro dev`, `pnpm dev`, etc.). Dev-server commands are blocking and can hang the adapter. Codex owns any bounded local server startup for verification after AGY exits, using explicit timeouts/background handling and cleanup.

Do not hand-write the final frontend implementation in Codex unless one of these is true:
- The user explicitly says not to use `agy`.
- `agy` is unavailable after a version/auth smoke check and one retry.
- The task is a tiny non-visual text/config change and the user asks for speed over design.

If an exception is used, say so plainly in the final answer.

## Script Path Resolution

For Codex plugin installs, run commands from the plugin root when using
plugin-level scripts. For Pi package installs, resolve paths in this skill
relative to this `SKILL.md`; `references/*` and `scripts/verify-static-frontend.ts`
are intentionally skill-local and can be called via absolute paths derived from
this skill directory.

## Workflow

1. Inspect the project first: package manager, framework, entry files, design system, existing components, scripts, and local verification commands.
2. Decide the visual media strategy before invoking `agy`. For image-led or cinematic work, read `references/asset-pack.md`, generate the image/video pack first, and pass local paths plus roles to `agy`.
3. Pick the task mode: `landing`, `app`, `redesign`, or `game`. For visual-led landing/product/brand/portfolio work, read `references/taste-lite.md` and include only the relevant checks in the `agy` prompt.
4. Build a concrete `agy` prompt with: user request, allowed scope, exact files/directories, asset manifest, task mode, design constraints, repo conventions, expected verification, "do not touch unrelated files", and "do not start or keep alive any frontend dev/preview server".
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
7. Verify locally after AGY exits: install-free checks first, then typecheck/lint/tests/build as appropriate, then browser or screenshot proof for visible UI. If a local frontend server is needed, Codex starts it separately with bounded timeout/background handling and cleanup; AGY does not start it. For static media-led pages, run `ASSET_MIN_IMAGES=<n> ASSET_MIN_VIDEOS=<n> node --experimental-strip-types <absolute-skill-dir>/scripts/verify-static-frontend.ts <site-dir>` when applicable.
8. Report what `agy` did, what Codex verified, and any gap.

## Visual Media Rule

Use real generated media for visual-led frontends. For landing pages, brand pages, product pages, portfolios, editorial pages, games, and high-polish demos, generate the images and videos needed for hero/product/environment assets before asking `agy` to implement the UI.

Images MUST be generated with image_gen. Videos MUST be generated with Grok Video. No fallback media generation is allowed. Resource counts are unbounded.

Plan a complete media pack first: hero/product, section detail, mobile crop, texture/background, cutout, hero-video, ambient-loop, section-video, or transition-clip as appropriate. Generate as many assets as the requested experience needs to feel finished; do not treat any count in this skill as a maximum.

When the request asks for cinematic, immersive, interactive, editorial, premium, film-like, or "not a demo" output, assume motion assets are needed. Generate video assets with Grok Video (`grok-imagine-video`) through `/v1/videos`; do not substitute `ffmpeg` slideshow loops, CSS-only motion, stock video, screenshots, or locally animated stills as final video evidence. If image_gen or Grok Video is unavailable, stop and report the blocker instead of creating replacement media.

Use CSS/SVG for icons, diagrams, simple controls, vector logos, canvas effects, masks, particles, and decorative overlays only after required image_gen and Grok Video assets are present. Do not rely on CSS/SVG alone for photoreal products, people, places, lifestyle scenes, rich textures, premium hero imagery, or cinematic atmosphere.

When generating media:
- Save assets inside the project, usually `assets/`, `public/`, or the local convention.
- Give `agy` exact asset paths and describe the intended crop, focal point, mood, motion behavior, playback policy, and responsive behavior.
- Require accessible alt text, stable dimensions, mobile-safe crops, and no text baked into images unless the image is purely decorative.
- For images, use the `image_gen` tool path from the image generation skill and move the selected output from `$CODEX_HOME/generated_images/` into the project before referencing it.
- For video, use Grok Video output saved as muted loopable `mp4` or `webm`, usually 4-12 seconds, with an image_gen poster image when the first frame may be dark or ambiguous.
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
- Do not start, run, or keep alive any frontend dev/preview server. Do not run `npm run dev`, `pnpm dev`, `yarn dev`, `vite --host`, `next dev`, `astro dev`, or similar blocking server commands. Codex will handle bounded server-based verification after you exit.

Assets:
- Asset manifest: <role | type:image|video | local path | section | crop/focal point or motion | alt text or aria label | poster path when video>.
- Image example: role=hero, type=image, path=assets/generated/hero.png, section=hero, crop=subject right with safe dark space left, alt=<specific useful alt text>.
- Video example: role=hero-video, type=video, path=assets/generated/hero-loop.mp4, poster=assets/generated/hero-poster.png, section=hero, motion=muted 6s loop with slow atmospheric movement, aria-label=<specific useful label>.
- All image assets in the manifest must come from image_gen. All video assets in the manifest must come from Grok Video. Do not invent fallback media or substitute CSS/SVG/local animation for missing generated assets.
- If a visual asset is provided, integrate it as a real image/media asset with stable dimensions, responsive crops, playback-safe video attributes, alt text or labels, and loading states.
- Do not replace image-led hero/product visuals with CSS-only or SVG-only approximations unless explicitly requested.

Design bar:
- Make the actual usable interface, not a marketing placeholder.
- No half-finished output: no placeholder copy, empty sections, missing hero visuals, broken media, fake controls, or "continue this pattern" stubs.
- Keep layout responsive and text non-overlapping on mobile and desktop.
- Prefer real visual media when the task needs visual richness; generate enough assets for every major visual section before `agy` implements.
- Avoid generic AI UI tropes, one-note palettes, and decorative clutter.
- For visual-led pages, satisfy the relevant checks from `references/taste-lite.md`.

Verification expected:
- Run only non-blocking checks such as typecheck, lint, tests, build, or static analyzers.
- Do not start a dev server. If server-based visual verification is needed, state the command/URL Codex should run separately and what to visually check.

Return:
- Files changed.
- Verification run and results.
- Any remaining risks.
```

## Frontend Skill Coordination

When `frontend-skill` or `frontend-design` also applies, use their design constraints as input to the `agy` prompt. `agy` still owns implementation; Codex verifies the result against those constraints.

## Verification References

- Read `references/asset-pack.md` before generating assets for image-led, video-led, cinematic, or polished demo work.
- Read `references/frontend-verification.md` before final verification for visible UI work.
- Use `node --experimental-strip-types <absolute-skill-dir>/scripts/verify-static-frontend.ts` for static HTML/CSS/JS pages when a local server can be run.

## Failure Handling

If `agy` hangs or fails:
- Check `AGY_BIN="${AGY_BIN:-agy}"; "$AGY_BIN" --version`.
- Run a minimal auth smoke: `AGY_BIN="${AGY_BIN:-agy}"; "$AGY_BIN" --print-timeout 60s --print 'Reply only: OK'`.
- Retry once with a smaller prompt and explicit `--add-dir`.
- If still blocked, stop and report the blocker instead of silently doing the frontend work without `agy`.
