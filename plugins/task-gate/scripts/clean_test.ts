#!/usr/bin/env -S node --experimental-strip-types
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  console.log(`+ ${args.join(" ")}`);
  const [command, ...rest] = args;
  const completed = spawnSync(command, rest, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
  });
  if (completed.status !== 0) {
    process.stdout.write(completed.stdout || "");
    process.stderr.write(completed.stderr || "");
    process.exit(completed.status || 1);
  }
  return completed;
}

function validatePluginManifest(): void {
  const manifest = JSON.parse(readFileSync(path.join(PLUGIN_ROOT, ".codex-plugin/plugin.json"), "utf8"));
  assert.equal(manifest.name, "task-gate");
  assert.ok(!("mcpServers" in manifest));
  assert.equal(manifest.skills, "./skills/");
  assert.match(manifest.interface.displayName, /Thinking Gate/);
  assert.ok(manifest.interface.capabilities.includes("Brainstorming"));
  assert.ok(manifest.interface.defaultPrompt.length <= 3);
  assert.ok(!manifest.interface.capabilities.includes("MCP"));
}

function validateNoPythonFiles(root: string): void {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if ([".git", "node_modules"].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else assert.ok(!file.endsWith(".py"), `unexpected Python file: ${path.relative(root, file)}`);
    }
  }
}

function validateSkill(): void {
  const skillText = readFileSync(path.join(PLUGIN_ROOT, "skills/task-gate/SKILL.md"), "utf8");
  assert.ok(skillText.startsWith("---\n"));
  assert.match(skillText, /\nname: task-gate\n/);
  assert.match(skillText, /scripts\/task_gate\.ts --think --json/);
  assert.match(skillText, /scripts\/task_gate\.ts --json/);
  assert.match(skillText, /codex_gate\.ts --execute/);

  const thinkingText = readFileSync(path.join(PLUGIN_ROOT, "skills/thinking-gate/SKILL.md"), "utf8");
  assert.match(thinkingText, /\nname: thinking-gate\n/);
  assert.match(thinkingText, /scripts\/task_gate\.ts --think --json/);
  for (const term of ["卡住", "没思路", "发散", "不知道下一步", "stuck", "no good next step", "brainstorm", "divergent"]) {
    assert.match(thinkingText, new RegExp(term));
  }
}

function runGateSmoke(): void {
  const tempDir = mkdtempSync(path.join(tmpdir(), "task-gate-clean-"));
  try {
    const fakeClaude = path.join(tempDir, "claude");
    writeFileSync(
      fakeClaude,
      `#!/bin/sh
case "$*" in
  *"reviewing the end of a Codex execution round"*)
    printf '%s\\n' '{"complete":true,"summary":"Docker gate follow-up complete.","next_tasks":[]}'
    ;;
  *)
    printf '%s\\n' '{"tasks":[{"title":"Plan in Docker"},{"title":"Verify in Docker"}]}'
    ;;
esac
`,
      "utf8",
    );
    chmodSync(fakeClaude, 0o755);
    const env = {
      ...process.env,
      TASK_GATE_THINKER: "cli",
      TASK_GATE_CLAUDE_BIN: fakeClaude,
      TASK_GATE_CODEX_BIN: "/usr/bin/true",
    };
    const completed = run(
      [
        "node",
        "--experimental-strip-types",
        "scripts/codex_gate.ts",
        "--execute",
        "Raw prompt stays outside Codex",
      ],
      { cwd: PLUGIN_ROOT, env },
    );
    assert.match(completed.stdout || "", /1\. Plan in Docker/);
    assert.match(completed.stdout || "", /2\. Verify in Docker/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runThinkSmoke(): void {
  const tempDir = mkdtempSync(path.join(tmpdir(), "task-gate-think-"));
  try {
    const fakeClaude = path.join(tempDir, "claude");
    writeFileSync(
      fakeClaude,
      `#!/bin/sh
printf '%s\\n' '{"ideas":[{"title":"Try a smaller reversible check","rationale":"It can unstick Codex without overcommitting."}],"recommendation":"Start with the reversible check.","next_tasks":[{"title":"Run one focused smoke"}]}'
`,
      "utf8",
    );
    chmodSync(fakeClaude, 0o755);
    const env = {
      ...process.env,
      TASK_GATE_THINKER: "cli",
      TASK_GATE_CLAUDE_BIN: fakeClaude,
    };
    const completed = run(
      [
        "node",
        "--experimental-strip-types",
        "scripts/task_gate.ts",
        "--think",
        "--json",
        "Codex is stuck with no good next step",
      ],
      { cwd: PLUGIN_ROOT, env },
    );
    const payload = JSON.parse(completed.stdout || "{}");
    assert.equal(payload.ideas[0].title, "Try a smaller reversible check");
    assert.equal(payload.recommendation, "Start with the reversible check.");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function main(): number {
  validatePluginManifest();
  validateNoPythonFiles(PLUGIN_ROOT);
  validateSkill();
  run(["node", "--experimental-strip-types", "--check", "scripts/task_gate.ts"], { cwd: PLUGIN_ROOT });
  run(["node", "--experimental-strip-types", "--check", "scripts/codex_gate.ts"], { cwd: PLUGIN_ROOT });
  run(["node", "--experimental-strip-types", "--test", "tests/test_task_gate.ts"], { cwd: PLUGIN_ROOT });
  runGateSmoke();
  runThinkSmoke();
  console.log("clean test passed");
  return 0;
}

process.exitCode = main();
