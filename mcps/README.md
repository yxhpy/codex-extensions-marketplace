# MCP Tools

MCP servers can live directly in this directory or inside a plugin.

Currently published MCP surface:

- `plugins/codex-augment-dispatcher/scripts/dispatcher_mcp.ts`: minimal stdio
  JSON-RPC surface for dispatcher classification, workflow create/approve/verify,
  and reliable-agent workflow stage contracts.

This MCP surface is script-only by default. The plugin manifest intentionally
does not register `mcpServers`; consumers can opt in by launching the script
with line-delimited JSON-RPC on stdin. Keep future MCP additions small, fake-test
them first, and avoid passing secrets or unnecessary repository context.
