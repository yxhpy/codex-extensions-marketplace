import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const PLUGIN_ROOT = path.resolve(import.meta.dirname, "..");
const SCRIPT = path.join(
	PLUGIN_ROOT,
	"scripts/sync_reliable_agent_workflow.ts",
);

function runScript(args: string[]) {
	return spawnSync(
		process.execPath,
		["--experimental-strip-types", SCRIPT, ...args],
		{ encoding: "utf8" },
	);
}

function makeSource(): string {
	const source = mkdtempSync(path.join(tmpdir(), "raw-upstream-source-"));
	const skill = path.join(source, "reliable-agent-workflow");
	mkdirSync(path.join(skill, "agents"), { recursive: true });
	writeFileSync(
		path.join(source, "package.json"),
		JSON.stringify({ version: "9.9.9" }) + "\n",
		"utf8",
	);
	writeFileSync(
		path.join(skill, "SKILL.md"),
		[
			"---",
			"name: reliable-agent-workflow",
			"description: Test reliable workflow for Codex, Claude Code, Grok, and Pi.",
			"---",
			"",
			"# Reliable Agent Workflow",
			"",
			"Use for zero open issues and independent verification.",
			"",
		].join("\n"),
		"utf8",
	);
	writeFileSync(
		path.join(skill, "agents/openai.yaml"),
		[
			"interface:",
			'  display_name: "Reliable Agent Workflow"',
			'  short_description: "Test sync"',
			'  default_prompt: "Use $reliable-agent-workflow."',
			"",
		].join("\n"),
		"utf8",
	);
	return source;
}

function makePluginRoot(): string {
	const root = mkdtempSync(path.join(tmpdir(), "raw-plugin-root-"));
	const skill = path.join(root, "skills/reliable-agent-workflow");
	mkdirSync(path.join(skill, "agents"), { recursive: true });
	writeFileSync(path.join(skill, "SKILL.md"), "stale\n", "utf8");
	writeFileSync(path.join(skill, "agents/openai.yaml"), "stale\n", "utf8");
	return root;
}

test("sync script detects drift and then syncs reliable-agent-workflow", () => {
	const source = makeSource();
	const pluginRoot = makePluginRoot();

	const before = runScript([
		"check",
		"--source",
		source,
		"--plugin-root",
		pluginRoot,
		"--json",
	]);
	assert.notEqual(before.status, 0, before.stdout || before.stderr);
	assert.match(before.stdout || before.stderr, /bundled file differs/);

	const sync = runScript([
		"sync",
		"--source",
		source,
		"--plugin-root",
		pluginRoot,
		"--json",
	]);
	assert.equal(sync.status, 0, sync.stdout || sync.stderr);
	const syncPayload = JSON.parse(sync.stdout);
	assert.equal(syncPayload.ok, true);
	assert.equal(syncPayload.upstream.version, "9.9.9");

	const metadataPath = path.join(
		pluginRoot,
		"upstreams/reliable-agent-workflow.json",
	);
	assert.ok(existsSync(metadataPath), "missing sync metadata");
	const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
	assert.equal(metadata.version, "9.9.9");
	assert.equal(metadata.files.length, 2);

	const after = runScript([
		"check",
		"--source",
		source,
		"--plugin-root",
		pluginRoot,
		"--json",
	]);
	assert.equal(after.status, 0, after.stdout || after.stderr);
	assert.equal(JSON.parse(after.stdout).ok, true);
});

test("bundled reliable-agent-workflow metadata records upstream version and files", () => {
	const metadataPath = path.join(
		PLUGIN_ROOT,
		"upstreams/reliable-agent-workflow.json",
	);
	const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));

	assert.equal(metadata.name, "reliable-agent-workflow");
	assert.equal(metadata.repository, "https://github.com/yxhpy/reliable-agent-workflow-skill.git");
	assert.equal(metadata.version, "0.3.1");
	assert.equal(metadata.commit, "c97c36207abc8769b5cb22a909c39776423c951c");
	assert.deepEqual(
		metadata.files.map((file: { path: string }) => file.path),
		["SKILL.md", "agents/openai.yaml"],
	);
});
