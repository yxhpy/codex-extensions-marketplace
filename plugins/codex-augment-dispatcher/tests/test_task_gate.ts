import assert from "node:assert/strict";
import test from "node:test";

import {
	ClaudeCliThinker,
	THINK_SCHEMA,
	Task,
	TaskPlan,
	TaskPlanner,
	ThinkingPlanner,
	parsePlanOutput,
	parseThinkingOutput,
} from "../scripts/task_gate.ts";
import {
	CodexExecutor,
	CodexGate,
	FollowupDecision,
	RouteDecision,
	RoutePlanner,
	buildCodexExecutionPrompt,
	buildRoutePrompt,
} from "../scripts/codex_gate.ts";

class FakeThinker {
	output: string;
	prompts: string[] = [];

	constructor(output: string) {
		this.output = output;
	}

	think(prompt: string): string {
		this.prompts.push(prompt);
		return this.output;
	}
}

class StaticRoutePlanner {
	decision: RouteDecision;
	prompts: string[] = [];

	constructor(
		decision = new RouteDecision({
			route: "simple",
			requiredPlugins: [],
			reason: "No plugin required.",
		}),
	) {
		this.decision = decision;
	}

	classify(prompt: string): RouteDecision {
		this.prompts.push(prompt);
		return this.decision;
	}
}

test("planner turns prompt into numbered tasks", () => {
	const thinker = new FakeThinker(
		JSON.stringify({
			tasks: [
				{ title: "Inspect the repository" },
				{ title: "Implement the requested change" },
				{ title: "Run focused verification" },
			],
		}),
	);

	const plan = new TaskPlanner({ thinker }).plan(
		"Add task gating to this plugin",
	);

	assert.deepEqual(
		plan.tasks.map((task) => task.id),
		[1, 2, 3],
	);
	assert.deepEqual(
		plan.tasks.map((task) => task.title),
		[
			"Inspect the repository",
			"Implement the requested change",
			"Run focused verification",
		],
	);
	assert.match(thinker.prompts[0], /Add task gating to this plugin/);
	assert.match(thinker.prompts[0], /Preserve exact filenames/);
	assert.equal(
		plan.asNumberedText(),
		"1. Inspect the repository\n2. Implement the requested change\n3. Run focused verification",
	);
});

test("parser accepts numbered text fallback", () => {
	const plan = parsePlanOutput(
		"1. Clarify scope\n2. Write tests\n3. Implement and verify",
		{
			sourcePrompt: "Build a gate",
		},
	);

	assert.deepEqual(
		plan.tasks.map((task) => task.title),
		["Clarify scope", "Write tests", "Implement and verify"],
	);
});

test("parser accepts Claude CLI structured output envelope", () => {
	const plan = parsePlanOutput(
		JSON.stringify({
			type: "result",
			result: "Natural language summary",
			structured_output: {
				tasks: [
					{
						title: "Use the structured output field",
						details: "Claude CLI wraps JSON schema results here.",
					},
				],
			},
		}),
		{ sourcePrompt: "Plan with Claude CLI" },
	);

	assert.equal(plan.tasks[0].title, "Use the structured output field");
});

test("thinking planner turns stuck prompt into candidate ideas", () => {
	const thinker = new FakeThinker(
		JSON.stringify({
			ideas: [
				{
					title: "Trace the smallest failing surface",
					rationale: "A narrow reproduction can reveal the next move.",
					tradeoffs: ["Fast to run", "May miss systemic causes"],
					risks: ["Could overfit to one symptom"],
					validation: ["One focused test fails before implementation"],
				},
				{
					title: "Map adjacent approaches",
					rationale: "Comparing alternatives can unlock a better path.",
				},
			],
			recommendation: "Start with the smallest failing surface.",
			next_tasks: [
				{ title: "Write a failing characterization test" },
				{ title: "Pick the cheapest reversible fix" },
			],
		}),
	);

	const plan = new ThinkingPlanner({ thinker, maxIdeas: 7 }).think(
		"Codex is stuck and has no good next step",
	);

	assert.deepEqual(
		plan.ideas.map((idea) => idea.id),
		[1, 2],
	);
	assert.equal(plan.ideas[0].title, "Trace the smallest failing surface");
	assert.deepEqual(plan.ideas[0].tradeoffs, [
		"Fast to run",
		"May miss systemic causes",
	]);
	assert.equal(plan.recommendation, "Start with the smallest failing surface.");
	assert.deepEqual(
		plan.nextTasks.map((task) => task.title),
		[
			"Write a failing characterization test",
			"Pick the cheapest reversible fix",
		],
	);
	assert.match(thinker.prompts[0], /divergent thinking mode/);
	assert.match(thinker.prompts[0], /Codex is stuck and has no good next step/);
});

test("thinking parser accepts Claude CLI structured output envelope", () => {
	const plan = parseThinkingOutput(
		JSON.stringify({
			type: "result",
			result: "Natural language summary",
			structured_output: {
				ideas: [
					{
						title: "Read structured_output first",
						rationale: "Claude CLI returns schema data separately.",
					},
				],
				next_tasks: [{ title: "Keep parser aligned" }],
			},
		}),
		{ sourcePrompt: "Codex is stuck" },
	);

	assert.equal(plan.ideas[0].title, "Read structured_output first");
	assert.equal(plan.nextTasks[0].title, "Keep parser aligned");
});

test("blank prompt is rejected before calling thinker", () => {
	const thinker = new FakeThinker('{"tasks":["unused"]}');

	assert.throws(
		() => new TaskPlanner({ thinker }).plan("   "),
		/prompt must not be blank/,
	);
	assert.deepEqual(thinker.prompts, []);
});

test("Claude CLI thinker uses noninteractive structured mode", () => {
	const calls: Array<[string[], Record<string, unknown>]> = [];
	const thinker = new ClaudeCliThinker({
		command: "/fake/claude",
		timeoutSeconds: 9,
		runner(args, options) {
			calls.push([args, options]);
			return { status: 0, stdout: '{"tasks":["Split prompt"]}', stderr: "" };
		},
	});

	assert.equal(thinker.think("Plan this"), '{"tasks":["Split prompt"]}');
	const [args, options] = calls[0];
	assert.equal(args[0], "/fake/claude");
	assert.ok(args.includes("--print"));
	assert.equal(args[args.indexOf("--output-format") + 1], "json");
	assert.ok(args.includes("--json-schema"));
	assert.ok(!args.includes("--tools"));
	assert.match(args[args.length - 1] || "", /Plan this/);
	assert.equal(options.timeout, 9000);
	assert.equal(options.captureOutput, true);
});

test("Claude CLI error reports stdout when stderr is empty", () => {
	const thinker = new ClaudeCliThinker({
		command: "/fake/claude",
		runner() {
			return { status: 1, stdout: "Error: Exceeded USD budget", stderr: "" };
		},
	});

	assert.throws(() => thinker.think("Plan this"), /Exceeded USD budget/);
});

test("Claude CLI thinker defaults to long timeout", () => {
	const oldEnv = process.env.TASK_GATE_CLAUDE_TIMEOUT;
	delete process.env.TASK_GATE_CLAUDE_TIMEOUT;
	try {
		const thinker = new ClaudeCliThinker({ command: "/fake/claude" });
		assert.equal(thinker.timeoutSeconds, 300);
	} finally {
		if (oldEnv === undefined) delete process.env.TASK_GATE_CLAUDE_TIMEOUT;
		else process.env.TASK_GATE_CLAUDE_TIMEOUT = oldEnv;
	}
});

test("default thinker uses CLI even when API credentials exist", async () => {
	const oldEnv = { ...process.env };
	process.env.ANTHROPIC_AUTH_TOKEN = "secret-token";
	process.env.ANTHROPIC_BASE_URL = "https://example.test/anthropic";
	process.env.ANTHROPIC_MODEL = "fast-model";
	process.env.TASK_GATE_THINKER = "auto";
	try {
		const { buildDefaultThinker } = await import("../scripts/task_gate.ts");
		const thinker = buildDefaultThinker();
		assert.ok(thinker instanceof ClaudeCliThinker);
		assert.deepEqual((thinker as ClaudeCliThinker).outputSchema.required, [
			"tasks",
		]);
	} finally {
		process.env = oldEnv;
	}
});

test("thinking planner default thinker uses thinking schema", () => {
	const oldEnv = { ...process.env };
	process.env.TASK_GATE_THINKER = "auto";
	try {
		const planner = new ThinkingPlanner();
		assert.equal(
			(planner.thinker as ClaudeCliThinker).outputSchema,
			THINK_SCHEMA,
		);
	} finally {
		process.env = oldEnv;
	}
});

test("route planner classifies plugin-demanding prompts", () => {
	const thinker = new FakeThinker(
		JSON.stringify({
			route: "frontend",
			reason: "Frontend implementation should route through AGY.",
			required_plugins: ["agy-frontend"],
			plugin_evidence_required: true,
		}),
	);

	const decision = new RoutePlanner({ thinker }).classify(
		"Redesign the React dashboard",
	);

	assert.equal(decision.route, "frontend");
	assert.deepEqual(decision.requiredPlugins, ["agy-frontend"]);
	assert.equal(decision.pluginEvidenceRequired, true);
	assert.match(thinker.prompts[0], /Classify the raw user prompt/);
	assert.match(thinker.prompts[0], /agy-frontend/);
	assert.match(thinker.prompts[0], /asset-slicer/);
});

test("route planner advertises GSAP animation for webpage motion", () => {
	const routePrompt = buildRoutePrompt(
		"给 React 页面加入 ScrollTrigger 视差动效",
	);
	assert.match(routePrompt, /gsap-animation/);
	assert.match(routePrompt, /ScrollTrigger/);
	assert.match(routePrompt, /agy-frontend/);

	const thinker = new FakeThinker(
		JSON.stringify({
			route: "frontend+gsap-animation",
			reason: "Webpage motion should use AGY with GSAP guidance.",
			required_plugins: ["agy-frontend", "gsap-animation"],
			plugin_evidence_required: true,
		}),
	);

	const decision = new RoutePlanner({ thinker }).classify(
		"给 React 页面加入 ScrollTrigger 视差动效",
	);

	assert.equal(decision.route, "frontend+gsap-animation");
	assert.deepEqual(decision.requiredPlugins, [
		"agy-frontend",
		"gsap-animation",
	]);
	assert.equal(decision.pluginEvidenceRequired, true);
	assert.match(thinker.prompts[0], /gsap-animation/);
	assert.match(thinker.prompts[0], /parallax/);
});

test("route prompt advertises background thread and worker fanout triggers", () => {
	const routePrompt = buildRoutePrompt("Classify this");
	const routeGuide = routePrompt.split("Raw user prompt:")[0] || routePrompt;

	assert.match(routeGuide, /background threads?/i);
	assert.match(routeGuide, /fan\s*out|fanout/i);
	assert.match(routeGuide, /worker agents?|agent threads?/i);
	assert.match(routeGuide, /parallel review\/research\/QA/i);
	assert.match(routeGuide, /subagents?|subagent\/packet/i);
});

test("route prompt advertises reliable workflow for cross CLI delivery", () => {
	const routePrompt = buildRoutePrompt(
		"深度分析给出优化方案，通用于 Pi Codex Claude Grok 等 CLI 工具，并完成 e2e 验证",
	);

	assert.match(routePrompt, /reliable-agent-workflow/);
	assert.match(routePrompt, /Codex, Claude Code, Grok, Pi/);
	assert.match(routePrompt, /optimization plans/);
	assert.match(routePrompt, /SkillOpt-style skill optimization/);
	assert.match(routePrompt, /self-evolving agent skills/);
	assert.match(routePrompt, /zero-open-issue/);

	const thinker = new FakeThinker(
		JSON.stringify({
			route: "reliable-agent-workflow",
			reason: "Reliable cross-harness delivery is required.",
			required_plugins: ["reliable-agent-workflow"],
			plugin_evidence_required: true,
		}),
	);

	const decision = new RoutePlanner({ thinker }).classify(
		"深度分析给出优化方案，通用于 Pi Codex Claude Grok 等 CLI 工具，并完成 e2e 验证",
	);

	assert.equal(decision.route, "reliable-agent-workflow+dynamic-workflow");
	assert.deepEqual(decision.requiredPlugins, [
		"reliable-agent-workflow",
		"dynamic-workflow",
		"task-gate",
	]);
	assert.equal(decision.pluginEvidenceRequired, true);
});

test("route prompt advertises workflow interop and MCP generator routes", () => {
	const routePrompt = buildRoutePrompt(
		"用 ultracode workflow script 和 .claude/workflows 桥接，再生成 MCP helper",
	);

	assert.match(routePrompt, /ultracode/);
	assert.match(routePrompt, /workflow script/);
	assert.match(routePrompt, /\.claude\/workflows/);
	assert.match(routePrompt, /\.atomic/);
	assert.match(routePrompt, /mcp-generator/);
	assert.match(routePrompt, /stdio JSON-RPC/);
});

test("route planner advertises asset slicer for generated sheets", () => {
	const thinker = new FakeThinker(
		JSON.stringify({
			route: "assets",
			reason: "Generated icon sheets need deterministic slicing checks.",
			required_plugins: ["asset-slicer"],
			plugin_evidence_required: true,
		}),
	);

	const decision = new RoutePlanner({ thinker }).classify(
		"切分这张生成的图标素材图，避免切偏",
	);

	assert.equal(decision.route, "assets");
	assert.deepEqual(decision.requiredPlugins, ["asset-slicer"]);
	assert.equal(decision.pluginEvidenceRequired, true);
	assert.match(thinker.prompts[0], /sprite sheets/);
	assert.match(thinker.prompts[0], /generated icons/);
	assert.match(thinker.prompts[0], /image_gen sheet generation/);
	assert.match(thinker.prompts[0], /切图/);
});

test("route planner merges deterministic dynamic workflow detection", () => {
	const thinker = new FakeThinker(
		JSON.stringify({
			route: "planning",
			reason: "Planner sees a broad request.",
			required_plugins: ["task-gate"],
			plugin_evidence_required: true,
		}),
	);

	const decision = new RoutePlanner({ thinker }).classify(
		"把迁移拆成支持 subagent 的动态工作流，包含 workflow artifacts、approval gates 和端到端验证",
	);

	assert.equal(decision.route, "planning+dynamic-workflow");
	assert.deepEqual(decision.requiredPlugins, ["task-gate", "dynamic-workflow"]);
	assert.equal(decision.pluginEvidenceRequired, true);
	assert.match(thinker.prompts[0], /dynamic-workflow/);
	assert.match(thinker.prompts[0], /approval-gated/);
});

test("route planner falls back to deterministic workflow detection when classifier fails", () => {
	const thinker = new FakeThinker("not json");

	const decision = new RoutePlanner({ thinker }).classify(
		"Use subagents and packet/result workflow artifacts for an end-to-end verified migration",
	);

	assert.equal(decision.route, "dynamic-workflow");
	assert.ok(decision.requiredPlugins.includes("dynamic-workflow"));
	assert.ok(decision.requiredPlugins.includes("task-gate"));
	assert.match(decision.reason, /deterministic fallback/);
});

test("codex gate dry run plans without executing codex", () => {
	const codexCalls: string[][] = [];
	const gate = new CodexGate({
		planner: new TaskPlanner({
			thinker: new FakeThinker('{"tasks":["Plan only"]}'),
		}),
		routePlanner: new StaticRoutePlanner(),
		executor: new CodexExecutor({
			command: "/fake/codex",
			runner(args) {
				codexCalls.push(args);
				return { status: 0 };
			},
		}),
	});

	const result = gate.run({ prompt: "Sensitive raw prompt", execute: false });

	assert.equal(result.exitCode, 0);
	assert.deepEqual(codexCalls, []);
	assert.match(result.output, /1\. Plan only/);
});

test("codex gate execute sends only task plan to codex", () => {
	const codexCalls: Array<[string[], Record<string, unknown>]> = [];
	class CompleteFollowup {
		assess(): FollowupDecision {
			return new FollowupDecision({
				complete: true,
				summary: "All tasks are complete.",
			});
		}
	}
	const gate = new CodexGate({
		planner: new TaskPlanner({
			thinker: new FakeThinker(
				JSON.stringify({
					tasks: [{ title: "Inspect files" }, { title: "Run verification" }],
				}),
			),
		}),
		executor: new CodexExecutor({
			command: "/fake/codex",
			runner(args, options) {
				codexCalls.push([args, options]);
				return {
					status: 0,
					stdout: "Detailed completion summary: complete",
					stderr: "",
				};
			},
		}),
		routePlanner: new StaticRoutePlanner(),
		followupPlanner: new CompleteFollowup(),
	});

	const result = gate.run({
		prompt: "Sensitive raw prompt",
		execute: true,
		cwd: "/tmp/work",
	});

	assert.equal(result.exitCode, 0);
	const [args, options] = codexCalls[0];
	assert.deepEqual(args.slice(0, 2), ["/fake/codex", "exec"]);
	assert.ok(args.includes("-C"));
	assert.ok(args.includes("/tmp/work"));
	const codexPrompt = args[args.length - 1] || "";
	assert.match(codexPrompt, /1\. Inspect files/);
	assert.match(codexPrompt, /2\. Run verification/);
	assert.doesNotMatch(codexPrompt, /Sensitive raw prompt/);
	assert.equal(options.check, false);
	assert.equal(options.captureOutput, true);
	assert.match(codexPrompt, /Detailed completion summary/);
	assert.match(result.output, /Gate follow-up/);
});

test("codex gate execution prompt requires plugin evidence for plugin routes", () => {
	const plan = new TaskPlan({
		sourcePrompt: "Fix frontend layout",
		tasks: [new Task({ id: 1, title: "Update the dashboard layout" })],
	});
	const route = new RouteDecision({
		route: "frontend",
		reason: "Frontend work must route through AGY.",
		requiredPlugins: ["agy-frontend"],
		pluginEvidenceRequired: true,
	});

	const codexPrompt = buildCodexExecutionPrompt(plan, 1, route);

	assert.match(codexPrompt, /Route decision: frontend/);
	assert.match(codexPrompt, /agy-frontend/);
	assert.match(codexPrompt, /Plugin evidence/);
	assert.match(codexPrompt, /Completion verdict/);
});

test("codex gate refuses completion when required plugin evidence is missing", () => {
	class StaticPlanner {
		plan(prompt: string): TaskPlan {
			return new TaskPlan({
				sourcePrompt: prompt,
				tasks: [new Task({ id: 1, title: "Implement frontend slice" })],
			});
		}
	}
	class CompleteFollowup {
		assess(): FollowupDecision {
			return new FollowupDecision({
				complete: true,
				summary: "All tasks are complete.",
			});
		}
	}
	const gate = new CodexGate({
		planner: new StaticPlanner(),
		routePlanner: new StaticRoutePlanner(
			new RouteDecision({
				route: "frontend",
				reason: "Frontend work requires AGY.",
				requiredPlugins: ["agy-frontend"],
				pluginEvidenceRequired: true,
			}),
		),
		executor: new CodexExecutor({
			command: "/fake/codex",
			runner() {
				return {
					status: 0,
					stdout: "Detailed completion summary: complete",
					stderr: "",
				};
			},
		}),
		followupPlanner: new CompleteFollowup(),
	});

	const result = gate.run({
		prompt: "Fix frontend layout",
		execute: true,
		maxRounds: 1,
	});

	assert.equal(result.exitCode, 1);
	assert.match(result.output, /missing required plugin evidence/);
	assert.doesNotMatch(result.output, /Task Gate completion verdict: complete/);
});

test("codex gate requires plugin names on usable Plugin evidence lines", () => {
	class StaticPlanner {
		plan(prompt: string): TaskPlan {
			return new TaskPlan({
				sourcePrompt: prompt,
				tasks: [new Task({ id: 1, title: "Run workflow gate" })],
			});
		}
	}
	class CompleteFollowup {
		assess(): FollowupDecision {
			return new FollowupDecision({
				complete: true,
				summary: "All tasks are complete.",
			});
		}
	}
	const routePlanner = new StaticRoutePlanner(
		new RouteDecision({
			route: "dynamic-workflow",
			reason: "Workflow route requires evidence.",
			requiredPlugins: ["dynamic-workflow", "task-gate"],
			pluginEvidenceRequired: true,
		}),
	);
	const gate = new CodexGate({
		planner: new StaticPlanner(),
		routePlanner,
		executor: new CodexExecutor({
			command: "/fake/codex",
			runner() {
				return {
					status: 0,
					stdout:
						"Detailed completion summary:\n" +
						"Work completed: dynamic-workflow and task-gate were discussed.\n" +
						"Plugin evidence: missing for now.\n" +
						"Completion verdict: complete",
					stderr: "",
				};
			},
		}),
		followupPlanner: new CompleteFollowup(),
	});

	const result = gate.run({
		prompt: "Create a workflow",
		execute: true,
		maxRounds: 1,
	});

	assert.equal(result.exitCode, 1);
	assert.match(
		result.output,
		/missing required plugin evidence: dynamic-workflow, task-gate/,
	);
});

test("codex gate accepts command-backed Plugin evidence lines", () => {
	class StaticPlanner {
		plan(prompt: string): TaskPlan {
			return new TaskPlan({
				sourcePrompt: prompt,
				tasks: [new Task({ id: 1, title: "Run workflow gate" })],
			});
		}
	}
	class CompleteFollowup {
		assess(): FollowupDecision {
			return new FollowupDecision({
				complete: true,
				summary: "All tasks are complete.",
			});
		}
	}
	const gate = new CodexGate({
		planner: new StaticPlanner(),
		routePlanner: new StaticRoutePlanner(
			new RouteDecision({
				route: "dynamic-workflow",
				reason: "Workflow route requires evidence.",
				requiredPlugins: ["dynamic-workflow", "task-gate"],
				pluginEvidenceRequired: true,
			}),
		),
		executor: new CodexExecutor({
			command: "/fake/codex",
			runner() {
				return {
					status: 0,
					stdout:
						"Detailed completion summary:\n" +
						"Plugin evidence: dynamic-workflow via node scripts/dynamic_workflow.ts detect; task-gate via node scripts/task_gate.ts --json.\n" +
						"Completion verdict: complete",
					stderr: "",
				};
			},
		}),
		followupPlanner: new CompleteFollowup(),
	});

	const result = gate.run({
		prompt: "Create a workflow",
		execute: true,
		maxRounds: 1,
	});

	assert.equal(result.exitCode, 0, result.output);
	assert.match(result.output, /Task Gate completion verdict: complete/);
});

test("codex gate rejects negative Plugin evidence segments", () => {
	class StaticPlanner {
		plan(prompt: string): TaskPlan {
			return new TaskPlan({
				sourcePrompt: prompt,
				tasks: [new Task({ id: 1, title: "Run workflow gate" })],
			});
		}
	}
	class CompleteFollowup {
		assess(): FollowupDecision {
			return new FollowupDecision({
				complete: true,
				summary: "All tasks are complete.",
			});
		}
	}
	const gate = new CodexGate({
		planner: new StaticPlanner(),
		routePlanner: new StaticRoutePlanner(
			new RouteDecision({
				route: "dynamic-workflow",
				reason: "Workflow route requires evidence.",
				requiredPlugins: ["dynamic-workflow", "task-gate"],
				pluginEvidenceRequired: true,
			}),
		),
		executor: new CodexExecutor({
			command: "/fake/codex",
			runner() {
				return {
					status: 0,
					stdout:
						"Detailed completion summary:\n" +
						"Plugin evidence: dynamic-workflow via node scripts/dynamic_workflow.ts detect; task-gate skipped because unavailable.\n" +
						"Completion verdict: complete",
					stderr: "",
				};
			},
		}),
		followupPlanner: new CompleteFollowup(),
	});

	const result = gate.run({
		prompt: "Create a workflow",
		execute: true,
		maxRounds: 1,
	});

	assert.equal(result.exitCode, 1);
	assert.match(result.output, /missing required plugin evidence: task-gate/);
});

test("codex gate continues with gate next tasks until complete", () => {
	class StaticPlanner {
		plan(prompt: string): TaskPlan {
			return new TaskPlan({
				sourcePrompt: prompt,
				tasks: [new Task({ id: 1, title: "Implement slice" })],
			});
		}
	}
	class Followup {
		calls: Record<string, unknown>[] = [];

		assess(kwargs: Record<string, unknown>): FollowupDecision {
			this.calls.push(kwargs);
			if (kwargs.roundNumber === 1) {
				return new FollowupDecision({
					complete: false,
					summary: "Verification is still missing.",
					nextTasks: [new Task({ id: 1, title: "Run verification" })],
				});
			}
			return new FollowupDecision({
				complete: true,
				summary: "Verification passed.",
			});
		}
	}
	const codexCalls: string[] = [];
	const followup = new Followup();
	const gate = new CodexGate({
		planner: new StaticPlanner(),
		routePlanner: new StaticRoutePlanner(),
		executor: new CodexExecutor({
			command: "/fake/codex",
			runner(args) {
				codexCalls.push(args[args.length - 1] || "");
				return {
					status: 0,
					stdout: `Detailed completion summary: round ${codexCalls.length}`,
					stderr: "",
				};
			},
		}),
		followupPlanner: followup,
	});

	const result = gate.run({
		prompt: "Sensitive raw prompt",
		execute: true,
		maxRounds: 3,
	});

	assert.equal(result.exitCode, 0);
	assert.equal(codexCalls.length, 2);
	assert.match(codexCalls[0], /1\. Implement slice/);
	assert.match(codexCalls[1], /1\. Run verification/);
	assert.doesNotMatch(codexCalls[0], /Sensitive raw prompt/);
	assert.doesNotMatch(codexCalls[1], /Sensitive raw prompt/);
	assert.equal(followup.calls.length, 2);
	assert.match(String(followup.calls[0].codexOutput), /round 1/);
	assert.match(result.output, /Verification is still missing/);
	assert.match(result.output, /Verification passed/);
});

test("codex gate returns failure when max rounds reached before completion", () => {
	class StaticPlanner {
		plan(prompt: string): TaskPlan {
			return new TaskPlan({
				sourcePrompt: prompt,
				tasks: [new Task({ id: 1, title: "Keep working" })],
			});
		}
	}
	class IncompleteFollowup {
		assess(): FollowupDecision {
			return new FollowupDecision({
				complete: false,
				summary: "More work remains.",
				nextTasks: [new Task({ id: 1, title: "Continue the remaining work" })],
			});
		}
	}
	const codexCalls: string[] = [];
	const gate = new CodexGate({
		planner: new StaticPlanner(),
		routePlanner: new StaticRoutePlanner(),
		executor: new CodexExecutor({
			command: "/fake/codex",
			runner(args) {
				codexCalls.push(args[args.length - 1] || "");
				return {
					status: 0,
					stdout: "Detailed completion summary: incomplete",
					stderr: "",
				};
			},
		}),
		followupPlanner: new IncompleteFollowup(),
	});

	const result = gate.run({
		prompt: "Sensitive raw prompt",
		execute: true,
		maxRounds: 2,
	});

	assert.equal(result.exitCode, 1);
	assert.equal(codexCalls.length, 2);
	assert.match(result.output, /max execution rounds reached before completion/);
});

test("codex execution prompt includes details and acceptance criteria", () => {
	const plan = new TaskPlan({
		sourcePrompt: "Create a file with secret raw wording",
		tasks: [
			new Task({
				id: 1,
				title: "Create ACTUAL_REMOTE_TEST_RESULT.txt",
				details:
					"Write TASK_GATE_REMOTE_CODEX_OK into ACTUAL_REMOTE_TEST_RESULT.txt.",
				acceptanceCriteria: [
					"ACTUAL_REMOTE_TEST_RESULT.txt contains TASK_GATE_REMOTE_CODEX_OK",
				],
			}),
		],
	});

	const codexPrompt = buildCodexExecutionPrompt(plan);

	assert.match(codexPrompt, /1\. Create ACTUAL_REMOTE_TEST_RESULT.txt/);
	assert.match(codexPrompt, /Write TASK_GATE_REMOTE_CODEX_OK/);
	assert.match(
		codexPrompt,
		/ACTUAL_REMOTE_TEST_RESULT.txt contains TASK_GATE_REMOTE_CODEX_OK/,
	);
	assert.match(codexPrompt, /Detailed completion summary/);
	assert.match(codexPrompt, /Completion verdict/);
	assert.doesNotMatch(codexPrompt, /secret raw wording/);
});
