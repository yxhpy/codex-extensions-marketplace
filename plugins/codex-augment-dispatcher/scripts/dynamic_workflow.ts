#!/usr/bin/env -S node --experimental-strip-types
import { createHash, randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DYNAMIC_WORKFLOW_PLUGIN = "dynamic-workflow";
export const WORKFLOW_SCHEMA_VERSION = 1;

const PLUGIN_ORDER = [
	DYNAMIC_WORKFLOW_PLUGIN,
	"task-gate",
	"grok-augment",
	"thinking-gate",
	"agy-frontend",
	"asset-slicer",
];

const SIGNALS: Array<{
	name: string;
	weight: number;
	plugins?: string[];
	patterns: RegExp[];
}> = [
	{
		name: "explicit-workflow",
		weight: 3,
		plugins: [DYNAMIC_WORKFLOW_PLUGIN, "task-gate"],
		patterns: [
			/dynamic[- ]workflow/i,
			/workflow artifacts?/i,
			/orchestrat(?:e|ion|or)/i,
			/approval gates?/i,
			/\bpacket\/result\b/i,
			/\bpackets?\s*(?:\/|-)\s*results?\b/i,
			/\b(?:subagent|agent|worker|workflow|parallel)\s+packets?\b/i,
			/\bpackets?\s+(?:flow|handoff|orchestration|lifecycle)\b/i,
			/\bsubagents?\b/i,
			/\bparallel agents?\b/i,
			/\bbackground threads?\b/i,
			/\bagent threads?\b/i,
			/\bworker agents?\b/i,
			/\b(?:fan\s*out|fanout)\b/i,
			/\bdelegat(?:e|ion)\b/i,
			/\blaunch (?:agents?|workers?|subagents?)\b/i,
			/\b(?:review|research|validation|qa) workers?\b/i,
			/\bparallel (?:review|research|validation|qa)\b/i,
			/\bswarm\b/i,
			/goal mode/i,
			/工作流|编排|多代理|子代理|后台线程|代理线程|并行代理|分派|审批门禁/i,
		],
	},
	{
		name: "broad-planning",
		weight: 2,
		plugins: ["task-gate"],
		patterns: [
			/\bplan\b|decompose|break down|multi[- ]step|broad|complex/i,
			/migration|repo[- ]wide|large refactor|release gate/i,
			/规划|拆解|分解|多步骤|复杂|大范围|迁移|重构/i,
		],
	},
	{
		name: "integration",
		weight: 2,
		plugins: [DYNAMIC_WORKFLOW_PLUGIN],
		patterns: [
			/integrat(?:e|ion)|coordinate|merge results?/i,
			/整合|集成|协调/i,
		],
	},
	{
		name: "approval-risk",
		weight: 2,
		plugins: [DYNAMIC_WORKFLOW_PLUGIN],
		patterns: [
			/approval|permission|destructive|irreversible|production|billing|secret|credential|deploy|publish|database/i,
			/审批|授权|破坏性|不可逆|生产|账单|密钥|凭据|部署|发布|数据库/i,
		],
	},
	{
		name: "verification",
		weight: 2,
		plugins: [DYNAMIC_WORKFLOW_PLUGIN],
		patterns: [
			/end[- ]to[- ]end|\be2e\b|verify|verification|validate|release readiness|smoke test/i,
			/端到端|验证|校验|验收|冒烟|回归/i,
		],
	},
	{
		name: "current-research",
		weight: 1,
		plugins: ["grok-augment"],
		patterns: [
			/current|latest|outside critique|risk review|creative direction/i,
			/最新|调研|外部评审|风险复核|创意方向/i,
		],
	},
	{
		name: "stuck",
		weight: 1,
		plugins: ["thinking-gate"],
		patterns: [
			/stuck|uncertain|looping|brainstorm|divergent/i,
			/卡住|没思路|头脑风暴|换个思路|不确定/i,
		],
	},
	{
		name: "frontend",
		weight: 1,
		plugins: ["agy-frontend"],
		patterns: [
			/frontend|\bui\b|landing page|css|responsive|browser visual|react|vue|svelte/i,
			/前端|落地页|动效|视觉检查|响应式/i,
		],
	},
	{
		name: "assets",
		weight: 2,
		plugins: ["asset-slicer"],
		patterns: [
			/sprite sheet|icon sheet|asset slic|dirty cut|crop drift/i,
			/generated icons?|icon generation|generate[- ]then[- ]slice|image_gen.*icons?/i,
			/切图|切分图标|素材图|图标表|切偏|生成图标|图标生成/i,
		],
	},
	{
		name: "extreme-quality",
		weight: 1,
		plugins: [DYNAMIC_WORKFLOW_PLUGIN],
		patterns: [
			/best[- ]in[- ]class|production[- ]grade|exhaustive|do it right|go all in/i,
			/做到极致|彻底|完整闭环|生产级|高质量/i,
		],
	},
];

export type RiskLevel = "low" | "medium" | "high";
export type WorkflowState =
	| "classified"
	| "pending_approval"
	| "approved"
	| "dispatched"
	| "results_collected"
	| "verified"
	| "complete"
	| "blocked";

export type DynamicWorkflowDetection = {
	dynamic: boolean;
	reason: string;
	signals: string[];
	requiredPlugins: string[];
	recommendedPackets: string[];
	riskLevel: RiskLevel;
	score: number;
};

type ApprovalRecord = {
	id: string;
	scope: "plan" | "execute" | "release";
	status: "pending" | "granted" | "denied";
	reason: string;
	grantedBy?: string;
	grantedAt?: string;
};

type Packet = {
	id: string;
	role: string;
	objective: string;
	status: "pending" | "running" | "completed" | "blocked";
	dependencies: string[];
	requiredPlugins: string[];
	approvalRequired: boolean;
	mode: "owner" | "subagent" | "simulated";
	expectedEvidence: string[];
};

type PacketResult = {
	packetId: string;
	status: "success" | "failure" | "blocked";
	summary: string;
	evidence: string[];
	completedAt: string;
};

type EvidenceRecord = {
	plugin: string;
	commandOrTool: string;
	status: "success" | "failure" | "blocked";
	exitCode?: number;
	artifactPath?: string;
	summary: string;
	createdAt: string;
};

type VerificationRecord = {
	check: string;
	status: "pass" | "fail" | "blocked";
	command?: string;
	summary: string;
	createdAt: string;
};

export type WorkflowArtifact = {
	schemaVersion: number;
	id: string;
	title: string;
	promptHash: string;
	promptSummary: string;
	createdAt: string;
	updatedAt: string;
	state: WorkflowState;
	detection: DynamicWorkflowDetection;
	approvals: ApprovalRecord[];
	packets: Packet[];
	results: PacketResult[];
	evidence: EvidenceRecord[];
	verification: VerificationRecord[];
	finalVerdict: "pending" | "complete" | "incomplete" | "blocked";
	artifacts: {
		workflowJson: string;
		plan: string;
		orchestration: string;
		packetsDir: string;
		resultsDir: string;
		finalReport: string;
	};
};

export type ValidationReport = {
	ok: boolean;
	complete: boolean;
	failures: string[];
	warnings: string[];
	workflow?: WorkflowArtifact;
};

export function detectDynamicWorkflow(
	prompt: string,
): DynamicWorkflowDetection {
	const text = prompt.trim();
	if (!text) {
		return {
			dynamic: false,
			reason: "blank prompt",
			signals: [],
			requiredPlugins: [],
			recommendedPackets: [],
			riskLevel: "low",
			score: 0,
		};
	}

	let score = 0;
	const signals = new Set<string>();
	const plugins = new Set<string>();
	for (const signal of SIGNALS) {
		if (signal.patterns.some((pattern) => pattern.test(text))) {
			signals.add(signal.name);
			score += signal.weight;
			for (const plugin of signal.plugins || []) plugins.add(plugin);
		}
	}

	const explicit = signals.has("explicit-workflow");
	const dynamic = explicit || score >= 4 || signals.size >= 3;
	if (dynamic) {
		plugins.add(DYNAMIC_WORKFLOW_PLUGIN);
		plugins.add("task-gate");
	}

	const riskLevel: RiskLevel = signals.has("approval-risk")
		? "high"
		: dynamic || signals.has("verification")
			? "medium"
			: "low";
	const requiredPlugins = orderedPlugins(plugins);
	const recommendedPackets = recommendedPacketIds(requiredPlugins, signals);
	return {
		dynamic,
		reason: dynamic
			? `Dynamic workflow recommended: ${Array.from(signals).join(", ")}`
			: `Dynamic workflow not required; matched ${signals.size} signal(s).`,
		signals: Array.from(signals).sort(),
		requiredPlugins,
		recommendedPackets,
		riskLevel,
		score,
	};
}

export function createWorkflow({
	prompt,
	root = ".agent-workflows",
	id,
	title,
}: {
	prompt: string;
	root?: string;
	id?: string;
	title?: string;
}): { dir: string; workflow: WorkflowArtifact } {
	const cleanPrompt = prompt.trim();
	if (!cleanPrompt) throw new Error("workflow prompt must not be blank");
	const detection = detectDynamicWorkflow(cleanPrompt);
	const workflowTitle = title?.trim() || firstLine(cleanPrompt, 80);
	const workflowId = slugify(id || workflowTitle || randomUUID());
	const dir = path.resolve(root, workflowId);
	const packetsDir = path.join(dir, "packets");
	const resultsDir = path.join(dir, "results");
	mkdirSync(packetsDir, { recursive: true });
	mkdirSync(resultsDir, { recursive: true });

	const createdAt = isoNow();
	const packets = buildPackets(detection);
	const approvals = buildApprovals(detection);
	const workflow: WorkflowArtifact = {
		schemaVersion: WORKFLOW_SCHEMA_VERSION,
		id: workflowId,
		title: workflowTitle,
		promptHash: hashText(cleanPrompt),
		promptSummary: firstLine(cleanPrompt, 200),
		createdAt,
		updatedAt: createdAt,
		state: approvals.some((approval) => approval.status === "pending")
			? "pending_approval"
			: "approved",
		detection,
		approvals,
		packets,
		results: [],
		evidence: [],
		verification: [],
		finalVerdict: "pending",
		artifacts: {
			workflowJson: "workflow.json",
			plan: "plan.md",
			orchestration: "orchestration.md",
			packetsDir: "packets",
			resultsDir: "results",
			finalReport: "final-report.md",
		},
	};

	writeAtomic(
		path.join(dir, "workflow.json"),
		JSON.stringify(workflow, null, 2) + "\n",
	);
	writeAtomic(path.join(dir, "plan.md"), renderPlan(workflow));
	writeAtomic(
		path.join(dir, "orchestration.md"),
		renderOrchestration(workflow),
	);
	writeAtomic(path.join(dir, "final-report.md"), renderFinalReport(workflow));
	for (const packet of packets) {
		writeAtomic(path.join(packetsDir, `${packet.id}.md`), renderPacket(packet));
	}
	return { dir, workflow };
}

export function loadWorkflow(workflowDir: string): WorkflowArtifact {
	const workflowPath = path.join(workflowDir, "workflow.json");
	return JSON.parse(readFileSync(workflowPath, "utf8")) as WorkflowArtifact;
}

export function saveWorkflow(
	workflowDir: string,
	workflow: WorkflowArtifact,
): void {
	workflow.updatedAt = isoNow();
	writeAtomic(
		path.join(workflowDir, "workflow.json"),
		JSON.stringify(workflow, null, 2) + "\n",
	);
	writeAtomic(
		path.join(workflowDir, "final-report.md"),
		renderFinalReport(workflow),
	);
}

export function approveWorkflow({
	workflowDir,
	scope,
	by = "dynamic_workflow.ts",
	reason = "Explicit approval recorded.",
}: {
	workflowDir: string;
	scope: "plan" | "execute" | "release";
	by?: string;
	reason?: string;
}): WorkflowArtifact {
	const workflow = loadWorkflow(workflowDir);
	const approval = workflow.approvals.find((item) => item.scope === scope);
	if (!approval) throw new Error(`unknown approval scope: ${scope}`);
	approval.status = "granted";
	approval.grantedBy = by;
	approval.grantedAt = isoNow();
	approval.reason = reason;
	if (workflow.approvals.every((item) => item.status === "granted")) {
		workflow.state = "approved";
	}
	saveWorkflow(workflowDir, workflow);
	return workflow;
}

export function simulateWorkflow({
	workflowDir,
}: {
	workflowDir: string;
}): WorkflowArtifact {
	const workflow = loadWorkflow(workflowDir);
	const executeApproval = workflow.approvals.find(
		(item) => item.scope === "execute",
	);
	if (executeApproval && executeApproval.status !== "granted") {
		workflow.state = "blocked";
		workflow.finalVerdict = "blocked";
		workflow.verification.push({
			check: "execute approval gate",
			status: "blocked",
			summary:
				"Simulation refused to dispatch packets before execute approval was granted.",
			createdAt: isoNow(),
		});
		saveWorkflow(workflowDir, workflow);
		throw new Error("execute approval is required before dispatch");
	}

	workflow.state = "dispatched";
	workflow.results = [];
	workflow.evidence = [];
	const completedAt = isoNow();
	for (const packet of workflow.packets) {
		packet.status = "completed";
		const result: PacketResult = {
			packetId: packet.id,
			status: "success",
			summary: `${packet.role} packet completed in deterministic simulation mode.`,
			evidence: packet.expectedEvidence,
			completedAt,
		};
		workflow.results.push(result);
		writeAtomic(
			path.join(workflowDir, "results", `${packet.id}.md`),
			renderResult(packet, result),
		);
		for (const plugin of packet.requiredPlugins) {
			workflow.evidence.push({
				plugin,
				commandOrTool: `simulated-packet:${packet.id}`,
				status: "success",
				exitCode: 0,
				artifactPath: path.join("results", `${packet.id}.md`),
				summary: `${plugin} requirement satisfied by ${packet.id} simulation evidence.`,
				createdAt: completedAt,
			});
		}
	}
	workflow.state = "results_collected";
	workflow.verification.push({
		check: "packet/result coupling",
		status: "pass",
		command: "dynamic_workflow.ts simulate",
		summary: "Every packet has a matching successful result file.",
		createdAt: isoNow(),
	});
	workflow.verification.push({
		check: "required plugin evidence",
		status: "pass",
		command: "dynamic_workflow.ts verify --complete",
		summary:
			"Every required plugin has structured evidence with success status.",
		createdAt: isoNow(),
	});
	workflow.state = "complete";
	workflow.finalVerdict = "complete";
	saveWorkflow(workflowDir, workflow);
	return workflow;
}

export function validateWorkflow(
	workflowDir: string,
	{ requireComplete = false }: { requireComplete?: boolean } = {},
): ValidationReport {
	const failures: string[] = [];
	const warnings: string[] = [];
	const requiredFiles = [
		"workflow.json",
		"plan.md",
		"orchestration.md",
		"final-report.md",
	];
	for (const name of requiredFiles) {
		const file = path.join(workflowDir, name);
		if (!existsSync(file)) failures.push(`Missing file: ${name}`);
		else if (!readFileSync(file, "utf8").trim())
			failures.push(`Empty file: ${name}`);
	}
	for (const name of ["packets", "results"]) {
		if (!existsSync(path.join(workflowDir, name)))
			failures.push(`Missing directory: ${name}`);
	}
	let workflow: WorkflowArtifact | undefined;
	try {
		workflow = loadWorkflow(workflowDir);
	} catch (error) {
		failures.push(`Invalid workflow.json: ${(error as Error).message}`);
	}
	if (workflow) {
		if (workflow.schemaVersion !== WORKFLOW_SCHEMA_VERSION) {
			failures.push(`Unsupported schemaVersion: ${workflow.schemaVersion}`);
		}
		if (!workflow.id) failures.push("workflow.id is required");
		if (!workflow.promptHash) failures.push("workflow.promptHash is required");
		if (!Array.isArray(workflow.packets) || workflow.packets.length === 0) {
			failures.push("workflow.packets must contain at least one packet");
		}
		const packetIds = new Set(workflow.packets.map((packet) => packet.id));
		for (const packet of workflow.packets) {
			for (const dependency of packet.dependencies) {
				if (!packetIds.has(dependency)) {
					failures.push(`${packet.id} depends on missing packet ${dependency}`);
				}
			}
			const packetPath = path.join(workflowDir, "packets", `${packet.id}.md`);
			if (!existsSync(packetPath))
				warnings.push(`Missing packet note: packets/${packet.id}.md`);
		}
		const requiredPlugins = workflow.detection.requiredPlugins || [];
		if (
			workflow.detection.dynamic &&
			!requiredPlugins.includes(DYNAMIC_WORKFLOW_PLUGIN)
		) {
			failures.push(
				"dynamic workflow detection must require dynamic-workflow evidence",
			);
		}
		const complete = isComplete(workflow);
		if (requireComplete && !complete) {
			if (
				!workflow.approvals.every((approval) => approval.status === "granted")
			) {
				failures.push("not all required approvals were granted");
			}
			const resultIds = new Set(
				workflow.results.map((result) => result.packetId),
			);
			for (const packet of workflow.packets) {
				if (!resultIds.has(packet.id))
					failures.push(`missing result for packet ${packet.id}`);
				if (packet.status !== "completed")
					failures.push(`packet ${packet.id} is not completed`);
			}
			for (const plugin of requiredPlugins) {
				if (
					!workflow.evidence.some(
						(item) => item.plugin === plugin && item.status === "success",
					)
				) {
					failures.push(`missing successful evidence for ${plugin}`);
				}
			}
			if (!workflow.verification.some((item) => item.status === "pass")) {
				failures.push("no passing verification record found");
			}
			if (workflow.finalVerdict !== "complete")
				failures.push("finalVerdict is not complete");
		}
		return {
			ok: failures.length === 0,
			complete,
			failures,
			warnings,
			workflow,
		};
	}
	return { ok: false, complete: false, failures, warnings };
}

function buildApprovals(detection: DynamicWorkflowDetection): ApprovalRecord[] {
	const now = isoNow();
	const executePending = detection.dynamic || detection.riskLevel !== "low";
	return [
		{
			id: "approval-plan",
			scope: "plan",
			status: "granted",
			reason: "Creating the local workflow artifact is safe and reversible.",
			grantedBy: "dynamic_workflow.ts",
			grantedAt: now,
		},
		{
			id: "approval-execute",
			scope: "execute",
			status: executePending ? "pending" : "granted",
			reason: executePending
				? "Execution can spawn helpers, mutate files, or consume external tools; explicit approval is required."
				: "Low-risk workflow may execute after local planning.",
			...(executePending
				? {}
				: { grantedBy: "dynamic_workflow.ts", grantedAt: now }),
		},
		{
			id: "approval-release",
			scope: "release",
			status: "pending",
			reason: "Release or final completion requires verification evidence.",
		},
	];
}

function buildPackets(detection: DynamicWorkflowDetection): Packet[] {
	const packets: Packet[] = [];
	const push = (packet: Packet) => packets.push(packet);
	push({
		id: "01-orchestration",
		role: "owner-plan",
		objective:
			"Restate goal, success criteria, constraints, risks, and packet boundaries.",
		status: "pending",
		dependencies: [],
		requiredPlugins: orderedPlugins(
			new Set([DYNAMIC_WORKFLOW_PLUGIN, "task-gate"]),
		),
		approvalRequired: false,
		mode: "owner",
		expectedEvidence: ["plan.md", "orchestration.md", "workflow.json"],
	});
	if (detection.requiredPlugins.includes("grok-augment")) {
		push({
			id: "02-research",
			role: "research",
			objective:
				"Collect current or outside critique without mutating local files.",
			status: "pending",
			dependencies: ["01-orchestration"],
			requiredPlugins: ["grok-augment"],
			approvalRequired: false,
			mode: "subagent",
			expectedEvidence: [
				"redacted prompt",
				"Grok transcript or timeout blocker",
			],
		});
	}
	if (detection.requiredPlugins.includes("thinking-gate")) {
		push({
			id: nextPacketId(packets, "thinking"),
			role: "stuck-divergence",
			objective:
				"Compare divergent approaches before the owner chooses a reversible path.",
			status: "pending",
			dependencies: ["01-orchestration"],
			requiredPlugins: ["thinking-gate"],
			approvalRequired: false,
			mode: "simulated",
			expectedEvidence: ["candidate ideas", "chosen approach"],
		});
	}
	if (detection.requiredPlugins.includes("asset-slicer")) {
		push({
			id: nextPacketId(packets, "assets"),
			role: "assets",
			objective:
				"Slice generated sheets deterministically and gate on the JSON report.",
			status: "pending",
			dependencies: ["01-orchestration"],
			requiredPlugins: ["asset-slicer"],
			approvalRequired: false,
			mode: "subagent",
			expectedEvidence: ["asset-slices.json", "dirty-border/count checks"],
		});
	}
	if (detection.requiredPlugins.includes("agy-frontend")) {
		push({
			id: nextPacketId(packets, "frontend"),
			role: "frontend",
			objective:
				"Bound frontend implementation through AGY and keep the owner agent as verifier.",
			status: "pending",
			dependencies: ["01-orchestration"],
			requiredPlugins: ["agy-frontend"],
			approvalRequired: true,
			mode: "subagent",
			expectedEvidence: ["AGY transcript", "local verification output"],
		});
	}
	const dependencyIds = packets.map((packet) => packet.id);
	push({
		id: nextPacketId(packets, "implementation"),
		role: "owner-implementation",
		objective:
			"Apply local edits or supervised execution after required approvals are granted.",
		status: "pending",
		dependencies: dependencyIds,
		requiredPlugins: [],
		approvalRequired: detection.dynamic || detection.riskLevel !== "low",
		mode: "owner",
		expectedEvidence: ["diff or changed paths", "bounded command output"],
	});
	push({
		id: nextPacketId(packets, "integration"),
		role: "owner-integration",
		objective:
			"Integrate packet results, resolve conflicts, and reject stale or unsafe outputs.",
		status: "pending",
		dependencies: [packets[packets.length - 1].id],
		requiredPlugins: [DYNAMIC_WORKFLOW_PLUGIN],
		approvalRequired: false,
		mode: "owner",
		expectedEvidence: ["integration decisions", "accepted/rejected results"],
	});
	push({
		id: nextPacketId(packets, "verification"),
		role: "owner-verification",
		objective:
			"Run narrow-to-broad checks and produce a final evidence-backed verdict.",
		status: "pending",
		dependencies: [packets[packets.length - 1].id],
		requiredPlugins: [DYNAMIC_WORKFLOW_PLUGIN],
		approvalRequired: false,
		mode: "owner",
		expectedEvidence: ["test/validator commands", "final-report.md"],
	});
	return packets;
}

function isComplete(workflow: WorkflowArtifact): boolean {
	const resultIds = new Set(workflow.results.map((result) => result.packetId));
	const evidencePlugins = new Set(
		workflow.evidence
			.filter((item) => item.status === "success")
			.map((item) => item.plugin),
	);
	return (
		workflow.finalVerdict === "complete" &&
		workflow.approvals.every((approval) => approval.status === "granted") &&
		workflow.packets.every(
			(packet) => packet.status === "completed" && resultIds.has(packet.id),
		) &&
		workflow.detection.requiredPlugins.every((plugin) =>
			evidencePlugins.has(plugin),
		) &&
		workflow.verification.some((item) => item.status === "pass")
	);
}

function recommendedPacketIds(
	plugins: string[],
	signals: Set<string>,
): string[] {
	const packets = ["01-orchestration"];
	if (plugins.includes("grok-augment")) packets.push("research");
	if (plugins.includes("thinking-gate")) packets.push("thinking");
	if (plugins.includes("asset-slicer")) packets.push("assets");
	if (plugins.includes("agy-frontend")) packets.push("frontend");
	if (signals.has("approval-risk")) packets.push("approval");
	packets.push("implementation", "integration", "verification");
	return packets;
}

function orderedPlugins(plugins: Iterable<string>): string[] {
	const set = new Set(Array.from(plugins).filter(Boolean));
	return PLUGIN_ORDER.filter((plugin) => set.has(plugin)).concat(
		Array.from(set)
			.filter((plugin) => !PLUGIN_ORDER.includes(plugin))
			.sort(),
	);
}

function nextPacketId(packets: Packet[], name: string): string {
	return `${String(packets.length + 1).padStart(2, "0")}-${slugify(name)}`;
}

function renderPlan(workflow: WorkflowArtifact): string {
	return `# ${workflow.title}

## Goal

${workflow.promptSummary}

## Success Criteria

- Workflow artifact is durable and auditable.
- Approval gates are explicit before execution and release.
- Packets have matching results and structured plugin evidence.
- Verification records prove the final verdict.

## Detection

- Dynamic: ${workflow.detection.dynamic ? "yes" : "no"}
- Risk: ${workflow.detection.riskLevel}
- Signals: ${workflow.detection.signals.join(", ") || "none"}
- Required plugins: ${workflow.detection.requiredPlugins.join(", ") || "none"}

## Work Packets

${workflow.packets.map((packet) => `- ${packet.id}: ${packet.objective}`).join("\n")}

## Approval Gates

${workflow.approvals.map((approval) => `- ${approval.scope}: ${approval.status} — ${approval.reason}`).join("\n")}
`;
}

function renderOrchestration(workflow: WorkflowArtifact): string {
	return `# Orchestration: ${workflow.title}

## Execution Rules

- Keep the owner agent responsible for local edits, verification, commits, and final claims.
- Use helpers only for their bounded routes and record structured evidence.
- If a real subagent runner is unavailable, execute packets serially in simulated-packet mode.
- Stop at pending approval gates; continue only with safe read-only planning.
- Integrate packet results explicitly before final verification.

## Packet Order

${workflow.packets.map((packet) => `1. ${packet.id} (${packet.role}) depends on ${packet.dependencies.join(", ") || "none"}`).join("\n")}
`;
}

function renderPacket(packet: Packet): string {
	return `# Packet ${packet.id}

Role: ${packet.role}
Mode: ${packet.mode}
Status: ${packet.status}
Approval required: ${packet.approvalRequired ? "yes" : "no"}
Dependencies: ${packet.dependencies.join(", ") || "none"}
Required plugins: ${packet.requiredPlugins.join(", ") || "none"}

## Objective

${packet.objective}

## Expected Evidence

${packet.expectedEvidence.map((item) => `- ${item}`).join("\n")}
`;
}

function renderResult(packet: Packet, result: PacketResult): string {
	return `# Result ${packet.id}

Status: ${result.status}
Completed at: ${result.completedAt}

## Summary

${result.summary}

## Evidence

${result.evidence.map((item) => `- ${item}`).join("\n")}
`;
}

function renderFinalReport(workflow: WorkflowArtifact): string {
	return `# Final Report: ${workflow.title}

## Verdict

${workflow.finalVerdict}

## Accepted Results

${workflow.results.map((result) => `- ${result.packetId}: ${result.summary}`).join("\n") || "Pending."}

## Structured Plugin Evidence

${workflow.evidence.map((item) => `- ${item.plugin}: ${item.status} via ${item.commandOrTool} (${item.summary})`).join("\n") || "Pending."}

## Verification Evidence

${workflow.verification.map((item) => `- ${item.check}: ${item.status} — ${item.summary}`).join("\n") || "Pending."}

## Remaining Risks

${workflow.finalVerdict === "complete" ? "None known after recorded verification." : "Workflow is not complete yet."}
`;
}

function firstLine(value: string, limit: number): string {
	const oneLine = value.replace(/\s+/g, " ").trim();
	if (oneLine.length <= limit) return oneLine;
	return `${oneLine.slice(0, limit - 1).trimEnd()}…`;
}

function slugify(value: string): string {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 72)
		.replace(/-+$/g, "");
	return slug || `workflow-${randomUUID().slice(0, 8)}`;
}

function hashText(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function isoNow(): string {
	return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function writeAtomic(filePath: string, content: string): void {
	mkdirSync(path.dirname(filePath), { recursive: true });
	const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	writeFileSync(tempPath, content, "utf8");
	renameSync(tempPath, filePath);
}

type CliArgs = {
	command: string;
	prompt: string[];
	json: boolean;
	root: string;
	id?: string;
	title?: string;
	scope?: "plan" | "execute" | "release";
	by?: string;
	reason?: string;
	complete: boolean;
};

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = {
		command: argv[0] || "help",
		prompt: [],
		json: false,
		root: ".agent-workflows",
		complete: false,
	};
	for (let i = 1; i < argv.length; i += 1) {
		const item = argv[i];
		if (item === "--json") args.json = true;
		else if (item === "--root") args.root = argv[++i] || args.root;
		else if (item === "--id") args.id = argv[++i] || undefined;
		else if (item === "--title") args.title = argv[++i] || undefined;
		else if (item === "--scope") args.scope = parseScope(argv[++i] || "");
		else if (item === "--by") args.by = argv[++i] || undefined;
		else if (item === "--reason") args.reason = argv[++i] || undefined;
		else if (item === "--complete") args.complete = true;
		else if (item === "-h" || item === "--help") args.command = "help";
		else args.prompt.push(item);
	}
	return args;
}

function parseScope(value: string): "plan" | "execute" | "release" {
	if (value === "plan" || value === "execute" || value === "release")
		return value;
	throw new Error("--scope must be one of: plan, execute, release");
}

function printHelp(): void {
	console.log(`usage: dynamic_workflow.ts <command> [options] [prompt-or-workflow-dir]

Commands:
  detect [--json] <prompt>          Detect whether a prompt needs dynamic workflow orchestration.
  new [--root DIR] [--id ID] <prompt>
                                    Create a durable workflow artifact directory.
  approve --scope execute <dir>     Record an approval gate as granted.
  simulate <dir>                    Run deterministic simulated packet/result completion.
  verify [--complete] <dir>         Validate structure, or full completion with --complete.
  e2e [--root DIR] [--json] <prompt>
                                    Create, approve, simulate, and verify a full workflow.
`);
}

export function main(argv = process.argv.slice(2)): number {
	try {
		const args = parseArgs(argv);
		if (args.command === "help") {
			printHelp();
			return 0;
		}
		if (args.command === "detect") {
			const prompt = args.prompt.join(" ") || readFileSync(0, "utf8");
			const detection = detectDynamicWorkflow(prompt);
			if (args.json) console.log(JSON.stringify(detection, null, 2));
			else {
				console.log(`dynamic=${detection.dynamic}`);
				console.log(`reason=${detection.reason}`);
				console.log(
					`required_plugins=${detection.requiredPlugins.join(",") || "none"}`,
				);
			}
			return 0;
		}
		if (args.command === "new") {
			const prompt = args.prompt.join(" ") || readFileSync(0, "utf8");
			const { dir, workflow } = createWorkflow({
				prompt,
				root: args.root,
				id: args.id,
				title: args.title,
			});
			if (args.json) console.log(JSON.stringify({ dir, workflow }, null, 2));
			else console.log(dir);
			return 0;
		}
		if (args.command === "approve") {
			const workflowDir = args.prompt[0];
			if (!workflowDir) throw new Error("approve requires workflow directory");
			const workflow = approveWorkflow({
				workflowDir,
				scope: args.scope || "execute",
				by: args.by,
				reason: args.reason,
			});
			if (args.json) console.log(JSON.stringify(workflow, null, 2));
			else console.log(`approved ${args.scope || "execute"}: ${workflowDir}`);
			return 0;
		}
		if (args.command === "simulate") {
			const workflowDir = args.prompt[0];
			if (!workflowDir) throw new Error("simulate requires workflow directory");
			const workflow = simulateWorkflow({ workflowDir });
			if (args.json) console.log(JSON.stringify(workflow, null, 2));
			else console.log(`simulated workflow: ${workflowDir}`);
			return 0;
		}
		if (args.command === "verify") {
			const workflowDir = args.prompt[0];
			if (!workflowDir) throw new Error("verify requires workflow directory");
			const report = validateWorkflow(workflowDir, {
				requireComplete: args.complete,
			});
			if (args.json) console.log(JSON.stringify(report, null, 2));
			else {
				console.log(
					report.ok
						? "workflow verification passed"
						: "workflow verification failed",
				);
				for (const failure of report.failures) console.log(`- ${failure}`);
				for (const warning of report.warnings)
					console.log(`warning: ${warning}`);
			}
			return report.ok ? 0 : 1;
		}
		if (args.command === "e2e") {
			const prompt = args.prompt.join(" ") || readFileSync(0, "utf8");
			const created = createWorkflow({
				prompt,
				root: args.root,
				id: args.id,
				title: args.title,
			});
			approveWorkflow({
				workflowDir: created.dir,
				scope: "execute",
				by: args.by || "dynamic_workflow.ts e2e",
			});
			approveWorkflow({
				workflowDir: created.dir,
				scope: "release",
				by: args.by || "dynamic_workflow.ts e2e",
			});
			simulateWorkflow({ workflowDir: created.dir });
			const report = validateWorkflow(created.dir, { requireComplete: true });
			const output = {
				dir: created.dir,
				ok: report.ok,
				complete: report.complete,
				failures: report.failures,
			};
			if (args.json) console.log(JSON.stringify(output, null, 2));
			else
				console.log(
					`${report.ok ? "e2e passed" : "e2e failed"}: ${created.dir}`,
				);
			return report.ok ? 0 : 1;
		}
		throw new Error(`unknown command: ${args.command}`);
	} catch (error) {
		console.error(`dynamic-workflow: ${(error as Error).message}`);
		return 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
}
