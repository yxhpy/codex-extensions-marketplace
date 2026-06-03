# Changelog

## Unreleased

## 0.1.18 - 2026-06-03

- Add Claude Code Dynamic Workflows / `ultracode` / workflow-script / `.claude/workflows` / `.atomic` interop detection while preserving `.agent-workflows/` as the canonical audit trail.
- Add a script-only dispatcher MCP stdio surface for classification, workflow create/approve/verify, and reliable-stage contracts.
- Add `mcp-generator` guidance for small dispatcher-compatible skill/MCP scaffolds.
- Tighten Codex gate Plugin evidence parsing so required plugin names must appear on usable `Plugin evidence:` lines.
- Add optimization-focused tests for detector coverage, release approval reporting, MCP stdio behavior, native interop metadata, and evidence enforcement.
- Route SkillOpt and self-evolving skill optimization prompts through `dynamic-workflow`, `reliable-agent-workflow`, and `task-gate`.
- Add SkillOpt-style skill optimization guidance for bounded skill edits, held-out prompt checks, and compact deployable skill docs.
- Add a local Microsoft SkillOpt setup under `tools/skillopt/` with pinned requirements, prompt repair from the official `v0.1.0` tag, a small dispatcher-routing split, validation tooling, and run instructions.
- Add `npm run skillopt:install-prompts` and `npm run skillopt:validate` for repeatable local SkillOpt setup checks without committing real credentials.

## 0.1.17 - 2026-06-02

- Vendor the latest `yxhpy/reliable-agent-workflow-skill` (`0.3.1`, commit `c97c36207abc8769b5cb22a909c39776423c951c`) as `skills/reliable-agent-workflow`.
- Route deep analysis, optimization plans, complex engineering delivery, Best-of-N, check-work, zero-open-issue repair loops, and e2e verification through `reliable-agent-workflow` across Pi, Codex, Claude Code, Grok, and similar CLI tools.
- Add `scripts/sync_reliable_agent_workflow.ts` so release gates can check or sync the bundled skill against upstream GitHub HEAD.
- Add `npm run release:check` to run dependency restore, upstream freshness, full tests, dynamic-workflow e2e, clean tests, and Docker clean tests.

## 0.1.16 - 2026-06-01

- Correct live xAI/Grok Video defaults after real provider testing showed `1080p` is not available for this team.
- Restore `xai_grok_video_generate` to the broadly supported `720p` default and document that `1080p` should be requested only when the user's xAI team supports it.
- Keep high-quality image generation defaults while mapping Grok augment video helper output to the supported 720p resolution.

## 0.1.15 - 2026-06-01

- Add SVG/emoji prohibition for visual-led frontend defaults and require high-quality image_gen/Grok Video assets instead of placeholder vector or emoji shortcuts.
- Make custom icons default to the image_gen sheet → asset-slicer pipeline before AGY/frontend integration.
- Improve subagent trigger hit rate for background threads, agent threads, worker agents, fanout, delegation, packets, and parallel review/research/QA prompts.
- Raise default generated media quality: Codex image generation defaults to high quality, xAI Grok Video defaults to 1080p, and Grok augmentation video helper defaults to high quality.
- Add static and deterministic tests plus real release e2e coverage for the new media and subagent routing defaults.

## 0.1.14 - 2026-06-01

- Add platform-neutral `dynamic-workflow` orchestration for all subagent-capable agents, with durable `.agent-workflows/<id>/` artifacts, approval gates, packet/result lifecycle, structured plugin evidence, simulated-packet fallback, and final verification.
- Route dynamic workflow scenarios through the dispatcher and Codex gate while keeping the workflow itself agent-neutral rather than Codex-branded.
- Add Codex and Pi E2E coverage that installs the package/plugin and exercises the dynamic workflow script from installed and skill-relative paths.
- Add `gsap-animation` guidance, AGY Motion / GSAP prompt references, and routing/test coverage for webpage animation, ScrollTrigger, parallax, lifecycle cleanup, accessibility, and performance.

## 0.1.13 - 2026-06-01

- Add the `asset-slicer` workflow and deterministic `asset_slice.ts` PNG slicer for generated icon/sprite sheets, including dirty-border, clipped-edge, gutter, count, and expected-box drift checks.
- Add E2E coverage for clean slicing, deterministic reruns, dense/merged sheets, blank sheets, clipped assets, and expected-box offset failures.
- Route generated multi-asset bitmap slicing through dispatcher, AGY asset guidance, README, and project instruction templates before frontend integration.

## 0.1.12 - 2026-06-01

- Forbid AGY frontend helper runs from starting or keeping alive blocking frontend dev/preview servers; Codex now owns any bounded server-based verification after AGY exits.
- Update dispatcher, AGY skill prompts, install guidance, and tests to enforce the non-blocking frontend-helper boundary.

## 0.1.11 - 2026-06-01

- Add the standalone `xai_grok_x_search` and `xai_grok_video_generate` Pi extension tools for xAI/Grok X Search and Grok Imagine Video without depending on Hermes.
- Add Pi-owned xAI OAuth PKCE login commands, API-key fallback, request builders, polling/download logic, docs, and offline unit coverage.

## 0.1.10 - 2026-06-01

- Add the `codex_generate_image` Pi extension tool for Codex-backed gpt-image-2 image generation using existing `openai-codex` login credentials.
- Add Codex image generation docs, save-mode configuration, and mocked unit coverage for request building, SSE parsing, and image saving.

## 0.1.9 - 2026-06-01

- Move `@types/node` into production dependencies so Pi git/package installs include Node built-in type declarations for bundled TypeScript test files.

## 0.1.8 - 2026-06-01

- Add Pi package metadata so the dispatcher skills can be installed by `pi install` from the same repository.
- Add isolated Codex/Pi CLI E2E coverage for marketplace install, Pi package install, and installed script execution.
- Document skill-relative script paths so Pi and Codex can resolve helper scripts consistently.

## 0.1.7 - 2026-05-30

- Strengthen dispatcher and task-gate skill descriptions so normal Codex sessions route through the dispatcher before direct adapters.

## 0.1.6 - 2026-05-30

- Add route classification and Plugin evidence enforcement to gated Codex execution.
- Document mandatory gated execution without requiring project `AGENTS.md` edits.

## 0.1.5 - 2026-05-30

- Limit dispatcher manifest default prompts to the loader-supported maximum of three entries.

## 0.1.4 - 2026-05-30

- Shorten dispatcher manifest default prompts so Codex accepts them under the loader's 128-character limit.

## 0.1.3 - 2026-05-30

- Add Codex background thread fanout guidance to project instructions and dispatcher docs.
- Document model/thinking profiles, skill routing, timeout behavior, and owner-thread verification boundaries.
- Add tests and clean-test assertions that lock the thread fanout guidance into the marketplace package.
