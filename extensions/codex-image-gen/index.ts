/**
 * Pi extension for OpenAI Codex image generation.
 *
 * Registers `codex_generate_image`, a tool that reuses Pi's existing
 * `openai-codex` OAuth login and calls the Codex Responses backend with the
 * native `image_generation` tool. The backend routes image generation to
 * gpt-image-2.
 */

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, extname, isAbsolute, join, resolve } from "node:path";

export const PROVIDER = "openai-codex";
export const DEFAULT_MODEL = "gpt-5.5";
export const DEFAULT_SAVE_MODE = "global";
export const CODEX_RESPONSES_URL =
	"https://chatgpt.com/backend-api/codex/responses";
export const OPENAI_BETA_HEADER = "responses=experimental";
export const JWT_CLAIM_PATH = "https://api.openai.com/auth";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;

const SAVE_MODES = ["none", "project", "global", "custom"] as const;
const OUTPUT_FORMATS = ["png", "jpeg", "webp"] as const;
const QUALITIES = ["low", "medium", "high", "auto"] as const;
const ACTIONS = ["auto", "generate", "edit"] as const;

type SaveMode = (typeof SAVE_MODES)[number];
type OutputFormat = (typeof OUTPUT_FORMATS)[number];
type Quality = (typeof QUALITIES)[number];
type ImageAction = (typeof ACTIONS)[number];

type ToolContent =
	| { type: "text"; text: string }
	| { type: "image"; data: string; mimeType: string };

type ToolUpdate = {
	content: ToolContent[];
	details?: Record<string, unknown>;
};

type ToolResult = ToolUpdate;

type PiToolContext = {
	cwd: string;
	modelRegistry: {
		find(provider: string, model: string): { id: string } | undefined;
		getApiKeyForProvider(provider: string): Promise<string | undefined>;
	};
	sessionManager?: { getSessionId?: () => string };
	sessionId?: string;
};

type PiExtensionAPI = {
	registerTool(definition: {
		name: string;
		label: string;
		description: string;
		promptSnippet?: string;
		promptGuidelines?: string[];
		parameters: typeof TOOL_PARAMETERS;
		execute(
			toolCallId: string,
			params: ToolParams,
			signal: AbortSignal | undefined,
			onUpdate: ((update: ToolUpdate) => void) | undefined,
			ctx: PiToolContext,
		): Promise<ToolResult>;
	}): void;
};

export interface ToolParams {
	prompt: string;
	model?: string;
	outputFormat?: OutputFormat;
	quality?: Quality;
	size?: string;
	action?: ImageAction;
	inputImages?: string[];
	save?: SaveMode;
	saveDir?: string;
}

export interface ExtensionConfig {
	save?: SaveMode;
	saveDir?: string;
	model?: string;
	quality?: Quality;
	size?: string;
}

export interface SaveConfig {
	mode: SaveMode;
	outputDir?: string;
}

export interface GeneratedImage {
	id: string;
	status: string;
	result: string;
	revisedPrompt?: string;
}

export interface ParsedCodexResponse {
	image?: GeneratedImage;
	text: string[];
	responseId?: string;
	usage?: unknown;
}

type CodexSseEvent =
	| { type: "error"; message?: string; code?: string }
	| { type: "response.failed"; response?: { error?: { message?: string } } }
	| { type: "response.created"; response?: { id?: string } }
	| { type: "response.output_text.delta"; delta?: string }
	| {
			type: "response.output_item.done";
			item?: {
				type?: string;
				id?: string | number;
				status?: string;
				result?: string;
				revised_prompt?: string;
			};
	  }
	| { type: "response.completed"; response?: { id?: string; usage?: unknown } };

const TOOL_PARAMETERS = {
	type: "object",
	additionalProperties: false,
	required: ["prompt"],
	properties: {
		prompt: {
			type: "string",
			description:
				"Image generation prompt. Include subject, composition, style, text, and constraints.",
		},
		model: {
			type: "string",
			description: `Codex routing model. Defaults to ${DEFAULT_MODEL}; image generation itself is handled by gpt-image-2 on the backend.`,
		},
		outputFormat: {
			type: "string",
			enum: OUTPUT_FORMATS,
			description: "Output file format. Defaults to png.",
		},
		quality: {
			type: "string",
			enum: QUALITIES,
			description: "gpt-image-2 quality. Defaults to auto unless configured.",
		},
		size: {
			type: "string",
			description:
				"Image size such as auto, 1024x1024, 1536x1024, or 1024x1536.",
		},
		action: {
			type: "string",
			enum: ACTIONS,
			description:
				"Use generate for new images, edit when input images are provided, or auto to let Codex decide.",
		},
		inputImages: {
			type: "array",
			items: { type: "string" },
			description:
				"Optional local image paths to include as references/edit inputs. Relative paths resolve under the current workspace.",
		},
		save: {
			type: "string",
			enum: SAVE_MODES,
			description:
				"Save mode: none, project, global, or custom. Defaults to global.",
		},
		saveDir: {
			type: "string",
			description:
				"Directory to save under when save=custom. Relative paths resolve under the current workspace.",
		},
	},
} as const;

export function getPiAgentDir(): string {
	return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

export function readConfigFile(path: string): ExtensionConfig {
	try {
		return JSON.parse(readFileSync(path, "utf8")) ?? {};
	} catch {
		return {};
	}
}

export function loadConfig(cwd: string): ExtensionConfig {
	const globalConfig = readConfigFile(
		join(getPiAgentDir(), "extensions", "codex-image-gen.json"),
	);
	const projectConfig = readConfigFile(
		join(cwd, ".pi", "extensions", "codex-image-gen.json"),
	);
	return { ...globalConfig, ...projectConfig };
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
	const parts = token.split(".");
	if (parts.length !== 3 || !parts[1]) {
		throw new Error(
			"OpenAI Codex auth token is not a JWT. Run /login for openai-codex again.",
		);
	}
	try {
		return JSON.parse(
			Buffer.from(parts[1], "base64url").toString("utf8"),
		) as Record<string, unknown>;
	} catch (error) {
		throw new Error(
			`Failed to decode OpenAI Codex auth token: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export function extractChatGptAccountId(token: string): string {
	const payload = decodeJwtPayload(token);
	const authClaims = payload[JWT_CLAIM_PATH];
	if (!authClaims || typeof authClaims !== "object") {
		throw new Error(
			"OpenAI Codex auth token does not contain ChatGPT auth claims. Run /login for openai-codex again.",
		);
	}
	const accountId = (authClaims as Record<string, unknown>).chatgpt_account_id;
	if (typeof accountId !== "string" || accountId.length === 0) {
		throw new Error(
			"OpenAI Codex auth token does not contain chatgpt_account_id. Run /login for openai-codex again.",
		);
	}
	return accountId;
}

function envSaveMode(): SaveMode | undefined {
	const value = process.env.PI_CODEX_IMAGE_SAVE_MODE?.toLowerCase();
	return SAVE_MODES.includes(value as SaveMode)
		? (value as SaveMode)
		: undefined;
}

export function resolveUnderCwd(cwd: string, filePath: string): string {
	const normalized = filePath.startsWith("@") ? filePath.slice(1) : filePath;
	return isAbsolute(normalized) ? normalized : resolve(cwd, normalized);
}

export function sanitizePathPart(value: string, fallback: string): string {
	const sanitized = value
		.split("")
		.map((ch) => (/[a-zA-Z0-9_-]/.test(ch) ? ch : "_"))
		.join("")
		.replace(/^_+|_+$/g, "")
		.slice(0, 120);
	return sanitized || fallback;
}

export function resolveSaveConfig(
	params: ToolParams,
	cwd: string,
	sessionId: string,
	config: ExtensionConfig,
): SaveConfig {
	const mode = params.save || envSaveMode() || config.save || DEFAULT_SAVE_MODE;
	const safeSessionId = sanitizePathPart(sessionId, "session");
	if (!SAVE_MODES.includes(mode)) {
		throw new Error(
			`Invalid save mode: ${mode}. Expected one of ${SAVE_MODES.join(", ")}.`,
		);
	}
	if (mode === "project") {
		return {
			mode,
			outputDir: join(cwd, ".pi", "generated-images", safeSessionId),
		};
	}
	if (mode === "global") {
		return {
			mode,
			outputDir: join(getPiAgentDir(), "generated-images", safeSessionId),
		};
	}
	if (mode === "custom") {
		const configuredDir =
			params.saveDir || process.env.PI_CODEX_IMAGE_SAVE_DIR || config.saveDir;
		if (!configuredDir || !configuredDir.trim()) {
			throw new Error(
				"save=custom requires saveDir or PI_CODEX_IMAGE_SAVE_DIR.",
			);
		}
		return {
			mode,
			outputDir: join(resolveUnderCwd(cwd, configuredDir), safeSessionId),
		};
	}
	return { mode };
}

export function extensionForFormat(outputFormat: OutputFormat): string {
	return outputFormat === "jpeg" ? "jpg" : outputFormat;
}

export function mimeForFormat(outputFormat: OutputFormat): string {
	return outputFormat === "jpeg" ? "image/jpeg" : `image/${outputFormat}`;
}

export function mimeForPath(filePath: string): string {
	const ext = extname(filePath).toLowerCase();
	if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
	if (ext === ".png") return "image/png";
	if (ext === ".webp") return "image/webp";
	if (ext === ".gif") return "image/gif";
	throw new Error(
		`Unsupported input image type for ${filePath}. Use png, jpg, jpeg, webp, or gif.`,
	);
}

export function imagePathToDataUrl(filePath: string): string {
	const data = readFileSync(filePath).toString("base64");
	return `data:${mimeForPath(filePath)};base64,${data}`;
}

export async function saveImage(
	base64Data: string,
	outputFormat: OutputFormat,
	outputDir: string,
	imageCallId: string,
): Promise<string> {
	const filename = `${sanitizePathPart(imageCallId, "image_generation")}.${extensionForFormat(outputFormat)}`;
	const filePath = join(outputDir, filename);
	await mkdir(outputDir, { recursive: true });
	await writeFile(filePath, Buffer.from(base64Data, "base64"));
	return filePath;
}

export function buildRequestBody(
	params: ToolParams,
	model: string,
	outputFormat: OutputFormat,
	sessionId: string,
	config: ExtensionConfig = {},
	cwd: string = process.cwd(),
) {
	const content: Array<Record<string, unknown>> = [
		{ type: "input_text", text: params.prompt },
	];
	for (const inputPath of params.inputImages || []) {
		const absolutePath = resolveUnderCwd(cwd, inputPath);
		content.push({
			type: "input_image",
			image_url: imagePathToDataUrl(absolutePath),
		});
	}

	const imageTool: Record<string, unknown> = {
		type: "image_generation",
		output_format: outputFormat,
	};
	const quality = params.quality || config.quality;
	const size = params.size || config.size;
	const action = params.action;
	if (quality) imageTool.quality = quality;
	if (size) imageTool.size = size;
	if (action) imageTool.action = action;

	return {
		model,
		store: false,
		stream: true,
		prompt_cache_key: sessionId,
		instructions:
			"You are generating bitmap image assets. For this request, call the image_generation tool exactly once. Do not answer with only text unless image generation is unavailable.",
		input: [
			{
				role: "user",
				content,
			},
		],
		tools: [imageTool],
		tool_choice: "auto",
		parallel_tool_calls: false,
		text: { verbosity: "low" },
	};
}

export function parseSseDataLines(chunk: string): string | undefined {
	const data = chunk
		.replace(/\r\n/g, "\n")
		.split("\n")
		.filter((line) => line.startsWith("data:"))
		.map((line) => line.slice(5).trim())
		.join("\n")
		.trim();
	return data && data !== "[DONE]" ? data : undefined;
}

export function handleCodexEvent(
	event: CodexSseEvent,
	parsed: ParsedCodexResponse,
): void {
	if (!event || typeof event !== "object") return;

	switch (event.type) {
		case "error":
			throw new Error(
				`Codex error: ${event.message || event.code || JSON.stringify(event)}`,
			);
		case "response.failed":
			throw new Error(
				event.response?.error?.message || "Codex response failed.",
			);
		case "response.created":
			if (typeof event.response?.id === "string")
				parsed.responseId = event.response.id;
			break;
		case "response.output_text.delta":
			if (typeof event.delta === "string") parsed.text.push(event.delta);
			break;
		case "response.output_item.done": {
			const item = event.item;
			if (item?.type === "image_generation_call") {
				if (typeof item.result !== "string" || item.result.length === 0) {
					throw new Error(
						"Codex image_generation_call did not contain image data.",
					);
				}
				parsed.image = {
					id: String(item.id || "image_generation"),
					status: String(item.status || "completed"),
					result: item.result,
					revisedPrompt:
						typeof item.revised_prompt === "string"
							? item.revised_prompt
							: undefined,
				};
			}
			break;
		}
		case "response.completed":
			if (typeof event.response?.id === "string")
				parsed.responseId = event.response.id;
			if (event.response?.usage) parsed.usage = event.response.usage;
			break;
	}
}

export function parseCodexSseText(text: string): ParsedCodexResponse {
	const parsed: ParsedCodexResponse = { text: [] };
	const chunks = text.replace(/\r\n/g, "\n").split(/\n\n+/);
	for (const chunk of chunks) {
		const data = parseSseDataLines(chunk);
		if (data) handleCodexEvent(JSON.parse(data) as CodexSseEvent, parsed);
	}
	return parsed;
}

export async function parseCodexSse(
	response: Response,
	signal?: AbortSignal,
): Promise<ParsedCodexResponse> {
	if (!response.body)
		throw new Error("Codex response did not include a stream body.");
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	const parsed: ParsedCodexResponse = { text: [] };

	try {
		while (true) {
			if (signal?.aborted) throw new Error("Image generation was aborted.");
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

			let separator = buffer.indexOf("\n\n");
			while (separator !== -1) {
				const chunk = buffer.slice(0, separator);
				buffer = buffer.slice(separator + 2);
				const data = parseSseDataLines(chunk);
				if (data) handleCodexEvent(JSON.parse(data) as CodexSseEvent, parsed);
				separator = buffer.indexOf("\n\n");
			}
		}
		const remaining = parseSseDataLines(buffer);
		if (remaining)
			handleCodexEvent(JSON.parse(remaining) as CodexSseEvent, parsed);
	} finally {
		try {
			await reader.cancel();
		} catch {
			// Stream may already be closed.
		}
		reader.releaseLock();
	}

	return parsed;
}

function isRetryableStatus(status: number, errorText: string): boolean {
	if ([429, 500, 502, 503, 504].includes(status)) return true;
	return /rate.?limit|overloaded|service.?unavailable|upstream.?connect|connection.?refused/i.test(
		errorText,
	);
}

function backoffMs(attempt: number): number {
	const jitter = 0.9 + Math.random() * 0.2;
	return BASE_DELAY_MS * 2 ** (attempt - 1) * jitter;
}

async function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) throw new Error("Image generation was aborted.");
	await new Promise<void>((resolve, reject) => {
		let abort: (() => void) | undefined;
		const timeout = setTimeout(() => {
			if (abort) signal?.removeEventListener("abort", abort);
			resolve();
		}, ms);
		if (!signal) return;
		abort = () => {
			clearTimeout(timeout);
			reject(new Error("Image generation was aborted."));
		};
		signal.addEventListener("abort", abort, { once: true });
	});
}

export async function requestImage(
	params: ToolParams,
	token: string,
	accountId: string,
	model: string,
	outputFormat: OutputFormat,
	sessionId: string,
	config: ExtensionConfig,
	cwd: string,
	signal?: AbortSignal,
	fetchFn: typeof fetch = fetch,
): Promise<ParsedCodexResponse> {
	const body = JSON.stringify(
		buildRequestBody(params, model, outputFormat, sessionId, config, cwd),
	);
	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
		"chatgpt-account-id": accountId,
		originator: "pi",
		"OpenAI-Beta": OPENAI_BETA_HEADER,
		accept: "text/event-stream",
		"content-type": "application/json",
	};

	for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
		if (signal?.aborted) throw new Error("Image generation was aborted.");
		const response = await fetchFn(CODEX_RESPONSES_URL, {
			method: "POST",
			headers,
			body,
			signal,
		});

		if (!response.ok) {
			const errorText = await response.text();
			if (
				attempt <= MAX_RETRIES &&
				isRetryableStatus(response.status, errorText)
			) {
				await abortableSleep(backoffMs(attempt), signal);
				continue;
			}
			throw new Error(
				`Codex image generation request failed (${response.status}): ${errorText}`,
			);
		}

		return parseCodexSse(response, signal);
	}

	throw new Error("Codex image generation request failed after all retries.");
}

function isOutputFormat(value: string | undefined): value is OutputFormat {
	return OUTPUT_FORMATS.includes(value as OutputFormat);
}

function getSessionId(ctx: {
	sessionManager?: { getSessionId?: () => string };
	sessionId?: string;
}): string {
	return (
		ctx.sessionManager?.getSessionId?.() ||
		ctx.sessionId ||
		`session-${Date.now()}`
	);
}

export default function codexImageGen(pi: PiExtensionAPI) {
	pi.registerTool({
		name: "codex_generate_image",
		label: "Codex Image",
		description:
			"Generate an image with the OpenAI Codex ChatGPT backend image_generation tool (gpt-image-2). Uses the existing openai-codex login; does not require OPENAI_API_KEY.",
		promptSnippet:
			"Generate bitmap images via OpenAI Codex's gpt-image-2 image_generation backend.",
		promptGuidelines: [
			"Use codex_generate_image when the user asks to generate a raster image, illustration, photo, sprite, icon draft, banner, or other bitmap asset with OpenAI/Codex image generation.",
			"Do not use codex_generate_image without a clear image-generation request, because it consumes the user's Codex image quota.",
			"For transparent backgrounds, codex_generate_image should generate a flat chroma-key background first; use local post-processing for alpha instead of claiming native gpt-image-2 transparency.",
		],
		parameters: TOOL_PARAMETERS,
		async execute(
			toolCallId: string,
			params: ToolParams,
			signal: AbortSignal | undefined,
			onUpdate: ((update: ToolUpdate) => void) | undefined,
			ctx: PiToolContext,
		) {
			const outputFormat = isOutputFormat(params.outputFormat)
				? params.outputFormat
				: "png";
			const config = loadConfig(ctx.cwd);
			const requestedModel = params.model || config.model || DEFAULT_MODEL;
			const model =
				ctx.modelRegistry.find(PROVIDER, requestedModel)?.id || requestedModel;
			const token = await ctx.modelRegistry.getApiKeyForProvider(PROVIDER);
			if (!token) {
				throw new Error(
					`Missing ${PROVIDER} credentials. Run /login and select ChatGPT Plus/Pro (Codex).`,
				);
			}
			const accountId = extractChatGptAccountId(token);
			const sessionId = getSessionId(ctx);

			onUpdate?.({
				content: [
					{
						type: "text",
						text: `Requesting gpt-image-2 generation through ${PROVIDER}/${model}...`,
					},
				],
				details: { provider: PROVIDER, model, outputFormat },
			});

			const parsed = await requestImage(
				params,
				token,
				accountId,
				model,
				outputFormat,
				sessionId,
				config,
				ctx.cwd,
				signal,
			);
			if (!parsed.image) {
				const text = parsed.text.join("").trim();
				throw new Error(
					text
						? `Codex did not return an image. Response text: ${text}`
						: "Codex did not return an image.",
				);
			}

			const saveConfig = resolveSaveConfig(params, ctx.cwd, sessionId, config);
			let savedPath: string | undefined;
			if (saveConfig.mode !== "none" && saveConfig.outputDir) {
				savedPath = await saveImage(
					parsed.image.result,
					outputFormat,
					saveConfig.outputDir,
					parsed.image.id || toolCallId,
				);
				onUpdate?.({
					content: [{ type: "text", text: `Image saved to ${savedPath}.` }],
					details: {
						provider: PROVIDER,
						model,
						savedPath,
						byteCount: Buffer.byteLength(parsed.image.result, "base64"),
					},
				});
			}

			const summary = [
				`Generated image via ${PROVIDER}/${model} using backend gpt-image-2.`,
				`Status: ${parsed.image.status}.`,
				parsed.image.revisedPrompt
					? `Revised prompt: ${parsed.image.revisedPrompt}`
					: undefined,
				savedPath
					? `Saved image to: ${savedPath}`
					: "Image was not saved to disk.",
			]
				.filter(Boolean)
				.join(" ");

			return {
				content: [
					{ type: "text", text: summary },
					{
						type: "image",
						data: parsed.image.result,
						mimeType: mimeForFormat(outputFormat),
					},
				],
				details: {
					provider: PROVIDER,
					model,
					backendImageModel: "gpt-image-2",
					outputFormat,
					saveMode: saveConfig.mode,
					savedPath,
					responseId: parsed.responseId,
					imageGenerationId: parsed.image.id,
					revisedPrompt: parsed.image.revisedPrompt,
					usage: parsed.usage,
				},
			};
		},
	});
}

// Kept for quick manual testing without installing the package.
export async function saveSmokeImageForManualTest(
	base64Data: string,
): Promise<string> {
	const outDir = join(tmpdir(), "pi-codex-image-gen-manual");
	return saveImage(base64Data, "png", outDir, basename(`manual-${Date.now()}`));
}
