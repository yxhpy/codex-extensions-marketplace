import assert from "node:assert/strict";
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const PLUGIN_ROOT = path.resolve(import.meta.dirname, "..");

function readJson(filePath: string) {
	return JSON.parse(readFileSync(filePath, "utf8"));
}

function runNodeScript(
	scriptPath: string,
	args: string[],
	env: Record<string, string> = {},
) {
	return spawnSync(
		process.execPath,
		["--experimental-strip-types", scriptPath, ...args],
		{
			cwd: PLUGIN_ROOT,
			encoding: "utf8",
			env: {
				...process.env,
				...env,
			},
		},
	);
}

test("merged plugin manifest uses a generic extensible name", () => {
	const manifest = readJson(
		path.join(PLUGIN_ROOT, ".codex-plugin/plugin.json"),
	);

	assert.equal(manifest.name, "codex-augment-dispatcher");
	assert.equal(manifest.version, "0.1.16");
	assert.equal(manifest.skills, "./skills/");
	assert.equal(manifest.interface.displayName, "Codex Augment Dispatcher");
	assert.deepEqual(manifest.author, { name: "yxhpy" });
	for (const capability of [
		"Planning",
		"Research",
		"Review",
		"Frontend",
		"Animation",
		"Coordination",
		"Assets",
	]) {
		assert.ok(
			manifest.interface.capabilities.includes(capability),
			`missing ${capability}`,
		);
	}
	assert.match(manifest.description, /dynamic workflow artifacts/);
	assert.match(manifest.description, /GSAP motion guidance/);
	assert.match(manifest.description, /high-quality media guidance/);
	assert.match(manifest.interface.longDescription, /dynamic-workflow/);
	assert.match(manifest.interface.longDescription, /subagent fanout/);
	assert.match(manifest.interface.longDescription, /worker-agent fanout/);
	assert.match(manifest.interface.longDescription, /GSAP\/ScrollTrigger/);
	assert.match(
		manifest.interface.longDescription,
		/SVG and emoji are prohibited/,
	);
	const defaultPrompt = manifest.interface.defaultPrompt.join("\n");
	assert.match(defaultPrompt, /classify the route/);
	assert.match(defaultPrompt, /Plugin evidence/);
	assert.match(defaultPrompt, /dynamic-workflow/);
	assert.match(defaultPrompt, /task-gate/);
	assert.match(defaultPrompt, /GSAP/);
	assert.match(defaultPrompt, /image_gen/);
	assert.match(defaultPrompt, /slicer/);
	assert.match(defaultPrompt, /subagents/);
	assert.ok(manifest.interface.defaultPrompt.length <= 3);
	for (const prompt of manifest.interface.defaultPrompt) {
		assert.ok(
			prompt.length <= 128,
			`default prompt too long: ${prompt.length}`,
		);
	}
	assert.ok(!("mcpServers" in manifest));
	assert.ok(!("hooks" in manifest));
});

test("main dispatch skill defines generic adapter routing without taking over Codex execution", () => {
	const text = readFileSync(
		path.join(PLUGIN_ROOT, "skills/dispatch/SKILL.md"),
		"utf8",
	);

	for (const phrase of [
		"dynamic-workflow",
		"external CLI adapters",
		"Mandatory Gate",
		"route classification",
		"Plugin evidence",
		"Initial adapters",
		"Add future CLI adapters",
		"Agent Thread And Subagent Fanout",
		"Claude CLI",
		"Grok CLI",
		"AGY CLI",
		"asset-slicer",
		"gsap-animation",
		"GSAP motion design guidance",
		"background threads",
		"worker agents",
		"SVG/emoji defaults",
		"The owner agent owns local file edits, integration, verification, commits, and final claims.",
		"Do not pass secrets, raw credentials, private tokens, or unnecessary full-repo context",
		"No fallback provider is allowed.",
		"Superpowers",
		"owner agent thread responsible for file edits",
		"Do not run parallel writers against the same working tree.",
	]) {
		assert.match(text, new RegExp(escapeRegExp(phrase)));
	}
});

test("routing skill descriptions favor dispatcher before direct adapters", () => {
	const dispatch = readFileSync(
		path.join(PLUGIN_ROOT, "skills/dispatch/SKILL.md"),
		"utf8",
	);
	const taskGate = readFileSync(
		path.join(PLUGIN_ROOT, "skills/task-gate/SKILL.md"),
		"utf8",
	);

	assert.match(dispatch, /description: Use before any non-trivial agent task/);
	assert.match(
		dispatch,
		/classify whether `dynamic-workflow`, `task-gate`, `thinking-gate`, `grok-augment`, `agy-frontend`, `gsap-animation`, or `asset-slicer` should run/,
	);
	assert.match(dispatch, /Use this skill before non-trivial agent work/);
	assert.match(
		taskGate,
		/description: Use for broad, multi-step, ambiguous, risky, or decomposition-first work/,
	);
	assert.match(taskGate, /# Task Gate/);
	assert.doesNotMatch(taskGate, /# Thinking Gate/);
});

test("skills document Pi-compatible helper script paths", () => {
	for (const skill of [
		"dynamic-workflow",
		"task-gate",
		"thinking-gate",
		"grok-augment",
		"dispatch",
		"asset-slicer",
	]) {
		const text = readFileSync(
			path.join(PLUGIN_ROOT, `skills/${skill}/SKILL.md`),
			"utf8",
		);
		assert.match(text, /Script Path Resolution/);
		assert.match(text, /\.\.\/\.\.\/scripts\//);
	}

	const agy = readFileSync(
		path.join(PLUGIN_ROOT, "skills/agy-frontend/SKILL.md"),
		"utf8",
	);
	assert.match(agy, /Script Path Resolution/);
	assert.match(
		agy,
		/<absolute-skill-dir>\/scripts\/verify-static-frontend\.ts/,
	);
});

test("merged plugin keeps existing capability skills under one plugin", () => {
	for (const skill of [
		"skills/dynamic-workflow/SKILL.md",
		"skills/task-gate/SKILL.md",
		"skills/thinking-gate/SKILL.md",
		"skills/grok-augment/SKILL.md",
		"skills/agy-frontend/SKILL.md",
		"skills/gsap-animation/SKILL.md",
		"skills/asset-slicer/SKILL.md",
	]) {
		assert.ok(existsSync(path.join(PLUGIN_ROOT, skill)), `missing ${skill}`);
	}
});

test("GSAP animation skill is wired into AGY motion prompts", () => {
	const skill = readFileSync(
		path.join(PLUGIN_ROOT, "skills/gsap-animation/SKILL.md"),
		"utf8",
	);
	const agy = readFileSync(
		path.join(PLUGIN_ROOT, "skills/agy-frontend/SKILL.md"),
		"utf8",
	);
	const reference = readFileSync(
		path.join(PLUGIN_ROOT, "skills/agy-frontend/references/gsap-motion.md"),
		"utf8",
	);

	for (const phrase of [
		"greensock/gsap-skills",
		"ScrollTrigger",
		"prefers-reduced-motion",
		"gsap.matchMedia()",
		"@gsap/react",
	]) {
		assert.match(skill, new RegExp(escapeRegExp(phrase)));
	}
	assert.match(agy, /gsap-animation/);
	assert.match(agy, /references\/gsap-motion\.md/);
	assert.match(reference, /Motion \/ GSAP/);
	assert.match(reference, /private GreenSock registries/);
});

test("plugin-owned executable scripts are TypeScript only", () => {
	const scriptFiles = readdirSync(path.join(PLUGIN_ROOT, "scripts"), {
		withFileTypes: true,
	})
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.sort();

	assert.ok(scriptFiles.length > 0);
	assert.deepEqual(
		scriptFiles.filter((file) => !file.endsWith(".ts")),
		[],
	);

	for (const script of scriptFiles) {
		const text = readFileSync(
			path.join(PLUGIN_ROOT, "scripts", script),
			"utf8",
		);
		assert.doesNotMatch(
			text,
			new RegExp("playwright_cli\\." + "sh|docker_clean_test\\." + "sh"),
		);
	}
});

test("fake Claude, Grok, and AGY commands exercise clean local smoke paths", () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), "dispatcher-fake-cli-"));
	const fakeClaude = path.join(tempDir, "claude");
	const fakeGrok = path.join(tempDir, "grok");
	const fakeAgy = path.join(tempDir, "agy");

	writeFileSync(
		fakeClaude,
		`#!/bin/sh
printf '%s\\n' '{"tasks":[{"title":"Plan with fake Claude"},{"title":"Verify with fake Claude"}]}'
`,
		"utf8",
	);
	writeFileSync(
		fakeGrok,
		`#!/bin/sh
case "$*" in
  *--version*) echo 'grok 0.0.fake'; exit 0 ;;
  *models*) echo 'grok-build'; exit 0 ;;
  *) echo 'FAKE_GROK_RESPONSE'; exit 0 ;;
esac
`,
		"utf8",
	);
	writeFileSync(
		fakeAgy,
		`#!/bin/sh
case "$*" in
  *--version*) echo 'agy 0.0.fake'; exit 0 ;;
  *) echo 'OK'; exit 0 ;;
esac
`,
		"utf8",
	);
	chmodSync(fakeClaude, 0o755);
	chmodSync(fakeGrok, 0o755);
	chmodSync(fakeAgy, 0o755);

	const env = {
		TASK_GATE_CLAUDE_BIN: fakeClaude,
		GROK_AUGMENT_GROK_BIN: fakeGrok,
		AGY_BIN: fakeAgy,
	};

	const workflow = runNodeScript(
		"scripts/dynamic_workflow.ts",
		[
			"e2e",
			"--root",
			path.join(tempDir, "workflows"),
			"--id",
			"merged-plugin-smoke",
			"--json",
			"Plan a subagent workflow with approval gates and end-to-end verification",
		],
		env,
	);
	assert.equal(workflow.status, 0, workflow.stderr);
	assert.match(workflow.stdout, /"complete": true/);

	const claudePlan = runNodeScript(
		"scripts/task_gate.ts",
		["--json", "Build merged plugin"],
		env,
	);
	assert.equal(claudePlan.status, 0, claudePlan.stderr);
	assert.match(claudePlan.stdout, /Plan with fake Claude/);

	const grokCritic = runNodeScript(
		"scripts/grok_augment.ts",
		["critic", "--json", "Review merged plugin"],
		env,
	);
	assert.equal(grokCritic.status, 0, grokCritic.stderr);
	assert.match(grokCritic.stdout, /FAKE_GROK_RESPONSE/);

	const agyVersion = spawnSync(fakeAgy, ["--version"], { encoding: "utf8" });
	assert.equal(agyVersion.status, 0, agyVersion.stderr);
	assert.match(agyVersion.stdout, /agy 0\.0\.fake/);
});

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
