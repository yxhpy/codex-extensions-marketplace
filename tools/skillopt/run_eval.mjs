#!/usr/bin/env node
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const pythonBin = path.join(root, ".venv/skillopt/bin/python");
const evalBin = path.join(root, ".venv/skillopt/bin/skillopt-eval");
const codexRunner = path.join(root, "tools/skillopt/codex_skillopt_runner.py");
const configPath = "tools/skillopt/configs/dispatch-routing-smoke.yaml";
const defaultSkill = ".tmp/skillopt-runs/dispatch-routing/best_skill.md";
const skillPath = process.argv[2] || defaultSkill;
const backend = process.env.SKILLOPT_BACKEND || "codex_cli";

const openAiRequiredEnv = [
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_AUTH_MODE",
  "AZURE_OPENAI_API_KEY",
  "SKILLOPT_TARGET_MODEL",
];

function fail(message) {
  console.error(`skillopt eval failed: ${message}`);
  process.exit(1);
}

if (!existsSync(evalBin)) {
  fail("missing .venv/skillopt/bin/skillopt-eval; run the setup commands in tools/skillopt/README.md first");
}
if (!existsSync(pythonBin)) {
  fail("missing .venv/skillopt/bin/python; run the setup commands in tools/skillopt/README.md first");
}
if (!existsSync(path.resolve(root, skillPath))) {
  fail(`missing skill artifact ${skillPath}; run npm run skillopt:train first or pass an explicit skill path`);
}

if (backend === "openai_chat") {
  const missing = openAiRequiredEnv.filter((key) => !process.env[key]);
  if (missing.length) {
    fail(`missing required environment variables: ${missing.join(", ")}`);
  }

  const args = [
    "--config", configPath,
    "--skill", skillPath,
    "--split", "all",
    "--target_backend", "openai_chat",
    "--azure_openai_endpoint", process.env.AZURE_OPENAI_ENDPOINT,
    "--azure_openai_auth_mode", process.env.AZURE_OPENAI_AUTH_MODE,
    "--azure_openai_api_key", process.env.AZURE_OPENAI_API_KEY,
    "--target_model", process.env.SKILLOPT_TARGET_MODEL,
    ...process.argv.slice(3),
  ];

  const completed = spawnSync(evalBin, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  process.exitCode = completed.status ?? 1;
} else {
  if (!existsSync(codexRunner)) {
    fail("missing tools/skillopt/codex_skillopt_runner.py");
  }
  const codexBin = process.env.SKILLOPT_CODEX_BIN || process.env.CODEX_EXEC_PATH || process.env.CODEX_CLI_BIN || "codex";
  if (!process.env.SKILLOPT_SKIP_CODEX_CHECK) {
    const codexCheck = spawnSync(codexBin, ["--version"], {
      cwd: root,
      encoding: "utf8",
    });
    if (codexCheck.status !== 0) {
      fail(`codex command not available: ${codexBin}`);
    }
  }

  const args = [
    codexRunner,
    "eval",
    "--config", configPath,
    "--skill", skillPath,
    "--split", "all",
    ...process.argv.slice(3),
  ];

  const completed = spawnSync(pythonBin, args, {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      SKILLOPT_CODEX_BIN: codexBin,
      ...(process.env.SKILLOPT_OPTIMIZER_MODEL ? { SKILLOPT_OPTIMIZER_MODEL: process.env.SKILLOPT_OPTIMIZER_MODEL } : {}),
      ...(process.env.SKILLOPT_TARGET_MODEL ? { SKILLOPT_TARGET_MODEL: process.env.SKILLOPT_TARGET_MODEL } : {}),
      CODEX_EXEC_PATH: codexBin,
      CODEX_EXEC_USE_SDK: process.env.CODEX_EXEC_USE_SDK || "cli",
      CODEX_EXEC_FULL_AUTO: process.env.CODEX_EXEC_FULL_AUTO || "false",
    },
  });
  process.exitCode = completed.status ?? 1;
}
