#!/usr/bin/env -S node --experimental-strip-types
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMAGE_NAME = "codex-augment-dispatcher-clean-test";

function run(args: string[]): void {
  console.log(`+ ${args.join(" ")}`);
  const [command, ...rest] = args;
  const completed = spawnSync(command, rest, {
    cwd: PLUGIN_ROOT,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (completed.error) {
    console.error(String(completed.error));
    process.exit(1);
  }
  if ((completed.status ?? 0) !== 0) process.exit(completed.status || 1);
}

run(["docker", "build", "-f", "tests/docker/Dockerfile", "-t", IMAGE_NAME, "."]);
run(["docker", "run", "--rm", IMAGE_NAME]);
