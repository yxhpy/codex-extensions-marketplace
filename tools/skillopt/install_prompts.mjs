#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import https from "node:https";
import path from "node:path";

const root = process.cwd();
const python = path.join(root, ".venv/skillopt/bin/python");
const promptRef = "v0.1.0";
const repoRaw = `https://raw.githubusercontent.com/microsoft/SkillOpt/${promptRef}`;

const genericPrompts = [
  "analyst_error.md",
  "analyst_error_full_rewrite.md",
  "analyst_error_rewrite.md",
  "analyst_success.md",
  "analyst_success_full_rewrite.md",
  "analyst_success_rewrite.md",
  "lr_autonomous.md",
  "merge_failure.md",
  "merge_failure_full_rewrite.md",
  "merge_failure_rewrite.md",
  "merge_final.md",
  "merge_final_full_rewrite.md",
  "merge_final_rewrite.md",
  "merge_success.md",
  "merge_success_full_rewrite.md",
  "merge_success_rewrite.md",
  "meta_skill.md",
  "ranking.md",
  "ranking_rewrite.md",
  "rewrite_skill.md",
  "slow_update.md",
];

const searchqaPrompts = [
  "analyst_error.md",
  "analyst_success.md",
  "rollout_system.md",
];

function fail(message) {
  console.error(`skillopt prompt install failed: ${message}`);
  process.exit(1);
}

function skilloptRoot() {
  const code = "import pathlib, skillopt; print(pathlib.Path(skillopt.__file__).resolve().parent)";
  const completed = spawnSync(python, ["-c", code], {
    cwd: root,
    encoding: "utf8",
  });
  if (completed.status !== 0) {
    process.stdout.write(completed.stdout || "");
    process.stderr.write(completed.stderr || "");
    fail("cannot import skillopt from .venv/skillopt");
  }
  return completed.stdout.trim();
}

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        download(response.headers.location).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`${url} returned HTTP ${response.statusCode}`));
        response.resume();
        return;
      }
      response.setEncoding("utf8");
      let body = "";
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve(body));
    }).on("error", reject);
  });
}

async function installOne({ sourcePath, targetPath }) {
  const url = `${repoRaw}/${sourcePath}`;
  const body = await download(url);
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, body, "utf8");
  console.log(`installed ${path.relative(root, targetPath)}`);
}

async function main() {
  const pkgRoot = skilloptRoot();
  const jobs = [];
  for (const name of genericPrompts) {
    jobs.push({
      sourcePath: `skillopt/prompts/${name}`,
      targetPath: path.join(pkgRoot, "prompts", name),
    });
  }
  for (const name of searchqaPrompts) {
    jobs.push({
      sourcePath: `skillopt/envs/searchqa/prompts/${name}`,
      targetPath: path.join(pkgRoot, "envs/searchqa/prompts", name),
    });
  }
  for (const job of jobs) {
    await installOne(job);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
