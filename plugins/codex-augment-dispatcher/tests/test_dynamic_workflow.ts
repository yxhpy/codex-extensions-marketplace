import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
	DYNAMIC_WORKFLOW_PLUGIN,
	approveWorkflow,
	createWorkflow,
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
		const report = validateWorkflow(dir);
		assert.equal(report.ok, true, report.failures.join("\n"));
		assert.equal(report.complete, false);
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
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
