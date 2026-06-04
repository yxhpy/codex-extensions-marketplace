import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { handleMcpRequest } from "../scripts/dispatcher_mcp.ts";

const PLUGIN_ROOT = path.resolve(import.meta.dirname, "..");
const SCRIPT = path.join(PLUGIN_ROOT, "scripts/dispatcher_mcp.ts");

function tempRoot(): string {
	return mkdtempSync(path.join(tmpdir(), "dispatcher-mcp-test-"));
}

function structuredContent(response: ReturnType<typeof handleMcpRequest>) {
	assert.ok(response?.result && typeof response.result === "object");
	const result = response.result as { structuredContent?: unknown };
	assert.ok(result.structuredContent);
	return result.structuredContent as Record<string, unknown>;
}

test("stdio MCP initializes, lists tools, and classifies interop prompts", () => {
	const input = [
		{
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {},
		},
		{
			jsonrpc: "2.0",
			id: 2,
			method: "tools/list",
			params: {},
		},
		{
			jsonrpc: "2.0",
			id: 3,
			method: "tools/call",
			params: {
				name: "dispatch_classify",
				arguments: { prompt: "ultracode 做大规模迁移" },
			},
		},
	]
		.map((request) => JSON.stringify(request))
		.join("\n");

	const completed = spawnSync(
		process.execPath,
		["--experimental-strip-types", SCRIPT],
		{
			cwd: PLUGIN_ROOT,
			encoding: "utf8",
			input,
		},
	);

	assert.equal(completed.status, 0, completed.stderr);
	const responses = completed.stdout
		.trim()
		.split(/\r?\n/)
		.map((line) => JSON.parse(line));
	assert.equal(responses.length, 3);
	assert.equal(responses[0].result.serverInfo.name, "codex-augment-dispatcher");
	assert.ok(
		responses[1].result.tools.some(
			(tool: { name: string }) => tool.name === "workflow_create",
		),
	);
	assert.ok(
		responses[1].result.tools.some(
			(tool: { name: string }) => tool.name === "workflow_replan_propose",
		),
	);
	const classify = responses[2].result.structuredContent;
	assert.equal(classify.dynamic, true);
	assert.ok(classify.signals.includes("native-workflow-interop"));
	assert.ok(classify.requiredPlugins.includes("dynamic-workflow"));
});

test("MCP handler creates, approves, and verifies workflow artifacts", () => {
	const root = tempRoot();
	try {
		const createResponse = handleMcpRequest({
			jsonrpc: "2.0",
			id: "create",
			method: "tools/call",
			params: {
				name: "workflow_create",
				arguments: {
					root,
					id: "mcp-workflow",
					prompt:
						"Create a workflow script bridge for Claude Code dynamic workflows with verification.",
				},
			},
		});
		const createPayload = structuredContent(createResponse) as {
			dir: string;
			workflow: { id: string };
		};
		assert.equal(createPayload.workflow.id, "mcp-workflow");
		assert.ok(existsSync(path.join(createPayload.dir, "workflow.json")));

		for (const scope of ["execute", "release"] as const) {
			const approveResponse = handleMcpRequest({
				jsonrpc: "2.0",
				id: scope,
				method: "tools/call",
				params: {
					name: "workflow_approve",
					arguments: {
						workflowDir: createPayload.dir,
						scope,
						by: "unit-test",
					},
				},
			});
			assert.ok(approveResponse?.result);
		}

		const verifyResponse = handleMcpRequest({
			jsonrpc: "2.0",
			id: "verify",
			method: "tools/call",
			params: {
				name: "workflow_verify",
				arguments: {
					workflowDir: createPayload.dir,
					complete: false,
				},
			},
		});
		const verifyPayload = structuredContent(verifyResponse);
		assert.equal(verifyPayload.ok, true);
		assert.equal(verifyPayload.complete, false);

		const inventoryResponse = handleMcpRequest({
			jsonrpc: "2.0",
			id: "inventory",
			method: "tools/call",
			params: {
				name: "workflow_inventory",
				arguments: { workflowDir: createPayload.dir },
			},
		});
		const inventoryPayload = structuredContent(inventoryResponse);
		assert.ok(Array.isArray(inventoryPayload.skills));
		assert.ok(String(inventoryPayload.coreToolCategories).includes("subagent"));

		const launchResponse = handleMcpRequest({
			jsonrpc: "2.0",
			id: "launch",
			method: "tools/call",
			params: {
				name: "workflow_launch_packet",
				arguments: {
					workflowDir: createPayload.dir,
					harness: "grok",
				},
			},
		});
		const launchPayload = structuredContent(launchResponse) as Array<{
			command: string;
		}>;
		assert.ok(launchPayload.length > 0);
		assert.match(launchPayload[0].command, /executionSpec=/);
		assert.match(launchPayload[0].command, /refined-json-v1/);

		const replanResponse = handleMcpRequest({
			jsonrpc: "2.0",
			id: "replan",
			method: "tools/call",
			params: {
				name: "workflow_replan_propose",
				arguments: {
					workflowDir: createPayload.dir,
					reason: "MCP test recorded post-node adaptive judgment.",
					action: "continue",
				},
			},
		});
		const replanPayload = structuredContent(replanResponse) as {
			event: { action: string; status: string };
		};
		assert.equal(replanPayload.event.action, "continue");
		assert.equal(replanPayload.event.status, "applied");

		const refinedResponse = handleMcpRequest({
			jsonrpc: "2.0",
			id: "refined",
			method: "tools/call",
			params: {
				name: "workflow_refined_results",
				arguments: { workflowDir: createPayload.dir },
			},
		});
		const refinedPayload = structuredContent(refinedResponse);
		assert.deepEqual(refinedPayload, []);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("MCP handler exposes reliable workflow stage contract", () => {
	const response = handleMcpRequest({
		jsonrpc: "2.0",
		id: 1,
		method: "tools/call",
		params: {
			name: "reliable_stage_contract",
			arguments: { stage: "verification" },
		},
	});
	const payload = structuredContent(response);
	assert.equal(payload.stage, "verification");
	assert.match(String(payload.ownerBoundary), /Owner agent owns edits/);
	assert.ok((payload.artifacts as string[]).includes("verification-round-<N>.md"));
});
