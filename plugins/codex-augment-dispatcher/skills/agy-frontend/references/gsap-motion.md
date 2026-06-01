# GSAP Motion Reference for AGY Prompts

Use this reference when the frontend request includes webpage animation, UI
motion, scroll animation, parallax, GSAP, ScrollTrigger, timeline sequencing, or
React/Vue/Svelte animation.

## Prompt Insertion

Add a `Motion / GSAP` section to the AGY prompt:

```text
Motion / GSAP:
- Use GSAP for non-trivial animation unless the existing codebase has a stronger motion convention.
- Register plugins once with gsap.registerPlugin(...). Use ScrollTrigger for scroll-linked effects.
- Prefer timelines with defaults, labels, position parameters, and stagger over chains of manual delays.
- Animate transform/opacity/autoAlpha; avoid layout-heavy top/left/width/height/margin/padding animation.
- Respect prefers-reduced-motion with gsap.matchMedia() or an equivalent reduced-motion branch.
- In React/Next, prefer @gsap/react useGSAP(), scoped refs, contextSafe callbacks, and automatic cleanup/revert.
- In Vue/Svelte, initialize after mount and clean up timelines/ScrollTriggers on unmount/destroy.
- For ScrollTrigger pinning, animate children of the pinned container, refresh only after real layout changes, and kill/revert triggers on route teardown.
- Do not use private GreenSock registries, .npmrc auth tokens, or paid Club GSAP instructions; use the public gsap package.
```

## Owner-Agent Verification

After AGY exits, Codex should verify the motion with the project's available
checks and, when possible, browser/e2e evidence for:

- no type/lint/build failures;
- initial and animated states render correctly;
- reduced-motion mode has a safe alternative;
- mobile and desktop layouts avoid overlap and layout shift;
- ScrollTrigger start/end/pin behavior remains stable after media or async
  content loads;
- animations clean up on unmount, route changes, or repeated renders.
