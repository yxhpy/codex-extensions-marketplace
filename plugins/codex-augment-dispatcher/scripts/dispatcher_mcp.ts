#!/usr/bin/env -S node --experimental-strip-types
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
	approveWorkflow,
	createWorkflow,
	detectDynamicWorkflow,
	validateWorkflow,
} from "./dynamic_workflow.ts";

type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

type JsonRpcRequest = {
	jsonrpc?: string;
	id?: string | number | null;
	method?: string;
	params?: {
		name?: string;
		arguments?: Record<string, unknown>;
		[key: string]: unknown;
	};
};

type JsonRpcResponse = {
	jsonrpc: "2.0";
	id: string | number | null;
	result?: JsonValue;
	error?: { code: number; message: string };
};

export const MCP_TOOLS = [
	{
		name: "dispatch_classify",
		description:
			"Classify a raw prompt with codex-augment-dispatcher routing signals.",
		inputSchema: {
			type: "object",
			properties: {
				prompt: { type: "string" },
			},
			required: ["prompt"],
			additionalProperties: false,
		},
	},
	{
		name: "workflow_create",
		description:
			"Create a .agent-workflows artifact directory for a prompt.",
		inputSchema: {
			type: "object",
			properties: {
				prompt: { type: "string" },
				root: { type: "string" },
				id: { type: "string" },
				title: { type: "string" },
			},
			required: ["prompt"],
			additionalProperties: false,
		},
	},
	{
		name: "workflow_approve",
		description: "Grant a workflow approval scope.",
		inputSchema: {
			type: "object",
			properties: {
				workflowDir: { type: "string" },
				scope: { enum: ["plan", "execute", "release"] },
				by: { type: "string" },
				reason: { type: "string" },
			},
			required: ["workflowDir", "scope"],
			additionalProperties: false,
		},
	},
	{
		name: "workflow_verify",
		description: "Validate a workflow artifact directory.",
		inputSchema: {
			type: "object",
			properties: {
				workflowDir: { type: "string" },
				complete: { type: "boolean" },
			},
			required: ["workflowDir"],
			additionalProperties: false,
		},
	},
	{
		name: "reliable_stage_contract",
		description:
			"Return reliable-agent-workflow stage artifacts and owner verification boundaries.",
		inputSchema: {
			type: "object",
			properties: {
				stage: { type: "string" },
			},
			additionalProperties: false,
		},
	},
] as const;

export function handleMcpRequest(request: JsonRpcRequest): JsonRpcResponse | null {
	const id = request.id ?? null;
	try {
		if (!request.method) throw new Error("missing method");
		if (request.method === "notifications/initialized") return null;
		if (request.method === "initialize") {
			return ok(id, {
				protocolVersion: "2024-11-05",
				serverInfo: {
					name: "codex-augment-dispatcher",
					version: "0.1.17",
				},
				capabilities: { tools: {} },
			});
		}
		if (request.method === "tools/list") {
			return ok(id, { tools: MCP_TOOLS as unknown as JsonValue });
		}
		if (request.method === "tools/call") {
			return ok(id, callTool(request.params?.name || "", request.params?.arguments || {}));
		}
		throw Object.assign(new Error(`unknown method: ${request.method}`), {
			code: -32601,
		});
	} catch (error) {
		return {
			jsonrpc: "2.0",
			id,
			error: {
				code: Number((error as { code?: number }).code || -32000),
				message: (error as Error).message,
			},
		};
	}
}

function callTool(name: string, args: Record<string, unknown>): JsonValue {
	if (name === "dispatch_classify") {
		const detection = detectDynamicWorkflow(requiredString(args, "prompt"));
		return toolResult(detection as unknown as JsonValue);
	}
	if (name === "workflow_create") {
		const { dir, workflow } = createWorkflow({
			prompt: requiredString(args, "prompt"),
			root: optionalString(args, "root") || ".agent-workflows",
			id: optionalString(args, "id"),
			title: optionalString(args, "title"),
		});
		return toolResult({ dir, workflow } as unknown as JsonValue);
	}
	if (name === "workflow_approve") {
		const workflow = approveWorkflow({
			workflowDir: requiredString(args, "workflowDir"),
			scope: requiredScope(args, "scope"),
			by: optionalString(args, "by") || "dispatcher_mcp",
			reason: optionalString(args, "reason") || "Approved through MCP.",
		});
		return toolResult(workflow as unknown as JsonValue);
	}
	if (name === "workflow_verify") {
		const report = validateWorkflow(requiredString(args, "workflowDir"), {
			requireComplete: Boolean(args.complete),
		});
		return toolResult(report as unknown as JsonValue);
	}
	if (name === "reliable_stage_contract") {
		return toolResult(reliableContract(optionalString(args, "stage")) as JsonValue);
	}
	throw Object.assign(new Error(`unknown tool: ${name}`), { code: -32602 });
}

function reliableContract(stage?: string): Record<string, JsonValue> {
	const stages = [
		"requirements",
		"design",
		"design-review",
		"implementation",
		"review",
		"verification",
		"final-report",
	];
	return {
		stage: stage || "all",
		stages,
		artifacts: [
			"design.md",
			"design-review.md",
			"implementation-summary.md",
			"review-round-<N>-<role>.md",
			"merged-review-round-<N>.md",
			"verification-round-<N>.md",
			"final-report.md",
		],
		ownerBoundary:
			"Owner agent owns edits, integration, tests, release decisions, and final claims.",
		verification:
			"Finish only after zero open issues and independent VERDICT: PASS evidence.",
	};
}

function toolResult(payload: JsonValue): JsonValue {
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(payload, null, 2),
			},
		],
		structuredContent: payload,
	};
}

function requiredString(args: Record<string, unknown>, key: string): string {
	const value = args[key];
	if (typeof value !== "string" || !value.trim()) {
		throw Object.assign(new Error(`${key} must be a non-empty string`), {
			code: -32602,
		});
	}
	return value;
}

function optionalString(
	args: Record<string, unknown>,
	key: string,
): string | undefined {
	const value = args[key];
	return typeof value === "string" && value.trim() ? value : undefined;
}

function requiredScope(
	args: Record<string, unknown>,
	key: string,
): "plan" | "execute" | "release" {
	const value = args[key];
	if (value === "plan" || value === "execute" || value === "release") {
		return value;
	}
	throw Object.assign(new Error(`${key} must be plan, execute, or release`), {
		code: -32602,
	});
}

function ok(id: string | number | null, result: JsonValue): JsonRpcResponse {
	return { jsonrpc: "2.0", id, result };
}

export function main(): number {
	const input = readFileSync(0, "utf8");
	for (const line of input.split(/\r?\n/)) {
		if (!line.trim()) continue;
		const response = handleMcpRequest(JSON.parse(line) as JsonRpcRequest);
		if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
	}
	return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
}
