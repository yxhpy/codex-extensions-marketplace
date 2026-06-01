---
name: asset-slicer
description: Standard workflow for splitting generated multi-icon/sprite sheets into clean individual PNG assets. Trigger on icon sheet, sprite sheet, asset sheet, cut icons, slice assets, crop sprites, 切图, 切分图标, 多素材切分, 图标切分不干净, 边界偏差.
metadata:
  short-description: Deterministic generated-asset slicing
---

# Asset Slicer

Use this skill when one generated bitmap contains multiple icons, sprites, UI
stickers, product cutouts, game items, or other separable visual assets that
must be split into individual files. The goal is to avoid dirty cuts, shifted
boxes, clipped silhouettes, and manual crop drift.

## Script Path Resolution

For Codex plugin installs, run commands from the plugin root. For Pi package
installs, resolve this skill directory first; the plugin root is `../..` from
this `SKILL.md`, so the slicer is `../../scripts/asset_slice.ts` when resolved
relative to this skill directory.

## Standard Workflow

1. **Generate for slicing, not just for looks.** Ask the image generator for a
   flat transparent or chroma-key background, one asset per island/cell, clear
   gutters, no touching/overlapping shapes, no cast shadows crossing gutters,
   no baked-in labels, and no decorative border frame. Save the untouched sheet
   in the project.
2. **Record expected structure.** Before slicing, write down the expected count
   and, when the layout is known, an expected-box manifest. This makes offset
   drift measurable instead of subjective.
3. **Run deterministic slicing.** Use the script with explicit output directory,
   expected count, padding, minimum gutter, and background mode:

```bash
node --experimental-strip-types ../../scripts/asset_slice.ts \
  assets/generated/icon-sheet.png \
  --out-dir assets/generated/icons \
  --background auto \
  --padding 2 \
  --min-gap 8 \
  --expect-count <n> \
  --json
```

4. **Gate on the report.** Treat `ok: false` as a hard blocker. Do not pass
   failed slices to AGY or ship them. Fix the upstream sheet prompt or expected
   manifest, then rerun.
5. **Use clean outputs only.** The script writes `slice-01.png`, `slice-02.png`,
   etc. with non-component pixels made transparent plus `asset-slices.json` as
   verification evidence. Put those exact slice paths into the AGY asset
   manifest or frontend implementation prompt.
6. **Keep the original sheet.** Preserve the source sheet and JSON report so a
   reviewer can reproduce the cuts.

## Optional Expected Manifest

When exact boxes are known, create a JSON file and pass it with `--expected`:

```json
{
  "tolerancePx": 1,
  "minIou": 0.95,
  "items": [
    { "id": "search", "box": { "x": 12, "y": 16, "width": 64, "height": 64 } },
    { "id": "settings", "box": { "x": 96, "y": 16, "width": 64, "height": 64 } }
  ]
}
```

The slicer compares detected raw boxes to the manifest with pixel offset and
IoU checks. Items are matched in deterministic reading order (top-to-bottom,
then left-to-right), so write the manifest in that order. This catches the
common "almost right but shifted" crop failure.

## Deterministic Checks

The report must pass all applicable checks:

- `components_detected`: at least one foreground island survived the noise
  threshold.
- `expected_count`: detected slice count equals the requested asset count.
- `slice_N_clean_border`: foreground pixels do not touch the output crop border,
  proving padding/gutters were sufficient.
- `slice_N_not_clipped`: the source asset does not touch the sheet edge.
- `slice_A_B_padded_boxes_do_not_overlap`: requested padding does not pull a
  neighbor into the slice.
- `slice_A_B_min_gap`: raw gutters meet the requested minimum gap.
- `slice_N_expected_alignment`: detected boxes match the optional manifest within
  `tolerancePx` and `minIou`.

## Failure Policy

Do not manually nudge crop boxes after a failed report unless the user asks for a
one-off rescue. Prefer regenerating the source sheet with stronger constraints:

- larger gutters between assets;
- flat chroma-key or transparent background;
- no shadows, glow, or particles crossing cell boundaries;
- one complete object per cell/island;
- no asset touching the canvas edge.

If regeneration is unavailable, document every manual override and rerun the
slicer with an expected manifest so the offset is still measured.
