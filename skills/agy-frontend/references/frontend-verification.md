# Frontend Verification

Use this reference before claiming frontend work is complete.

## Required Evidence

- Local command evidence: lint/typecheck/test/build when the project provides them.
- Static evidence for simple pages: no unexpected external URLs, no missing local assets, no obvious placeholders, JavaScript parses.
- Asset evidence for image-led pages: the page references the expected count of local raster assets and each referenced asset exists.
- Browser evidence: page loads at the intended URL, console has no errors, no failed essential requests, no horizontal overflow.
- Visual evidence: screenshots after initial animations settle.
- Responsive evidence: check at least `390x844`, `877x778`, and `1440x900` when layout or visual polish matters.
- Interaction evidence: exercise the primary CTA/control and one representative interactive element.

## Visual Completion Rules

- DOM existence is not enough. If the key visual is technically present but hidden, too dim, covered by motion, below the fold, or visually ambiguous, it is not complete.
- Wait for entrance animations before final screenshots, usually around 2 seconds.
- Verify the first viewport matches the task: product/brand page shows the product/brand; app UI shows the working surface; game shows gameplay.
- For image-led pages, verify the media crop and focal point on mobile and desktop.
- For asset packs, verify every manifest role is either used in the page or intentionally reserved for a follow-up.

## Fix Loop

Use at most three focused AGY repair rounds by default:

1. Initial implementation.
2. Visual QA repair from screenshots.
3. Final mechanical QA repair such as missing assets, console errors, overflow, or favicon.

If a fourth repair seems necessary, report the remaining problem and why it needs another round.
