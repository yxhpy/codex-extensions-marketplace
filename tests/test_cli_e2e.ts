import assert from "node:assert/strict";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	spawnSync,
	type SpawnSyncOptionsWithStringEncoding,
} from "node:child_process";
import test from "node:test";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const PLUGIN_NAME = "codex-augment-dispatcher";
const MARKETPLACE_NAME = "yxhpy-codex-extensions";
const VERSION = "0.1.15";

function readJson(filePath: string) {
	return JSON.parse(readFileSync(filePath, "utf8"));
}

function run(
	command: string,
	args: string[],
	options: Omit<SpawnSyncOptionsWithStringEncoding, "encoding"> = {},
) {
	const result = spawnSync(command, args, {
		...options,
		encoding: "utf8",
		env: {
			...process.env,
			...(options.env || {}),
		},
	});
	const stdout = result.stdout || "";
	const stderr = result.stderr || "";
	return {
		...result,
		stdout,
		stderr,
		output: `${stdout}${stderr}`,
	};
}

function hasCommand(command: string): boolean {
	const result = run(command, ["--version"]);
	return !result.error && result.status === 0;
}

function isolatedHome(prefix: string) {
	const home = mkdtempSync(path.join(tmpdir(), prefix));
	mkdirSync(path.join(home, ".config"), { recursive: true });
	mkdirSync(path.join(home, ".cache"), { recursive: true });
	mkdirSync(path.join(home, ".codex"), { recursive: true });
	return home;
}

function writeFakeClaude(dir: string): string {
	const fakeClaude = path.join(dir, "claude");
	writeFileSync(
		fakeClaude,
		`#!/bin/sh
printf '%s\n' '{"tasks":[{"title":"E2E plan with fake Claude"},{"title":"E2E verify with fake Claude"}]}'
`,
		"utf8",
	);
	chmodSync(fakeClaude, 0o755);
	return fakeClaude;
}

test("Codex CLI installs the local marketplace in an isolated HOME and installed scripts run", {
	timeout: 60_000,
}, (t) => {
	if (!hasCommand("codex")) {
		t.skip("codex CLI not found on PATH");
		return;
	}

	const home = isolatedHome("codex-cli-e2e-home-");
	const env = {
		HOME: home,
		XDG_CONFIG_HOME: path.join(home, ".config"),
		XDG_CACHE_HOME: path.join(home, ".cache"),
		CODEX_HOME: path.join(home, ".codex"),
	};

	const marketplace = run(
		"codex",
		["plugin", "marketplace", "add", REPO_ROOT],
		{ env },
	);
	assert.equal(marketplace.status, 0, marketplace.output);
	assert.ok(
		marketplace.output.includes(`Added marketplace \`${MARKETPLACE_NAME}\``),
		marketplace.output,
	);

	const addPlugin = run(
		"codex",
		["plugin", "add", `${PLUGIN_NAME}@${MARKETPLACE_NAME}`],
		{ env },
	);
	assert.equal(addPlugin.status, 0, addPlugin.output);
	assert.ok(
		addPlugin.output.includes(`Added plugin \`${PLUGIN_NAME}\``),
		addPlugin.output,
	);

	const installedRootMatch = addPlugin.output.match(
		/Installed plugin root:\s*(.+)/,
	);
	assert.ok(installedRootMatch, addPlugin.output);
	const installedRoot = installedRootMatch[1].trim();
	const manifestPath = path.join(installedRoot, ".codex-plugin/plugin.json");
	assert.ok(
		existsSync(manifestPath),
		`missing installed manifest at ${manifestPath}`,
	);
	assert.equal(readJson(manifestPath).version, VERSION);

	const list = run(
		"codex",
		["plugin", "list", "--marketplace", MARKETPLACE_NAME],
		{ env },
	);
	assert.equal(list.status, 0, list.output);
	assert.match(list.output, new RegExp(`${PLUGIN_NAME}@${MARKETPLACE_NAME}`));
	assert.match(list.output, /installed, enabled/);

	const fakeClaude = writeFakeClaude(home);
	const workflow = run(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(installedRoot, "scripts/dynamic_workflow.ts"),
			"e2e",
			"--root",
			path.join(home, "agent-workflows"),
			"--id",
			"codex-cli-e2e",
			"--json",
			"Plan a platform-neutral subagent workflow with approval gates and end-to-end verification",
		],
		{ cwd: installedRoot, env },
	);
	assert.equal(workflow.status, 0, workflow.output);
	assert.match(workflow.stdout || "", /"complete": true/);

	const planner = run(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(installedRoot, "scripts/task_gate.ts"),
			"--json",
			"Plan isolated Codex E2E",
		],
		{
			cwd: installedRoot,
			env: {
				...env,
				TASK_GATE_CLAUDE_BIN: fakeClaude,
			},
		},
	);
	assert.equal(planner.status, 0, planner.output);
	assert.match(planner.stdout || "", /E2E plan with fake Claude/);
});

test("Pi CLI installs the local package in an isolated config and skill-relative scripts run", {
	timeout: 60_000,
}, (t) => {
	if (!hasCommand("pi")) {
		t.skip("pi CLI not found on PATH");
		return;
	}

	const home = isolatedHome("pi-cli-e2e-home-");
	const piDir = path.join(home, ".pi", "agent");
	const env = {
		HOME: home,
		XDG_CONFIG_HOME: path.join(home, ".config"),
		XDG_CACHE_HOME: path.join(home, ".cache"),
		PI_CODING_AGENT_DIR: piDir,
		PI_OFFLINE: "1",
	};

	const install = run("pi", ["install", REPO_ROOT], { env });
	assert.equal(install.status, 0, install.output);

	const list = run("pi", ["list"], { env });
	assert.equal(list.status, 0, list.output);
	assert.match(list.output, new RegExp(escapeRegExp(REPO_ROOT)));

	const settingsPath = path.join(piDir, "settings.json");
	assert.ok(existsSync(settingsPath), `missing Pi settings at ${settingsPath}`);
	const settings = readJson(settingsPath);
	const packages = (settings.packages || []).map(
		(entry: string | { source?: string }) =>
			typeof entry === "string" ? entry : entry.source,
	);
	const resolvedPackages = packages
		.filter(Boolean)
		.map((entry: string) => path.resolve(piDir, entry));
	assert.ok(
		resolvedPackages.includes(REPO_ROOT),
		`Pi settings packages did not include ${REPO_ROOT}`,
	);

	const pkg = readJson(path.join(REPO_ROOT, "package.json"));
	assert.equal(pkg.version, VERSION);
	assert.deepEqual(pkg.pi.skills, [
		"./plugins/codex-augment-dispatcher/skills",
	]);
	assert.deepEqual(pkg.pi.extensions, [
		"./extensions/codex-image-gen/index.ts",
		"./extensions/xai-grok/index.ts",
	]);
	assert.ok(
		pkg.dependencies["@types/node"],
		"Pi production installs must include Node type declarations",
	);
	assert.ok(
		existsSync(path.join(REPO_ROOT, "node_modules/@types/node")),
		"local production dependency install should include @types/node",
	);

	const workflowSkillRoot = path.join(
		REPO_ROOT,
		"plugins/codex-augment-dispatcher/skills/dynamic-workflow",
	);
	const workflowScript = path.resolve(
		workflowSkillRoot,
		"../../scripts/dynamic_workflow.ts",
	);
	assert.ok(
		existsSync(workflowScript),
		`missing skill-relative workflow script at ${workflowScript}`,
	);
	const workflow = run(
		process.execPath,
		[
			"--experimental-strip-types",
			workflowScript,
			"e2e",
			"--root",
			path.join(home, "agent-workflows"),
			"--id",
			"pi-cli-e2e",
			"--json",
			"Plan a platform-neutral subagent workflow with approval gates and end-to-end verification",
		],
		{ cwd: workflowSkillRoot, env },
	);
	assert.equal(workflow.status, 0, workflow.output);
	assert.match(workflow.stdout || "", /"complete": true/);

	const skillRoot = path.join(
		REPO_ROOT,
		"plugins/codex-augment-dispatcher/skills/task-gate",
	);
	const skillRelativeScript = path.resolve(
		skillRoot,
		"../../scripts/task_gate.ts",
	);
	assert.ok(
		existsSync(skillRelativeScript),
		`missing skill-relative script at ${skillRelativeScript}`,
	);

	const fakeClaude = writeFakeClaude(home);
	const planner = run(
		process.execPath,
		[
			"--experimental-strip-types",
			skillRelativeScript,
			"--json",
			"Plan isolated Pi E2E",
		],
		{
			cwd: skillRoot,
			env: {
				...env,
				TASK_GATE_CLAUDE_BIN: fakeClaude,
			},
		},
	);
	assert.equal(planner.status, 0, planner.output);
	assert.match(planner.stdout || "", /E2E plan with fake Claude/);
});

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
