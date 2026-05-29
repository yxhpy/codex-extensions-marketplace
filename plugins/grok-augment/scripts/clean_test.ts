#!/usr/bin/env -S node --experimental-strip-types
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(PLUGIN_ROOT, "../..");

function run(args: string[], env?: NodeJS.ProcessEnv): void {
  const [command, ...rest] = args;
  const completed = spawnSync(command, rest, {
    cwd: REPO_ROOT,
    env,
    encoding: "utf8",
  });
  process.stdout.write(completed.stdout || "");
  process.stderr.write(completed.stderr || "");
  if (completed.status !== 0) process.exit(completed.status || 1);
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

function main(): number {
  validateNoPythonFiles(PLUGIN_ROOT);
  const root = mkdtempSync(path.join(tmpdir(), "grok-augment-clean-"));
  const fakeHome = path.join(root, "home");
  const fakeCodexHome = path.join(root, "codex");
  const fakeBin = path.join(root, "bin");
  mkdirSync(fakeHome);
  mkdirSync(fakeCodexHome);
  mkdirSync(fakeBin);
  const fakeGrok = path.join(fakeBin, "grok");
  writeFileSync(
    fakeGrok,
    `#!/bin/sh
case "$*" in
  *--version*) echo 'grok 0.0.clean-test'; exit 0 ;;
  *models*) echo 'grok-build'; exit 0 ;;
  *) echo 'CLEAN_TEST_GROK_RESPONSE'; exit 0 ;;
esac
`,
    "utf8",
  );
  chmodSync(fakeGrok, 0o755);
  const env = {
    ...process.env,
    HOME: fakeHome,
    CODEX_HOME: fakeCodexHome,
    GROK_AUGMENT_GROK_BIN: fakeGrok,
  };
  run(["node", "--experimental-strip-types", "--test", "plugins/grok-augment/tests/*.ts"], env);
  run(["node", "--experimental-strip-types", path.join(PLUGIN_ROOT, "scripts/grok_augment.ts"), "inspect", "--json"], env);
  run(
    [
      "node",
      "--experimental-strip-types",
      path.join(PLUGIN_ROOT, "scripts/grok_augment.ts"),
      "--json",
      "video",
      "one safe closed-loop test shot",
    ],
    env,
  );
  return 0;
}

process.exitCode = main();
