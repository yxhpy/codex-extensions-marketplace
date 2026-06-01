#!/usr/bin/env -S node --experimental-strip-types
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
	DYNAMIC_WORKFLOW_PLUGIN,
	detectDynamicWorkflow,
} from "./dynamic_workflow.ts";
import {
	PLAN_SCHEMA,
	PlanError,
	Task,
	TaskPlan,
	TaskPlanner,
	buildDefaultThinker,
	stringList,
	taskFromRaw,
	tryParseJson,
	type Thinker,
} from "./task_gate.ts";

type JsonValue = unknown;

type RunResult = {
	stdout?: string;
	stderr?: string;
	status?: number | null;
	error?: Error & { code?: string };
};

type Runner = (args: string[], options: Record<string, JsonValue>) => RunResult;

export const FOLLOWUP_SCHEMA = {
	type: "object",
	properties: {
		complete: { type: "boolean" },
		summary: { type: "string" },
		next_tasks: PLAN_SCHEMA.properties.tasks,
	},
	required: ["complete", "summary"],
	additionalProperties: false,
};

export const ROUTE_SCHEMA = {
	type: "object",
	properties: {
		route: { type: "string" },
		reason: { type: "string" },
		required_plugins: {
			type: "array",
			items: { type: "string" },
		},
		plugin_evidence_required: { type: "boolean" },
	},
	required: ["route", "required_plugins", "plugin_evidence_required"],
	additionalProperties: false,
};

export class GateResult {
	exitCode: number;
	output: string;

	constructor({
		exitCode,
		output = "",
	}: { exitCode: number; output?: string }) {
		this.exitCode = exitCode;
		this.output = output;
	}
}

export class RouteDecision {
	route: string;
	reason: string;
	requiredPlugins: string[];
	pluginEvidenceRequired: boolean;

	constructor({
		route,
		reason = "",
		requiredPlugins = [],
		pluginEvidenceRequired,
	}: {
		route: string;
		reason?: string;
		requiredPlugins?: string[];
		pluginEvidenceRequired?: boolean;
	}) {
		this.route = route.trim() || "simple";
		this.reason = reason.trim();
		this.requiredPlugins = Array.from(
			new Set(requiredPlugins.map((plugin) => plugin.trim()).filter(Boolean)),
		);
		this.pluginEvidenceRequired =
			pluginEvidenceRequired ?? this.requiredPlugins.length > 0;
	}
}

export class CodexRunResult {
	exitCode: number;
	output: string;

	constructor({
		exitCode,
		output = "",
	}: { exitCode: number; output?: string }) {
		this.exitCode = exitCode;
		this.output = output;
	}
}

export class FollowupDecision {
	complete: boolean;
	summary: string;
	nextTasks: Task[];

	constructor({
		complete,
		summary = "",
		nextTasks = [],
	}: {
		complete: boolean;
		summary?: string;
		nextTasks?: Task[];
	}) {
		this.complete = complete;
		this.summary = summary;
		this.nextTasks = nextTasks;
	}
}

function defaultRunner(args: string[]): RunResult {
	const [command, ...rest] = args;
	if (!command) return { status: 1, stderr: "missing command" };
	return spawnSync(command, rest, { encoding: "utf8" }) as RunResult;
}

export class CodexExecutor {
	command: string;
	runner: Runner;

	constructor({
		command,
		runner = defaultRunner,
	}: { command?: string; runner?: Runner } = {}) {
		this.command = command || process.env.TASK_GATE_CODEX_BIN || "codex";
		this.runner = runner;
	}

	execute({
		codexPrompt,
		cwd,
		extraArgs = [],
	}: {
		codexPrompt: string;
		cwd?: string;
		extraArgs?: string[];
	}): CodexRunResult {
		const args = [this.command, "exec", "--skip-git-repo-check"];
		if (cwd) args.push("-C", cwd);
		args.push(...extraArgs, codexPrompt);
		const completed = this.runner(args, {
			text: true,
			check: false,
			captureOutput: true,
		});
		if (completed.error?.code === "ENOENT") {
			throw new PlanError(`codex command not found: ${this.command}`);
		}
		const stdout = (completed.stdout || "").trim();
		const stderr = (completed.stderr || "").trim();
		return new CodexRunResult({
			exitCode: Number(completed.status ?? 0),
			output: [stdout, stderr].filter(Boolean).join("\n"),
		});
	}
}

export class FollowupPlanner {
	thinker: Thinker;
	maxTasks: number;

	constructor({
		thinker,
		maxTasks = 8,
	}: { thinker?: Thinker; maxTasks?: number } = {}) {
		this.thinker = thinker || buildDefaultThinker(FOLLOWUP_SCHEMA);
		this.maxTasks = maxTasks;
	}

	assess({
		plan,
		codexOutput,
		exitCode,
		roundNumber,
		routeDecision,
	}: {
		plan: TaskPlan;
		codexOutput: string;
		exitCode: number;
		roundNumber: number;
		routeDecision?: RouteDecision;
	}): FollowupDecision {
		const prompt = buildFollowupPrompt({
			plan,
			codexOutput,
			exitCode,
			roundNumber,
			maxTasks: this.maxTasks,
			routeDecision,
		});
		return parseFollowupOutput(this.thinker.think(prompt), this.maxTasks);
	}
}

export class RoutePlanner {
	thinker: Thinker;

	constructor({ thinker }: { thinker?: Thinker } = {}) {
		this.thinker = thinker || buildDefaultThinker(ROUTE_SCHEMA);
	}

	classify(prompt: string): RouteDecision {
		if (!prompt.trim()) throw new PlanError("prompt must not be blank");
		const detection = detectDynamicWorkflow(prompt);
		try {
			return mergeDynamicWorkflowDecision(
				parseRouteOutput(this.thinker.think(buildRoutePrompt(prompt)), {
					sourcePrompt: prompt,
				}),
				detection,
			);
		} catch (error) {
			if (error instanceof PlanError && detection.dynamic) {
				return routeDecisionFromDynamicDetection(detection, error.message);
			}
			throw error;
		}
	}
}

export function mergeDynamicWorkflowDecision(
	decision: RouteDecision,
	detection: ReturnType<typeof detectDynamicWorkflow>,
): RouteDecision {
	if (!detection.dynamic) return decision;
	const requiredPlugins = Array.from(
		new Set([...decision.requiredPlugins, ...detection.requiredPlugins]),
	);
	const route = decision.route.includes(DYNAMIC_WORKFLOW_PLUGIN)
		? decision.route
		: decision.route === "simple"
			? DYNAMIC_WORKFLOW_PLUGIN
			: `${decision.route}+${DYNAMIC_WORKFLOW_PLUGIN}`;
	const reason = [decision.reason, detection.reason].filter(Boolean).join("; ");
	return new RouteDecision({
		route,
		reason,
		requiredPlugins,
		pluginEvidenceRequired: true,
	});
}

export function routeDecisionFromDynamicDetection(
	detection: ReturnType<typeof detectDynamicWorkflow>,
	classifierError = "route classifier unavailable",
): RouteDecision {
	return new RouteDecision({
		route: DYNAMIC_WORKFLOW_PLUGIN,
		reason: `${detection.reason}; deterministic fallback after ${classifierError}`,
		requiredPlugins: detection.requiredPlugins,
		pluginEvidenceRequired: detection.requiredPlugins.length > 0,
	});
}

export class CodexGate {
	planner: { plan(prompt: string): TaskPlan };
	routePlanner: { classify(prompt: string): RouteDecision };
	executor: CodexExecutor;
	followupPlanner: {
		assess(args: Record<string, JsonValue>): FollowupDecision;
	};

	constructor({
		planner,
		routePlanner,
		executor,
		followupPlanner,
	}: {
		planner?: { plan(prompt: string): TaskPlan };
		routePlanner?: { classify(prompt: string): RouteDecision };
		executor?: CodexExecutor;
		followupPlanner?: {
			assess(args: Record<string, JsonValue>): FollowupDecision;
		};
	} = {}) {
		this.planner = planner || new TaskPlanner();
		this.routePlanner = routePlanner || new RoutePlanner();
		this.executor = executor || new CodexExecutor();
		this.followupPlanner = followupPlanner || new FollowupPlanner();
	}

	run({
		prompt,
		execute = false,
		cwd,
		codexArgs = [],
		maxRounds = 3,
	}: {
		prompt: string;
		execute?: boolean;
		cwd?: string;
		codexArgs?: string[];
		maxRounds?: number;
	}): GateResult {
		let plan: TaskPlan;
		let routeDecision: RouteDecision;
		try {
			routeDecision = this.routePlanner.classify(prompt);
			plan = this.planner.plan(prompt);
		} catch (error) {
			if (error instanceof PlanError) {
				return new GateResult({
					exitCode: 1,
					output: `task-gate: ${error.message}`,
				});
			}
			throw error;
		}

		const initialReport = [
			"Route decision:",
			formatRouteDecision(routeDecision),
			"Initial task plan:",
			plan.asNumberedText(),
		];

		if (!execute)
			return new GateResult({ exitCode: 0, output: initialReport.join("\n") });
		if (maxRounds < 1) {
			return new GateResult({
				exitCode: 1,
				output: "task-gate: max_rounds must be at least 1",
			});
		}

		let currentPlan = plan;
		const reports = initialReport;
		for (let roundNumber = 1; roundNumber <= maxRounds; roundNumber += 1) {
			const codexPrompt = buildCodexExecutionPrompt(
				currentPlan,
				roundNumber,
				routeDecision,
			);
			try {
				const runResult = this.executor.execute({
					codexPrompt,
					cwd,
					extraArgs: codexArgs,
				});
				let decision = this.followupPlanner.assess({
					plan: currentPlan,
					codexOutput: runResult.output,
					exitCode: runResult.exitCode,
					roundNumber,
					routeDecision,
				});
				decision = enforcePluginEvidence(
					routeDecision,
					runResult.output,
					decision,
				);
				reports.push(formatRoundReport(roundNumber, runResult, decision));
				if (decision.complete && runResult.exitCode === 0) {
					reports.push("Task Gate completion verdict: complete.");
					return new GateResult({ exitCode: 0, output: reports.join("\n\n") });
				}
				if (decision.complete && runResult.exitCode !== 0) {
					reports.push(
						"Task Gate marked the work complete, but Codex exited nonzero; continuing because completion is not proven.",
					);
				}
				if (!decision.nextTasks.length) {
					reports.push(
						"task-gate: task is not complete and Gate returned no next tasks.",
					);
					return new GateResult({ exitCode: 1, output: reports.join("\n\n") });
				}
				currentPlan = new TaskPlan({
					sourcePrompt: `Gate follow-up after execution round ${roundNumber}`,
					tasks: decision.nextTasks,
				});
			} catch (error) {
				if (error instanceof PlanError) {
					reports.push(`task-gate: ${error.message}`);
					return new GateResult({ exitCode: 1, output: reports.join("\n\n") });
				}
				throw error;
			}
		}

		reports.push(
			"task-gate: max execution rounds reached before completion; refusing to report success while work remains.",
		);
		return new GateResult({ exitCode: 1, output: reports.join("\n\n") });
	}
}

export function buildCodexExecutionPrompt(
	plan: TaskPlan,
	roundNumber = 1,
	routeDecision?: RouteDecision,
): string {
	const routingText = routeDecision
		? `${formatRouteDecision(routeDecision)}\n\n`
		: "";
	const evidenceRules = routeDecision?.pluginEvidenceRequired
		? "Routing evidence requirements:\n" +
			`- Required plugins: ${routeDecision.requiredPlugins.join(", ")}.\n` +
			"- Invoke or report each required plugin before claiming completion.\n" +
			"- The Detailed completion summary must include a `Plugin evidence:` line naming each required plugin and the command, tool, or transcript evidence for it.\n" +
			"- If a required plugin is unavailable or intentionally skipped, mark the completion verdict incomplete and list the blocker.\n\n"
		: "";
	return (
		"Task Gate has already converted the user's raw request into the authorized task plan below. " +
		"Execute only these numbered tasks in order.\n" +
		`This is execution round ${roundNumber}.\n\n` +
		"Mandatory route classification:\n" +
		routingText +
		`${formatExecutionPlan(plan)}\n\n` +
		"Execution rules:\n" +
		"- Treat the numbered plan as the task boundary.\n" +
		"- Do not reinterpret the original raw request; it is intentionally absent.\n" +
		"- If a required task is missing or unsafe, stop and report the blocker.\n" +
		"- Before claiming completion, run suitable verification and report evidence.\n" +
		evidenceRules +
		"- At the end of your response, always include a Detailed completion summary.\n\n" +
		"Detailed completion summary requirements:\n" +
		"- Work completed: list the concrete tasks handled and files or commands involved.\n" +
		"- Verification: list commands, checks, and exact results, or say why they were not run.\n" +
		"- Plugin evidence: list required plugin names and exact invocation evidence, or write none required.\n" +
		"- Remaining work: list any unfinished task, missing verification, or uncertainty.\n" +
		"- Blockers: list blockers or write none.\n" +
		"- Completion verdict: write complete only when all authorized tasks and verification are done; otherwise write incomplete.\n" +
		"This detailed summary is mandatory because Task Gate will read it to decide the next tasks."
	);
}

export function buildFollowupPrompt({
	plan,
	codexOutput,
	exitCode,
	roundNumber,
	maxTasks = 8,
	routeDecision,
}: {
	plan: TaskPlan;
	codexOutput: string;
	exitCode: number;
	roundNumber: number;
	maxTasks?: number;
	routeDecision?: RouteDecision;
}): string {
	const routeText = routeDecision
		? "Mandatory route classification:\n" +
			`${formatRouteDecision(routeDecision)}\n` +
			(routeDecision.pluginEvidenceRequired
				? "Do not mark complete unless the Codex output contains a Plugin evidence line naming every required plugin.\n\n"
				: "\n")
		: "";
	return (
		"You are Task Gate reviewing the end of a Codex execution round. " +
		"The raw user prompt is intentionally absent; use only the authorized task plan and Codex's detailed completion summary.\n" +
		"Return only JSON matching this shape: " +
		'{"complete":false,"summary":"detailed assessment",' +
		'"next_tasks":[{"title":"next task","details":"optional detail",' +
		'"acceptance_criteria":["optional check"]}]}.\n' +
		`If complete is false, provide 1 to ${maxTasks} concrete next_tasks so Codex can continue. ` +
		"If complete is true, next_tasks may be empty. Do not mark complete when verification is missing, " +
		"Codex exited nonzero, or the summary says work remains.\n\n" +
		`Execution round: ${roundNumber}\n` +
		`Codex exit code: ${exitCode}\n\n` +
		routeText +
		"Authorized task plan:\n" +
		`${formatExecutionPlan(plan)}\n\n` +
		"Codex detailed completion summary and output:\n" +
		clipText(codexOutput)
	);
}

export function buildRoutePrompt(prompt: string): string {
	return (
		"Classify the raw user prompt before Codex executes any work. " +
		"Return only JSON matching this shape: " +
		'{"route":"simple","reason":"short reason","required_plugins":["plugin-name"],"plugin_evidence_required":true}.\n' +
		"Available routes and mandatory plugins:\n" +
		"- dynamic-workflow: use dynamic-workflow for complex, multi-track, approval-gated, subagent/packet, artifact, or end-to-end verified work.\n" +
		"- frontend: use agy-frontend for frontend build, edit, redesign, styling, layout, interaction, browser UI work, or visual verification; AGY must not start dev/preview servers.\n" +
		"- assets: use asset-slicer for generated icon sheets, sprite sheets, multi-asset bitmap slicing, crop drift checks, dirty-cut checks, or 切图/切分图标 requests.\n" +
		"- research: use grok-augment for current research, outside critique, risk review, product/frontend direction, creative paths, or Grok video briefs/generation.\n" +
		"- planning: use task-gate for broad, multi-step, ambiguous, risky, or decomposition-first work.\n" +
		"- stuck: use thinking-gate when Codex is stuck, uncertain, looping, or needs divergent thinking.\n" +
		"- review: use grok-augment or task-gate when independent critique, regression audit, or release-readiness review is needed.\n" +
		"- simple: no required plugins only for trivial, low-risk tasks that do not match another route.\n" +
		"Set required_plugins to every plugin that must be invoked before completion. " +
		"Set plugin_evidence_required true whenever required_plugins is not empty. " +
		"Do not solve or execute the task; only classify the route.\n\n" +
		`Raw user prompt:\n${prompt.trim()}`
	);
}

export function parseRouteOutput(
	output: string,
	{ sourcePrompt }: { sourcePrompt: string },
): RouteDecision {
	if (!output.trim())
		throw new PlanError("route classifier returned an empty decision");
	const parsed = tryParseJson(output);
	if (parsed === null)
		throw new PlanError("route classifier returned invalid JSON");
	return routeFromJson(parsed, sourcePrompt);
}

export function parseFollowupOutput(
	output: string,
	maxTasks = 8,
): FollowupDecision {
	const parsed = tryParseJson(output);
	if (parsed === null)
		throw new PlanError("follow-up gate returned invalid JSON");
	return followupFromJson(parsed, maxTasks);
}

function routeFromJson(parsed: JsonValue, sourcePrompt: string): RouteDecision {
	const record = asRecord(parsed);
	if (record && asRecord(record.structured_output))
		return routeFromJson(record.structured_output, sourcePrompt);
	if (record && typeof record.result === "string") {
		const nested = tryParseJson(record.result);
		if (nested !== null) return routeFromJson(nested, sourcePrompt);
	}
	if (!record) throw new PlanError("route classifier JSON must be an object");
	const route = String(
		record.route || record.category || record.kind || "",
	).trim();
	if (!route) throw new PlanError("route classifier JSON must contain a route");
	const requiredPlugins = stringList(
		record.required_plugins || record.requiredPlugins || record.plugins || [],
	);
	const rawEvidence =
		record.plugin_evidence_required ?? record.pluginEvidenceRequired;
	let pluginEvidenceRequired = requiredPlugins.length > 0;
	if (typeof rawEvidence === "boolean") pluginEvidenceRequired = rawEvidence;
	else if (typeof rawEvidence === "string") {
		pluginEvidenceRequired = ["true", "yes", "required"].includes(
			rawEvidence.trim().toLowerCase(),
		);
	}
	if (requiredPlugins.length > 0 && !pluginEvidenceRequired) {
		throw new PlanError(
			"route classifier cannot require plugins without plugin evidence",
		);
	}
	return new RouteDecision({
		route,
		reason: String(
			record.reason ||
				record.rationale ||
				`Classified prompt: ${sourcePrompt.slice(0, 80)}`,
		).trim(),
		requiredPlugins,
		pluginEvidenceRequired,
	});
}

function followupFromJson(
	parsed: JsonValue,
	maxTasks: number,
): FollowupDecision {
	const record = asRecord(parsed);
	if (record && asRecord(record.structured_output))
		return followupFromJson(record.structured_output, maxTasks);
	if (record && typeof record.result === "string") {
		const nested = tryParseJson(record.result);
		if (nested !== null) return followupFromJson(nested, maxTasks);
	}
	if (!record) throw new PlanError("follow-up gate JSON must be an object");
	const hasComplete = Object.keys(record).includes("complete");
	const complete = boolFromRaw(
		hasComplete ? record.complete : record.is_complete || record.done,
	);
	const summary = String(record.summary || record.assessment || "").trim();
	const rawTasks = record.next_tasks || record.tasks || [];
	const nextTasks: Task[] = [];
	if (Array.isArray(rawTasks)) {
		for (const raw of rawTasks.slice(0, maxTasks)) {
			const task = taskFromRaw(raw, nextTasks.length + 1);
			if (task) nextTasks.push(task);
		}
	}
	return new FollowupDecision({ complete, summary, nextTasks });
}

function enforcePluginEvidence(
	routeDecision: RouteDecision,
	codexOutput: string,
	decision: FollowupDecision,
): FollowupDecision {
	if (
		!routeDecision.pluginEvidenceRequired ||
		hasRequiredPluginEvidence(routeDecision, codexOutput)
	)
		return decision;
	const missing = missingPluginEvidence(routeDecision, codexOutput);
	return new FollowupDecision({
		complete: false,
		summary: `missing required plugin evidence: ${missing.join(", ")}`,
		nextTasks: [
			new Task({
				id: 1,
				title: "Provide required plugin evidence before completion",
				details:
					"Run or report the required plugin route and include a `Plugin evidence:` line naming every required plugin in the Detailed completion summary.",
				acceptanceCriteria: missing.map(
					(plugin) =>
						`Detailed completion summary includes Plugin evidence for ${plugin}`,
				),
			}),
		],
	});
}

function hasRequiredPluginEvidence(
	routeDecision: RouteDecision,
	text: string,
): boolean {
	return missingPluginEvidence(routeDecision, text).length === 0;
}

function missingPluginEvidence(
	routeDecision: RouteDecision,
	text: string,
): string[] {
	const lower = text.toLowerCase();
	if (!lower.includes("plugin evidence"))
		return [...routeDecision.requiredPlugins];
	return routeDecision.requiredPlugins.filter(
		(plugin) => !lower.includes(plugin.toLowerCase()),
	);
}

function boolFromRaw(raw: JsonValue): boolean {
	if (typeof raw === "boolean") return raw;
	if (typeof raw === "string") {
		const normalized = raw.trim().toLowerCase();
		if (["true", "yes", "done", "complete", "completed"].includes(normalized))
			return true;
		if (
			["false", "no", "incomplete", "remaining", "blocked"].includes(normalized)
		)
			return false;
	}
	throw new PlanError('follow-up gate JSON must contain boolean "complete"');
}

function clipText(text: string): string {
	const limit = Number(process.env.TASK_GATE_CODEX_OUTPUT_CHARS || "12000");
	if (text.length <= limit) return text;
	const omitted = text.length - limit;
	return `[omitted ${omitted} earlier chars]\n${text.slice(-limit)}`;
}

function formatRouteDecision(routeDecision: RouteDecision): string {
	const plugins = routeDecision.requiredPlugins.length
		? routeDecision.requiredPlugins.join(", ")
		: "none";
	return [
		`Route decision: ${routeDecision.route}`,
		`Route reason: ${routeDecision.reason || "not provided"}`,
		`Required plugins: ${plugins}`,
		`Plugin evidence required: ${routeDecision.pluginEvidenceRequired ? "yes" : "no"}`,
	].join("\n");
}

function formatRoundReport(
	roundNumber: number,
	runResult: CodexRunResult,
	decision: FollowupDecision,
): string {
	const lines = [
		`Execution round ${roundNumber}`,
		`Codex exit code: ${runResult.exitCode}`,
		"Codex detailed completion summary:",
		indent(runResult.output || "<no output>"),
		"Gate follow-up:",
		indent(decision.summary || "<no summary>"),
	];
	if (decision.nextTasks.length) {
		lines.push("Gate next tasks:");
		lines.push(
			indent(
				new TaskPlan({
					sourcePrompt: "",
					tasks: decision.nextTasks,
				}).asNumberedText(),
			),
		);
	}
	return lines.join("\n");
}

function indent(text: string): string {
	return text
		.split(/\r?\n/)
		.map((line) => (line ? `  ${line}` : ""))
		.join("\n");
}

function formatExecutionPlan(plan: TaskPlan): string {
	const lines: string[] = [];
	for (const task of plan.tasks) {
		lines.push(`${task.id}. ${task.title}`);
		if (task.details) lines.push(`   Details: ${task.details}`);
		if (task.acceptanceCriteria.length) {
			lines.push("   Acceptance criteria:");
			lines.push(
				...task.acceptanceCriteria.map((criterion) => `   - ${criterion}`),
			);
		}
	}
	return lines.join("\n");
}

function asRecord(value: JsonValue): Record<string, JsonValue> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, JsonValue>)
		: null;
}

type CliArgs = {
	prompt: string[];
	execute: boolean;
	cwd: string;
	maxTasks: number;
	maxRounds: number;
	codexArgs: string[];
};

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = {
		prompt: [],
		execute: false,
		cwd: process.cwd(),
		maxTasks: 8,
		maxRounds: 3,
		codexArgs: [],
	};
	for (let i = 0; i < argv.length; i += 1) {
		const item = argv[i];
		if (item === "--execute") args.execute = true;
		else if (item === "--cwd") args.cwd = argv[++i] || process.cwd();
		else if (item === "--max-tasks") args.maxTasks = Number(argv[++i] || "8");
		else if (item === "--max-rounds") args.maxRounds = Number(argv[++i] || "3");
		else if (item === "--codex-arg") args.codexArgs.push(argv[++i] || "");
		else if (item === "-h" || item === "--help") {
			printHelp();
			process.exit(0);
		} else if (item) args.prompt.push(item);
	}
	return args;
}

function printHelp(): void {
	console.log(`usage: codex_gate.ts [--execute] [--cwd DIR] [--max-tasks N] [--max-rounds N] [--codex-arg ARG] [prompt ...]

Plan a raw prompt first, then optionally execute the plan with Codex.`);
}

export function main(argv = process.argv.slice(2)): number {
	const args = parseArgs(argv);
	const prompt = args.prompt.join(" ").trim() || readFileSync(0, "utf8").trim();
	const gate = new CodexGate({
		planner: new TaskPlanner({ maxTasks: args.maxTasks }),
		followupPlanner: new FollowupPlanner({ maxTasks: args.maxTasks }),
	});
	const result = gate.run({
		prompt,
		execute: args.execute,
		cwd: args.cwd,
		codexArgs: args.codexArgs.filter(Boolean),
		maxRounds: args.maxRounds,
	});
	if (result.output) {
		const stream = result.exitCode === 0 ? process.stdout : process.stderr;
		stream.write(`${result.output}\n`);
	}
	return result.exitCode;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
}
