# Asset Pack

Use this reference before invoking `agy` for image-led pages, product pages, brand pages, portfolios, games, and polished demos.

## Default Rule

Do not generate only one image for a full visual-led page. Plan a focused asset pack, then generate or gather the assets before `agy` implements the UI.

Typical counts:

- Tiny proof or component: 1 image is acceptable.
- Single landing/product page: 2-5 images.
- Rich multi-section page or game: 4-8 images.

## Common Roles

- `hero`: wide first-viewport image with safe text area or clear product focal point.
- `mobile-hero`: vertical/mobile crop when the hero cannot crop cleanly.
- `product-cutout`: isolated product or subject for layered motion and overlays.
- `section-detail`: ingredient, material, place, feature, or process close-up.
- `texture`: subtle background material such as glass, paper, mist, shadow, fabric, terrain.
- `state`: visual for empty/loading/error/success when the interface depends on states.

Pick only roles the page genuinely needs. Avoid making decorative filler images.

## Manifest Format

Pass assets to `agy` like this:

```text
Asset manifest:
- role: hero
  path: assets/generated/<name>.png
  section: hero
  crop: product right, safe dark space left for headline
  alt: <specific useful alt text>
- role: section-detail
  path: assets/generated/<name>.png
  section: craft
  crop: center detail, can be masked in a vertical frame
  alt: <specific useful alt text>
```

## Generation Guidance

- Generate separate assets for different section jobs instead of cropping one image for everything.
- Avoid baked-in UI text, fake logos, watermarks, and unreadable label text.
- For product pages, prefer one wide hero plus one detail/ingredient/process image. Add a mobile crop if the desktop hero has a strong horizontal composition.
- Store final selected assets inside the project, usually `assets/generated/` or the local project convention.
- Keep original generated files in `$CODEX_HOME/generated_images/`; copy selected assets into the project.

