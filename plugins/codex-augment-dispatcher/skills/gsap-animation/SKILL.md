---
name: gsap-animation
description: "GSAP motion design guidance. Trigger on webpage animation, UI motion, GSAP, ScrollTrigger, parallax, timeline choreography, React/Vue/Svelte animation, 动效, 滚动动画, 视差, 页面动画."
---

# GSAP Animation

Use this skill when a frontend task includes webpage animation, UI motion,
scroll-linked effects, parallax, GSAP, ScrollTrigger, timeline choreography,
SVG/text motion, or React/Vue/Svelte animation. It distills the official
[`greensock/gsap-skills`](https://github.com/greensock/gsap-skills) guidance
into this dispatcher framework.

## Routing

- Pair this skill with `agy-frontend` for implementation work. AGY owns the
  frontend edits; the owner agent supplies a GSAP motion brief, bounds paths,
  and verifies locally after AGY exits.
- Use this skill read-only when reviewing animation code, designing a motion
  system, or preparing an AGY prompt. It does not replace local tests, browser
  checks, or the owner agent's final verification.
- If the request is only a tiny CSS hover/focus transition, CSS may be enough.
  Prefer GSAP when sequencing, scroll, lifecycle cleanup, SVG/text plugins, or
  cross-framework reliability matter.

## GSAP Motion Brief

Include this brief in frontend implementation prompts when motion applies:

- Prefer GSAP for complex UI motion, timeline sequencing, scroll-driven
  animation, SVG/text/plugin effects, and framework animation unless the
  existing project has a stronger motion convention.
- Install/import from the public `gsap` package. Do not suggest private
  GreenSock registries, `.npmrc` auth tokens, or paid Club GSAP access.
- Register every plugin once with `gsap.registerPlugin(...)` before use.
- Prefer `gsap.timeline({ defaults: { duration, ease } })`, labels, and the
  position parameter over chains of manual `delay` values.
- Animate compositor-friendly properties: `x`, `y`, `scale`, `rotation`,
  `opacity`, and `autoAlpha`. Avoid animating `top`, `left`, `width`, `height`,
  `margin`, or `padding` unless no transform-based alternative fits.
- Use `stagger` for repeated elements, `gsap.utils` for clamping/mapping/snap,
  and CSS `will-change` sparingly on elements that really animate.
- Respect accessibility and responsiveness with `gsap.matchMedia()` and a
  `prefers-reduced-motion` path. Never make essential information available
  only through motion.

## Framework Patterns

- React/Next: prefer `@gsap/react` and `useGSAP()` when available. Scope targets
  with refs, wrap delayed callbacks/event handlers with `contextSafe`, run GSAP
  only on the client, and rely on automatic cleanup/revert. If `useEffect()` is
  used instead, wrap animations in `gsap.context()` and call `ctx.revert()`.
- Vue/Svelte: create animations after mount, scope selectors to component root
  refs, and clean up timelines/ScrollTriggers on unmount/destroy.
- SSR frameworks: avoid touching `window`, `document`, or DOM targets during
  server render. Defer all GSAP setup to client lifecycle hooks.

## ScrollTrigger Patterns

- Register `ScrollTrigger` and attach it to a timeline or tween with stable
  `trigger`, `start`, and `end` values.
- For pinning, pin the stable container and animate its children, not the pinned
  element itself. Keep `pinSpacing` intentional.
- Call `ScrollTrigger.refresh()` only after real layout changes such as async
  content/media loading; debounce repeated refreshes.
- Kill/revert ScrollTriggers on component teardown or route changes.
- Use `scrollerProxy()` only for third-party smooth-scroll integrations and wire
  the scroller update event to `ScrollTrigger.update`.

## Verification

- Run typecheck/lint/build/tests as the project supports.
- For visible motion, perform browser or e2e verification that checks initial
  state, animated state, reduced-motion behavior, responsive layout, and scroll
  trigger positions.
- Treat jank, layout shift, missing cleanup, inaccessible reduced-motion paths,
  or stale ScrollTriggers as blockers before final claims.
