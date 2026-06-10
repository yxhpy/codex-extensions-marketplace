#!/usr/bin/env -S node --experimental-strip-types
import { createHash, randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnCliSync } from "./spawn_util.ts";
import { classifyUiuxPrompt } from "./uiux_auto_hook.ts";

export const DYNAMIC_WORKFLOW_PLUGIN = "dynamic-workflow";
export const WORKFLOW_SCHEMA_VERSION = 3;

const PLUGIN_ORDER = [
	DYNAMIC_WORKFLOW_PLUGIN,
	"reliable-agent-workflow",
	"task-gate",
	"grok-augment",
	"thinking-gate",
	"ui-ux-closed-loop",
	"agy-frontend",
	"gsap-animation",
	"asset-slicer",
];

const SIGNALS: Array<{
	name: string;
	weight: number;
	plugins?: string[];
	patterns: RegExp[];
}> = [
	{
		name: "adaptive-orchestrator",
		weight: 5,
		plugins: [
			DYNAMIC_WORKFLOW_PLUGIN,
			"reliable-agent-workflow",
			"task-gate",
		],
		patterns: [
			/adaptive (?:hierarchical )?(?:orchestrator|orchestration|workflow|replan|control loop)/i,
			/hierarchical multi[- ]agent|HMAS|controller.*manager.*worker|manager.*worker.*evaluator/i,
			/environment inventory|env(?:ironment)?_inventory|survey (?:agents|tools|skills|mcps|environment)/i,
			/execution[_ -]?spec|pre[- ]assign(?:ed)? (?:tools|skills|personas|agents|subagent)/i,
			/refined[- ]?(?:result|output|summary)|main (?:sees|receives) only refined/i,
			/replan|re[- ]split|post[- ]node judgment|adaptive judgment|graph delta|topology/i,
			/tool[- ]first|tools_used_for_self_resolution|ask_user.*tool/i,
			/自适应.*(编排|工作流|重规划)|分层.*(多代理|智能体)|环境盘点|执行规格|预分配.*(工具|技能|persona|代理)|精炼结果|主模型.*精炼|重规划|重新拆分|工具优先/i,
		],
	},
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
		weight: 4,
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
			/(?:page|screen|website|homepage|landing page|dashboard|portal|web app).*(?:ugly|generic|template|no planning|redesign|revamp|polish|production[- ]grade|premium)/i,
			/(?:ugly|generic|template|no planning|looks bad).*(?:page|screen|website|homepage|landing page|dashboard|ui|frontend)/i,
			/(?:full[- ]page|page[- ]level|product[- ]facing|marketing|conversion).*(?:ui|ux|design|frontend|redesign|polish)/i,
			/(?:\u9875\u9762|\u754c\u9762|\u524d\u7aef|\u843d\u5730\u9875|\u9996\u9875|\u5b98\u7f51|\u4eea\u8868\u76d8).*(?:\u4e11|\u96be\u770b|\u4e0d\u597d\u770b|\u6ca1\u89c4\u5212|\u6ca1\u6709\u89c4\u5212|\u6a21\u677f|AI\u5473|\u91cd\u505a|\u6539\u7248|\u7f8e\u5316|\u89c6\u89c9\u5347\u7ea7|\u751f\u4ea7\u7ea7|\u9ad8\u7ea7\u611f)/i,
			/(?:\u4e11|\u96be\u770b|\u4e0d\u597d\u770b|\u6ca1\u89c4\u5212|\u6ca1\u6709\u89c4\u5212|\u6a21\u677f|AI\u5473).*(?:\u9875\u9762|\u754c\u9762|UI|\u524d\u7aef|\u843d\u5730\u9875|\u9996\u9875|\u5b98\u7f51)/i,
			/(?:\u9875\u9762\u9700\u6c42.*\u4ea7\u54c1\u601d\u7ef4.*\u4f4e\u4fdd\u771f|\u4f4e\u4fdd\u771f\u539f\u578b|\u89c6\u89c9\u8bbe\u8ba1\u95ed\u73af|\u8bbe\u8ba1\u95ed\u73af|\u4ea7\u54c1\u5230\s*UI|UI\/UX\s*\u95ed\u73af)/i,
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
		name: "reference-visual",
		weight: 4,
		plugins: [DYNAMIC_WORKFLOW_PLUGIN, "task-gate", "agy-frontend"],
		patterns: [
			// English reference matching
			/reference (site|design|page|mockup|style|visual|look)/i,
			/match (the|this) (style|design|look|appearance|site|page|reference|mockup)/i,
			/looks? (like|identical|similar|the same) (to|the|this) (reference|site|design|screenshot|mockup|provided)/i,
			/visual (fidelity|similarity|match|comparison|parity|consistency)/i,
			/copy (the|this) (style|look|ui|design|layout) (of|from)/i,
			/build (a|the) (page|landing|frontend|ui|site) that looks (exactly|identical|the same|very similar) (as|like|to)/i,
			/pixel[- ]?perfect|high[- ]?fidelity (to|with) (reference|design)/i,
			// Chinese - looser to catch natural phrasing like "参考这个设计图", "参考站的样式", "按照参考实现"
			/参考.*(站|设计|页面|站点|图|mockup|样式|外观|设计图)/i,
			/匹配.*(这个|该|参考).*(设计|样式|外观|页面|站|效果|设计图)/i,
			/像.*(这个|参考|提供的).*(站点|设计|截图|页面|参考|mockup).*(一样|一致)/i,
			/视觉(保真|相似|一致|匹配|对比|相似度)/i,
			/(复刻|按照参考|和参考.*(一致|一样|相同)|参考.*实现)/i,
			/(落地页|页面|前端).*(参考|设计图).*(样式|设计|视觉|一致)/i,
			/参考(站|设计|页面).*(实现|做|构建|落地|前端)/i,
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

type InventorySkill = {
	name: string;
	description: string;
	source: "plugin" | "project" | "harness" | "unknown";
	path?: string;
};

type HarnessAdapter = {
	name: LaunchHarness | "agy" | "grok-augment";
	available: boolean;
	command?: string;
};

type EnvironmentInventory = {
	capturedAt: string;
	harness: "generic" | "codex" | "claude" | "grok" | "pi";
	skills: InventorySkill[];
	subagentTypes: string[];
	personas: string[];
	coreToolCategories: string[];
	mcps: string[];
	harnessAdapters: HarnessAdapter[];
	discoverySources: string[];
	notes: string[];
};

type CapabilityMode = "read-only" | "read-write" | "execute" | "all";
type OutputContract = "refined-json-v1" | "standard-evidence-md";

type PacketExecutionSpec = {
	subagentType: "general-purpose" | "explore" | "plan";
	persona: string;
	capabilityMode: CapabilityMode;
	injectSkills: string[];
	recommendedTools: string[];
	worktreeIsolation: boolean;
	outputContract: OutputContract;
	refinedResultFields: string[];
	stopConditions: string[];
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
	executionSpec?: PacketExecutionSpec;
};

type LaunchHarness = "grok" | "claude" | "codex" | "pi" | "cc-router";

type RefinedOpenQuestion = {
	q: string;
	resolvedVia: string;
	impact: "low" | "medium" | "high";
};

export type RefinedResult = {
	packetId: string;
	verdict: "success" | "partial" | "blocked";
	executiveSummary: string;
	keyArtifacts: string[];
	evidencePointers: string[];
	toolsUsedForSelfResolution: string[];
	openQuestions: RefinedOpenQuestion[];
	suggestedNextActions: string[];
	confidence: number;
	pluginEvidence: string;
	completedAt: string;
};

export type PacketResult = {
	packetId: string;
	status: "success" | "failure" | "blocked";
	summary: string;
	evidence: string[];
	completedAt: string;
	refined?: RefinedResult;
};

type EvidenceRecord = {
	plugin: string;
	commandOrTool: string;
	status: "success" | "failure" | "blocked" | "warning";
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

type ReplanEvent = {
	id: string;
	createdAt: string;
	trigger: string;
	packetId?: string;
	reason: string;
	action: "continue" | "split-next" | "insert-evaluator" | "reorder" | "blocked";
	affectedPackets: string[];
	status: "proposed" | "applied" | "skipped";
	summary: string;
};

type CondensedLogEntry = {
	id: string;
	createdAt: string;
	type: "packet-result" | "adaptive-judgment" | "tool-resolution" | "verification";
	packetId?: string;
	summary: string;
	evidencePointers: string[];
	confidence?: number;
};

type AdaptiveControl = {
	enabled: boolean;
	graphVersion: number;
	maxReplansPerPacket: number;
	toolFirstResolutionRequired: boolean;
	refinedResultContract: OutputContract;
	replanEvents: ReplanEvent[];
	condensedLog: CondensedLogEntry[];
	completionPolicy: string;
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
	environmentInventory: EnvironmentInventory;
	packets: Packet[];
	results: PacketResult[];
	evidence: EvidenceRecord[];
	verification: VerificationRecord[];
	interop: WorkflowInterop;
	adaptive: AdaptiveControl;
	finalVerdict: "pending" | "complete" | "incomplete" | "blocked";
	artifacts: {
		workflowJson: string;
		plan: string;
		orchestration: string;
		packetsDir: string;
		resultsDir: string;
		graph: string;
		condensedLog: string;
		replanEventsDir: string;
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

	const uiuxDecision = classifyUiuxPrompt(text);
	if (uiuxDecision.route === "uiux-closed-loop") {
		signals.add("ui-ux-closed-loop");
		score += uiuxDecision.complexity === "high" ? 4 : 3;
		for (const plugin of uiuxDecision.requiredPlugins) plugins.add(plugin);
	} else if (uiuxDecision.route === "simple-frontend") {
		signals.add("frontend");
		for (const plugin of uiuxDecision.requiredPlugins) plugins.add(plugin);
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

function buildEnvironmentInventory(
	prompt: string,
	detection: DynamicWorkflowDetection,
): EnvironmentInventory {
	const capturedAt = isoNow();
	const lower = prompt.toLowerCase();
	const harnessMentions = [
		["codex", /\bcodex\b/i],
		["claude", /\bclaude\b/i],
		["grok", /\bgrok\b/i],
		["pi", /\bpi\b/i],
	].filter(([, pattern]) => (pattern as RegExp).test(prompt));
	const harness: EnvironmentInventory["harness"] =
		harnessMentions.length === 1
			? (harnessMentions[0][0] as EnvironmentInventory["harness"])
			: "generic";
	const skills = discoverLocalSkills();
	const personas = Array.from(
		new Set([
			"researcher",
			"reviewer",
			"implementer",
			"verifier",
			"evaluator",
			"style-reviewer",
			"scout",
			"worker",
		]),
	);
	const adapters: HarnessAdapter[] = [
		{ name: "codex", command: "codex", available: commandInPath("codex") },
		{ name: "claude", command: "claude", available: commandInPath("claude") },
		{ name: "grok", command: "grok", available: commandInPath("grok") },
		{ name: "pi", command: "pi", available: commandInPath("pi") },
		{ name: "agy", command: "agy", available: commandInPath("agy") },
		{
			name: "cc-router",
			command: "taskctl",
			available: commandInPath("taskctl"),
		},
	];

	return {
		capturedAt,
		harness,
		skills,
		subagentTypes: ["general-purpose", "explore", "plan"],
		personas,
		coreToolCategories: [
			"filesystem",
			"terminal",
			"subagent",
			"todo",
			"scheduler",
			"monitor",
			"mcp",
			"search",
			"web",
			"image",
			"browser",
		],
		mcps: [
			"search_tool/use_tool when exposed by the active harness",
			"dispatcher_mcp.ts local stdio tools",
		],
		harnessAdapters: adapters,
		discoverySources: [
			"local skill frontmatter under skills/*/SKILL.md",
			"PATH scan for codex/claude/grok/pi/agy/taskctl",
			"static cross-harness subagent and core tool categories",
		],
		notes: [
			"Inventory is intentionally local and non-secret; external MCP search should be added by the owner or harness-specific subagent when available.",
			`Detected route signals: ${detection.signals.join(", ") || "none"}.`,
		],
	};
}

function discoverLocalSkills(): InventorySkill[] {
	const scriptDir = path.dirname(fileURLToPath(import.meta.url));
	const skillsDir = path.resolve(scriptDir, "..", "skills");
	if (!existsSync(skillsDir)) return [];
	const skills: InventorySkill[] = [];
	for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
		if (!existsSync(skillPath)) continue;
		const text = readFileSync(skillPath, "utf8");
		const frontmatter = parseFrontmatter(text);
		skills.push({
			name: frontmatter.name || entry.name,
			description: frontmatter.description || "",
			source: "plugin",
			path: path.relative(path.resolve(scriptDir, ".."), skillPath),
		});
	}
	return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function parseFrontmatter(text: string): Record<string, string> {
	if (!text.startsWith("---")) return {};
	const end = text.indexOf("\n---", 3);
	if (end === -1) return {};
	const out: Record<string, string> = {};
	for (const line of text.slice(3, end).split(/\r?\n/)) {
		const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
		if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
	}
	return out;
}

function commandInPath(command: string): boolean {
	const pathValue = process.env.PATH || "";
	const extensions =
		process.platform === "win32"
			? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";")
			: [""];
	for (const dir of pathValue.split(path.delimiter)) {
		if (!dir) continue;
		for (const ext of extensions) {
			if (existsSync(path.join(dir, `${command}${ext}`))) return true;
		}
	}
	return false;
}

function inventorySummary(inventory: EnvironmentInventory): Record<string, unknown> {
	return {
		harness: inventory.harness,
		skills: inventory.skills.map((skill) => skill.name),
		subagentTypes: inventory.subagentTypes,
		personas: inventory.personas,
		availableAdapters: inventory.harnessAdapters
			.filter((adapter) => adapter.available)
			.map((adapter) => adapter.name),
		coreToolCategories: inventory.coreToolCategories,
	};
}

function assignExecutionSpecs(
	packets: Packet[],
	detection: DynamicWorkflowDetection,
	inventory: EnvironmentInventory,
): Packet[] {
	const normalized = packets.map((packet, index) =>
		normalizePacket(packet, index, detection, inventory),
	);
	const styleReview = normalized.find((packet) => packet.id.includes("style-review"));
	if (styleReview) {
		for (const packet of normalized) {
			if (
				packet.role.toLowerCase().includes("frontend") &&
				!packet.dependencies.includes(styleReview.id)
			) {
				packet.dependencies.push(styleReview.id);
			}
		}
	}
	return normalized;
}

function normalizePacket(
	raw: Partial<Packet> & Record<string, any>,
	index: number,
	detection: DynamicWorkflowDetection,
	inventory: EnvironmentInventory,
): Packet {
	const packet: Packet = {
		id: raw.id || `${String(index + 1).padStart(2, "0")}-packet`,
		role: raw.role || "subagent",
		objective: raw.objective || "Complete the assigned work.",
		status: raw.status === "running" || raw.status === "completed" || raw.status === "blocked"
			? raw.status
			: "pending",
		dependencies: Array.isArray(raw.dependencies) ? raw.dependencies : [],
		requiredPlugins: orderedPlugins(raw.requiredPlugins || raw.required_plugins || []),
		approvalRequired: !!raw.approvalRequired || !!raw.approval_required,
		mode: raw.mode === "owner" || raw.mode === "simulated" ? raw.mode : "subagent",
		expectedEvidence: Array.isArray(raw.expectedEvidence)
			? raw.expectedEvidence
			: Array.isArray(raw.expected_evidence)
				? raw.expected_evidence
				: ["result.md"],
	};
	packet.executionSpec = normalizeExecutionSpec(
		raw.executionSpec || raw.execution_spec,
		packet,
		detection,
		inventory,
	);
	return packet;
}

function normalizeExecutionSpec(
	raw: Partial<PacketExecutionSpec> | Record<string, any> | undefined,
	packet: Packet,
	detection: DynamicWorkflowDetection,
	inventory: EnvironmentInventory,
): PacketExecutionSpec {
	const role = packet.role.toLowerCase();
	const persona = typeof raw?.persona === "string" && raw.persona.trim()
		? raw.persona
		: defaultPersonaForRole(role);
	const capabilityMode = normalizeCapabilityMode(
		raw?.capabilityMode || raw?.capability_mode || defaultCapabilityMode(role, packet.mode),
	);
	const injectSkills = asStringArray(raw?.injectSkills || raw?.inject_skills);
	for (const plugin of packet.requiredPlugins) injectSkills.push(plugin);
	const recommendedTools = asStringArray(raw?.recommendedTools || raw?.recommended_tools);
	for (const tool of defaultToolsForRole(role, detection, inventory)) {
		recommendedTools.push(tool);
	}
	return {
		subagentType: normalizeSubagentType(raw?.subagentType || raw?.subagent_type || defaultSubagentType(role)),
		persona,
		capabilityMode,
		injectSkills: Array.from(new Set(injectSkills.filter(Boolean))).sort(),
		recommendedTools: Array.from(new Set(recommendedTools.filter(Boolean))).sort(),
		worktreeIsolation: Boolean(
			raw?.worktreeIsolation ?? raw?.worktree_isolation ?? (capabilityMode !== "read-only" && packet.mode === "subagent"),
		),
		outputContract: raw?.outputContract === "standard-evidence-md" || raw?.output_contract === "standard-evidence-md"
			? "standard-evidence-md"
			: "refined-json-v1",
		refinedResultFields: [
			"packetId",
			"verdict",
			"executiveSummary",
			"keyArtifacts",
			"evidencePointers",
			"toolsUsedForSelfResolution",
			"openQuestions",
			"suggestedNextActions",
			"confidence",
			"pluginEvidence",
		],
		stopConditions: [
			"Stop and return blocked if required input is unavailable after documented tool-first resolution attempts.",
			"Do not ask the user directly unless tool exhaustion and product-decision need are documented.",
			"Return only refined-json-v1 plus artifact pointers to the owner context.",
		],
	};
}

function asStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string" && !!item.trim())
		: [];
}

function normalizeCapabilityMode(value: unknown): CapabilityMode {
	if (
		value === "read-only" ||
		value === "read-write" ||
		value === "execute" ||
		value === "all"
	) {
		return value;
	}
	return "read-only";
}

function normalizeSubagentType(value: unknown): PacketExecutionSpec["subagentType"] {
	if (value === "explore" || value === "plan") return value;
	return "general-purpose";
}

function defaultSubagentType(role: string): PacketExecutionSpec["subagentType"] {
	if (role.includes("orchestration") || role.includes("plan")) return "plan";
	if (role.includes("research") || role.includes("review") || role.includes("evaluator")) return "explore";
	return "general-purpose";
}

function defaultPersonaForRole(role: string): string {
	if (role.includes("research")) return "researcher";
	if (role.includes("style")) return "style-reviewer";
	if (role.includes("review")) return "reviewer";
	if (role.includes("verify") || role.includes("verification")) return "verifier";
	if (role.includes("evaluator")) return "evaluator";
	return "implementer";
}

function defaultCapabilityMode(role: string, mode: Packet["mode"]): CapabilityMode {
	if (mode === "owner") return "all";
	if (role.includes("implement") || role.includes("frontend") || role.includes("assets")) {
		return "read-write";
	}
	if (role.includes("verification")) return "execute";
	return "read-only";
}

function defaultToolsForRole(
	role: string,
	detection: DynamicWorkflowDetection,
	inventory: EnvironmentInventory,
): string[] {
	const tools = ["read", "rg", "workflow.json", "results/"];
	if (role.includes("research")) tools.push("web/search", "grok_augment", "mcp/search_tool");
	if (role.includes("review") || role.includes("evaluator")) tools.push("git diff", "tests", "validateWorkflow");
	if (role.includes("implement") || role.includes("frontend")) tools.push("apply_patch", "test command", "git diff");
	if (role.includes("verification")) tools.push("npm test", "validate_plugin.py", "quick_validate.py");
	if (detection.signals.includes("adaptive-orchestrator")) {
		tools.push("adaptive-step", "condensed_log.jsonl", "replan_events/");
	}
	tools.push("native subagent tools for the selected harness");
	return tools;
}

function buildAdaptiveControl(detection: DynamicWorkflowDetection): AdaptiveControl {
	return {
		enabled: detection.dynamic || detection.signals.includes("adaptive-orchestrator"),
		graphVersion: 1,
		maxReplansPerPacket: 3,
		toolFirstResolutionRequired: true,
		refinedResultContract: "refined-json-v1",
		replanEvents: [],
		condensedLog: [],
		completionPolicy:
			"Continue until all packets have refined results, adaptive judgments are recorded, required approvals are granted, and final verification passes.",
	};
}

/**
 * Call Claude CLI to dynamically compose a packet-based workflow.
 * This makes the workflow structure LLM-driven (dynamic and "random" per model sampling)
 * instead of purely static templates.
 */
function planPacketsWithClaude(
	prompt: string,
	detection: DynamicWorkflowDetection,
	claudeBin: string,
	inventory: EnvironmentInventory,
): Packet[] | null {
	const schema = `JSON array of packet objects. Each: {
  "id": string like "02-research",
  "role": "research" | "review" | "frontend" | "implementation" | "integration" | "verification" | "evaluator" | "owner-plan",
  "objective": "clear one-sentence goal",
  "dependencies": string[],
  "approvalRequired": boolean,
  "mode": "owner" | "subagent",
  "expectedEvidence": string[],
  "executionSpec": {
    "subagentType": "general-purpose" | "explore" | "plan",
    "persona": "researcher" | "reviewer" | "implementer" | "verifier" | "evaluator",
    "capabilityMode": "read-only" | "read-write" | "execute" | "all",
    "injectSkills": string[],
    "recommendedTools": string[],
    "worktreeIsolation": boolean,
    "outputContract": "refined-json-v1"
  }
}. Always include "01-orchestration" first as owner-plan. For adaptive/hierarchical orchestrator tasks, include inventory-aware planning, evaluator, refined-result, and post-node replan packets. For reference/visual matching UI tasks, include an early independent "style-review" or "visual-review" subagent packet (approvalRequired true) before any impl/frontend. Make parallelism explicit where safe.`;

	const planningPrompt = `You are a world-class dynamic workflow orchestrator for multi-agent coding and product tasks across different CLIs (Claude, Codex, Grok, Pi).

User request: ${prompt}

Current quick detection signals: ${JSON.stringify(detection.signals)}
Required plugins hint: ${JSON.stringify(detection.requiredPlugins)}
Environment inventory summary: ${JSON.stringify(inventorySummary(inventory))}

Design a complete, dynamic, parallel-friendly packet workflow as JSON array.

Rules:
- Start with 01-orchestration (owner-plan).
- Use the environment inventory to pre-assign realistic executionSpec values for every packet.
- Use subagent mode + approval gates for risky or review-heavy packets (especially independent review for fidelity or high-risk).
- For any task involving matching a reference site, design, screenshot, or "looks like / visual fidelity to external reference": include a dedicated early "style-review" packet done by *independent* subagent (mode: subagent, approvalRequired: true, role: "review"). It must verify both visual fidelity *and* that the work has not drifted into a completely different refactor.
- For adaptive orchestrator work: include an evaluator packet and require refined-json-v1 output from all subagent packets, with post-node suggested replan fields.
- Maximize safe parallelism (independent research/review can run in parallel).
- Keep owner as the final integrator and verifier.
- Output *only* the raw JSON array. No explanations, no markdown fences.

${schema}`;

	const completed = spawnCliSync(
		claudeBin,
		[planningPrompt],
		{
			encoding: "utf8",
			timeout: 180_000,
			env: { ...process.env, CLAUDE_NO_COLOR: "1" },
		},
	);

	if (completed.error || completed.status !== 0) {
		console.error("Claude planning failed, falling back to static packets:", completed.stderr || completed.error);
		return null;
	}

	let output = (completed.stdout || "").trim();
	// Clean common LLM output wrappers
	output = output.replace(/^```json\s*|\s*```$/g, "").trim();
	output = output.replace(/^```[\s\S]*?\n|\n```$/g, "").trim();

	try {
		const proposed = JSON.parse(output);
		if (!Array.isArray(proposed)) return null;

		// Normalize to our Packet type, ensure basics
		return proposed.map((p: any, idx: number) =>
			normalizePacket(p, idx, detection, inventory),
		) as Packet[];
	} catch (e) {
		console.error("Failed to parse Claude packet plan:", e, "raw:", output.slice(0, 300));
		return null;
	}
}

/**
 * Optional second round: have Claude review the proposed packets for quality, parallelism, and safety (e.g. independent review where needed).
 */
function reviewPacketsWithClaude(
	prompt: string,
	proposedPackets: Packet[],
	claudeBin: string,
	detection: DynamicWorkflowDetection,
	inventory: EnvironmentInventory,
): { approved: boolean; feedback: string; revisedPackets?: Packet[] } | null {
	const reviewPrompt = `Review this proposed dynamic workflow packet plan for the user request:

User request: ${prompt}

Proposed packets (JSON):
${JSON.stringify(proposedPackets, null, 2)}

As an independent auditor:
- Is the structure complete and safe?
- Does it have independent review subagents (especially for reference/visual fidelity tasks to prevent "completely different refactor")?
- Is parallelism used where appropriate?
- Are approval gates in the right places?
- Does it stay faithful to the original request without over- or under-scoping?

Output ONLY JSON: { "approved": true/false, "feedback": "concise critique and suggestions", "revisedPackets": [ ... ] (optional, only if you have specific improvements) }`;

	const completed = spawnCliSync(claudeBin, [reviewPrompt], {
		encoding: "utf8",
		timeout: 120_000,
	});

	if (completed.error || completed.status !== 0) return null;

	let out = (completed.stdout || "").trim().replace(/^```json\s*|\s*```$/g, "").trim();
	try {
		const parsed = JSON.parse(out);
		if (Array.isArray(parsed.revisedPackets)) {
			parsed.revisedPackets = parsed.revisedPackets.map((packet: any, index: number) =>
				normalizePacket(packet, index, detection, inventory),
			);
		}
		return parsed;
	} catch {
		return null;
	}
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
	const replanEventsDir = path.join(dir, "replan_events");
	mkdirSync(packetsDir, { recursive: true });
	mkdirSync(resultsDir, { recursive: true });
	mkdirSync(replanEventsDir, { recursive: true });

	const createdAt = isoNow();
	const environmentInventory = buildEnvironmentInventory(cleanPrompt, detection);

	// Dynamic LLM-driven packet composition via Claude CLI (primary path when available).
	// This implements "user prompt -> Claude CLI dynamically/randomly composes the workflow -> model reviews -> if agree, proceed to fan-out".
	// Fallback to rule-based buildPackets if no Claude or planning fails.
	let packets: Packet[] = assignExecutionSpecs(
		buildPackets(detection),
		detection,
		environmentInventory,
	);
	const claudeBin = process.env.DYNAMIC_WORKFLOW_CLAUDE_BIN || process.env.TASK_GATE_CLAUDE_BIN;
	const hasClaude = !!claudeBin;

	let llmReview: { approved?: boolean; feedback?: string } | null = null;
	if (hasClaude && detection.dynamic) {
		try {
			const llmProposed = planPacketsWithClaude(cleanPrompt, detection, claudeBin, environmentInventory);
			if (llmProposed && llmProposed.length >= 3) {
				packets = assignExecutionSpecs(llmProposed, detection, environmentInventory);

				// Normalize: always ensure 01-orchestration declares the core plugins
				// so simulateWorkflow will add the "successful evidence for dynamic-workflow / task-gate"
				// that validateWorkflow --complete requires. This keeps LLM-proposed structures
				// compatible with the rest of the system and tests.
				const orch = packets.find(p => p.id === "01-orchestration" || p.id.startsWith("01-"));
				if (orch) {
					const core = [DYNAMIC_WORKFLOW_PLUGIN, "task-gate"];
					orch.requiredPlugins = Array.from(new Set([...(orch.requiredPlugins || []), ...core]));
				}

				// Second round review by model (as requested: "模型本身又一次审核的权力，如果意见一致")
				llmReview = reviewPacketsWithClaude(cleanPrompt, packets, claudeBin, detection, environmentInventory);
				if (llmReview && !llmReview.approved && llmReview.revisedPackets && llmReview.revisedPackets.length >= 3) {
					packets = assignExecutionSpecs(llmReview.revisedPackets, detection, environmentInventory);
					// re-normalize after revision
					const orch2 = packets.find(p => p.id === "01-orchestration" || p.id.startsWith("01-"));
					if (orch2) {
						const core = [DYNAMIC_WORKFLOW_PLUGIN, "task-gate"];
						orch2.requiredPlugins = Array.from(new Set([...(orch2.requiredPlugins || []), ...core]));
					}
				}
			}
		} catch (err) {
			// silent fallback to static
			console.warn("LLM packet planning failed, using static template:", (err as Error).message);
		}
	}

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
		environmentInventory,
		packets,
		results: [],
		evidence: [],
		verification: [],
		interop,
		adaptive: buildAdaptiveControl(detection),
		finalVerdict: "pending",
		artifacts: {
			workflowJson: "workflow.json",
			plan: "plan.md",
			orchestration: "orchestration.md",
			packetsDir: "packets",
			resultsDir: "results",
			graph: "graph.json",
			condensedLog: "condensed_log.jsonl",
			replanEventsDir: "replan_events",
			finalReport: "final-report.md",
		},
	};

	if (llmReview && llmReview.feedback) {
		workflow.evidence.push({
			plugin: "dynamic-workflow",
			commandOrTool: "claude packet-plan review",
			status: llmReview.approved ? "success" : "warning",
			summary: llmReview.feedback,
			createdAt: isoNow(),
		});
	}

	writeAtomic(
		path.join(dir, "workflow.json"),
		JSON.stringify(workflow, null, 2) + "\n",
	);
	writeAtomic(path.join(dir, "plan.md"), renderPlan(workflow));
	writeAtomic(
		path.join(dir, "orchestration.md"),
		renderOrchestration(workflow),
	);
	writeWorkflowDerivedArtifacts(dir, workflow);
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
	writeWorkflowDerivedArtifacts(workflowDir, workflow);
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
		result.refined = buildRefinedResult(packet, result);
		workflow.results.push(result);
		workflow.adaptive.condensedLog.push({
			id: `log-${workflow.adaptive.condensedLog.length + 1}`,
			createdAt: completedAt,
			type: "packet-result",
			packetId: packet.id,
			summary: result.refined.executiveSummary,
			evidencePointers: result.refined.evidencePointers,
			confidence: result.refined.confidence,
		});
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
	appendReplanEvent(workflow, {
		trigger: "post-simulation adaptive judgment",
		reason:
			"Deterministic simulation completed all ready packets; no graph split was needed.",
		action: "continue",
		affectedPackets: workflow.packets.map((packet) => packet.id),
		status: "applied",
		summary:
			"Adaptive loop inspected refined packet results and continued to final verification.",
	});
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
	workflow.verification.push({
		check: "adaptive workflow contracts",
		status: "pass",
		command: "dynamic_workflow.ts simulate",
		summary:
			"Environment inventory, per-packet execution specs, refined-json-v1 results, condensed log, and adaptive judgment event were recorded.",
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
		if (!workflow.environmentInventory?.capturedAt) {
			failures.push("workflow.environmentInventory.capturedAt is required");
		}
		if (!Array.isArray(workflow.environmentInventory?.skills)) {
			failures.push("workflow.environmentInventory.skills must be an array");
		}
		if (!workflow.adaptive?.refinedResultContract) {
			failures.push("workflow.adaptive.refinedResultContract is required");
		}
		for (const derived of ["graph.json", "condensed_log.jsonl"]) {
			if (!existsSync(path.join(workflowDir, derived))) {
				warnings.push(`Missing derived artifact: ${derived}`);
			}
		}
		if (!Array.isArray(workflow.packets) || workflow.packets.length === 0) {
			failures.push("workflow.packets must contain at least one packet");
		}
		const packetIds = new Set(workflow.packets.map((packet) => packet.id));
		for (const packet of workflow.packets) {
			if (!packet.executionSpec) {
				failures.push(`${packet.id} is missing executionSpec`);
			} else if (!packet.executionSpec.outputContract) {
				failures.push(`${packet.id} executionSpec.outputContract is required`);
			}
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
			for (const result of workflow.results) {
				if (!result.refined) {
					failures.push(`missing refined result for packet ${result.packetId}`);
					continue;
				}
				if (!Array.isArray(result.refined.toolsUsedForSelfResolution)) {
					failures.push(
						`refined result for ${result.packetId} is missing toolsUsedForSelfResolution`,
					);
				}
				if (typeof result.refined.confidence !== "number") {
					failures.push(`refined result for ${result.packetId} is missing confidence`);
				}
			}
			if (!workflow.adaptive.replanEvents.length) {
				failures.push("no adaptive replan/judgment event recorded");
			}
			if (!workflow.adaptive.condensedLog.length) {
				failures.push("no condensed adaptive log entries recorded");
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
			"Restate goal, success criteria, constraints, risks, inventory findings, packet boundaries, execution specs, and adaptive replan policy.",
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
	// For reference-visual (high hit rate improvement): always insert an explicit independent style-review
	// packet that must be done by a separate reviewer before AGY/frontend work. This directly addresses
	// the common mistake of conservative "just use agy + self visual check".
	let styleReviewId: string | undefined;
	if (detection.signals.includes("reference-visual")) {
		const hasStyleReview = packets.some((p) => p.id.includes("style-review") || p.id.includes("review") && p.role === "review");
		if (!hasStyleReview) {
			const packet = {
				id: nextPacketId(packets, "style-review"),
				role: "review",
				objective:
					"Independent visual style review and fidelity check against the external reference site/design/mockup/screenshot. Explicitly verify high visual similarity AND confirm the implementation has NOT become a completely different refactor or architecture. MUST be performed by an independent reviewer subagent (not the owner, not AGY). This packet's approval is required before any AGY/frontend implementation packet can start.",
				status: "pending",
				dependencies: ["01-orchestration"],
				requiredPlugins: ["reliable-agent-workflow"],
				approvalRequired: true,
				mode: "subagent",
				expectedEvidence: [
					"style-review-report.md",
					"side-by-side screenshots or annotated diffs",
					"fidelity metrics or qualitative assessment",
					"explicit statement on 'no unintended refactor'",
					"APPROVED or BLOCKED verdict",
				],
			};
			styleReviewId = packet.id;
			push(packet);
		}
	}
	if (detection.requiredPlugins.includes("agy-frontend")) {
		push({
			id: nextPacketId(packets, "frontend"),
			role: "frontend",
			objective:
				"Bound frontend implementation through AGY and keep the owner agent as verifier.",
			status: "pending",
			dependencies: styleReviewId ? ["01-orchestration", styleReviewId] : ["01-orchestration"],
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
	if (detection.dynamic || detection.signals.includes("adaptive-orchestrator")) {
		push({
			id: nextPacketId(packets, "evaluator"),
			role: "evaluator",
			objective:
				"Evaluate refined packet results for quality, unresolved questions, next-node size, and whether the graph needs split/replan/topology changes before owner implementation proceeds.",
			status: "pending",
			dependencies: packets.map((packet) => packet.id),
			requiredPlugins: [DYNAMIC_WORKFLOW_PLUGIN],
			approvalRequired: false,
			mode: "subagent",
			expectedEvidence: [
				"refined-json-v1 evaluator result",
				"quality threshold verdict",
				"suggested replan or no-change decision",
				"tool-first question resolution log",
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
	if (!workflow.environmentInventory) {
		workflow.environmentInventory = buildEnvironmentInventory(
			workflow.promptSummary || workflow.title || "",
			workflow.detection,
		);
	}
	if (!workflow.adaptive) workflow.adaptive = buildAdaptiveControl(workflow.detection);
	if (!workflow.artifacts) {
		workflow.artifacts = {
			workflowJson: "workflow.json",
			plan: "plan.md",
			orchestration: "orchestration.md",
			packetsDir: "packets",
			resultsDir: "results",
			graph: "graph.json",
			condensedLog: "condensed_log.jsonl",
			replanEventsDir: "replan_events",
			finalReport: "final-report.md",
		};
	} else {
		workflow.artifacts.graph ||= "graph.json";
		workflow.artifacts.condensedLog ||= "condensed_log.jsonl";
		workflow.artifacts.replanEventsDir ||= "replan_events";
	}
	workflow.packets = assignExecutionSpecs(
		workflow.packets || [],
		workflow.detection,
		workflow.environmentInventory,
	);
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

function writeWorkflowDerivedArtifacts(
	workflowDir: string,
	workflow: WorkflowArtifact,
): void {
	writeAtomic(
		path.join(workflowDir, workflow.artifacts.graph || "graph.json"),
		JSON.stringify(renderGraph(workflow), null, 2) + "\n",
	);
	writeAtomic(
		path.join(workflowDir, workflow.artifacts.condensedLog || "condensed_log.jsonl"),
		renderCondensedLog(workflow),
	);
	const replanDir = path.join(
		workflowDir,
		workflow.artifacts.replanEventsDir || "replan_events",
	);
	mkdirSync(replanDir, { recursive: true });
	for (const event of workflow.adaptive.replanEvents) {
		writeAtomic(
			path.join(replanDir, `${event.id}.json`),
			JSON.stringify(event, null, 2) + "\n",
		);
	}
}

function renderGraph(workflow: WorkflowArtifact): Record<string, unknown> {
	return {
		workflowId: workflow.id,
		graphVersion: workflow.adaptive.graphVersion,
		generatedAt: workflow.updatedAt,
		nodes: workflow.packets.map((packet) => ({
			id: packet.id,
			role: packet.role,
			mode: packet.mode,
			status: packet.status,
			dependencies: packet.dependencies,
			requiredPlugins: packet.requiredPlugins,
			approvalRequired: packet.approvalRequired,
			executionSpec: packet.executionSpec,
		})),
		edges: workflow.packets.flatMap((packet) =>
			packet.dependencies.map((dependency) => ({
				from: dependency,
				to: packet.id,
			})),
		),
		adaptive: {
			enabled: workflow.adaptive.enabled,
			maxReplansPerPacket: workflow.adaptive.maxReplansPerPacket,
			refinedResultContract: workflow.adaptive.refinedResultContract,
			replanEventCount: workflow.adaptive.replanEvents.length,
		},
	};
}

function renderCondensedLog(workflow: WorkflowArtifact): string {
	return workflow.adaptive.condensedLog
		.map((entry) => JSON.stringify(entry))
		.join("\n") + (workflow.adaptive.condensedLog.length ? "\n" : "");
}

function buildRefinedResult(packet: Packet, result: PacketResult): RefinedResult {
	const artifact = path.join("results", `${packet.id}.md`);
	return {
		packetId: packet.id,
		verdict: result.status === "success" ? "success" : result.status === "blocked" ? "blocked" : "partial",
		executiveSummary: `${packet.role} completed with ${result.evidence.length} evidence item(s); owner should load artifacts only if repair is needed.`,
		keyArtifacts: [artifact],
		evidencePointers: result.evidence.map((item) => `${artifact}: ${item}`),
		toolsUsedForSelfResolution: [
			"read:packet contract",
			"inspect:workflow.json executionSpec",
			"write:refined-json-v1 result",
		],
		openQuestions: [],
		suggestedNextActions: [
			"Owner adaptive judgment should inspect confidence, blockers, and next packet size before proceeding.",
		],
		confidence: result.status === "success" ? 0.9 : 0.35,
		pluginEvidence: `Plugin evidence: dynamic-workflow ${packet.role} via refined-json-v1 simulation.`,
		completedAt: result.completedAt,
	};
}

function appendReplanEvent(
	workflow: WorkflowArtifact,
	input: {
		trigger: string;
		packetId?: string;
		reason: string;
		action: ReplanEvent["action"];
		affectedPackets?: string[];
		status?: ReplanEvent["status"];
		summary?: string;
	},
): ReplanEvent {
	const event: ReplanEvent = {
		id: `replan-${String(workflow.adaptive.replanEvents.length + 1).padStart(3, "0")}`,
		createdAt: isoNow(),
		trigger: input.trigger,
		packetId: input.packetId,
		reason: input.reason,
		action: input.action,
		affectedPackets: input.affectedPackets || [],
		status: input.status || "proposed",
		summary: input.summary || `${input.action} proposed after ${input.trigger}.`,
	};
	workflow.adaptive.replanEvents.push(event);
	workflow.adaptive.condensedLog.push({
		id: `log-${workflow.adaptive.condensedLog.length + 1}`,
		createdAt: event.createdAt,
		type: "adaptive-judgment",
		packetId: input.packetId,
		summary: event.summary,
		evidencePointers: [`replan_events/${event.id}.json`],
		confidence: event.status === "applied" ? 0.8 : 0.6,
	});
	workflow.adaptive.graphVersion += event.status === "applied" ? 1 : 0;
	return event;
}

export function getWorkflowInventory(workflowDir: string): EnvironmentInventory {
	return loadWorkflow(workflowDir).environmentInventory;
}

export function getRefinedResults(workflowDir: string): RefinedResult[] {
	return loadWorkflow(workflowDir).results
		.map((result) => result.refined)
		.filter((result): result is RefinedResult => !!result);
}

export function recordAdaptiveReplan({
	workflowDir,
	packetId,
	trigger = "manual adaptive-step",
	reason,
	action = "continue",
}: {
	workflowDir: string;
	packetId?: string;
	trigger?: string;
	reason: string;
	action?: ReplanEvent["action"];
}): { workflow: WorkflowArtifact; event: ReplanEvent } {
	const workflow = loadWorkflow(workflowDir);
	const event = appendReplanEvent(workflow, {
		trigger,
		packetId,
		reason,
		action,
		affectedPackets: packetId ? [packetId] : workflow.packets.map((packet) => packet.id),
		status: "applied",
		summary:
			action === "continue"
				? "Adaptive judgment recorded no structural graph change."
				: `Adaptive judgment recorded action: ${action}.`,
	});
	saveWorkflow(workflowDir, workflow);
	return { workflow, event };
}

type ParsedWorkerResult = {
	status?: PacketResult["status"];
	summary?: string;
	evidence?: string[];
	refined?: Partial<RefinedResult>;
};

export function recordPacketResult({
	workflowDir,
	packetId,
	resultFile,
	status,
}: {
	workflowDir: string;
	packetId: string;
	resultFile?: string;
	status?: PacketResult["status"];
}): { workflow: WorkflowArtifact; result: PacketResult } {
	const workflow = loadWorkflow(workflowDir);
	const packet = workflow.packets.find((item) => item.id === packetId);
	if (!packet) throw new Error(`unknown packet: ${packetId}`);
	const relResultPath = path.join("results", `${packet.id}.md`);
	const sourcePath = resultFile
		? path.resolve(resultFile)
		: path.join(workflowDir, relResultPath);
	if (!existsSync(sourcePath)) {
		throw new Error(
			`result file not found for ${packet.id}: ${sourcePath}; pass --result-file or create ${relResultPath}`,
		);
	}
	const raw = readFileSync(sourcePath, "utf8");
	const parsed = parseWorkerResult(raw);
	const completedAt = parsed.refined?.completedAt || isoNow();
	const resultStatus = status || parsed.status || refinedVerdictToStatus(parsed.refined?.verdict) || "success";
	const evidence = parsed.evidence?.length
		? parsed.evidence
		: extractEvidenceLines(raw, sourcePath, workflowDir);
	const result: PacketResult = {
		packetId: packet.id,
		status: resultStatus,
		summary:
			parsed.summary ||
			parsed.refined?.executiveSummary ||
			firstLine(raw, 220) ||
			`${packet.role} worker result ingested from ${path.basename(sourcePath)}.`,
		evidence,
		completedAt,
	};
	result.refined = normalizeRefinedResult(packet, result, parsed.refined, relResultPath);

	const existingIndex = workflow.results.findIndex((item) => item.packetId === packet.id);
	if (existingIndex >= 0) workflow.results[existingIndex] = result;
	else workflow.results.push(result);

	packet.status = result.status === "blocked" ? "blocked" : "completed";
	workflow.state = "results_collected";

	const evidencePlugins = new Set([DYNAMIC_WORKFLOW_PLUGIN, ...packet.requiredPlugins]);
	for (const plugin of evidencePlugins) {
		workflow.evidence.push({
			plugin,
			commandOrTool: `record-result:${packet.id}`,
			status: result.status === "success" ? "success" : result.status === "blocked" ? "blocked" : "warning",
			exitCode: result.status === "success" ? 0 : undefined,
			artifactPath: relResultPath,
			summary:
				plugin === DYNAMIC_WORKFLOW_PLUGIN
					? `Real worker result ingested for ${packet.id}; ${result.refined.pluginEvidence}`
					: `${plugin} evidence linked from real worker result ${packet.id}.`,
			createdAt: completedAt,
		});
	}

	workflow.verification.push({
		check: `packet result ingest:${packet.id}`,
		status: result.status === "success" ? "pass" : result.status === "blocked" ? "blocked" : "fail",
		command: "dynamic_workflow.ts record-result",
		summary: `Recorded ${result.status} refined-json-v1 result for ${packet.id} from ${path.relative(workflowDir, sourcePath) || relResultPath}.`,
		createdAt: completedAt,
	});

	workflow.adaptive.condensedLog.push({
		id: `log-${workflow.adaptive.condensedLog.length + 1}`,
		createdAt: completedAt,
		type: "packet-result",
		packetId: packet.id,
		summary: result.refined.executiveSummary,
		evidencePointers: result.refined.evidencePointers,
		confidence: result.refined.confidence,
	});

	appendReplanEvent(workflow, {
		trigger: `record-result:${packet.id}`,
		packetId: packet.id,
		reason: `Real worker result for ${packet.id} was ingested and normalized to ${packet.executionSpec?.outputContract || "refined-json-v1"}.`,
		action: result.status === "blocked" ? "blocked" : "continue",
		affectedPackets: [packet.id],
		status: "applied",
		summary:
			result.status === "success"
				? "Adaptive judgment recorded ingested worker result; no structural graph change."
				: `Adaptive judgment recorded ${result.status} packet result for owner follow-up.`,
	});

	maybeMarkWorkflowComplete(workflow);
	writeAtomic(path.join(workflowDir, relResultPath), renderResult(packet, result));
	saveWorkflow(workflowDir, workflow);
	return { workflow, result };
}

function parseWorkerResult(raw: string): ParsedWorkerResult {
	const jsonCandidates = collectJsonCandidates(raw);
	for (const candidate of jsonCandidates) {
		try {
			const parsed = parsedResultFromJson(JSON.parse(candidate));
			if (parsed.status || parsed.summary || parsed.evidence?.length || parsed.refined) {
				return parsed;
			}
		} catch {
			// Try next candidate.
		}
	}
	return parseMarkdownWorkerResult(raw);
}

function collectJsonCandidates(raw: string): string[] {
	const candidates: string[] = [];
	const trimmed = raw.trim();
	if (trimmed.startsWith("{") && trimmed.endsWith("}")) candidates.push(trimmed);
	for (const match of raw.matchAll(/```(?:json|refined-json-v1)?\s*([\s\S]*?)```/gi)) {
		const body = match[1].trim();
		if (body.startsWith("{") && body.endsWith("}")) candidates.push(body);
	}
	const refined = sectionBody(raw, "Refined Result") || sectionBody(raw, "refined-json-v1");
	if (refined) {
		const fenced = refined.match(/```(?:json|refined-json-v1)?\s*([\s\S]*?)```/i)?.[1]?.trim();
		if (fenced) candidates.push(fenced);
		const direct = refined.trim();
		if (direct.startsWith("{") && direct.endsWith("}")) candidates.push(direct);
	}
	return candidates;
}

function parsedResultFromJson(value: unknown): ParsedWorkerResult {
	if (!value || typeof value !== "object") return {};
	const obj = value as Record<string, unknown>;
	const refinedSource = (obj.refined && typeof obj.refined === "object" ? obj.refined : obj) as Record<string, unknown>;
	const refined = looksLikeRefinedResult(refinedSource) ? partialRefinedFromObject(refinedSource) : undefined;
	return {
		status: parseOptionalStatus(obj.status) || refinedVerdictToStatus(refined?.verdict),
		summary: typeof obj.summary === "string" ? obj.summary : refined?.executiveSummary,
		evidence: asStringArray(obj.evidence),
		refined,
	};
}

function looksLikeRefinedResult(obj: Record<string, unknown>): boolean {
	return typeof obj.executiveSummary === "string" || typeof obj.pluginEvidence === "string" || Array.isArray(obj.toolsUsedForSelfResolution);
}

function partialRefinedFromObject(obj: Record<string, unknown>): Partial<RefinedResult> {
	return {
		packetId: typeof obj.packetId === "string" ? obj.packetId : undefined,
		verdict: parseOptionalVerdict(obj.verdict),
		executiveSummary: typeof obj.executiveSummary === "string" ? obj.executiveSummary : undefined,
		keyArtifacts: asStringArray(obj.keyArtifacts),
		evidencePointers: asStringArray(obj.evidencePointers),
		toolsUsedForSelfResolution: asStringArray(obj.toolsUsedForSelfResolution),
		openQuestions: Array.isArray(obj.openQuestions) ? normalizeOpenQuestions(obj.openQuestions) : undefined,
		suggestedNextActions: asStringArray(obj.suggestedNextActions),
		confidence: typeof obj.confidence === "number" ? Math.max(0, Math.min(1, obj.confidence)) : undefined,
		pluginEvidence: typeof obj.pluginEvidence === "string" ? obj.pluginEvidence : undefined,
		completedAt: typeof obj.completedAt === "string" ? obj.completedAt : undefined,
	};
}

function parseMarkdownWorkerResult(raw: string): ParsedWorkerResult {
	const statusMatch = raw.match(/^Status:\s*(success|failure|blocked)\s*$/im);
	const summarySection = sectionBody(raw, "Summary");
	const evidenceSection = sectionBody(raw, "Evidence");
	const pluginEvidence = raw.match(/Plugin evidence:\s*.+/i)?.[0];
	const evidence = evidenceSection
		? evidenceSection
				.split(/\r?\n/)
				.map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
				.filter(Boolean)
		: [];
	if (pluginEvidence && !evidence.includes(pluginEvidence)) evidence.push(pluginEvidence);
	return {
		status: statusMatch ? parseOptionalStatus(statusMatch[1]) : undefined,
		summary: summarySection ? firstLine(summarySection, 500) : firstLine(raw, 220),
		evidence,
	};
}

function normalizeRefinedResult(
	packet: Packet,
	result: PacketResult,
	input: Partial<RefinedResult> | undefined,
	artifact: string,
): RefinedResult {
	const fallback = buildRefinedResult(packet, result);
	const evidencePointers = input?.evidencePointers?.length
		? input.evidencePointers
		: result.evidence.map((item) => `${artifact}: ${item}`);
	return {
		packetId: packet.id,
		verdict: input?.verdict || fallback.verdict,
		executiveSummary: input?.executiveSummary || result.summary || fallback.executiveSummary,
		keyArtifacts: input?.keyArtifacts?.length ? input.keyArtifacts : [artifact],
		evidencePointers: evidencePointers.length ? evidencePointers : [`${artifact}: ingested worker result`],
		toolsUsedForSelfResolution: input?.toolsUsedForSelfResolution?.length
			? input.toolsUsedForSelfResolution
			: [
					"read:packet contract",
					"inspect:workflow.json executionSpec",
					"write:worker result markdown/json",
					"ingest:dynamic_workflow.ts record-result",
				],
		openQuestions: input?.openQuestions || [],
		suggestedNextActions: input?.suggestedNextActions?.length
			? input.suggestedNextActions
			: fallback.suggestedNextActions,
		confidence: typeof input?.confidence === "number" ? input.confidence : fallback.confidence,
		pluginEvidence:
			input?.pluginEvidence ||
			`Plugin evidence: dynamic-workflow ${packet.role} via record-result refined-json-v1 ingestion.`,
		completedAt: input?.completedAt || result.completedAt,
	};
}

function maybeMarkWorkflowComplete(workflow: WorkflowArtifact): void {
	const resultIds = new Set(workflow.results.map((result) => result.packetId));
	const allPacketsTerminal = workflow.packets.every(
		(packet) => packet.status === "completed" && resultIds.has(packet.id),
	);
	const allResultsSuccessful = workflow.results.every((result) => result.status === "success" && !!result.refined);
	const approvalsGranted = workflow.approvals.every((approval) => approval.status === "granted");
	if (allPacketsTerminal && allResultsSuccessful && approvalsGranted) {
		workflow.state = "complete";
		workflow.finalVerdict = "complete";
		workflow.verification.push({
			check: "record-result workflow completion",
			status: "pass",
			command: "dynamic_workflow.ts record-result",
			summary: "All packets have successful refined results, approvals, plugin evidence, condensed log entries, and adaptive judgments.",
			createdAt: isoNow(),
		});
	} else if (workflow.results.some((result) => result.status === "blocked")) {
		workflow.finalVerdict = "blocked";
	} else {
		workflow.finalVerdict = "pending";
	}
}

function sectionBody(raw: string, heading: string): string | undefined {
	const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = raw.match(new RegExp(`^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "im"));
	return match?.[1]?.trim();
}

function extractEvidenceLines(raw: string, sourcePath: string, workflowDir: string): string[] {
	const lines = raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => /^Plugin evidence:/i.test(line));
	const rel = path.relative(workflowDir, sourcePath) || sourcePath;
	return lines.length ? lines : [`ingested result file: ${rel}`];
}

function parseOptionalStatus(value: unknown): PacketResult["status"] | undefined {
	return value === "success" || value === "failure" || value === "blocked" ? value : undefined;
}

function parseOptionalVerdict(value: unknown): RefinedResult["verdict"] | undefined {
	return value === "success" || value === "partial" || value === "blocked" ? value : undefined;
}

function refinedVerdictToStatus(value: unknown): PacketResult["status"] | undefined {
	if (value === "success") return "success";
	if (value === "blocked") return "blocked";
	if (value === "partial") return "failure";
	return undefined;
}

function normalizeOpenQuestions(value: unknown[]): RefinedOpenQuestion[] {
	return value
		.map((item) => {
			if (!item || typeof item !== "object") return undefined;
			const obj = item as Record<string, unknown>;
			const impact = obj.impact === "low" || obj.impact === "medium" || obj.impact === "high" ? obj.impact : "medium";
			return {
				q: typeof obj.q === "string" ? obj.q : String(obj.question || "open question"),
				resolvedVia: typeof obj.resolvedVia === "string" ? obj.resolvedVia : "worker self-resolution",
				impact,
			};
		})
		.filter((item): item is RefinedOpenQuestion => !!item);
}

export function listLaunchSuggestions({
	workflowDir,
	harness = "auto",
	packetId,
}: {
	workflowDir: string;
	harness?: string;
	packetId?: string;
}): Array<{
	packetId: string;
	role: string;
	harness: LaunchHarness;
	command: string;
	executionSpec?: PacketExecutionSpec;
}> {
	const workflow = loadWorkflow(workflowDir);
	const harnesses = launchHarnesses(harness);
	const packets = workflow.packets.filter(
		(packet) => packet.mode === "subagent" && (!packetId || packet.id === packetId),
	);
	return packets.flatMap((packet) =>
		harnesses.map((item) => ({
			packetId: packet.id,
			role: packet.role,
			harness: item,
			command: launchSuggestion({ harness: item, workflowDir, packet }),
			executionSpec: packet.executionSpec,
		})),
	);
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
	if (signals.has("reference-visual")) {
		// Ensure style review comes before generic frontend for reference-driven work
		if (!packets.includes("style-review")) packets.push("style-review");
	}
	if (plugins.includes("agy-frontend")) packets.push("frontend");
	if (signals.has("adaptive-orchestrator")) packets.push("evaluator");
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
- Inventory captured: ${workflow.environmentInventory.capturedAt}
- Available adapters: ${workflow.environmentInventory.harnessAdapters.filter((adapter) => adapter.available).map((adapter) => adapter.name).join(", ") || "none detected on PATH"}
- Local skills inventoried: ${workflow.environmentInventory.skills.map((skill) => skill.name).join(", ") || "none"}
- Canonical artifact root: ${workflow.interop.canonicalArtifactRoot}
- Optional native layouts: ${workflow.interop.optionalNativeLayouts.join(", ") || "none"}
- Adaptive graph version: ${workflow.adaptive.graphVersion}
- Refined result contract: ${workflow.adaptive.refinedResultContract}

## Work Packets

${workflow.packets.map((packet) => `- ${packet.id}: ${packet.objective} (persona: ${packet.executionSpec?.persona || "n/a"}, tools: ${packet.executionSpec?.recommendedTools.join(", ") || "n/a"})`).join("\n")}

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
- Start from environmentInventory in workflow.json before assigning work.
- Every packet has an executionSpec with subagent type, persona, capability mode, injected skills, recommended tools, and output contract.
- Subagents return refined-json-v1 only: executive summary, evidence pointers, tools used for self-resolution, open questions, suggested replan, confidence, and Plugin evidence.
- After each result or batch, record an adaptive judgment in replan_events/ and condensed_log.jsonl; split/reorder/insert evaluator packets when new evidence or next-node size requires it.
- Ask the user only after tool-first resolution attempts are documented in the refined result.

## Packet Order

${workflow.packets.map((packet) => `1. ${packet.id} (${packet.role}) depends on ${packet.dependencies.join(", ") || "none"}`).join("\n")}

## Adaptive Artifacts

- Graph: ${workflow.artifacts.graph}
- Condensed log: ${workflow.artifacts.condensedLog}
- Replan events: ${workflow.artifacts.replanEventsDir}/
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

## Execution Spec

${JSON.stringify(packet.executionSpec, null, 2)}

## Refined Result Contract

Subagents must write a compact refined-json-v1 result for owner context:

- packetId
- verdict
- executiveSummary
- keyArtifacts
- evidencePointers
- toolsUsedForSelfResolution
- openQuestions
- suggestedNextActions
- confidence
- pluginEvidence

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

## Refined Result

${result.refined ? JSON.stringify(result.refined, null, 2) : "Pending refined-json-v1 result."}
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

## Adaptive Evidence

- Graph version: ${workflow.adaptive.graphVersion}
- Replan events: ${workflow.adaptive.replanEvents.length}
- Condensed log entries: ${workflow.adaptive.condensedLog.length}
${workflow.adaptive.replanEvents.map((event) => `- ${event.id}: ${event.status} ${event.action} — ${event.summary}`).join("\n") || "- Pending adaptive judgments."}

## Environment Inventory

- Harness: ${workflow.environmentInventory.harness}
- Skills: ${workflow.environmentInventory.skills.map((skill) => skill.name).join(", ") || "none"}
- Subagent types: ${workflow.environmentInventory.subagentTypes.join(", ")}
- Personas: ${workflow.environmentInventory.personas.join(", ")}
- Core tool categories: ${workflow.environmentInventory.coreToolCategories.join(", ")}
- MCP notes: ${workflow.environmentInventory.mcps.join(", ") || "none"}

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
	if (lower.includes("review") || lower.includes("evaluator")) return "reviewer";
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
	const spec = packet.executionSpec || normalizeExecutionSpec(undefined, packet, {
		dynamic: true,
		reason: "launch fallback",
		signals: [],
		requiredPlugins: [],
		recommendedPackets: [],
		riskLevel: "medium",
		score: 0,
	}, buildEnvironmentInventory(packet.objective, {
		dynamic: true,
		reason: "launch fallback",
		signals: [],
		requiredPlugins: [],
		recommendedPackets: [],
		riskLevel: "medium",
		score: 0,
	}));
	const contract =
		`executionSpec=${JSON.stringify(spec)}; output=${spec.outputContract}; include toolsUsedForSelfResolution, suggestedNextActions, confidence, and Plugin evidence; owner receives refined result only.`;
	const packetPath = `${workflowDir}/packets/${packet.id}.md`;
	const resultPath = `${workflowDir}/results/${packet.id}.md`;
	const refinedInstruction = `Follow ${packetPath} exactly. ${contract}`;
	if (harness === "grok") {
		return `Grok task: task({ description: ${JSON.stringify(`Packet ${packet.id}: ${packet.objective}`)}, subagent_type: ${JSON.stringify(spec.subagentType)}, persona: ${JSON.stringify(spec.persona || agentKind)}, capability_mode: ${JSON.stringify(spec.capabilityMode)}, prompt: ${JSON.stringify(`${refinedInstruction} Write refined result to ${resultPath}. End with: Plugin evidence: dynamic-workflow ${packet.role} via Grok task + ${spec.persona || agentKind} persona.`)}, worktree: ${spec.worktreeIsolation ? "true" : "false"} })`;
	}
	if (harness === "claude") {
		return `Claude: @reliable-${agentKind} (or Agent(reliable-${agentKind})) with prompt ${JSON.stringify(`${refinedInstruction} Write refined output to ${resultPath}. Copy docs/examples/claude-agents/reliable-${agentKind}.md first.`)}`;
	}
	if (harness === "codex") {
		return `codex --profile deep-review ${JSON.stringify(`You are the ${agentKind} defined in .codex/agents/${agentKind}.toml (copy from docs/examples/codex-agents/${agentKind}.toml). Packet: read ${packetPath}. ${contract} Write refined result + 'Plugin evidence: dynamic-workflow ${packet.role} via Codex ${agentKind} agent' to ${resultPath}. Capability mode: ${spec.capabilityMode}.`)}`;
	}
	if (harness === "pi") {
		return `Pi: subagent({ agent: ${JSON.stringify(agentKind === "reviewer" ? "reviewer" : agentKind === "researcher" ? "scout" : "worker")}, task: ${JSON.stringify(`${refinedInstruction} Output refined-json-v1 to ${resultPath} + Plugin evidence.`)}, model: ${JSON.stringify(`openai-codex/gpt-5.5:${agentKind === "implementer" ? "medium" : "high"}`)}, async: true })`;
	}
	return `cc-router: taskctl capability --role ${packet.role} --instruction ${JSON.stringify(`Follow ${packetPath}; ${contract}; write portable refined result to ${resultPath}; include Plugin evidence: dynamic-workflow ${packet.role} via cc-router/taskctl.`)}`;
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
	packetId?: string;
	trigger?: string;
	action?: ReplanEvent["action"];
	resultFile?: string;
	resultStatus?: PacketResult["status"];
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
		else if (item === "--packet") args.packetId = argv[++i] || undefined;
		else if (item === "--trigger") args.trigger = argv[++i] || undefined;
		else if (item === "--action") args.action = parseReplanAction(argv[++i] || "");
		else if (item === "--result-file") args.resultFile = argv[++i] || undefined;
		else if (item === "--status") args.resultStatus = parseResultStatus(argv[++i] || "");
		else args.prompt.push(item);
	}
	return args;
}

function parseScope(value: string): "plan" | "execute" | "release" {
	if (value === "plan" || value === "execute" || value === "release")
		return value;
	throw new Error("--scope must be one of: plan, execute, release");
}

function parseReplanAction(value: string): ReplanEvent["action"] {
	if (
		value === "continue" ||
		value === "split-next" ||
		value === "insert-evaluator" ||
		value === "reorder" ||
		value === "blocked"
	) {
		return value;
	}
	throw new Error(
		"--action must be one of: continue, split-next, insert-evaluator, reorder, blocked",
	);
}

function parseResultStatus(value: string): PacketResult["status"] {
	if (value === "success" || value === "failure" || value === "blocked") return value;
	throw new Error("--status must be one of: success, failure, blocked");
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
  record-result --packet ID [--status success|failure|blocked] [--result-file FILE] <dir>
                                    Ingest a real worker Markdown/JSON result into workflow.json.
  verify [--complete] <dir>         Validate structure, or full completion with --complete.
  inventory [--json] <dir>          Print captured environment inventory.
  refined-results [--json] <dir>    Print compact refined packet results.
  adaptive-step [--packet ID] [--trigger TEXT] [--action continue|split-next|insert-evaluator|reorder|blocked] <dir> <reason>
                                    Record a post-node adaptive judgment/replan event.
  e2e [--root DIR] [--json] <prompt>
                                    Create, approve, simulate, and verify a full workflow.
  launch-packets [--harness auto|codex|claude|grok|pi|cc-router] <workflow-dir>
                                    Print harness-specific spawn commands
                                    for subagent-mode packets. Uses native primitives where
                                    available (Grok task/spawn, Claude Agent/@, Codex with tomls,
                                    Pi subagent calls) or documented fallbacks + cc-router taskctl
                                    note. Workers must write results into the workflow results/ dir,
                                    then owner runs record-result before verify --complete.
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
		if (args.command === "record-result") {
			const workflowDir = args.prompt[0];
			if (!workflowDir) throw new Error("record-result requires workflow directory");
			if (!args.packetId) throw new Error("record-result requires --packet ID");
			const recorded = recordPacketResult({
				workflowDir,
				packetId: args.packetId,
				resultFile: args.resultFile,
				status: args.resultStatus,
			});
			if (args.json) console.log(JSON.stringify(recorded, null, 2));
			else console.log(`recorded result for ${recorded.result.packetId}: ${recorded.result.status}`);
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
		if (args.command === "inventory") {
			const workflowDir = args.prompt[0];
			if (!workflowDir) throw new Error("inventory requires workflow directory");
			const inventory = getWorkflowInventory(workflowDir);
			if (args.json) console.log(JSON.stringify(inventory, null, 2));
			else {
				console.log(`harness=${inventory.harness}`);
				console.log(
					`skills=${inventory.skills.map((skill) => skill.name).join(",") || "none"}`,
				);
				console.log(
					`available_adapters=${inventory.harnessAdapters.filter((adapter) => adapter.available).map((adapter) => adapter.name).join(",") || "none"}`,
				);
			}
			return 0;
		}
		if (args.command === "refined-results") {
			const workflowDir = args.prompt[0];
			if (!workflowDir) throw new Error("refined-results requires workflow directory");
			const refined = getRefinedResults(workflowDir);
			if (args.json) console.log(JSON.stringify(refined, null, 2));
			else {
				for (const result of refined) {
					console.log(`${result.packetId}: ${result.verdict} (${result.confidence}) ${result.executiveSummary}`);
				}
			}
			return 0;
		}
		if (args.command === "adaptive-step") {
			const workflowDir = args.prompt[0];
			if (!workflowDir) throw new Error("adaptive-step requires workflow directory");
			const reason = args.prompt.slice(1).join(" ").trim();
			if (!reason) throw new Error("adaptive-step requires a reason");
			const recorded = recordAdaptiveReplan({
				workflowDir,
				packetId: args.packetId,
				trigger: args.trigger,
				reason,
				action: args.action || "continue",
			});
			if (args.json) console.log(JSON.stringify(recorded, null, 2));
			else console.log(`adaptive event recorded: ${recorded.event.id}`);
			return 0;
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
			console.log("# Results must be written back to results/<packet>.md, then ingested with record-result.");
			console.log("# See docs/CROSS_HARNESS_SUBAGENT_TRIGGERING.md for exact syntax per harness + cc-router interop.");
			const suggestions = listLaunchSuggestions({
				workflowDir,
				harness,
				packetId: args.packetId,
			});
			let emitted = 0;
			let currentPacket = "";
			for (const suggestion of suggestions) {
				if (currentPacket !== suggestion.packetId) {
					const packet = workflow.packets.find((item) => item.id === suggestion.packetId);
					currentPacket = suggestion.packetId;
					emitted += 1;
					console.log(`\n# ${suggestion.packetId} (${suggestion.role}, deps: ${packet?.dependencies.join(",") || "none"})`);
				}
				console.log(suggestion.command);
			}
			if (emitted === 0)
				console.log("\n# No subagent-mode packets found in this workflow. Nothing to launch.");
			console.log("\n# After each worker finishes, run: node .../dynamic_workflow.ts record-result --packet <packet-id> " + workflowDir);
			console.log("# Then run: node .../dynamic_workflow.ts verify --complete " + workflowDir);
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
