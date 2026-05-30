# Changelog

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
