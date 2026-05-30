#!/usr/bin/env -S node --experimental-strip-types
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(args: string[], options: { cwd?: string } = {}) {
  console.log(`+ ${args.join(" ")}`);
  const [command, ...rest] = args;
  const completed = spawnSync(command, rest, {
    cwd: options.cwd,
    encoding: "utf8",
  });
  if (completed.status !== 0) {
    process.stdout.write(completed.stdout || "");
    process.stderr.write(completed.stderr || "");
    process.exit(completed.status || 1);
  }
  return completed;
}

function validateManifest(): void {
  const manifest = JSON.parse(readFileSync(path.join(PLUGIN_ROOT, ".codex-plugin/plugin.json"), "utf8"));
  assert.equal(manifest.name, "codex-augment-dispatcher");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.interface.displayName, "Codex Augment Dispatcher");
  for (const capability of ["Planning", "Research", "Review", "Frontend"]) {
    assert.ok(manifest.interface.capabilities.includes(capability), `missing ${capability}`);
  }
  assert.ok(!("mcpServers" in manifest));
  assert.ok(!("hooks" in manifest));
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

function validateSkills(): void {
  const dispatch = readFileSync(path.join(PLUGIN_ROOT, "skills/dispatch/SKILL.md"), "utf8");
  assert.match(dispatch, /external CLI adapters/);
  assert.match(dispatch, /Mandatory Gate/);
  assert.match(dispatch, /route classification/);
  assert.match(dispatch, /Plugin evidence/);
  assert.match(dispatch, /Initial adapters/);
  assert.match(dispatch, /Add future CLI adapters/);
  assert.match(dispatch, /Claude CLI/);
  assert.match(dispatch, /Grok CLI/);
  assert.match(dispatch, /AGY CLI/);
  assert.match(dispatch, /Codex owns local file edits/);
  assert.match(dispatch, /No fallback provider is allowed/);
  assert.match(dispatch, /Codex Thread Fanout/);
  assert.match(dispatch, /owner Codex thread responsible for file edits/);
  assert.match(dispatch, /Do not run parallel writers against the same working tree/);

  const agy = readFileSync(path.join(PLUGIN_ROOT, "skills/agy-frontend/SKILL.md"), "utf8");
  assert.match(agy, /Images MUST be generated with image_gen/);
  assert.match(agy, /Videos MUST be generated with Grok Video/);
}

function main(): number {
  validateManifest();
  validateNoPythonFiles(PLUGIN_ROOT);
  validateSkills();
  for (const script of ["task_gate.ts", "codex_gate.ts", "grok_augment.ts", "verify-static-frontend.ts"]) {
    run(["node", "--experimental-strip-types", "--check", `scripts/${script}`], { cwd: PLUGIN_ROOT });
  }
  run(["node", "--experimental-strip-types", "--test", "tests/*.ts"], { cwd: PLUGIN_ROOT });
  console.log("clean test passed");
  return 0;
}

process.exitCode = main();
