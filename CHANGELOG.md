# Changelog

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
