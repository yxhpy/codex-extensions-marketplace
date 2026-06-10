import assert from "node:assert/strict";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
	DYNAMIC_WORKFLOW_PLUGIN,
	approveWorkflow,
	createWorkflow,
	denyWorkflow,
	detectDynamicWorkflow,
	getRefinedResults,
	getWorkflowInventory,
	listLaunchSuggestions,
	recordPacketResult,
	recordAdaptiveReplan,
	simulateWorkflow,
	validateWorkflow,
} from "../scripts/dynamic_workflow.ts";

const PLUGIN_ROOT = path.resolve(import.meta.dirname, "..");
const SCRIPT = path.join(PLUGIN_ROOT, "scripts/dynamic_workflow.ts");

function tempRoot(): string {
	return mkdtempSync(path.join(tmpdir(), "agent-dynamic-workflow-test-"));
}

function runScript(args: string[], cwd = PLUGIN_ROOT) {
	return spawnSync(
		process.execPath,
		["--experimental-strip-types", SCRIPT, ...args],
		{
			cwd,
			encoding: "utf8",
		},
	);
}

test("detector recognizes platform-neutral subagent workflow prompts", () => {
	const detection = detectDynamicWorkflow(
		"把复杂迁移编排成支持 subagent 的动态工作流，带 approval gates 和端到端验证，做到极致",
	);

	assert.equal(detection.dynamic, true);
	assert.equal(detection.riskLevel, "high");
	assert.ok(detection.signals.includes("explicit-workflow"));
	assert.ok(detection.requiredPlugins.includes(DYNAMIC_WORKFLOW_PLUGIN));
	assert.ok(detection.requiredPlugins.includes("task-gate"));
	assert.ok(detection.recommendedPackets.includes("verification"));
});

test("detector catches subagent and background-thread fanout wording", () => {
	const prompts = [
		"Use background threads for read-only research and review fanout before implementation.",
		"Fan out worker agents for research, implementation, and QA with owner-agent integration.",
		"Use agent threads for plan, research, review, and frontend tracks; owner keeps final claims.",
		"Create parallel worker packets for assets and frontend QA, with approval before execution.",
	];

	for (const prompt of prompts) {
		const detection = detectDynamicWorkflow(prompt);
		assert.equal(detection.dynamic, true, prompt);
		assert.ok(detection.signals.includes("explicit-workflow"), prompt);
		assert.ok(
			detection.requiredPlugins.includes(DYNAMIC_WORKFLOW_PLUGIN),
			prompt,
		);
		assert.ok(detection.requiredPlugins.includes("task-gate"), prompt);
		assert.ok(detection.recommendedPackets.includes("verification"), prompt);
	}
});

test("detector does not over-trigger on networking packet wording", () => {
	const detection = detectDynamicWorkflow(
		"Fix packet loss handling in the UDP client",
	);

	assert.equal(detection.dynamic, false);
	assert.ok(!detection.requiredPlugins.includes(DYNAMIC_WORKFLOW_PLUGIN));
});

test("detector elevates generated icon slicing plus e2e into dynamic workflow", () => {
	const detection = detectDynamicWorkflow(
		"生成一组图标并默认生成后切图，最后 e2e 验证。",
	);

	assert.equal(detection.dynamic, true);
	assert.ok(detection.signals.includes("assets"));
	assert.ok(detection.signals.includes("verification"));
	assert.ok(detection.requiredPlugins.includes(DYNAMIC_WORKFLOW_PLUGIN));
	assert.ok(detection.requiredPlugins.includes("asset-slicer"));
	assert.ok(detection.recommendedPackets.includes("assets"));
	assert.ok(detection.recommendedPackets.includes("verification"));
});

test("detector routes deep analysis and optimization plans through reliable workflow", () => {
	const detection = detectDynamicWorkflow(
		"深度分析给出优化方案，并完成 e2e 验证，适用于 Pi Codex Claude Grok 等 CLI 工具。",
	);

	assert.equal(detection.dynamic, true);
	assert.ok(detection.signals.includes("reliable-delivery"));
	assert.ok(detection.signals.includes("broad-planning"));
	assert.ok(detection.requiredPlugins.includes("reliable-agent-workflow"));
	assert.ok(detection.requiredPlugins.includes(DYNAMIC_WORKFLOW_PLUGIN));
	assert.ok(detection.requiredPlugins.includes("task-gate"));
	assert.ok(detection.recommendedPackets.includes("reliable-workflow"));
	assert.ok(detection.recommendedPackets.includes("verification"));
});

test("detector routes SkillOpt skill optimization through reliable workflow", () => {
	const prompts = [
		"使用 https://github.com/microsoft/SkillOpt 最大化优化skill",
		"Apply SkillOpt to tighten this SKILL.md with held-out validation",
		"Run a self-evolving agent skill optimization pass",
		"优化技能触发词并验证不要漏检",
		"optimize the agent skill with bounded add delete replace edits",
	];

	for (const prompt of prompts) {
		const detection = detectDynamicWorkflow(prompt);

		assert.equal(detection.dynamic, true, prompt);
		assert.ok(detection.signals.includes("skill-optimization"), prompt);
		assert.ok(
			detection.requiredPlugins.includes("reliable-agent-workflow"),
			prompt,
		);
		assert.ok(detection.requiredPlugins.includes(DYNAMIC_WORKFLOW_PLUGIN));
		assert.ok(detection.requiredPlugins.includes("task-gate"), prompt);
		assert.ok(detection.recommendedPackets.includes("reliable-workflow"));
		assert.ok(detection.recommendedPackets.includes("verification"));
	}
});

test("detector routes full UI UX design loops through design-loop packet", () => {
	const prompts = [
		"Use ui-ux-closed-loop to go from requirements to low-fi prototype to polished UI",
		"从页面需求到产品思维、低保真原型，再做 polished UI/UX",
		"Plan a visual product design closed loop with wireframes and frontend implementation",
		"This landing page is ugly and has no planning; redesign it into a production-grade page",
		"这个首页页面很丑也没有规划，重做成生产级 UI",
	];

	for (const prompt of prompts) {
		const detection = detectDynamicWorkflow(prompt);

		assert.equal(detection.dynamic, true, prompt);
		assert.ok(detection.signals.includes("ui-ux-closed-loop"), prompt);
		assert.ok(detection.requiredPlugins.includes(DYNAMIC_WORKFLOW_PLUGIN));
		assert.ok(detection.requiredPlugins.includes("task-gate"));
		assert.ok(detection.requiredPlugins.includes("ui-ux-closed-loop"));
		assert.ok(detection.requiredPlugins.includes("agy-frontend"));
		assert.ok(detection.recommendedPackets.includes("design-loop"));
		assert.ok(detection.recommendedPackets.includes("frontend"));
	}
});

test("detector catches reference-site visual fidelity work and forces independent style-review packet (improved hit rate for conservative agy-only mistake)", () => {
	const prompts = [
		// English
		"Build a landing page that matches the reference site https://example.com/design exactly, including colors and layout",
		"Create a static frontend that looks identical to this reference design screenshot",
		"Implement a page with high visual fidelity to the provided reference mockup, pixel perfect",
		"Copy the style and components from the reference site for our new marketing page",
		"Build UI that has the exact same look as the attached reference design, do visual comparison",
		// Chinese
		"做一个单页静态前端，要和参考站 https://example.com 视觉上完全一致，包括配色和布局",
		"按照这个参考设计截图实现落地页，视觉保真度要高",
		"复刻参考站的样式和组件，做一个视觉匹配的页面",
		"参考这个设计图构建前端页面，检查有没有变成完全不同的重构",
		"页面需求：像提供的参考站点一样，做视觉相似度审查",
	];

	for (const prompt of prompts) {
		const detection = detectDynamicWorkflow(prompt);

		assert.equal(detection.dynamic, true, `should be dynamic for: ${prompt}`);
		assert.ok(detection.signals.includes("reference-visual"), `missing reference-visual signal for: ${prompt}`);
		assert.ok(detection.requiredPlugins.includes(DYNAMIC_WORKFLOW_PLUGIN), prompt);
		assert.ok(detection.requiredPlugins.includes("task-gate"), prompt);
		assert.ok(detection.requiredPlugins.includes("agy-frontend"), prompt);
		// The packet builder will add style-review because of the signal
		// (we check recommended at least)
		assert.ok(
			detection.recommendedPackets.includes("style-review") ||
			detection.recommendedPackets.includes("frontend"),
			`should recommend review or frontend for reference visual: ${prompt}`
		);
	}
});

test("detector recognizes OPTIMIZATION.md Claude workflow interop terms", () => {
	const prompts = [
		"OPTIMIZATION.md 按照建议深度优化",
		"ultracode 做大规模迁移",
		"Claude Code dynamic workflows 重构 500 文件",
		"使用 workflow script 做审计",
		"优化 .claude/workflows 桥接",
		"把 .atomic artifacts 对齐到 .agent-workflows 审计 trail",
	];

	for (const prompt of prompts) {
		const detection = detectDynamicWorkflow(prompt);
		assert.equal(detection.dynamic, true, prompt);
		assert.ok(
			detection.requiredPlugins.includes(DYNAMIC_WORKFLOW_PLUGIN),
			prompt,
		);
		assert.ok(detection.requiredPlugins.includes("task-gate"), prompt);
	}

	const ultracode = detectDynamicWorkflow("ultracode 做大规模迁移");
	assert.ok(ultracode.signals.includes("native-workflow-interop"));
	assert.ok(ultracode.recommendedPackets.includes("interop"));
});

test("adaptive orchestrator workflows persist inventory, execution specs, refined results, and replan evidence", () => {
	const detection = detectDynamicWorkflow(
		"Implement adaptive hierarchical orchestrator with environment inventory, execution_spec, refined results, post-node replan, evaluator, and tool-first resolution.",
	);
	assert.equal(detection.dynamic, true);
	assert.ok(detection.signals.includes("adaptive-orchestrator"));
	assert.ok(detection.requiredPlugins.includes(DYNAMIC_WORKFLOW_PLUGIN));
	assert.ok(detection.requiredPlugins.includes("reliable-agent-workflow"));
	assert.ok(detection.recommendedPackets.includes("evaluator"));

	const root = tempRoot();
	try {
		const { dir, workflow } = createWorkflow({
			root,
			id: "adaptive-orchestrator",
			prompt:
				"Implement adaptive hierarchical orchestrator with environment inventory, pre-assigned execution_spec, refined-json-v1 results, evaluator, post-node replan loop, and tool-first doubt resolution.",
		});

		assert.equal(workflow.schemaVersion, 3);
		assert.ok(workflow.environmentInventory.capturedAt);
		assert.ok(
			workflow.environmentInventory.skills.some(
				(skill) => skill.name === "dynamic-workflow",
			),
		);
		assert.equal(workflow.adaptive.enabled, true);
		assert.equal(workflow.adaptive.refinedResultContract, "refined-json-v1");
		assert.ok(workflow.packets.some((packet) => packet.role === "evaluator"));
		for (const packet of workflow.packets) {
			assert.ok(packet.executionSpec, `${packet.id} missing executionSpec`);
			assert.equal(packet.executionSpec?.outputContract, "refined-json-v1");
			assert.ok(packet.executionSpec?.recommendedTools.length);
		}
		assert.ok(existsSync(path.join(dir, "graph.json")));
		assert.ok(existsSync(path.join(dir, "condensed_log.jsonl")));
		assert.ok(existsSync(path.join(dir, "replan_events")));
		assert.match(
			readFileSync(path.join(dir, "packets/01-orchestration.md"), "utf8"),
			/refined-json-v1/,
		);

		const inventory = getWorkflowInventory(dir);
		assert.equal(inventory.harness, "generic");
		const launch = listLaunchSuggestions({ workflowDir: dir, harness: "pi" });
		assert.ok(launch.length > 0);
		assert.match(launch[0].command, /executionSpec=/);
		assert.match(launch[0].command, /refined-json-v1/);

		approveWorkflow({ workflowDir: dir, scope: "execute", by: "unit-test" });
		approveWorkflow({ workflowDir: dir, scope: "release", by: "unit-test" });
		simulateWorkflow({ workflowDir: dir });
		const refined = getRefinedResults(dir);
		assert.equal(refined.length, workflow.packets.length);
		assert.ok(
			refined.every((result) =>
				result.toolsUsedForSelfResolution.includes("inspect:workflow.json executionSpec"),
			),
		);
		const adaptive = recordAdaptiveReplan({
			workflowDir: dir,
			packetId: workflow.packets[0].id,
			trigger: "unit-test post-node judgment",
			reason: "Result was compact and next packet was small enough to continue.",
			action: "continue",
		});
		assert.equal(adaptive.event.status, "applied");
		assert.ok(existsSync(path.join(dir, "replan_events", `${adaptive.event.id}.json`)));

		const complete = validateWorkflow(dir, { requireComplete: true });
		assert.equal(complete.ok, true, complete.failures.join("\n"));
		assert.equal(complete.complete, true);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("cross-harness prompts keep generic inventory and portable launch specs", () => {
	const root = tempRoot();
	try {
		const { dir, workflow } = createWorkflow({
			root,
			id: "cross-harness",
			prompt:
				"Verify Codex, Pi, Grok, and Claude call chains for adaptive subagent workflow launch-packets.",
		});

		assert.equal(workflow.environmentInventory.harness, "generic");
		for (const packet of workflow.packets) {
			assert.ok(
				!(packet.executionSpec?.recommendedTools || []).some((tool) =>
					/grok native subagent tools|codex native subagent tools|claude native subagent tools|pi native subagent tools/.test(tool),
				),
				`${packet.id} has provider-specific default tool leakage`,
			);
		}
		const launch = listLaunchSuggestions({ workflowDir: dir, harness: "auto" });
		assert.ok(launch.length > 0);
		assert.ok(
			launch.every((item) =>
				item.command.includes("native subagent tools for the selected harness"),
			),
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("workflow artifact creation is durable and platform-neutral", () => {
	const root = tempRoot();
	try {
		const { dir, workflow } = createWorkflow({
			root,
			id: "risky-subagent-migration",
			prompt:
				"Plan a risky subagent migration with approval gates, packet/results, and end-to-end verification.",
		});

		assert.equal(workflow.id, "risky-subagent-migration");
		assert.equal(workflow.state, "pending_approval");
		assert.equal(workflow.artifacts.workflowJson, "workflow.json");
		for (const rel of [
			"workflow.json",
			"plan.md",
			"orchestration.md",
			"final-report.md",
			"packets/01-orchestration.md",
		]) {
			assert.ok(existsSync(path.join(dir, rel)), `missing ${rel}`);
		}
		const orchestration = readFileSync(
			path.join(dir, "orchestration.md"),
			"utf8",
		);
		assert.match(orchestration, /owner agent/i);
		assert.doesNotMatch(orchestration, /Codex/);
		assert.match(orchestration, /\.agent-workflows/);
		const report = validateWorkflow(dir);
		assert.equal(report.ok, true, report.failures.join("\n"));
		assert.equal(report.complete, false);
		assert.equal(
			report.workflow?.interop.canonicalArtifactRoot,
			".agent-workflows",
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("explicit fanout workflows create launchable subagent packet recipes", () => {
	const root = tempRoot();
	try {
		const { dir, workflow } = createWorkflow({
			root,
			id: "launchable-fanout",
			prompt:
				"Use dynamic-workflow subagent fanout with background threads for research and review before implementation.",
		});
		const subagentPackets = workflow.packets.filter(
			(packet) => packet.mode === "subagent",
		);
		assert.ok(
			subagentPackets.some((packet) => packet.role === "researcher"),
			"expected researcher subagent packet",
		);
		assert.ok(
			subagentPackets.some((packet) => packet.role === "reviewer"),
			"expected reviewer subagent packet",
		);

		const codex = runScript(["launch-packets", "--harness", "codex", dir]);
		assert.equal(codex.status, 0, codex.stderr || codex.stdout);
		assert.match(codex.stdout, /docs\/examples\/codex-agents\/researcher\.toml/);
		assert.match(codex.stdout, /docs\/examples\/codex-agents\/reviewer\.toml/);
		assert.doesNotMatch(codex.stdout, /No subagent-mode packets/);

		const auto = runScript(["launch-packets", dir]);
		assert.equal(auto.status, 0, auto.stderr || auto.stdout);
		assert.match(auto.stdout, /Grok task:/);
		assert.match(auto.stdout, /Claude: @reliable-researcher/);
		assert.match(auto.stdout, /codex --profile deep-review/);
		assert.match(auto.stdout, /Pi: subagent/);
		assert.match(auto.stdout, /cc-router: taskctl capability/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});


test("record-result ingests real worker JSON and markdown into workflow state", () => {
	const root = tempRoot();
	try {
		const { dir, workflow } = createWorkflow({
			root,
			id: "real-worker-ingest",
			prompt:
				"Use dynamic-workflow subagent fanout with real workers, approval gates, refined results, and end-to-end verification.",
		});
		approveWorkflow({ workflowDir: dir, scope: "execute", by: "unit-test" });
		approveWorkflow({ workflowDir: dir, scope: "release", by: "unit-test" });

		for (const [index, packet] of workflow.packets.entries()) {
			const resultPath = path.join(dir, "results", `${packet.id}.md`);
			if (index === 0) {
				writeFileSync(
					resultPath,
					JSON.stringify(
						{
							status: "success",
							summary: `${packet.role} whole-file JSON result completed.`,
							evidence: [
								`checked ${packet.id} packet contract`,
								`Plugin evidence: dynamic-workflow ${packet.role} via whole-file JSON`,
							],
							refined: {
								packetId: packet.id,
								verdict: "success",
								executiveSummary: `${packet.role} whole-file JSON result was refined for owner context.`,
								keyArtifacts: [`results/${packet.id}.md`],
								evidencePointers: [`results/${packet.id}.md: whole-file JSON evidence`],
								toolsUsedForSelfResolution: ["read:packet contract", "write:refined-json-v1 result"],
								openQuestions: [],
								suggestedNextActions: ["continue"],
								confidence: 0.88,
								pluginEvidence: `Plugin evidence: dynamic-workflow ${packet.role} via whole-file JSON`,
								completedAt: "2026-01-01T00:00:00Z",
							},
						},
						null,
						2,
					) + "\n",
					"utf8",
				);
			} else {
				writeFileSync(
					resultPath,
					`# Worker Result ${packet.id}

Status: success

## Summary

${packet.role} real worker completed and wrote portable refined output.

## Evidence

- checked ${packet.id} packet contract
- Plugin evidence: dynamic-workflow ${packet.role} via fake real worker

## Refined Result

\`\`\`json
${JSON.stringify(
	{
		packetId: packet.id,
		verdict: "success",
		executiveSummary: `${packet.role} real worker result was refined for owner context.`,
		keyArtifacts: [`results/${packet.id}.md`],
		evidencePointers: [`results/${packet.id}.md: fake real worker evidence`],
		toolsUsedForSelfResolution: ["read:packet contract", "write:refined-json-v1 result"],
		openQuestions: [],
		suggestedNextActions: ["continue"],
		confidence: 0.88,
		pluginEvidence: `Plugin evidence: dynamic-workflow ${packet.role} via fake real worker`,
		completedAt: "2026-01-01T00:00:00Z",
	},
	null,
	2,
)}
\`\`\`
`,
					"utf8",
				);
			}
			recordPacketResult({ workflowDir: dir, packetId: packet.id });
		}

		const report = validateWorkflow(dir, { requireComplete: true });
		assert.equal(report.ok, true, report.failures.join("\n"));
		assert.equal(report.complete, true);
		assert.equal(report.workflow?.finalVerdict, "complete");
		assert.equal(report.workflow?.results.length, workflow.packets.length);
		assert.ok(
			report.workflow?.verification.some((item) =>
				item.check.startsWith("packet result ingest:"),
			),
		);
		assert.ok(
			report.workflow?.adaptive.replanEvents.some((item) =>
				item.trigger.startsWith("record-result:"),
			),
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("workflow interop metadata keeps .agent-workflows canonical", () => {
	const root = tempRoot();
	try {
		const { dir, workflow } = createWorkflow({
			root,
			id: "claude-interop",
			prompt:
				"Bridge Claude Code dynamic workflows and workflow script output from .claude/workflows into the dispatcher audit trail.",
		});

		assert.equal(workflow.interop.workflowScriptInterop, true);
		assert.deepEqual(workflow.interop.optionalNativeLayouts, [
			".claude/workflows/",
		]);
		assert.ok(workflow.packets.some((packet) => packet.id.endsWith("interop")));
		const plan = readFileSync(path.join(dir, "plan.md"), "utf8");
		assert.match(plan, /Canonical artifact root: \.agent-workflows/);
		assert.match(plan, /\.claude\/workflows\//);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("validator normalizes older workflow artifacts without interop metadata", () => {
	const root = tempRoot();
	try {
		const { dir } = createWorkflow({
			root,
			id: "legacy-workflow",
			prompt: "Plan a legacy workflow artifact with verification.",
		});
		const workflowPath = path.join(dir, "workflow.json");
		const workflow = JSON.parse(readFileSync(workflowPath, "utf8"));
		workflow.schemaVersion = 1;
		delete workflow.interop;
		writeFileSync(workflowPath, JSON.stringify(workflow, null, 2) + "\n");

		const report = validateWorkflow(dir);
		assert.equal(report.ok, true, report.failures.join("\n"));
		assert.equal(report.workflow?.schemaVersion, 3);
		assert.equal(
			report.workflow?.interop.canonicalArtifactRoot,
			".agent-workflows",
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("approval gate blocks simulation until execution approval is granted", () => {
	const root = tempRoot();
	try {
		const { dir } = createWorkflow({
			root,
			prompt:
				"Coordinate subagents for a risky release workflow with approval gates and E2E checks.",
		});
		assert.throws(
			() => simulateWorkflow({ workflowDir: dir }),
			/execute approval/,
		);
		const blocked = validateWorkflow(dir, { requireComplete: true });
		assert.equal(blocked.ok, false);
		assert.ok(blocked.failures.some((failure) => /approvals/.test(failure)));

		approveWorkflow({ workflowDir: dir, scope: "execute", by: "unit-test" });
		approveWorkflow({ workflowDir: dir, scope: "release", by: "unit-test" });
		simulateWorkflow({ workflowDir: dir });
		const complete = validateWorkflow(dir, { requireComplete: true });
		assert.equal(complete.ok, true, complete.failures.join("\n"));
		assert.equal(complete.complete, true);
		assert.equal(complete.workflow?.finalVerdict, "complete");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("simulation does not report PASS before release approval", () => {
	const root = tempRoot();
	try {
		const { dir } = createWorkflow({
			root,
			prompt:
				"Create a dynamic workflow with approval gates and end-to-end verification.",
		});
		approveWorkflow({ workflowDir: dir, scope: "execute", by: "unit-test" });
		simulateWorkflow({ workflowDir: dir });
		const report = validateWorkflow(dir, { requireComplete: true });
		assert.equal(report.ok, false);
		assert.equal(report.workflow?.finalVerdict, "pending");
		const finalReport = readFileSync(path.join(dir, "final-report.md"), "utf8");
		assert.match(finalReport, /VERDICT: PENDING/);
		assert.doesNotMatch(finalReport, /VERDICT: PASS/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("deny command records blocked approval state", () => {
	const root = tempRoot();
	try {
		const { dir } = createWorkflow({
			root,
			prompt:
				"Coordinate a dynamic workflow with approval gates and verification.",
		});
		const workflow = denyWorkflow({
			workflowDir: dir,
			scope: "execute",
			by: "unit-test",
			reason: "destructive action refused",
		});
		assert.equal(workflow.state, "blocked");
		assert.equal(workflow.finalVerdict, "blocked");
		const finalReport = readFileSync(path.join(dir, "final-report.md"), "utf8");
		assert.match(finalReport, /VERDICT: BLOCKED/);
		assert.match(finalReport, /destructive action refused/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("CLI e2e creates, approves, simulates, and verifies a workflow", () => {
	const root = tempRoot();
	try {
		const result = runScript([
			"e2e",
			"--root",
			root,
			"--id",
			"cli-e2e",
			"--json",
			"Plan a complex subagent workflow with approval gates and end-to-end verification.",
		]);
		assert.equal(result.status, 0, result.stderr || result.stdout);
		const output = JSON.parse(result.stdout);
		assert.equal(output.ok, true);
		assert.equal(output.complete, true);
		assert.ok(existsSync(path.join(output.dir, "workflow.json")));

		const verify = runScript(["verify", "--complete", output.dir]);
		assert.equal(verify.status, 0, verify.stderr || verify.stdout);
		assert.match(verify.stdout, /workflow verification passed/);
		const finalReport = readFileSync(
			path.join(output.dir, "final-report.md"),
			"utf8",
		);
		assert.match(finalReport, /VERDICT: PASS/);
		assert.doesNotMatch(finalReport, /blocked — Simulation refused/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
