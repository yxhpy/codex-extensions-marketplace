---
name: mcp-generator
description: Generate or review small dispatcher-compatible MCP or skill scaffolds, especially stdio MCP tools that expose classification, workflow artifact creation, approval, verification, or reliable-agent workflow contracts while preserving owner-agent verification boundaries.
---

# MCP Generator

Use this skill when the user asks to create a new MCP helper, skill/MCP pair,
dispatcher-compatible tool surface, or reusable route adapter.

## Boundaries

- Keep scaffolds minimal and deterministic. Prefer stdio JSON-RPC or local
  TypeScript scripts when a full server is unnecessary.
- Do not add plugin manifest `mcpServers` wiring unless the user explicitly asks
  for install-time MCP registration and tests are updated for it.
- Do not pass secrets, credentials, raw env dumps, or unnecessary repo context to
  external tools.
- The owner agent keeps edits, integration, tests, release decisions, and final
  claims.

## Workflow

1. Identify the route or skill the MCP should expose.
2. Reuse existing repository functions before adding new protocol logic.
3. Define a small tool schema for each action and keep mutation tools explicit.
4. Add fake/local stdio tests that call `initialize`, `tools/list`, and
   `tools/call`.
5. Update `mcps/README.md`, dispatcher routing docs, and release checks only for
   the supported surface.

## Verification

Before claiming completion, run focused tests for the new script and one broad
plugin test command. For dispatcher-owned MCP helpers, also prove that `Plugin
evidence` requirements still fail when evidence is missing or negative.
