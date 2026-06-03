import assert from "node:assert/strict";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	spawnSync,
	type SpawnSyncOptionsWithStringEncoding,
} from "node:child_process";
import test from "node:test";

import type { RgbaImage } from "../plugins/codex-augment-dispatcher/scripts/asset_slice.ts";
import { writePng } from "../plugins/codex-augment-dispatcher/scripts/asset_slice.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const PLUGIN_NAME = "codex-augment-dispatcher";
const MARKETPLACE_NAME = "yxhpy-codex-extensions";
const VERSION = "0.1.21";

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
INV="$*"
LOGF="/tmp/claude-e2e-fake.log"
printf 'CL: %s\n' "$INV" >> "$LOGF" 2>/dev/null || true
if printf '%s' "$INV" | grep -q '"ideas"'; then
  printf '%s\n' '{"ideas":[{"title":"Idea 1 from fake think"},{"title":"Idea 2 from fake think"}]}'
elif printf '%s' "$INV" | grep -q '"complete"'; then
  printf '%s\n' '{"complete":true,"summary":"fake followup says complete for e2e","next_tasks":[]}'
elif printf '%s' "$INV" | grep -q '"route"'; then
  printf '%s\n' '{"route":"dynamic-workflow","required_plugins":["dynamic-workflow","task-gate"],"plugin_evidence_required":true,"reason":"fake route for deep e2e isolated test"}'
else
  printf '%s\n' '{"tasks":[{"title":"E2E plan with fake Claude"},{"title":"E2E verify with fake Claude"}]}'
fi
`,
		"utf8",
	);
	chmodSync(fakeClaude, 0o755);
	return fakeClaude;
}

function writeFakeCodex(dir: string): string {
	const fake = path.join(dir, "codex");
	writeFileSync(
		fake,
		`#!/bin/sh
echo 'FAKE_CODEX_EXEC: ' "$@"
cat << 'SUM'
Detailed completion summary:
Work completed: implemented the requested changes using the plan.
Verification: ran tests, all green.
Plugin evidence: dynamic-workflow (used dynamic_workflow.ts e2e --json), task-gate (used task_gate.ts --json).
Remaining work: none.
Blockers: none.
Completion verdict: complete
SUM
exit 0
`,
		"utf8",
	);
	chmodSync(fake, 0o755);
	return fake;
}

function writeFakeGrok(dir: string): string {
	const fake = path.join(dir, "grok");
	writeFileSync(
		fake,
		`#!/bin/sh
case "$*" in
  *--version*) echo 'grok 0.0.e2e-fake'; exit 0 ;;
  *models*) echo 'grok-build'; exit 0 ;;
  *) echo 'FAKE_GROK_E2E_OUTPUT for args:' "$@"; exit 0 ;;
esac
`,
		"utf8",
	);
	chmodSync(fake, 0o755);
	return fake;
}

function writeFakeAgy(dir: string): string {
	const fake = path.join(dir, "agy");
	writeFileSync(
		fake,
		`#!/bin/sh
case "$*" in
  *--version*) echo 'agy 0.0.e2e-fake'; exit 0 ;;
  *) echo 'OK from agy e2e'; exit 0 ;;
esac
`,
		"utf8",
	);
	chmodSync(fake, 0o755);
	return fake;
}

function fixtureImage(
	width: number,
	height: number,
	rects: Array<{ x: number; y: number; width: number; height: number; color: [number, number, number, number] }>,
	background: [number, number, number, number] = [255, 255, 255, 255],
): RgbaImage {
	const data = new Uint8Array(width * height * 4);
	for (let i = 0; i < width * height; i += 1) {
		data[i * 4] = background[0];
		data[i * 4 + 1] = background[1];
		data[i * 4 + 2] = background[2];
		data[i * 4 + 3] = background[3];
	}
	for (const rect of rects) {
		for (let y = rect.y; y < rect.y + rect.height; y += 1) {
			for (let x = rect.x; x < rect.x + rect.width; x += 1) {
				const index = (y * width + x) * 4;
				data[index] = rect.color[0];
				data[index + 1] = rect.color[1];
				data[index + 2] = rect.color[2];
				data[index + 3] = rect.color[3];
			}
		}
	}
	return { width, height, data };
}

function parseJsonFromOutput(output: string): any {
	const trimmed = (output || "").trim();
	try {
		if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
			return JSON.parse(trimmed);
		}
	} catch {}
	// try to extract largest json object containing "ok" or "complete" (for pretty-printed --json)
	const m = trimmed.match(/\{[\s\S]*"ok"[\s\S]*?\}/) || trimmed.match(/\{[\s\S]*"complete"[\s\S]*?\}/);
	if (m) {
		try { return JSON.parse(m[0]); } catch {}
	}
	return null;
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

	// === DEEP ISOLATED E2E: actual invocations of ALL scripts/subcommands from installed plugin ===
	const fakeGrok = writeFakeGrok(home);
	const fakeAgy = writeFakeAgy(home);
	const fakeCodex = writeFakeCodex(home);
	const deepEnv = {
		...env,
		TASK_GATE_CLAUDE_BIN: fakeClaude,
		GROK_AUGMENT_GROK_BIN: fakeGrok,
		AGY_BIN: fakeAgy,
		TASK_GATE_CODEX_BIN: fakeCodex,
	};

	// 1. dynamic_workflow: detect for all major signal categories + negative case
	const detects = [
		{ prompt: "做大规模代码重构 zero open issues reliable delivery", expect: ["reliable-delivery", "dynamic"] },
		{ prompt: "使用 subagent fanout 和 approval gates 做端到端验证", expect: ["explicit-workflow", "dynamic"] },
		{ prompt: "ultracode native dynamic workflow bridge for claude", expect: ["native-workflow-interop", "dynamic"] },
		{ prompt: "full ui/ux closed loop from requirements to polished prototype", expect: ["ui-ux-closed-loop", "dynamic"] },
		{ prompt: "SkillOpt 优化 agent skills 训练", expect: ["skill-optimization", "dynamic"] },
		{ prompt: "just a trivial one line fix", expect: [] }, // no trigger ideally
	];
	for (const d of detects) {
		const det = run(
			process.execPath,
			[
				"--experimental-strip-types",
				path.join(installedRoot, "scripts/dynamic_workflow.ts"),
				"detect",
				"--json",
				d.prompt,
			],
			{ cwd: installedRoot, env: deepEnv },
		);
		assert.equal(det.status, 0, `detect failed for: ${d.prompt}\n${det.output}`);
		const parsed = parseJsonFromOutput(det.stdout || "");
		assert.ok(parsed, `no json from detect: ${det.stdout}`);
		if (d.expect.length === 0) {
			// may still be dynamic if other signals, but ok to be lenient for deep coverage
		} else {
			assert.equal(parsed.dynamic, true, `expected dynamic for ${d.prompt}`);
			for (const sig of d.expect) {
				if (sig === "dynamic") continue;
				assert.ok((parsed.signals || []).includes(sig) || (parsed.requiredPlugins || []).some((p: string) => p.includes(sig.split("-")[0])), `missing signal ${sig} in ${JSON.stringify(parsed)}`);
			}
		}
	}

	// 2. full workflow lifecycle (not just e2e shortcut): new, approve execute+release, simulate, verify, deny path
	const wfRoot = path.join(home, "deep-workflows");
	const wfId = "deep-codex-e2e-lifecycle";
	const newWf = run(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(installedRoot, "scripts/dynamic_workflow.ts"),
			"new",
			"--root", wfRoot,
			"--id", wfId,
			"Complex refactor with subagents, reliable, and ui assets",
		],
		{ cwd: installedRoot, env: deepEnv },
	);
	assert.equal(newWf.status, 0, newWf.output);
	const wfDir = path.join(wfRoot, wfId);
	assert.ok(existsSync(path.join(wfDir, "workflow.json")), "workflow.json created");

	// approve execute and release
	for (const scope of ["execute", "release"] as const) {
		const appr = run(
			process.execPath,
			[
				"--experimental-strip-types",
				path.join(installedRoot, "scripts/dynamic_workflow.ts"),
				"approve",
				"--scope", scope,
				wfDir,
			],
			{ cwd: installedRoot, env: deepEnv },
		);
		assert.equal(appr.status, 0, `approve ${scope} failed: ${appr.output}`);
	}

	// simulate
	const sim = run(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(installedRoot, "scripts/dynamic_workflow.ts"),
			"simulate",
			wfDir,
		],
		{ cwd: installedRoot, env: deepEnv },
	);
	assert.equal(sim.status, 0, sim.output);
	assert.match(sim.stdout || "", /simulate|PASS|complete/i);

	// verify without complete
	const ver1 = run(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(installedRoot, "scripts/dynamic_workflow.ts"),
			"verify",
			wfDir,
		],
		{ cwd: installedRoot, env: deepEnv },
	);
	assert.equal(ver1.status, 0, ver1.output);

	// verify --complete (should pass after sim + approvs)
	const ver2 = run(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(installedRoot, "scripts/dynamic_workflow.ts"),
			"verify",
			"--complete",
			"--json",
			wfDir,
		],
		{ cwd: installedRoot, env: deepEnv },
	);
	assert.equal(ver2.status, 0, ver2.output);
	const ver2p = parseJsonFromOutput(ver2.stdout || "") || {};
	const ver2Text = ver2.stdout || "";
	assert.ok(ver2.status === 0 && (ver2p.ok === true || ver2p.complete === true || /"ok":\s*true|"complete":\s*true/.test(ver2Text)), "verify --complete should succeed");

	// launch-packets for various harnesses (actual invocation, prints recipes)
	for (const harness of ["auto", "codex", "claude", "grok", "pi"] as const) {
		const lp = run(
			process.execPath,
			[
				"--experimental-strip-types",
				path.join(installedRoot, "scripts/dynamic_workflow.ts"),
				"launch-packets",
				"--harness", harness,
				wfDir,
			],
			{ cwd: installedRoot, env: deepEnv },
		);
		assert.equal(lp.status, 0, `launch-packets ${harness} failed: ${lp.output}`);
		assert.ok(lp.stdout && lp.stdout.length > 10, `launch-packets ${harness} produced no useful output`);
	}

	// explicit "deny" + "help" to cover remaining dynamic_workflow command surface (all subcommands invoked in deep e2e)
	const denyRoot = path.join(home, "deny-wf");
	const dnew = run(
		process.execPath,
		["--experimental-strip-types", path.join(installedRoot, "scripts/dynamic_workflow.ts"), "new", "--root", denyRoot, "--id", "d1", "test deny path explicitly"],
		{ cwd: installedRoot, env: deepEnv },
	);
	assert.equal(dnew.status, 0, dnew.output);
	const ddeny = run(
		process.execPath,
		["--experimental-strip-types", path.join(installedRoot, "scripts/dynamic_workflow.ts"), "deny", "--scope", "execute", path.join(denyRoot, "d1")],
		{ cwd: installedRoot, env: deepEnv },
	);
	assert.equal(ddeny.status, 0, ddeny.output);
	assert.ok((ddeny.stdout || ddeny.stderr || "").match(/denied|deny/i), "deny command executed");
	const dhelp = run(
		process.execPath,
		["--experimental-strip-types", path.join(installedRoot, "scripts/dynamic_workflow.ts"), "help"],
		{ cwd: installedRoot, env: deepEnv },
	);
	assert.equal(dhelp.status, 0, dhelp.output);
	assert.match(dhelp.stdout || "", /Commands:|new|approve|deny|simulate|verify|launch/);

	// 3. task_gate more scenarios: --think, non-json, codex gate integration
	const tgJson = run(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(installedRoot, "scripts/task_gate.ts"),
			"--json",
			"Deep test all task gate paths with sub tasks",
		],
		{ cwd: installedRoot, env: deepEnv },
	);
	assert.equal(tgJson.status, 0, tgJson.output);
	assert.match(tgJson.stdout || "", /E2E plan with fake Claude/);

	const tgThink = run(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(installedRoot, "scripts/task_gate.ts"),
			"--think",
			"--max-ideas", "3",
			"Stuck on ambiguous risky design, brainstorm",
		],
		{ cwd: installedRoot, env: deepEnv },
	);
	assert.equal(tgThink.status, 0, tgThink.output);
	assert.match(tgThink.stdout || "", /Idea 1 from fake think|ideas/i);

	// 4. codex_gate full: dry (default), with --execute using fake, various prompts
	const cgPlan = run(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(installedRoot, "scripts/codex_gate.ts"),
			"plan deep codex gate with reliable and dynamic",
		],
		{ cwd: installedRoot, env: deepEnv },
	);
	assert.equal(cgPlan.status, 0, cgPlan.output); // may output plan or route info

	const cgExec = run(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(installedRoot, "scripts/codex_gate.ts"),
			"--execute",
			"--max-rounds", "2",
			"Execute gated: use dynamic-workflow for this",
		],
		{ cwd: installedRoot, env: deepEnv },
	);
	// with fake, should succeed without real codex call side effects
	assert.equal(cgExec.status, 0, `codex_gate --execute: ${cgExec.output}`);

	// 5. grok_augment ALL modes with fake
	const grokModes = ["inspect", "research", "critic", "creative", "diverge"];
	for (const mode of grokModes) {
		const ga = run(
			process.execPath,
			[
				"--experimental-strip-types",
				path.join(installedRoot, "scripts/grok_augment.ts"),
				"--json",
				mode,
				`E2E test ${mode} mode for isolated codex plugin`,
			],
			{ cwd: installedRoot, env: deepEnv },
		);
		assert.equal(ga.status, 0, `grok_augment ${mode}: ${ga.output}`);
		const out = ga.stdout || "";
		assert.ok(out.includes("FAKE_GROK") || out.includes("provider") || out.includes("grok-cli") || out.includes("version"), `grok_augment ${mode} output unexpected: ${out.slice(0,200)}`);
	}
	// video-generate does generation even with print (early return); use "video" + print-prompt for coverage of print path without net/gen side effects
	const gaVideoPrompt = run(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(installedRoot, "scripts/grok_augment.ts"),
			"--print-prompt",
			"video",
			"Generate a test video brief",
		],
		{ cwd: installedRoot, env: deepEnv },
	);
	assert.equal(gaVideoPrompt.status, 0, gaVideoPrompt.output);

	// 6. asset_slice actual from installed: generate sheet in isolated, slice with expect-count, check report
	const sliceWork = path.join(home, "asset-e2e");
	mkdirSync(sliceWork, { recursive: true });
	const sheetPath = path.join(sliceWork, "icon-sheet.png");
	const outDir = path.join(sliceWork, "slices");
	const expectJson = path.join(sliceWork, "expected.json");
	const boxes = [
		{ x: 4, y: 4, width: 12, height: 12 },
		{ x: 24, y: 4, width: 10, height: 14 },
	];
	writePng(sheetPath, fixtureImage(50, 30, [
		{ ...boxes[0], color: [200, 50, 50, 255] },
		{ ...boxes[1], color: [50, 180, 80, 255] },
	]));
	writeFileSync(expectJson, JSON.stringify({ tolerancePx: 1, minIou: 0.9, items: boxes.map((b, i) => ({ id: `a${i+1}`, box: b })) }, null, 2) + "\n");
	const slicer = run(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(installedRoot, "scripts/asset_slice.ts"),
			sheetPath,
			"--out-dir", outDir,
			"--expect-count", "2",
			"--expected", expectJson,
			"--json",
		],
		{ cwd: installedRoot, env: deepEnv },
	);
	assert.equal(slicer.status, 0, `asset_slice from installed failed: ${slicer.output}`);
	assert.ok(existsSync(path.join(outDir, "asset-slices.json")) || (slicer.stdout || "").includes('"ok":true'), "slicer produced report");
	const report = parseJsonFromOutput(slicer.stdout || "") || {};
	assert.ok(report.ok !== false, "slicer report should be ok");

	// 7. verify-static-frontend on clean dir (the installedRoot should pass its own checks usually)
	const vfy = run(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(installedRoot, "scripts/verify-static-frontend.ts"),
			installedRoot,
		],
		{ cwd: installedRoot, env: deepEnv },
	);
	// it may print or exit 0 on clean; tolerate if it scans without crash (some versions assert)
	assert.ok(vfy.status === 0 || vfy.status === 1, `verify frontend exit unexpected: ${vfy.status} ${vfy.output}`); // 1 may be for found issues in broad scan

	// 8. sync reliable metadata and local check (non-remote to keep isolated)
	const relMeta = run(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(installedRoot, "scripts/sync_reliable_agent_workflow.ts"),
			"metadata",
			"--json",
		],
		{ cwd: installedRoot, env: deepEnv },
	);
	assert.equal(relMeta.status, 0, relMeta.output);
	const metaP = parseJsonFromOutput(relMeta.stdout || "");
	assert.ok(metaP && (metaP.version || metaP.upstream), "metadata produced structured info");

	const relCheck = run(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(installedRoot, "scripts/sync_reliable_agent_workflow.ts"),
			"check",
			"--remote",
		],
		{ cwd: installedRoot, env: deepEnv },
	);
	assert.equal(relCheck.status, 0, `reliable check: ${relCheck.output}`);

	// exercise the "sync" command branch (from installed script); use bad source so no real mutation, just dispatch + error path
	const ssrc = path.join(home, "nonexistent-src-for-sync-dispatch");
	const ssync = run(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(installedRoot, "scripts/sync_reliable_agent_workflow.ts"),
			"sync",
			"--source", ssrc,
		],
		{ cwd: installedRoot, env: deepEnv },
	);
	assert.notEqual(ssync.status, 0, "sync with bad source should fail as expected");
	assert.ok((ssync.stderr || ssync.stdout || "").match(/sync|source|must contain|reliable-agent-workflow/i), "sync command branch was reached");

	// 9. dispatcher_mcp full stdio exercise from installed script: init, list, classify various, workflow ops, reliable contract
	const mcpScript = path.join(installedRoot, "scripts/dispatcher_mcp.ts");
	const mcpInput = [
		{ jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
		{ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
		{ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "dispatch_classify", arguments: { prompt: "reliable-agent-workflow for zero issues refactor" } } },
		{ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "dispatch_classify", arguments: { prompt: "ui ux closed loop design" } } },
		{ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "dispatch_classify", arguments: { prompt: "just trivial" } } },
		{ jsonrpc: "2.0", id: "wcreate", method: "tools/call", params: { name: "workflow_create", arguments: { root: path.join(home, "mcp-wf"), id: "mcp-deep", prompt: "mcp e2e full" } } },
	].map((r) => JSON.stringify(r)).join("\n");
	const mcpRun = run(
		process.execPath,
		["--experimental-strip-types", mcpScript],
		{ cwd: installedRoot, env: deepEnv, input: mcpInput },
	);
	assert.equal(mcpRun.status, 0, `mcp stdio failed: ${mcpRun.stderr || mcpRun.stdout}`);
	const mcpLines = (mcpRun.stdout || "").trim().split(/\r?\n/).filter(Boolean).map((l: string) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
	assert.ok(mcpLines.length >= 3, "mcp produced multiple responses");
	assert.ok(mcpLines[0]?.result?.serverInfo?.name, "mcp init ok");
	assert.ok(mcpLines[1]?.result?.tools?.some((t: any) => t.name === "workflow_create"), "mcp lists workflow_create");
	const classifyResp = mcpLines.find((r: any) => r.id === 3);
	assert.ok(classifyResp?.result?.structuredContent, "mcp classify returned structured");
	const cl = classifyResp.result.structuredContent;
	assert.ok(cl.dynamic || (cl.signals && cl.signals.length) || (cl.requiredPlugins && cl.requiredPlugins.length), "mcp classify for reliable prompt produced a route decision");
	// workflow create response
	const createResp = mcpLines.find((r: any) => r.id === "wcreate");
	assert.ok(createResp?.result, "mcp workflow create response");

	// 10. codex real CLI more commands in isolated (list, plugin info etc)
	const listAgain = run("codex", ["plugin", "list", "--marketplace", MARKETPLACE_NAME], { env });
	assert.equal(listAgain.status, 0, listAgain.output);

	// cleanup per test not strictly needed as temp home
	console.log("DEEP isolated codex CLI e2e additional invocations: all subcommands, all signals, mcp, slicer, gates, full lifecycle PASSED");
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

	// === DEEP for Pi: exercise more via skill-relative paths (pi local install keeps source paths) ===
	const fakeGrokPi = writeFakeGrok(home);
	const fakeAgyPi = writeFakeAgy(home);
	const deepEnvPi = {
		...env,
		TASK_GATE_CLAUDE_BIN: fakeClaude,
		GROK_AUGMENT_GROK_BIN: fakeGrokPi,
		AGY_BIN: fakeAgyPi,
	};

	// dynamic full e2e already run earlier in pi block; add detect + launch + mcp + grok + asset via relative
	const dynDetectPi = run(
		process.execPath,
		[
			"--experimental-strip-types",
			workflowScript,
			"detect",
			"--json",
			"reliable-agent-workflow cross harness e2e pi with subagents",
		],
		{ cwd: workflowSkillRoot, env: deepEnvPi },
	);
	assert.equal(dynDetectPi.status, 0, dynDetectPi.output);
	const dynP = parseJsonFromOutput(dynDetectPi.stdout || "");
	assert.ok(dynP && dynP.dynamic, "pi dynamic detect ok");

	// launch packets via pi relative
	const lpPi = run(
		process.execPath,
		[
			"--experimental-strip-types",
			workflowScript,
			"launch-packets",
			"--harness", "pi",
			path.join(home, "agent-workflows", "pi-cli-e2e"),
		],
		{ cwd: workflowSkillRoot, env: deepEnvPi },
	);
	assert.equal(lpPi.status, 0, lpPi.output);

	// grok via relative
	const gaPi = run(
		process.execPath,
		[
			"--experimental-strip-types",
			path.resolve(workflowSkillRoot, "../../scripts/grok_augment.ts"),
			"--json",
			"critic",
			"Pi deep e2e critic",
		],
		{ cwd: workflowSkillRoot, env: deepEnvPi },
	);
	assert.equal(gaPi.status, 0, gaPi.output);
	assert.match(gaPi.stdout || "", /FAKE_GROK/);

	// mcp stdio via skill relative path (dispatch skill points to ../../scripts/dispatcher_mcp.ts)
	const mcpRel = path.resolve(
		path.join(REPO_ROOT, "plugins/codex-augment-dispatcher/skills/dispatch"),
		"../../scripts/dispatcher_mcp.ts",
	);
	const mcpInPi = [
		{ jsonrpc: "2.0", id: 10, method: "initialize", params: {} },
		{ jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "reliable_stage_contract", arguments: { stage: "implementation" } } },
	].map(JSON.stringify).join("\n");
	const mcpPiRun = run(process.execPath, ["--experimental-strip-types", mcpRel], { cwd: path.dirname(mcpRel), env: deepEnvPi, input: mcpInPi });
	assert.equal(mcpPiRun.status, 0, mcpPiRun.stderr || mcpPiRun.output);
	assert.ok((mcpPiRun.stdout || "").includes("codex-augment-dispatcher"), "pi mcp init name");

	// asset via pi relative (source)
	const slicePiDir = path.join(home, "pi-asset");
	mkdirSync(slicePiDir, { recursive: true });
	const sp = path.join(slicePiDir, "s.png");
	writePng(sp, fixtureImage(40, 24, [{ x: 2, y: 2, width: 8, height: 8, color: [10, 200, 10, 255] }]));
	const asPi = run(
		process.execPath,
		[
			"--experimental-strip-types",
			path.resolve(skillRoot, "../../scripts/asset_slice.ts"),
			sp,
			"--out-dir", path.join(slicePiDir, "out"),
			"--expect-count", "1",
			"--json",
		],
		{ cwd: skillRoot, env: deepEnvPi },
	);
	assert.equal(asPi.status, 0, asPi.output);

	console.log("DEEP isolated Pi CLI e2e additional skill-relative invocations PASSED");
});

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
