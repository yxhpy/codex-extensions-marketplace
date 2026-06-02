# Asset Pack

Use this reference before invoking `agy` for image-led, video-led, cinematic, product, brand, portfolio, game, and polished demo work.

## Default Rule

Do not generate only one image for a full visual-led page. Plan a focused media pack, then generate the assets before `agy` implements the UI. The pack should be complete enough that `agy` can build the full requested experience without empty sections, generic filler, or CSS-only substitutes for the main visual moments.

High-quality images MUST be generated with image_gen. High-quality videos MUST be generated with Grok Video. No fallback media generation is allowed. Resource counts are unbounded.

SVG and emoji are prohibited as default visual assets. Do not use inline SVG, SVG icon packs, emoji, CSS-only illustrations, or local animation as substitutes for generated image/video assets unless the user explicitly asks for that medium or the SVG is a structural mask/control rather than a visual asset.

Do not put numeric caps, quotas, or fixed asset counts in the media generation plan. Let the requested experience, visible section count, interaction design, and verification evidence decide how many image_gen images and Grok Video clips to create.

## Common Roles

Image roles:

- `hero`: wide first-viewport image with safe text area or clear product focal point.
- `mobile-hero`: vertical/mobile crop when the hero cannot crop cleanly.
- `product-cutout`: isolated product or subject for layered motion and overlays.
- `section-detail`: ingredient, material, place, feature, or process close-up.
- `texture`: subtle background material such as glass, paper, mist, shadow, fabric, terrain.
- `state`: visual for empty/loading/error/success when the interface depends on states.
- `icon-sheet` / `sprite-sheet`: the default workflow for custom icons, badges, stickers, game items, and multi-asset UI art. Generate a high-quality image_gen sheet with flat transparent/chroma background and clear gutters, then process it with the `asset-slicer` workflow before AGY receives individual paths.

Video roles:

- `hero-video`: short first-viewport loop, usually 4-10 seconds, muted autoplay, with a still poster and a clear focal subject.
- `ambient-loop`: atmospheric motion such as mist, candlelight, fabric, water, clouds, particles, or city movement, usually 4-12 seconds and seamless enough to loop.
- `section-video`: a focused clip for a story/process/feature section, usually 4-8 seconds, with visible motion that clarifies the section rather than acting as decoration.
- `transition-clip`: a brief bridge between scenes or states, usually 2-5 seconds, used sparingly for editorial, game, or cinematic experiences.

Pick roles the page genuinely needs, but do not under-generate for premium requests. If the prompt asks for cinematic, immersive, interactive, film-like, rich, production-real, or "not a demo" output, keep adding image_gen images and Grok Video clips until the page can be finished without placeholders or missing visual moments.

Image generation guidance:

- Use the `image_gen` tool path from the image generation skill for every raster image that ships with the page.
- User-provided images may be references for image_gen, but they are not a substitute final image pack unless the user explicitly asks for asset integration instead of generation.
- Store selected image_gen outputs inside the project before passing paths to `agy`.

Video format guidance:

- Use Grok Video (`grok-imagine-video`) through the local Grok2API `/v1/videos` gateway, then save the resulting `.mp4` or `.webm` files inside the project.
- Use `multipart/form-data` with `input_reference[]` when image-to-video needs a stable local reference frame; poll `/v1/videos/{id}` until `status=completed`, then download `/v1/videos/{id}/content`.
- Use 16:9 or 21:9 for desktop hero loops, 9:16 for mobile hero variants, and 1:1 or 4:5 for compact section clips.
- Keep loops short and compressed enough for local preview. Default xAI/Grok Video requests to 720p because some teams cannot access 1080p; request 1080p only when the user's xAI team explicitly supports it. Keep clips 4-12 seconds, muted, looped, and poster-backed.
- Avoid baked-in UI text, fake subtitles, watermarks, logos, and unreadable label text. Do not accept local `ffmpeg` slideshow loops, CSS motion, stock clips, or locally animated stills as final generated-video proof.

## Manifest Format

Pass assets to `agy` like this:

```text
Asset manifest:
- role: hero
  type: image
  path: assets/generated/<name>.png
  section: hero
  crop: product right, safe dark space left for headline
  alt: <specific useful alt text>
- role: hero-video
  type: video
  path: assets/generated/<name>.mp4
  poster: assets/generated/<name>-poster.png
  section: hero
  motion: muted autoplay loop, slow camera drift, subject remains readable
  aria-label: <specific useful label for the video>
- role: section-detail
  type: image
  path: assets/generated/<name>.png
  section: craft
  crop: center detail, can be masked in a vertical frame
  alt: <specific useful alt text>
```

## Generation Guidance

- Generate separate assets for different section jobs instead of cropping one image or stretching one loop for everything.
- For icons, sprite sheets, sticker packs, badges, and game item sheets, default to the image_gen → `asset-slicer` pipeline: require a flat transparent/chroma background, clear gutters, and one asset per cell/island, then run `asset-slicer` before using the outputs.
- Do not hand-draw inline SVG icons, use SVG icon libraries, or use emoji as the default visual asset path; use them only when explicitly requested or when needed as non-visual semantic controls.
- Avoid baked-in UI text, fake logos, watermarks, and unreadable label text.
- For product pages, generate image_gen hero/detail/mobile/section assets until every visual section has real media.
- For cinematic or interactive pages, generate Grok Video hero/ambient/section clips and image_gen posters/section images until the experience is complete.
- Store final selected assets inside the project, usually `assets/generated/` or the local project convention.
- Keep original generated files in `$CODEX_HOME/generated_images/`; copy selected assets into the project.
