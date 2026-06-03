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
export const WORKFLOW_SCHEMA_VERSION = 2;

const PLUGIN_ORDER = [
	DYNAMIC_WORKFLOW_PLUGIN,
	"reliable-agent-workflow",
	"task-gate",
	"grok-augment",
	"thinking-gate",
	"ui-ux-closed-loop",
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
		name: "reliable-delivery",
		weight: 3,
		plugins: [
			DYNAMIC_WORKFLOW_PLUGIN,
			"reliable-agent-workflow",
			"task-gate",
		],
		patterns: [
			/reliable-agent-workflow/i,
			/reliable (?:agent )?(?:workflow|delivery|engineering)/i,
			/design[- ]review[- ]implement|implementation review/i,
			/zero[- ]open[- ]issues?|zero issues?/i,
			/best[- ]of[- ]n|check[- ]work|repair[- ]until/i,
			/deep analysis|deep optimization|optimization plan|architecture analysis|code audit/i,
			/深度分析|深度优化|优化方案|架构分析|代码审计|质量门禁|发布准备|交付闭环|零开放问题/i,
		],
	},
	{
		name: "skill-optimization",
		weight: 4,
		plugins: [
			DYNAMIC_WORKFLOW_PLUGIN,
			"reliable-agent-workflow",
			"task-gate",
		],
		patterns: [
			/SkillOpt/i,
			/self[- ]evolving agent skills?/i,
			/\bskill\s*(?:optimization|optimisation|optimizer|training|tuning)\b/i,
			/optimi[sz]e\s+(?:this\s+|the\s+)?(?:agent\s+)?skills?\b/i,
			/最大化优化\s*skills?|优化\s*skills?|优化\s*技能|技能优化|训练\s*skills?|训练\s*技能/i,
		],
	},
	{
		name: "ui-ux-closed-loop",
		weight: 3,
		plugins: [
			DYNAMIC_WORKFLOW_PLUGIN,
			"task-gate",
			"ui-ux-closed-loop",
			"agy-frontend",
		],
		patterns: [
			/ui\/ux|ux\/ui|visual product|product[- ]to[- ]ui/i,
			/closed[- ]loop.*(?:ui|ux|design)|(?:ui|ux|design).*closed[- ]loop/i,
			/requirements?.*(?:prototype|wireframe).*(?:ui|ux|frontend)/i,
			/low[- ]fi(?:delity)?|wireframes?|prototype.*polished/i,
			/design system.*(?:frontend|ui|ux)|polished (?:ui|ux|interface)/i,
			/页面需求.*产品思维.*低保真|低保真原型|视觉设计闭环|设计闭环|产品到\s*UI|UI\/UX\s*闭环/i,
		],
	},
	{
		name: "native-workflow-interop",
		weight: 4,
		plugins: [DYNAMIC_WORKFLOW_PLUGIN, "task-gate"],
		patterns: [
			/ultracode/i,
			/claude code dynamic workflows?/i,
			/native (?:dynamic )?workflow/i,
			/workflow scripts?/i,
			/\.claude\/workflows?/i,
			/\.atomic\b/i,
			/native dw|dw bridge|dynamic workflow bridge/i,
			/原生\s*DW|原生动态工作流|工作流脚本|桥接\s*(?:native|原生|Claude|DW)|Claude\s*动态工作流/i,
		],
	},
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
			/\bcreate a workflow\b/i,
			/工作流|编排|多代理|子代理|后台线程|代理线程|并行代理|分派|审批门禁/i,
		],
	},
	{
		name: "broad-planning",
		weight: 2,
		plugins: ["task-gate"],
		patterns: [
			/\bplan\b|decompose|break down|multi[- ]step|broad|complex/i,
			/migration|repo[- ]wide|large refactor|release gate|deep optimization/i,
			/规划|拆解|分解|多步骤|复杂|大范围|迁移|重构|优化方案|深度分析|深度优化/i,
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

type LaunchHarness = "grok" | "claude" | "codex" | "pi" | "cc-router";

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

type WorkflowInterop = {
	canonicalArtifactRoot: ".agent-workflows";
	optionalNativeLayouts: string[];
	workflowScriptInterop: boolean;
	notes: string[];
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
	interop: WorkflowInterop;
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
	const interop = buildInterop(cleanPrompt, detection);
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
		interop,
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
	return normalizeWorkflow(
		JSON.parse(readFileSync(workflowPath, "utf8")) as WorkflowArtifact,
	);
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
	workflow.verification = [];
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
	const releaseApproval = workflow.approvals.find(
		(item) => item.scope === "release",
	);
	if (releaseApproval && releaseApproval.status !== "granted") {
		workflow.state = "results_collected";
		workflow.finalVerdict = "pending";
		workflow.verification.push({
			check: "release approval gate",
			status: "blocked",
			summary:
				"Simulation collected packet results but refused to mark final PASS before release approval was granted.",
			createdAt: isoNow(),
		});
	} else {
		workflow.state = "complete";
		workflow.finalVerdict = "complete";
	}
	saveWorkflow(workflowDir, workflow);
	return workflow;
}

export function denyWorkflow({
	workflowDir,
	scope,
	by = "dynamic_workflow.ts",
	reason = "Explicit approval denial recorded.",
}: {
	workflowDir: string;
	scope: "plan" | "execute" | "release";
	by?: string;
	reason?: string;
}): WorkflowArtifact {
	const workflow = loadWorkflow(workflowDir);
	const approval = workflow.approvals.find((item) => item.scope === scope);
	if (!approval) throw new Error(`unknown approval scope: ${scope}`);
	approval.status = "denied";
	approval.grantedBy = by;
	approval.grantedAt = isoNow();
	approval.reason = reason;
	workflow.state = "blocked";
	workflow.finalVerdict = "blocked";
	workflow.verification.push({
		check: `${scope} approval gate`,
		status: "blocked",
		summary: `Approval scope ${scope} was denied: ${reason}`,
		createdAt: isoNow(),
	});
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
		if (!workflow.interop?.canonicalArtifactRoot) {
			failures.push("workflow.interop.canonicalArtifactRoot is required");
		}
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
	if (detection.requiredPlugins.includes("reliable-agent-workflow")) {
		push({
			id: nextPacketId(packets, "reliable-workflow"),
			role: "reliable-agent-workflow",
			objective:
				"Run the cross-harness reliable delivery workflow with design, review, repair, and independent verification artifacts.",
			status: "pending",
			dependencies: ["01-orchestration"],
			requiredPlugins: ["reliable-agent-workflow"],
			approvalRequired: false,
			mode: "owner",
			expectedEvidence: [
				".agent-runs/reliable-agent-workflow/<run-id>/design.md",
				"zero-open-issue review summary",
				"independent verification record",
			],
		});
	}
	if (detection.signals.includes("native-workflow-interop")) {
		push({
			id: nextPacketId(packets, "interop"),
			role: "workflow-interop",
			objective:
				"Record optional native workflow bridge details while keeping .agent-workflows as the portable audit trail.",
			status: "pending",
			dependencies: ["01-orchestration"],
			requiredPlugins: [DYNAMIC_WORKFLOW_PLUGIN],
			approvalRequired: false,
			mode: "owner",
			expectedEvidence: [
				"interop bridge note",
				".agent-workflows canonical artifact path",
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
	if (detection.requiredPlugins.includes("ui-ux-closed-loop")) {
		push({
			id: nextPacketId(packets, "design-loop"),
			role: "ui-ux-closed-loop",
			objective:
				"Orchestrate requirements, product thinking, low-fidelity prototype, design direction, implementation constraints, and verification evidence.",
			status: "pending",
			dependencies: ["01-orchestration"],
			requiredPlugins: ["ui-ux-closed-loop"],
			approvalRequired: false,
			mode: "owner",
			expectedEvidence: [
				"requirements/product-thinking note",
				"low-fidelity prototype or wireframe artifact",
				"external reference install/availability notes",
				"UI/UX verification checklist",
			],
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
	if (
		detection.signals.includes("explicit-workflow") &&
		!packets.some((packet) => packet.mode === "subagent")
	) {
		push({
			id: nextPacketId(packets, "research"),
			role: "researcher",
			objective:
				"Run a bounded read-only context pass for the requested fanout workflow and report facts the owner should use before implementation.",
			status: "pending",
			dependencies: ["01-orchestration"],
			requiredPlugins: [DYNAMIC_WORKFLOW_PLUGIN],
			approvalRequired: false,
			mode: "subagent",
			expectedEvidence: [
				"read-only context summary",
				"commands or files inspected",
				"Plugin evidence fanout line",
			],
		});
		push({
			id: nextPacketId(packets, "review"),
			role: "reviewer",
			objective:
				"Review the owner plan and packet boundaries for regressions, missing checks, and unsafe assumptions before implementation proceeds.",
			status: "pending",
			dependencies: ["01-orchestration", packets[packets.length - 1].id],
			requiredPlugins: [DYNAMIC_WORKFLOW_PLUGIN],
			approvalRequired: false,
			mode: "subagent",
			expectedEvidence: [
				"structured review findings",
				"0-open-issues or explicit blockers",
				"Plugin evidence fanout line",
			],
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

function buildInterop(
	prompt: string,
	detection: DynamicWorkflowDetection,
): WorkflowInterop {
	const lower = prompt.toLowerCase();
	const optionalNativeLayouts = new Set<string>();
	const notes = [...defaultInterop().notes];
	if (
		detection.signals.includes("native-workflow-interop") ||
		lower.includes("claude")
	) {
		optionalNativeLayouts.add(".claude/workflows/");
		notes.push(
			"Claude Code native Dynamic Workflows can be bridged by recording script paths and run evidence here; do not replace the portable artifact.",
		);
	}
	if (lower.includes(".atomic") || lower.includes("atomic")) {
		optionalNativeLayouts.add(".atomic/");
		notes.push(
			"Atomic-style artifacts may be cross-linked, but workflow.json remains the source of truth.",
		);
	}
	if (lower.includes("workflow script") || lower.includes("ultracode")) {
		notes.push(
			"Workflow-script interop should capture script path, approvals, packet results, and verification evidence without embedding secrets.",
		);
	}
	return {
		...defaultInterop(),
		optionalNativeLayouts: Array.from(optionalNativeLayouts).sort(),
		workflowScriptInterop: detection.signals.includes(
			"native-workflow-interop",
		),
		notes,
	};
}

function normalizeWorkflow(workflow: WorkflowArtifact): WorkflowArtifact {
	if (!workflow.interop) workflow.interop = defaultInterop();
	if (workflow.schemaVersion < WORKFLOW_SCHEMA_VERSION) {
		workflow.schemaVersion = WORKFLOW_SCHEMA_VERSION;
	}
	return workflow;
}

function defaultInterop(): WorkflowInterop {
	return {
		canonicalArtifactRoot: ".agent-workflows",
		optionalNativeLayouts: [],
		workflowScriptInterop: false,
		notes: [".agent-workflows/ remains the canonical cross-harness audit trail."],
	};
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
	if (plugins.includes("reliable-agent-workflow"))
		packets.push("reliable-workflow");
	if (plugins.includes("grok-augment")) packets.push("research");
	if (signals.has("native-workflow-interop")) packets.push("interop");
	if (plugins.includes("thinking-gate")) packets.push("thinking");
	if (plugins.includes("ui-ux-closed-loop")) packets.push("design-loop");
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
- Canonical artifact root: ${workflow.interop.canonicalArtifactRoot}
- Optional native layouts: ${workflow.interop.optionalNativeLayouts.join(", ") || "none"}

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
- Preserve .agent-workflows/ as the canonical cross-harness audit trail.
- Keep optional native layouts such as .claude/workflows/ or .atomic/ as bridge metadata; do not replace workflow.json as the source of truth.

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
	const verdict =
		workflow.finalVerdict === "complete"
			? "VERDICT: PASS"
			: workflow.finalVerdict === "blocked"
				? "VERDICT: BLOCKED"
				: "VERDICT: PENDING";
	return `# Final Report: ${workflow.title}

## Verdict

${verdict}

## Accepted Results

${workflow.results.map((result) => `- ${result.packetId}: ${result.summary}`).join("\n") || "Pending."}

## Structured Plugin Evidence

${workflow.evidence.map((item) => `- ${item.plugin}: ${item.status} via ${item.commandOrTool} (${item.summary})`).join("\n") || "Pending."}

## Verification Evidence

${workflow.verification.map((item) => `- ${item.check}: ${item.status} — ${item.summary}`).join("\n") || "Pending."}

## Interop

- Canonical artifact root: ${workflow.interop.canonicalArtifactRoot}
- Optional native layouts: ${workflow.interop.optionalNativeLayouts.join(", ") || "none"}
- Workflow script interop: ${workflow.interop.workflowScriptInterop ? "yes" : "no"}
${workflow.interop.notes.map((item) => `- ${item}`).join("\n")}

## Remaining Risks

${workflow.finalVerdict === "complete" ? "None known after recorded verification." : "Workflow is not complete yet or final approval is still pending."}
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

function launchHarnesses(value: string): LaunchHarness[] {
	const normalized = value.toLowerCase();
	const harnesses: LaunchHarness[] = ["grok", "claude", "codex", "pi", "cc-router"];
	if (normalized === "auto") return harnesses;
	if ((harnesses as string[]).includes(normalized))
		return [normalized as LaunchHarness];
	throw new Error(
		"--harness must be one of: auto, codex, claude, grok, pi, cc-router",
	);
}

function agentKindForRole(
	role: string,
): "researcher" | "reviewer" | "verifier" | "implementer" {
	const lower = role.toLowerCase();
	if (lower.includes("research")) return "researcher";
	if (lower.includes("review")) return "reviewer";
	if (lower.includes("verify") || lower.includes("verification"))
		return "verifier";
	return "implementer";
}

function launchSuggestion({
	harness,
	workflowDir,
	packet,
}: {
	harness: LaunchHarness;
	workflowDir: string;
	packet: Packet;
}): string {
	const agentKind = agentKindForRole(packet.role);
	const packetPath = `${workflowDir}/packets/${packet.id}.md`;
	const resultPath = `${workflowDir}/results/${packet.id}.md`;
	if (harness === "grok") {
		return `Grok task: task({ description: "Packet ${packet.id}: ${packet.objective}", subagent_type: "general-purpose", persona: "${agentKind}", capability_mode: "${agentKind === "implementer" ? "read-write" : "read-only"}", prompt: "Follow ${packetPath} exactly. Write result to ${resultPath}. End with: Plugin evidence: dynamic-workflow ${packet.role} via Grok task + ${agentKind} persona.", /* worktree: true if risky */ })`;
	}
	if (harness === "claude") {
		return `Claude: @reliable-${agentKind} (or Agent(reliable-${agentKind})) follow ${packetPath}. Write structured output to ${resultPath}. Copy docs/examples/claude-agents/reliable-${agentKind}.md first.`;
	}
	if (harness === "codex") {
		return `codex --profile deep-review "You are the ${agentKind} defined in .codex/agents/${agentKind}.toml (copy from docs/examples/codex-agents/${agentKind}.toml). Packet: read ${packetPath}. Write structured result + 'Plugin evidence: dynamic-workflow ${packet.role} via Codex ${agentKind} agent' to ${resultPath}. Use read-only where possible."`;
	}
	if (harness === "pi") {
		return `Pi: subagent({ agent: "${agentKind === "reviewer" ? "reviewer" : agentKind === "researcher" ? "scout" : "worker"}", task: "Follow ${packetPath}. Output to ${resultPath} + Plugin evidence.", model: "openai-codex/gpt-5.5:${agentKind === "implementer" ? "medium" : "high"}", async: true })`;
	}
	return `cc-router: taskctl capability --role ${packet.role} --instruction "Follow ${packetPath}; write portable result to ${resultPath}; include Plugin evidence: dynamic-workflow ${packet.role} via cc-router/taskctl."`;
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
	harness?: string;
};

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = {
		command: argv[0] || "help",
		prompt: [],
		json: false,
		root: ".agent-workflows",
		complete: false,
		harness: "auto",
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
		else if (item === "--harness") args.harness = argv[++i] || "auto";
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
  deny --scope execute <dir>        Record an approval gate as denied.
  simulate <dir>                    Run deterministic simulated packet/result completion.
  verify [--complete] <dir>         Validate structure, or full completion with --complete.
  e2e [--root DIR] [--json] <prompt>
                                    Create, approve, simulate, and verify a full workflow.
  launch-packets [--harness auto|codex|claude|grok|pi|cc-router] <workflow-dir>
                                    Print harness-specific spawn commands
                                    for subagent-mode packets. Uses native primitives where
                                    available (Grok task/spawn, Claude Agent/@, Codex with tomls,
                                    Pi subagent calls) or documented fallbacks + cc-router taskctl
                                    note. Workers must write results into the workflow results/ dir.
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
		if (args.command === "deny") {
			const workflowDir = args.prompt[0];
			if (!workflowDir) throw new Error("deny requires workflow directory");
			const workflow = denyWorkflow({
				workflowDir,
				scope: args.scope || "execute",
				by: args.by,
				reason: args.reason || "Denied by CLI.",
			});
			if (args.json) console.log(JSON.stringify(workflow, null, 2));
			else console.log(`denied ${args.scope || "execute"}: ${workflowDir}`);
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
		if (args.command === "launch-packets" || args.command === "launch") {
			const workflowDir = args.prompt[0];
			if (!workflowDir) throw new Error("launch-packets requires workflow directory");
			const harness = (args.harness || "auto").toLowerCase();
			const harnesses = launchHarnesses(harness);
			const workflow = loadWorkflow(workflowDir);
			console.log(`# launch-packets for ${workflow.id} (harness=${harness})`);
			console.log("# Owner should run the relevant recipe (or equivalent native tool call) for each subagent packet.");
			console.log("# Results must be written back to results/<packet>.md + evidence recorded.");
			console.log("# See docs/CROSS_HARNESS_SUBAGENT_TRIGGERING.md for exact syntax per harness + cc-router interop.");
			let emitted = 0;
			for (const packet of workflow.packets) {
				if (packet.mode !== "subagent") continue;
				const role = packet.role;
				emitted += 1;
				console.log(`\n# ${packet.id} (${role}, deps: ${packet.dependencies.join(",") || "none"})`);
				for (const item of harnesses) {
					console.log(launchSuggestion({ harness: item, workflowDir, packet }));
				}
			}
			if (emitted === 0)
				console.log("\n# No subagent-mode packets found in this workflow. Nothing to launch.");
			console.log("\n# After launches, run: node .../dynamic_workflow.ts verify --complete " + workflowDir);
			return 0;
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
