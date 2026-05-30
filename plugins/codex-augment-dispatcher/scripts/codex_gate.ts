#!/usr/bin/env -S node --experimental-strip-types
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  PLAN_SCHEMA,
  PlanError,
  Task,
  TaskPlan,
  TaskPlanner,
  buildDefaultThinker,
  stringList,
  taskFromRaw,
  tryParseJson,
  type Thinker,
} from "./task_gate.ts";

type JsonValue = unknown;

type RunResult = {
  stdout?: string;
  stderr?: string;
  status?: number | null;
  error?: Error & { code?: string };
};

type Runner = (args: string[], options: Record<string, JsonValue>) => RunResult;

export const FOLLOWUP_SCHEMA = {
  type: "object",
  properties: {
    complete: { type: "boolean" },
    summary: { type: "string" },
    next_tasks: PLAN_SCHEMA.properties.tasks,
  },
  required: ["complete", "summary"],
  additionalProperties: false,
};

export class GateResult {
  exitCode: number;
  output: string;

  constructor({ exitCode, output = "" }: { exitCode: number; output?: string }) {
    this.exitCode = exitCode;
    this.output = output;
  }
}

export class CodexRunResult {
  exitCode: number;
  output: string;

  constructor({ exitCode, output = "" }: { exitCode: number; output?: string }) {
    this.exitCode = exitCode;
    this.output = output;
  }
}

export class FollowupDecision {
  complete: boolean;
  summary: string;
  nextTasks: Task[];

  constructor({
    complete,
    summary = "",
    nextTasks = [],
  }: {
    complete: boolean;
    summary?: string;
    nextTasks?: Task[];
  }) {
    this.complete = complete;
    this.summary = summary;
    this.nextTasks = nextTasks;
  }
}

function defaultRunner(args: string[]): RunResult {
  const [command, ...rest] = args;
  if (!command) return { status: 1, stderr: "missing command" };
  return spawnSync(command, rest, { encoding: "utf8" }) as RunResult;
}

export class CodexExecutor {
  command: string;
  runner: Runner;

  constructor({ command, runner = defaultRunner }: { command?: string; runner?: Runner } = {}) {
    this.command = command || process.env.TASK_GATE_CODEX_BIN || "codex";
    this.runner = runner;
  }

  execute({
    codexPrompt,
    cwd,
    extraArgs = [],
  }: {
    codexPrompt: string;
    cwd?: string;
    extraArgs?: string[];
  }): CodexRunResult {
    const args = [this.command, "exec", "--skip-git-repo-check"];
    if (cwd) args.push("-C", cwd);
    args.push(...extraArgs, codexPrompt);
    const completed = this.runner(args, { text: true, check: false, captureOutput: true });
    if (completed.error?.code === "ENOENT") {
      throw new PlanError(`codex command not found: ${this.command}`);
    }
    const stdout = (completed.stdout || "").trim();
    const stderr = (completed.stderr || "").trim();
    return new CodexRunResult({
      exitCode: Number(completed.status ?? 0),
      output: [stdout, stderr].filter(Boolean).join("\n"),
    });
  }
}

export class FollowupPlanner {
  thinker: Thinker;
  maxTasks: number;

  constructor({ thinker, maxTasks = 8 }: { thinker?: Thinker; maxTasks?: number } = {}) {
    this.thinker = thinker || buildDefaultThinker(FOLLOWUP_SCHEMA);
    this.maxTasks = maxTasks;
  }

  assess({
    plan,
    codexOutput,
    exitCode,
    roundNumber,
  }: {
    plan: TaskPlan;
    codexOutput: string;
    exitCode: number;
    roundNumber: number;
  }): FollowupDecision {
    const prompt = buildFollowupPrompt({
      plan,
      codexOutput,
      exitCode,
      roundNumber,
      maxTasks: this.maxTasks,
    });
    return parseFollowupOutput(this.thinker.think(prompt), this.maxTasks);
  }
}

export class CodexGate {
  planner: { plan(prompt: string): TaskPlan };
  executor: CodexExecutor;
  followupPlanner: { assess(args: Record<string, JsonValue>): FollowupDecision };

  constructor({
    planner,
    executor,
    followupPlanner,
  }: {
    planner?: { plan(prompt: string): TaskPlan };
    executor?: CodexExecutor;
    followupPlanner?: { assess(args: Record<string, JsonValue>): FollowupDecision };
  } = {}) {
    this.planner = planner || new TaskPlanner();
    this.executor = executor || new CodexExecutor();
    this.followupPlanner = followupPlanner || new FollowupPlanner();
  }

  run({
    prompt,
    execute = false,
    cwd,
    codexArgs = [],
    maxRounds = 3,
  }: {
    prompt: string;
    execute?: boolean;
    cwd?: string;
    codexArgs?: string[];
    maxRounds?: number;
  }): GateResult {
    let plan: TaskPlan;
    try {
      plan = this.planner.plan(prompt);
    } catch (error) {
      if (error instanceof PlanError) {
        return new GateResult({ exitCode: 1, output: `task-gate: ${error.message}` });
      }
      throw error;
    }

    if (!execute) return new GateResult({ exitCode: 0, output: plan.asNumberedText() });
    if (maxRounds < 1) {
      return new GateResult({ exitCode: 1, output: "task-gate: max_rounds must be at least 1" });
    }

    let currentPlan = plan;
    const reports = ["Initial task plan:", plan.asNumberedText()];
    for (let roundNumber = 1; roundNumber <= maxRounds; roundNumber += 1) {
      const codexPrompt = buildCodexExecutionPrompt(currentPlan, roundNumber);
      try {
        const runResult = this.executor.execute({
          codexPrompt,
          cwd,
          extraArgs: codexArgs,
        });
        const decision = this.followupPlanner.assess({
          plan: currentPlan,
          codexOutput: runResult.output,
          exitCode: runResult.exitCode,
          roundNumber,
        });
        reports.push(formatRoundReport(roundNumber, runResult, decision));
        if (decision.complete && runResult.exitCode === 0) {
          reports.push("Task Gate completion verdict: complete.");
          return new GateResult({ exitCode: 0, output: reports.join("\n\n") });
        }
        if (decision.complete && runResult.exitCode !== 0) {
          reports.push(
            "Task Gate marked the work complete, but Codex exited nonzero; continuing because completion is not proven.",
          );
        }
        if (!decision.nextTasks.length) {
          reports.push("task-gate: task is not complete and Gate returned no next tasks.");
          return new GateResult({ exitCode: 1, output: reports.join("\n\n") });
        }
        currentPlan = new TaskPlan({
          sourcePrompt: `Gate follow-up after execution round ${roundNumber}`,
          tasks: decision.nextTasks,
        });
      } catch (error) {
        if (error instanceof PlanError) {
          reports.push(`task-gate: ${error.message}`);
          return new GateResult({ exitCode: 1, output: reports.join("\n\n") });
        }
        throw error;
      }
    }

    reports.push(
      "task-gate: max execution rounds reached before completion; refusing to report success while work remains.",
    );
    return new GateResult({ exitCode: 1, output: reports.join("\n\n") });
  }
}

export function buildCodexExecutionPrompt(plan: TaskPlan, roundNumber = 1): string {
  return (
    "Task Gate has already converted the user's raw request into the authorized task plan below. " +
    "Execute only these numbered tasks in order.\n" +
    `This is execution round ${roundNumber}.\n\n` +
    `${formatExecutionPlan(plan)}\n\n` +
    "Execution rules:\n" +
    "- Treat the numbered plan as the task boundary.\n" +
    "- Do not reinterpret the original raw request; it is intentionally absent.\n" +
    "- If a required task is missing or unsafe, stop and report the blocker.\n" +
    "- Before claiming completion, run suitable verification and report evidence.\n" +
    "- At the end of your response, always include a Detailed completion summary.\n\n" +
    "Detailed completion summary requirements:\n" +
    "- Work completed: list the concrete tasks handled and files or commands involved.\n" +
    "- Verification: list commands, checks, and exact results, or say why they were not run.\n" +
    "- Remaining work: list any unfinished task, missing verification, or uncertainty.\n" +
    "- Blockers: list blockers or write none.\n" +
    "- Completion verdict: write complete only when all authorized tasks and verification are done; otherwise write incomplete.\n" +
    "This detailed summary is mandatory because Task Gate will read it to decide the next tasks."
  );
}

export function buildFollowupPrompt({
  plan,
  codexOutput,
  exitCode,
  roundNumber,
  maxTasks = 8,
}: {
  plan: TaskPlan;
  codexOutput: string;
  exitCode: number;
  roundNumber: number;
  maxTasks?: number;
}): string {
  return (
    "You are Task Gate reviewing the end of a Codex execution round. " +
    "The raw user prompt is intentionally absent; use only the authorized task plan and Codex's detailed completion summary.\n" +
    "Return only JSON matching this shape: " +
    '{"complete":false,"summary":"detailed assessment",' +
    '"next_tasks":[{"title":"next task","details":"optional detail",' +
    '"acceptance_criteria":["optional check"]}]}.\n' +
    `If complete is false, provide 1 to ${maxTasks} concrete next_tasks so Codex can continue. ` +
    "If complete is true, next_tasks may be empty. Do not mark complete when verification is missing, " +
    "Codex exited nonzero, or the summary says work remains.\n\n" +
    `Execution round: ${roundNumber}\n` +
    `Codex exit code: ${exitCode}\n\n` +
    "Authorized task plan:\n" +
    `${formatExecutionPlan(plan)}\n\n` +
    "Codex detailed completion summary and output:\n" +
    clipText(codexOutput)
  );
}

export function parseFollowupOutput(output: string, maxTasks = 8): FollowupDecision {
  const parsed = tryParseJson(output);
  if (parsed === null) throw new PlanError("follow-up gate returned invalid JSON");
  return followupFromJson(parsed, maxTasks);
}

function followupFromJson(parsed: JsonValue, maxTasks: number): FollowupDecision {
  const record = asRecord(parsed);
  if (record && asRecord(record.structured_output)) return followupFromJson(record.structured_output, maxTasks);
  if (record && typeof record.result === "string") {
    const nested = tryParseJson(record.result);
    if (nested !== null) return followupFromJson(nested, maxTasks);
  }
  if (!record) throw new PlanError("follow-up gate JSON must be an object");
  const complete = boolFromRaw(
    Object.hasOwn(record, "complete") ? record.complete : record.is_complete || record.done,
  );
  const summary = String(record.summary || record.assessment || "").trim();
  const rawTasks = record.next_tasks || record.tasks || [];
  const nextTasks: Task[] = [];
  if (Array.isArray(rawTasks)) {
    for (const raw of rawTasks.slice(0, maxTasks)) {
      const task = taskFromRaw(raw, nextTasks.length + 1);
      if (task) nextTasks.push(task);
    }
  }
  return new FollowupDecision({ complete, summary, nextTasks });
}

function boolFromRaw(raw: JsonValue): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (["true", "yes", "done", "complete", "completed"].includes(normalized)) return true;
    if (["false", "no", "incomplete", "remaining", "blocked"].includes(normalized)) return false;
  }
  throw new PlanError('follow-up gate JSON must contain boolean "complete"');
}

function clipText(text: string): string {
  const limit = Number(process.env.TASK_GATE_CODEX_OUTPUT_CHARS || "12000");
  if (text.length <= limit) return text;
  const omitted = text.length - limit;
  return `[omitted ${omitted} earlier chars]\n${text.slice(-limit)}`;
}

function formatRoundReport(roundNumber: number, runResult: CodexRunResult, decision: FollowupDecision): string {
  const lines = [
    `Execution round ${roundNumber}`,
    `Codex exit code: ${runResult.exitCode}`,
    "Codex detailed completion summary:",
    indent(runResult.output || "<no output>"),
    "Gate follow-up:",
    indent(decision.summary || "<no summary>"),
  ];
  if (decision.nextTasks.length) {
    lines.push("Gate next tasks:");
    lines.push(indent(new TaskPlan({ sourcePrompt: "", tasks: decision.nextTasks }).asNumberedText()));
  }
  return lines.join("\n");
}

function indent(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => (line ? `  ${line}` : ""))
    .join("\n");
}

function formatExecutionPlan(plan: TaskPlan): string {
  const lines: string[] = [];
  for (const task of plan.tasks) {
    lines.push(`${task.id}. ${task.title}`);
    if (task.details) lines.push(`   Details: ${task.details}`);
    if (task.acceptanceCriteria.length) {
      lines.push("   Acceptance criteria:");
      lines.push(...task.acceptanceCriteria.map((criterion) => `   - ${criterion}`));
    }
  }
  return lines.join("\n");
}

function asRecord(value: JsonValue): Record<string, JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, JsonValue>) : null;
}

type CliArgs = {
  prompt: string[];
  execute: boolean;
  cwd: string;
  maxTasks: number;
  maxRounds: number;
  codexArgs: string[];
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    prompt: [],
    execute: false,
    cwd: process.cwd(),
    maxTasks: 8,
    maxRounds: 3,
    codexArgs: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--execute") args.execute = true;
    else if (item === "--cwd") args.cwd = argv[++i] || process.cwd();
    else if (item === "--max-tasks") args.maxTasks = Number(argv[++i] || "8");
    else if (item === "--max-rounds") args.maxRounds = Number(argv[++i] || "3");
    else if (item === "--codex-arg") args.codexArgs.push(argv[++i] || "");
    else if (item === "-h" || item === "--help") {
      printHelp();
      process.exit(0);
    } else if (item) args.prompt.push(item);
  }
  return args;
}

function printHelp(): void {
  console.log(`usage: codex_gate.ts [--execute] [--cwd DIR] [--max-tasks N] [--max-rounds N] [--codex-arg ARG] [prompt ...]

Plan a raw prompt first, then optionally execute the plan with Codex.`);
}

export function main(argv = process.argv.slice(2)): number {
  const args = parseArgs(argv);
  const prompt = args.prompt.join(" ").trim() || readFileSync(0, "utf8").trim();
  const gate = new CodexGate({
    planner: new TaskPlanner({ maxTasks: args.maxTasks }),
    followupPlanner: new FollowupPlanner({ maxTasks: args.maxTasks }),
  });
  const result = gate.run({
    prompt,
    execute: args.execute,
    cwd: args.cwd,
    codexArgs: args.codexArgs.filter(Boolean),
    maxRounds: args.maxRounds,
  });
  if (result.output) {
    const stream = result.exitCode === 0 ? process.stdout : process.stderr;
    stream.write(`${result.output}\n`);
  }
  return result.exitCode;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
