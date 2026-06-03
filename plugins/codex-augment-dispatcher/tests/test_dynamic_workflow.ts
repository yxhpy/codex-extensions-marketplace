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
		assert.equal(report.workflow?.schemaVersion, 2);
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
