#!/usr/bin/env -S node --experimental-strip-types
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnCliSync } from "./spawn_util.ts";

type JsonValue = unknown;

type RunOptions = {
  text?: boolean;
  captureOutput?: boolean;
  timeout?: number;
  check?: boolean;
};

type RunResult = {
  stdout?: string;
  stderr?: string;
  status?: number | null;
  error?: Error & { code?: string };
};

type Runner = (args: string[], options: RunOptions) => RunResult;

export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    tasks: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string", minLength: 1 },
          details: { type: "string" },
          acceptance_criteria: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
  },
  required: ["tasks"],
  additionalProperties: false,
};

export const THINK_SCHEMA = {
  type: "object",
  properties: {
    ideas: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string", minLength: 1 },
          rationale: { type: "string" },
          tradeoffs: {
            type: "array",
            items: { type: "string" },
          },
          risks: {
            type: "array",
            items: { type: "string" },
          },
          validation: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
    recommendation: { type: "string" },
    next_tasks: PLAN_SCHEMA.properties.tasks,
  },
  required: ["ideas"],
  additionalProperties: false,
};

export class PlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanError";
  }
}

export interface Thinker {
  think(prompt: string): string;
}

export class Task {
  id: number;
  title: string;
  details: string;
  acceptanceCriteria: string[];

  constructor({
    id,
    title,
    details = "",
    acceptanceCriteria = [],
  }: {
    id: number;
    title: string;
    details?: string;
    acceptanceCriteria?: string[];
  }) {
    this.id = id;
    this.title = title;
    this.details = details;
    this.acceptanceCriteria = acceptanceCriteria;
  }

  toDict(): Record<string, JsonValue> {
    const data: Record<string, JsonValue> = { id: this.id, title: this.title };
    if (this.details) data.details = this.details;
    if (this.acceptanceCriteria.length) data.acceptance_criteria = this.acceptanceCriteria;
    return data;
  }
}

export class TaskPlan {
  sourcePrompt: string;
  tasks: Task[];

  constructor({ sourcePrompt, tasks }: { sourcePrompt: string; tasks: Task[] }) {
    this.sourcePrompt = sourcePrompt;
    this.tasks = tasks;
  }

  asNumberedText(): string {
    return this.tasks.map((task) => `${task.id}. ${task.title}`).join("\n");
  }

  toDict(): Record<string, JsonValue> {
    return {
      source_prompt: this.sourcePrompt,
      tasks: this.tasks.map((task) => task.toDict()),
    };
  }

  toJson(): string {
    return JSON.stringify(this.toDict(), null, 2);
  }
}

export class Idea {
  id: number;
  title: string;
  rationale: string;
  tradeoffs: string[];
  risks: string[];
  validation: string[];

  constructor({
    id,
    title,
    rationale = "",
    tradeoffs = [],
    risks = [],
    validation = [],
  }: {
    id: number;
    title: string;
    rationale?: string;
    tradeoffs?: string[];
    risks?: string[];
    validation?: string[];
  }) {
    this.id = id;
    this.title = title;
    this.rationale = rationale;
    this.tradeoffs = tradeoffs;
    this.risks = risks;
    this.validation = validation;
  }

  toDict(): Record<string, JsonValue> {
    const data: Record<string, JsonValue> = { id: this.id, title: this.title };
    if (this.rationale) data.rationale = this.rationale;
    if (this.tradeoffs.length) data.tradeoffs = this.tradeoffs;
    if (this.risks.length) data.risks = this.risks;
    if (this.validation.length) data.validation = this.validation;
    return data;
  }
}

export class ThinkingPlan {
  sourcePrompt: string;
  ideas: Idea[];
  recommendation: string;
  nextTasks: Task[];

  constructor({
    sourcePrompt,
    ideas,
    recommendation = "",
    nextTasks = [],
  }: {
    sourcePrompt: string;
    ideas: Idea[];
    recommendation?: string;
    nextTasks?: Task[];
  }) {
    this.sourcePrompt = sourcePrompt;
    this.ideas = ideas;
    this.recommendation = recommendation;
    this.nextTasks = nextTasks;
  }

  asMarkdown(): string {
    const lines = ["Ideas:"];
    for (const idea of this.ideas) {
      lines.push(`${idea.id}. ${idea.title}`);
      if (idea.rationale) lines.push(`   Rationale: ${idea.rationale}`);
      if (idea.tradeoffs.length) {
        lines.push("   Tradeoffs:");
        lines.push(...idea.tradeoffs.map((item) => `   - ${item}`));
      }
      if (idea.risks.length) {
        lines.push("   Risks:");
        lines.push(...idea.risks.map((item) => `   - ${item}`));
      }
      if (idea.validation.length) {
        lines.push("   Validation:");
        lines.push(...idea.validation.map((item) => `   - ${item}`));
      }
    }
    if (this.recommendation) lines.push("", "Recommendation:", this.recommendation);
    if (this.nextTasks.length) {
      lines.push("", "Next tasks:");
      lines.push(...this.nextTasks.map((task) => `${task.id}. ${task.title}`));
    }
    return lines.join("\n");
  }

  toDict(): Record<string, JsonValue> {
    const data: Record<string, JsonValue> = {
      source_prompt: this.sourcePrompt,
      ideas: this.ideas.map((idea) => idea.toDict()),
    };
    if (this.recommendation) data.recommendation = this.recommendation;
    if (this.nextTasks.length) data.next_tasks = this.nextTasks.map((task) => task.toDict());
    return data;
  }

  toJson(): string {
    return JSON.stringify(this.toDict(), null, 2);
  }
}

function defaultRunner(args: string[], options: RunOptions): RunResult {
  const [command, ...rest] = args;
  if (!command) return { status: 1, stderr: "missing command" };
  return spawnCliSync(command, rest, {
    encoding: "utf8",
    timeout: options.timeout,
  }) as RunResult;
}

export class ClaudeCliThinker implements Thinker {
  command: string;
  runner: Runner;
  timeoutSeconds: number;
  outputSchema: Record<string, JsonValue>;

  constructor({
    command,
    runner = defaultRunner,
    timeoutSeconds,
    outputSchema,
  }: {
    command?: string;
    runner?: Runner;
    timeoutSeconds?: number;
    outputSchema?: Record<string, JsonValue>;
  } = {}) {
    this.command = command || process.env.TASK_GATE_CLAUDE_BIN || "claude";
    this.runner = runner;
    this.timeoutSeconds = timeoutSeconds ?? Number(process.env.TASK_GATE_CLAUDE_TIMEOUT || "300");
    this.outputSchema = outputSchema || PLAN_SCHEMA;
  }

  think(prompt: string): string {
    const args = [
      this.command,
      "--print",
      "--output-format",
      "json",
      "--no-session-persistence",
      "--disable-slash-commands",
      "--json-schema",
      JSON.stringify(this.outputSchema),
      prompt,
    ];
    const completed = this.runner(args, {
      text: true,
      captureOutput: true,
      timeout: this.timeoutSeconds * 1000,
      check: true,
    });
    if (completed.error?.code === "ENOENT") {
      throw new PlanError(`claude command not found: ${this.command}`);
    }
    if (completed.error?.code === "ETIMEDOUT" || completed.error?.name === "TimeoutError") {
      throw new PlanError("claude task planning timed out");
    }
    if ((completed.status ?? 0) !== 0) {
      const stderr = (completed.stderr || "").trim();
      const stdout = (completed.stdout || "").trim();
      throw new PlanError(stderr || stdout || `claude exited with status ${completed.status}`);
    }
    const output = (completed.stdout || "").trim();
    if (!output) throw new PlanError("claude returned an empty plan");
    return output;
  }
}

export function buildDefaultThinker(outputSchema?: Record<string, JsonValue>): Thinker {
  const mode = (process.env.TASK_GATE_THINKER || "cli").trim().toLowerCase();
  if (!["", "auto", "cli"].includes(mode)) {
    throw new PlanError("TASK_GATE_THINKER must be cli or auto");
  }
  return new ClaudeCliThinker({ outputSchema });
}

export class TaskPlanner {
  thinker: Thinker;
  maxTasks: number;

  constructor({ thinker, maxTasks = 8 }: { thinker?: Thinker; maxTasks?: number } = {}) {
    this.thinker = thinker || buildDefaultThinker();
    this.maxTasks = maxTasks;
  }

  plan(prompt: string): TaskPlan {
    if (!prompt.trim()) throw new PlanError("prompt must not be blank");
    const thinkerPrompt = buildThinkerPrompt(prompt, this.maxTasks);
    const output = this.thinker.think(thinkerPrompt);
    return parsePlanOutput(output, { sourcePrompt: prompt, maxTasks: this.maxTasks });
  }
}

export class ThinkingPlanner {
  thinker: Thinker;
  maxIdeas: number;
  maxNextTasks: number;

  constructor({
    thinker,
    maxIdeas = 7,
    maxNextTasks = 3,
  }: {
    thinker?: Thinker;
    maxIdeas?: number;
    maxNextTasks?: number;
  } = {}) {
    this.thinker = thinker || buildDefaultThinker(THINK_SCHEMA);
    this.maxIdeas = maxIdeas;
    this.maxNextTasks = maxNextTasks;
  }

  think(prompt: string): ThinkingPlan {
    if (!prompt.trim()) throw new PlanError("prompt must not be blank");
    const thinkerPrompt = buildThinkingPrompt(prompt, this.maxIdeas, this.maxNextTasks);
    const output = this.thinker.think(thinkerPrompt);
    return parseThinkingOutput(output, {
      sourcePrompt: prompt,
      maxIdeas: this.maxIdeas,
      maxNextTasks: this.maxNextTasks,
    });
  }
}

export function buildThinkerPrompt(prompt: string, maxTasks = 8): string {
  return (
    "You are Task Gate, a planning layer that converts a user's raw prompt " +
    "into a short executable task list for Codex.\n" +
    "Return only JSON matching this shape: " +
    '{"tasks":[{"title":"Task title","details":"optional detail",' +
    '"acceptance_criteria":["optional check"]}]}.\n' +
    `Use 1 to ${maxTasks} tasks. Each task must be concrete and executable. ` +
    "Preserve exact filenames, literal text, commands, URLs, identifiers, " +
    "and numeric values from the user prompt inside task titles, details, " +
    "or acceptance criteria whenever they are needed for execution. " +
    "Do not solve the task; only decompose it.\n\n" +
    `User prompt:\n${prompt.trim()}`
  );
}

export function buildThinkingPrompt(prompt: string, maxIdeas = 7, maxNextTasks = 3): string {
  return (
    "You are Task Gate in divergent thinking mode. Codex is stuck, lacks a " +
    "good next step, or needs better options before acting.\n" +
    "Return only JSON matching this shape: " +
    '{"ideas":[{"title":"Candidate direction","rationale":"why it helps",' +
    '"tradeoffs":["cost or benefit"],"risks":["what can go wrong"],' +
    '"validation":["how to test the idea"]}],' +
    '"recommendation":"best first path","next_tasks":[{"title":"concrete next task"}]}.\n' +
    `Generate 3 to ${maxIdeas} meaningfully different candidate ideas unless ` +
    "the prompt clearly needs fewer. Include at most " +
    `${maxNextTasks} next_tasks. Preserve exact filenames, literal text, ` +
    "commands, URLs, identifiers, and numeric values from the user prompt " +
    "whenever they constrain the options. Do not execute the task; open up " +
    "the solution space, compare directions, and recommend the smallest " +
    "reversible next move.\n\n" +
    `Stuck prompt:\n${prompt.trim()}`
  );
}

export function parsePlanOutput(
  output: string,
  { sourcePrompt, maxTasks = 8 }: { sourcePrompt: string; maxTasks?: number },
): TaskPlan {
  if (!output.trim()) throw new PlanError("thinker returned an empty plan");
  const parsed = tryParseJson(output);
  const tasks = parsed !== null ? tasksFromJson(parsed, maxTasks) : tasksFromNumberedText(output, maxTasks);
  if (!tasks.length) throw new PlanError("thinker did not produce any tasks");
  return new TaskPlan({ sourcePrompt, tasks });
}

export function parseThinkingOutput(
  output: string,
  {
    sourcePrompt,
    maxIdeas = 7,
    maxNextTasks = 3,
  }: { sourcePrompt: string; maxIdeas?: number; maxNextTasks?: number },
): ThinkingPlan {
  if (!output.trim()) throw new PlanError("thinker returned an empty thinking plan");
  const parsed = tryParseJson(output);
  let ideas: Idea[];
  let recommendation = "";
  let nextTasks: Task[] = [];
  if (parsed !== null) {
    [ideas, recommendation, nextTasks] = thinkingFromJson(parsed, maxIdeas, maxNextTasks);
  } else {
    ideas = ideasFromNumberedText(output, maxIdeas);
  }
  if (!ideas.length) throw new PlanError("thinker did not produce any ideas");
  return new ThinkingPlan({ sourcePrompt, ideas, recommendation, nextTasks });
}

export function tryParseJson(output: string): JsonValue | null {
  let text = output.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenced?.[1]) {
    text = fenced[1].trim();
  } else {
    const objectMatch = /\{[\s\S]*\}/.exec(text);
    if (objectMatch?.[0]) text = objectMatch[0];
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function tasksFromJson(parsed: JsonValue, maxTasks: number): Task[] {
  const record = asRecord(parsed);
  if (record && asRecord(record.structured_output)) {
    return tasksFromJson(record.structured_output, maxTasks);
  }
  if (record && typeof record.result === "string") {
    const nested = tryParseJson(record.result);
    if (nested !== null) return tasksFromJson(nested, maxTasks);
  }
  if (!record || !Array.isArray(record.tasks)) {
    throw new PlanError('JSON plan must contain a "tasks" array');
  }
  const tasks: Task[] = [];
  for (const raw of record.tasks.slice(0, maxTasks)) {
    const task = taskFromRaw(raw, tasks.length + 1);
    if (task) tasks.push(task);
  }
  return tasks;
}

function thinkingFromJson(parsed: JsonValue, maxIdeas: number, maxNextTasks: number): [Idea[], string, Task[]] {
  const record = asRecord(parsed);
  if (record && asRecord(record.structured_output)) {
    return thinkingFromJson(record.structured_output, maxIdeas, maxNextTasks);
  }
  if (record && typeof record.result === "string") {
    const nested = tryParseJson(record.result);
    if (nested !== null) return thinkingFromJson(nested, maxIdeas, maxNextTasks);
  }
  if (!record) throw new PlanError('JSON thinking plan must contain an "ideas" array');
  const rawIdeas = record.ideas || record.directions || record.options || record.candidates;
  if (!Array.isArray(rawIdeas)) throw new PlanError('JSON thinking plan must contain an "ideas" array');
  const ideas: Idea[] = [];
  for (const raw of rawIdeas.slice(0, maxIdeas)) {
    const idea = ideaFromRaw(raw, ideas.length + 1);
    if (idea) ideas.push(idea);
  }
  const recommendation = String(record.recommendation || record.recommended_path || record.recommended || "").trim();
  const rawNextTasks = record.next_tasks || record.tasks || [];
  const nextTasks: Task[] = [];
  if (Array.isArray(rawNextTasks)) {
    for (const raw of rawNextTasks.slice(0, maxNextTasks)) {
      const task = taskFromRaw(raw, nextTasks.length + 1);
      if (task) nextTasks.push(task);
    }
  }
  return [ideas, recommendation, nextTasks];
}

function ideaFromRaw(raw: JsonValue, ideaId: number): Idea | null {
  if (typeof raw === "string") {
    const title = raw.trim();
    return title ? new Idea({ id: ideaId, title }) : null;
  }
  const record = asRecord(raw);
  if (!record) return null;
  const title = String(record.title || record.idea || record.direction || record.option || record.name || "").trim();
  if (!title) return null;
  return new Idea({
    id: ideaId,
    title,
    rationale: String(record.rationale || record.why || record.details || record.detail || "").trim(),
    tradeoffs: stringList(record.tradeoffs || record.trade_offs || record["trade-offs"] || record.costs || []),
    risks: stringList(record.risks || record.risk || []),
    validation: stringList(record.validation || record.verification || record.checks || []),
  });
}

function ideasFromNumberedText(output: string, maxIdeas: number): Idea[] {
  const ideas: Idea[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(?:\d+[\.)]|[-*])\s+(.+?)\s*$/.exec(line);
    if (!match?.[1]) continue;
    const title = match[1].trim();
    if (title) ideas.push(new Idea({ id: ideas.length + 1, title }));
    if (ideas.length >= maxIdeas) break;
  }
  return ideas;
}

export function taskFromRaw(raw: JsonValue, taskId: number): Task | null {
  if (typeof raw === "string") {
    const title = raw.trim();
    return title ? new Task({ id: taskId, title }) : null;
  }
  const record = asRecord(raw);
  if (!record) return null;
  const title = String(record.title || record.task || record.description || record.name || "").trim();
  if (!title) return null;
  return new Task({
    id: taskId,
    title,
    details: String(record.details || record.detail || "").trim(),
    acceptanceCriteria: stringList(record.acceptance_criteria || record.checks || []),
  });
}

function tasksFromNumberedText(output: string, maxTasks: number): Task[] {
  const tasks: Task[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(?:\d+[\.)]|[-*])\s+(.+?)\s*$/.exec(line);
    if (!match?.[1]) continue;
    const title = match[1].trim();
    if (title) tasks.push(new Task({ id: tasks.length + 1, title }));
    if (tasks.length >= maxTasks) break;
  }
  return tasks;
}

export function stringList(raw: JsonValue): string[] {
  if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

function asRecord(value: JsonValue): Record<string, JsonValue> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, JsonValue>) : null;
}

type CliArgs = {
  prompt: string[];
  maxTasks: number;
  maxIdeas: number;
  think: boolean;
  json: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { prompt: [], maxTasks: 8, maxIdeas: 7, think: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--think") args.think = true;
    else if (item === "--json") args.json = true;
    else if (item === "--max-tasks") args.maxTasks = Number(argv[++i] || "8");
    else if (item === "--max-ideas") args.maxIdeas = Number(argv[++i] || "7");
    else if (item === "-h" || item === "--help") {
      printHelp();
      process.exit(0);
    } else if (item) {
      args.prompt.push(item);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`usage: task_gate.ts [--max-tasks N] [--max-ideas N] [--think] [--json] [prompt ...]

Plan or brainstorm a raw prompt.`);
}

export function main(argv = process.argv.slice(2)): number {
  const args = parseArgs(argv);
  const prompt = args.prompt.join(" ").trim() || readFileSync(0, "utf8").trim();
  try {
    if (args.think) {
      const thinkingPlan = new ThinkingPlanner({ maxIdeas: args.maxIdeas }).think(prompt);
      console.log(args.json ? thinkingPlan.toJson() : thinkingPlan.asMarkdown());
      return 0;
    }
    const plan = new TaskPlanner({ maxTasks: args.maxTasks }).plan(prompt);
    console.log(args.json ? plan.toJson() : plan.asNumberedText());
    return 0;
  } catch (error) {
    if (error instanceof PlanError) {
      console.error(`task-gate: ${error.message}`);
      return 1;
    }
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
