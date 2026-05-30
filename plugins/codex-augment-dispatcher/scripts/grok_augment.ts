#!/usr/bin/env -S node --experimental-strip-types
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

type RunResult = {
  stdout?: string;
  stderr?: string;
  status?: number | null;
  error?: Error & { code?: string };
};

type Runner = (args: string[], options: Record<string, unknown>) => RunResult;

type JsonPayload = Record<string, unknown>;

export const DEFAULT_TIMEOUT_SECONDS = 300;
export const VALID_MODES = new Set(["research", "critic", "creative", "video", "diverge"]);
export const DEFAULT_GROK_VIDEO_BASE_URL = "http://127.0.0.1:20080";
export const DEFAULT_GROK_VIDEO_MODEL = "grok-imagine-video";
export const DEFAULT_GROK_VIDEO_SIZE = "1024x1024";
export const DEFAULT_GROK_VIDEO_SECONDS = 6;
export const DEFAULT_GROK_VIDEO_QUALITY = "standard";
export const MIN_VIDEO_BYTES = 10_000;

export class GrokAugmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GrokAugmentError";
  }
}

function defaultRunner(args: string[], options: Record<string, unknown>): RunResult {
  const [command, ...rest] = args;
  if (!command) return { status: 1, stderr: "missing command" };
  return spawnSync(command, rest, {
    encoding: "utf8",
    timeout: Number(options.timeout || DEFAULT_TIMEOUT_SECONDS * 1000),
  }) as RunResult;
}

export class GrokCli {
  command: string;
  runner: Runner;
  timeoutSeconds: number;

  constructor({
    command,
    runner = defaultRunner,
    timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
  }: {
    command: string;
    runner?: Runner;
    timeoutSeconds?: number;
  }) {
    this.command = command;
    this.runner = runner;
    this.timeoutSeconds = timeoutSeconds;
  }

  singleTurn(prompt: string, { effort, outputFormat = "plain" }: { effort?: string; outputFormat?: string } = {}): string {
    const args = [this.command, "--no-alt-screen", "--no-plan", "--output-format", outputFormat];
    if (effort) args.push("--effort", effort);
    args.push("-p", prompt);
    const completed = this.run(args);
    const output = (completed.stdout || "").trim();
    if (!output) throw new GrokAugmentError("grok returned an empty response");
    return output;
  }

  inspect(): JsonPayload {
    const version = (this.run([this.command, "--version"]).stdout || "").trim();
    const models = (this.run([this.command, "models"]).stdout || "").trim();
    if (!version) throw new GrokAugmentError("grok --version returned empty output");
    if (!models) throw new GrokAugmentError("grok models returned empty output");
    return {
      provider: "grok-cli",
      command: this.command,
      version,
      models,
    };
  }

  private run(args: string[]): RunResult {
    const completed = this.runner(args, {
      text: true,
      captureOutput: true,
      timeout: this.timeoutSeconds * 1000,
      check: false,
    });
    if (completed.error?.code === "ENOENT") {
      throw new GrokAugmentError(`grok command not found: ${this.command}`);
    }
    if (completed.error?.code === "ETIMEDOUT" || completed.error?.name === "TimeoutError") {
      throw new GrokAugmentError("grok command timed out");
    }
    if ((completed.status ?? 0) !== 0) {
      const stderr = (completed.stderr || "").trim();
      const stdout = (completed.stdout || "").trim();
      throw new GrokAugmentError(stderr || stdout || `grok exited with status ${completed.status}`);
    }
    return completed;
  }
}

export class GrokVideoClient {
  baseUrl: string;
  apiKey: string;
  timeoutSeconds: number;

  constructor({
    baseUrl = DEFAULT_GROK_VIDEO_BASE_URL,
    apiKey = "",
    timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
  }: {
    baseUrl?: string;
    apiKey?: string;
    timeoutSeconds?: number;
  } = {}) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.timeoutSeconds = timeoutSeconds;
  }

  async generate(
    prompt: string,
    {
      outDir,
      model = DEFAULT_GROK_VIDEO_MODEL,
      seconds = DEFAULT_GROK_VIDEO_SECONDS,
      size = DEFAULT_GROK_VIDEO_SIZE,
      quality = DEFAULT_GROK_VIDEO_QUALITY,
    }: {
      outDir: string;
      model?: string;
      seconds?: number;
      size?: string;
      quality?: string;
    },
  ): Promise<JsonPayload> {
    const cleaned = prompt.trim();
    if (!cleaned) throw new GrokAugmentError("video prompt must not be blank");
    mkdirSync(outDir, { recursive: true });

    const payload = new URLSearchParams({
      model,
      prompt: cleaned,
      seconds: String(seconds),
      size,
      quality,
      resolution_name: quality === "high" ? "720p" : "480p",
      preset: "normal",
    });
    let job = await this.postForm("/v1/videos", payload);
    const videoId = String(job.id || "").trim();
    if (!videoId) throw new GrokAugmentError(`grok video response missing id: ${JSON.stringify(job)}`);

    let state = String(job.status || "").trim();
    const deadline = Date.now() + this.timeoutSeconds * 1000;
    let polls = 1;
    while (["queued", "in_progress"].includes(state) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      job = await this.getJson(`/v1/videos/${videoId}`, 30_000);
      polls += 1;
      state = String(job.status || "").trim();
    }
    if (state !== "completed") {
      throw new GrokAugmentError(`grok video did not complete: status=${state || "unknown"}`);
    }

    const videoBytes = await this.downloadVideo(job, videoId);
    if (videoBytes.length < MIN_VIDEO_BYTES) {
      throw new GrokAugmentError(`grok video output too small: ${videoBytes.length} bytes`);
    }
    const videoPath = path.join(outDir, `${videoId}.mp4`);
    writeFileSync(videoPath, videoBytes);
    return {
      provider: "grok-video",
      id: videoId,
      status: state,
      model: job.model || model,
      seconds: String(job.seconds || seconds),
      size: job.size || size,
      quality: job.quality || quality,
      polls,
      file: videoPath,
      bytes: videoBytes.length,
    };
  }

  private headers(contentType?: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    if (contentType) headers["Content-Type"] = contentType;
    return headers;
  }

  private url(pathname: string): string {
    return `${this.baseUrl.replace(/\/+$/, "")}${pathname}`;
  }

  private async postForm(pathname: string, payload: URLSearchParams): Promise<JsonPayload> {
    return this.openJson(this.url(pathname), {
      method: "POST",
      body: payload.toString(),
      headers: this.headers("application/x-www-form-urlencoded"),
    });
  }

  private async getJson(pathname: string, timeoutMs: number): Promise<JsonPayload> {
    return this.openJson(this.url(pathname), { method: "GET", headers: this.headers() }, timeoutMs);
  }

  private async openJson(url: string, init: RequestInit, timeoutMs = this.timeoutSeconds * 1000): Promise<JsonPayload> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const text = await response.text();
      if (!response.ok) throw new GrokAugmentError(`grok video HTTP ${response.status}: ${text.trim()}`);
      return JSON.parse(text);
    } catch (error) {
      if (error instanceof GrokAugmentError) throw error;
      throw new GrokAugmentError(`grok video request failed: ${String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async downloadVideo(job: JsonPayload, videoId: string): Promise<Buffer> {
    const url = typeof job.url === "string" && job.url ? job.url : this.url(`/v1/videos/${videoId}/content`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutSeconds * 1000);
    try {
      const response = await fetch(url, { headers: this.headers(), signal: controller.signal });
      const body = Buffer.from(await response.arrayBuffer());
      if (!response.ok) throw new GrokAugmentError(`grok video download HTTP ${response.status}: ${body.toString("utf8").trim()}`);
      return body;
    } catch (error) {
      if (error instanceof GrokAugmentError) throw error;
      throw new GrokAugmentError(`grok video download failed: ${String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function buildPrompt(mode: string, brief: string): string {
  const cleaned = brief.trim();
  if (!cleaned) throw new GrokAugmentError("brief must not be blank");
  if (!VALID_MODES.has(mode)) throw new GrokAugmentError(`unknown mode: ${mode}`);
  const headers: Record<string, string> = {
    research:
      "You are Grok Research for Codex. Use current web/X knowledge when useful. Return concise Markdown with: Findings, source URLs, Risks, and Codex Actions. Codex owns local file edits, command execution, verification, and commits.",
    critic:
      "You are an independent Grok reviewer for Codex. Find missing requirements, incorrect assumptions, risk, and verification gaps. Do not edit files or ask for tool execution. Codex owns local file edits and tests.",
    creative:
      "You are Grok Creative for a Codex/AGY workflow. Produce bold but executable visual directions, interaction ideas, copy, and asset prompts. For image assets, state that Codex must use image_gen. For video assets, state that Codex must use Grok video. Do not cap asset count unless the user asks.",
    video:
      "You are Grok Video for Codex. Produce a video-generation brief and shot list for Grok video only. No fallback provider is allowed. Do not use image providers for video. Include prompt, duration, aspect ratio, camera movement, style, negative constraints, and expected output checks.",
    diverge:
      "You are Grok Divergence for Codex. Generate 3 to 7 meaningfully different candidate paths, with tradeoffs, risks, and how Codex can verify each locally. Do not mutate files.",
  };
  return `${headers[mode]}\n\nUser brief:\n${cleaned}`;
}

export function buildCli(): GrokCli {
  const command = (process.env.GROK_AUGMENT_GROK_BIN || "grok").trim();
  if (!command) throw new GrokAugmentError("GROK_AUGMENT_GROK_BIN must not be blank");
  const timeoutSeconds = Number(process.env.GROK_AUGMENT_TIMEOUT || String(DEFAULT_TIMEOUT_SECONDS));
  return new GrokCli({ command, timeoutSeconds });
}

function buildVideoClient(args: CliArgs): GrokVideoClient {
  const baseUrl = args.baseUrl || process.env.GROK_VIDEO_BASE_URL || DEFAULT_GROK_VIDEO_BASE_URL;
  const apiKeyEnv = args.apiKeyEnv || "GROK_VIDEO_API_KEY";
  const timeoutSeconds = Number(process.env.GROK_VIDEO_TIMEOUT || String(DEFAULT_TIMEOUT_SECONDS));
  return new GrokVideoClient({
    baseUrl,
    apiKey: process.env[apiKeyEnv] || "",
    timeoutSeconds,
  });
}

export function emitResult(payload: JsonPayload, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
  } else if ("response" in payload) {
    console.log(payload.response);
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
}

type CliArgs = {
  json: boolean;
  effort?: string;
  printPrompt: boolean;
  mode: string;
  brief: string[];
  baseUrl?: string;
  apiKeyEnv?: string;
  outDir?: string;
  model: string;
  seconds: number;
  size: string;
  quality: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    json: false,
    printPrompt: false,
    mode: "",
    brief: [],
    model: DEFAULT_GROK_VIDEO_MODEL,
    seconds: DEFAULT_GROK_VIDEO_SECONDS,
    size: DEFAULT_GROK_VIDEO_SIZE,
    quality: DEFAULT_GROK_VIDEO_QUALITY,
  };
  const consumeFlag = (item: string, index: number): number => {
    if (item === "--json") args.json = true;
    else if (item === "--print-prompt") args.printPrompt = true;
    else if (item === "--effort") args.effort = argv[++index];
    else if (item === "--base-url") args.baseUrl = argv[++index];
    else if (item === "--api-key-env") args.apiKeyEnv = argv[++index];
    else if (item === "--out-dir") args.outDir = argv[++index];
    else if (item === "--model") args.model = argv[++index] || DEFAULT_GROK_VIDEO_MODEL;
    else if (item === "--seconds") args.seconds = Number(argv[++index] || DEFAULT_GROK_VIDEO_SECONDS);
    else if (item === "--size") args.size = argv[++index] || DEFAULT_GROK_VIDEO_SIZE;
    else if (item === "--quality") args.quality = argv[++index] || DEFAULT_GROK_VIDEO_QUALITY;
    else if (item === "-h" || item === "--help") {
      printHelp();
      process.exit(0);
    } else if (!args.mode) {
      args.mode = item;
    } else {
      args.brief.push(item);
    }
    return index;
  };
  for (let i = 0; i < argv.length; i += 1) i = consumeFlag(argv[i], i);
  if (!args.mode) throw new GrokAugmentError("mode is required");
  return args;
}

function printHelp(): void {
  console.log(`usage: grok_augment.ts [--json] [--effort LEVEL] [--print-prompt] <mode> [brief ...]

Modes: inspect, research, critic, creative, video, diverge, video-generate`);
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const args = parseArgs(argv);
    if (args.mode === "video-generate") {
      const brief = args.brief.join(" ").trim() || readFileSync(0, "utf8").trim();
      const outDir = args.outDir || path.join(tmpdir(), `grok-augment-video-${process.pid}-${Date.now()}`);
      const result = await buildVideoClient(args).generate(brief, {
        outDir,
        model: args.model,
        seconds: args.seconds,
        size: args.size,
        quality: args.quality,
      });
      emitResult(result, args.json);
      return 0;
    }

    const cli = buildCli();
    if (args.mode === "inspect") {
      emitResult(cli.inspect(), args.json);
      return 0;
    }

    const brief = args.brief.join(" ").trim() || readFileSync(0, "utf8").trim();
    const prompt = buildPrompt(args.mode, brief);
    if (args.printPrompt) {
      emitResult({ provider: "grok-cli", mode: args.mode, prompt }, args.json);
      return 0;
    }

    const response = cli.singleTurn(prompt, { effort: args.effort });
    emitResult({ provider: "grok-cli", mode: args.mode, response }, args.json);
    return 0;
  } catch (error) {
    if (error instanceof GrokAugmentError || error instanceof SyntaxError) {
      console.error(`grok-augment: ${error.message}`);
      return 1;
    }
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
