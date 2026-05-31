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
	assert.equal(manifest.version, "0.1.9");
	assert.equal(manifest.skills, "./skills/");
	assert.equal(manifest.interface.displayName, "Codex Augment Dispatcher");
	assert.deepEqual(manifest.author, { name: "yxhpy" });
	for (const capability of [
		"Planning",
		"Research",
		"Review",
		"Frontend",
		"Coordination",
	]) {
		assert.ok(
			manifest.interface.capabilities.includes(capability),
			`missing ${capability}`,
		);
	}
	assert.match(manifest.description, /external CLI adapters/);
	assert.match(manifest.interface.longDescription, /initial adapters/);
	assert.match(manifest.interface.longDescription, /background thread fanout/);
	const defaultPrompt = manifest.interface.defaultPrompt.join("\n");
	assert.match(defaultPrompt, /classify the route/);
	assert.match(defaultPrompt, /Plugin evidence/);
	assert.match(defaultPrompt, /task-gate/);
	assert.match(defaultPrompt, /read-only Codex background threads/);
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
		"external CLI adapters",
		"Mandatory Gate",
		"route classification",
		"Plugin evidence",
		"Initial adapters",
		"Add future CLI adapters",
		"Claude CLI",
		"Grok CLI",
		"AGY CLI",
		"Codex owns local file edits, verification, commits, and final claims.",
		"Do not pass secrets, raw credentials, private tokens, or unnecessary full-repo context",
		"No fallback provider is allowed.",
		"Superpowers",
		"Codex Thread Fanout",
		"owner Codex thread responsible for file edits",
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

	assert.match(dispatch, /description: Use before any non-trivial Codex task/);
	assert.match(
		dispatch,
		/classify whether `task-gate`, `thinking-gate`, `grok-augment`, or `agy-frontend` should run/,
	);
	assert.match(dispatch, /Use this skill before non-trivial Codex work/);
	assert.match(
		taskGate,
		/description: Use for broad, multi-step, ambiguous, risky, or decomposition-first work/,
	);
	assert.match(taskGate, /# Task Gate/);
	assert.doesNotMatch(taskGate, /# Thinking Gate/);
});

test("skills document Pi-compatible helper script paths", () => {
	for (const skill of [
		"task-gate",
		"thinking-gate",
		"grok-augment",
		"dispatch",
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
		"skills/task-gate/SKILL.md",
		"skills/thinking-gate/SKILL.md",
		"skills/grok-augment/SKILL.md",
		"skills/agy-frontend/SKILL.md",
	]) {
		assert.ok(existsSync(path.join(PLUGIN_ROOT, skill)), `missing ${skill}`);
	}
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
