#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const skilloptPython = path.join(root, ".venv/skillopt/bin/python");
const trainBin = path.join(root, ".venv/skillopt/bin/skillopt-train");
const configPath = path.join(root, "tools/skillopt/configs/dispatch-routing-smoke.yaml");
const splitRoot = path.join(root, "tools/skillopt/data/dispatch-routing");
const genericPromptChecks = ["analyst_error.md", "merge_final.md", "ranking.md"];
const searchqaPromptChecks = ["rollout_system.md"];

function fail(message) {
  console.error(`skillopt setup validation failed: ${message}`);
  process.exit(1);
}

function requireFile(filePath) {
  if (!existsSync(filePath)) fail(`missing ${path.relative(root, filePath)}`);
}

function skilloptPackageRoot() {
  const code = "import pathlib, skillopt; print(pathlib.Path(skillopt.__file__).resolve().parent)";
  const completed = spawnSync(skilloptPython, ["-c", code], {
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

requireFile(skilloptPython);
requireFile(trainBin);
requireFile(configPath);
const packageRoot = skilloptPackageRoot();
for (const name of genericPromptChecks) {
  requireFile(path.join(packageRoot, "prompts", name));
}
for (const name of searchqaPromptChecks) {
  requireFile(path.join(packageRoot, "envs/searchqa/prompts", name));
}

for (const split of ["train", "val", "test"]) {
  const filePath = path.join(splitRoot, split, "items.json");
  requireFile(filePath);
  const items = JSON.parse(readFileSync(filePath, "utf8"));
  if (!Array.isArray(items) || items.length === 0) {
    fail(`${path.relative(root, filePath)} must be a non-empty JSON array`);
  }
  for (const [index, item] of items.entries()) {
    for (const key of ["id", "question", "context", "answers"]) {
      if (!(key in item)) {
        fail(`${path.relative(root, filePath)} item ${index} missing ${key}`);
      }
    }
    if (!Array.isArray(item.answers) || item.answers.length === 0) {
      fail(`${path.relative(root, filePath)} item ${index} has no answers`);
    }
  }
}

const code = `
import sys
from importlib.metadata import version
from skillopt.config import load_config, flatten_config
from scripts.train import get_adapter
from skillopt.model.backend_config import set_optimizer_backend, set_target_backend

cfg = flatten_config(load_config(sys.argv[1]))
required = {
    "env": "searchqa",
    "skill_init": "plugins/codex-augment-dispatcher/skills/dispatch/SKILL.md",
    "split_mode": "split_dir",
    "split_dir": "tools/skillopt/data/dispatch-routing",
    "optimizer_backend": "openai_chat",
    "target_backend": "openai_chat",
}
for key, expected in required.items():
    actual = cfg.get(key)
    if actual != expected:
        raise SystemExit(f"{key}={actual!r}, expected {expected!r}")
set_optimizer_backend(cfg["optimizer_backend"])
set_target_backend(cfg["target_backend"])
adapter = get_adapter(cfg)
adapter.setup(cfg)
dataloader = adapter.get_dataloader()
counts = {
    "train": len(dataloader.train_items),
    "val": len(dataloader.val_items),
    "test": len(dataloader.test_items),
}
print({"skillopt": version("skillopt"), "counts": counts, "out_root": cfg.get("out_root")})
`;

const completed = spawnSync(skilloptPython, ["-c", code, configPath], {
  cwd: root,
  encoding: "utf8",
});
if (completed.status !== 0) {
  process.stdout.write(completed.stdout || "");
  process.stderr.write(completed.stderr || "");
  fail("SkillOpt config/dataloader smoke check failed");
}
process.stdout.write(completed.stdout || "");
console.log("SkillOpt setup validation passed");
