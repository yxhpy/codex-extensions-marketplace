/**
 * Pi extension for xAI/Grok X Search and video generation.
 *
 * This extension is intentionally standalone: it does not shell out to, import,
 * or read credentials from any other agent harness. Authentication is resolved
 * from XAI_API_KEY/PI_XAI_API_KEY, optional extension config, or this
 * extension's own xAI OAuth PKCE token store under Pi's agent directory.
 */

import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

export const DEFAULT_BASE_URL = "https://api.x.ai/v1";
export const DEFAULT_SEARCH_MODEL = "grok-4.3";
export const DEFAULT_VIDEO_MODEL = "grok-imagine-video";
export const DEFAULT_VIDEO_DURATION = 8;
export const DEFAULT_VIDEO_ASPECT_RATIO = "16:9";
export const DEFAULT_VIDEO_RESOLUTION = "720p";
export const DEFAULT_AUTH_HOST = "127.0.0.1";
export const DEFAULT_AUTH_PORT = 56121;
export const DEFAULT_AUTH_PATH = "/callback";
export const OAUTH_ISSUER = "https://auth.x.ai";
export const OAUTH_DISCOVERY_URL = `${OAUTH_ISSUER}/.well-known/openid-configuration`;
export const DEFAULT_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
export const DEFAULT_SCOPE = "openid profile email offline_access grok-cli:access api:access";
export const TOKEN_REFRESH_SKEW_MS = 120_000;
export const MAX_X_HANDLES = 20;
export const DEFAULT_VIDEO_TIMEOUT_MS = 10 * 60_000;
export const DEFAULT_VIDEO_POLL_INTERVAL_MS = 5_000;
export const MIN_VIDEO_BYTES = 10_000;

const VIDEO_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"] as const;
const VIDEO_RESOLUTIONS = ["480p", "720p", "1080p"] as const;

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
export type AuthKind = "api-key" | "oauth" | "bearer";

type TextContent = { type: "text"; text: string };
type ToolUpdate = (update: { content: TextContent[]; details?: unknown }) => void;
type CommandContext = {
	cwd?: string;
	ui: { notify: (message: string, level?: "info" | "warning" | "error") => void };
};
type ToolContext = {
	cwd: string;
	sessionId?: string;
	sessionManager?: { getSessionId?: () => string };
};

type ExtensionAPI = {
	registerCommand: (
		name: string,
		definition: {
			description: string;
			handler: (args: string, ctx: CommandContext) => unknown | Promise<unknown>;
		},
	) => void;
	registerTool: (definition: {
		name: string;
		label: string;
		description: string;
		promptSnippet?: string;
		promptGuidelines?: string[];
		parameters: unknown;
		execute: (
			toolCallId: string,
			params: any,
			signal: AbortSignal | undefined,
			onUpdate: ToolUpdate | undefined,
			ctx: ToolContext,
		) => unknown | Promise<unknown>;
	}) => void;
};

export interface ExtensionConfig {
	apiKey?: string;
	accessToken?: string;
	refreshToken?: string;
	expiresAt?: number;
	baseUrl?: string;
	searchModel?: string;
	videoModel?: string;
	videoOutputDir?: string;
	oauth?: {
		clientId?: string;
		scope?: string;
		callbackHost?: string;
		callbackPort?: number;
	};
}

export interface StoredOAuthCredentials {
	accessToken: string;
	refreshToken?: string;
	expiresAt?: number;
	tokenEndpoint?: string;
	authorizationEndpoint?: string;
	baseUrl?: string;
	tokenType?: string;
	idToken?: string;
}

export interface ResolvedAuth {
	kind: AuthKind;
	token: string;
	baseUrl: string;
	refreshed?: boolean;
}

export interface XSearchParams {
	query: string;
	model?: string;
	allowed_x_handles?: string[];
	excluded_x_handles?: string[];
	from_date?: string;
	to_date?: string;
	enable_image_understanding?: boolean;
	enable_video_understanding?: boolean;
	baseUrl?: string;
}

export interface XSearchResult {
	answer: string;
	citations: Array<{ url: string; title?: string }>;
	raw?: unknown;
}

export interface VideoGenerateParams {
	prompt: string;
	model?: string;
	duration?: number;
	aspect_ratio?: string;
	resolution?: string;
	outputDir?: string;
	filename?: string;
	download?: boolean;
	pollIntervalMs?: number;
	timeoutMs?: number;
	baseUrl?: string;
	user?: string;
}

export interface VideoGenerationResult {
	requestId: string;
	status: string;
	url?: string;
	duration?: number;
	model?: string;
	file?: string;
	bytes?: number;
	polls: number;
	raw?: unknown;
}

export interface OAuthDiscovery {
	authorization_endpoint: string;
	token_endpoint: string;
}

interface CallbackResult {
	code?: string;
	state?: string;
	error?: string;
	errorDescription?: string;
}

const XAI_X_SEARCH_PARAMETERS = {
	type: "object",
	additionalProperties: false,
	required: ["query"],
	properties: {
		query: {
			type: "string",
			description: "Question or search goal for X/Twitter posts, users, or threads.",
		},
		model: {
			type: "string",
			description: `xAI model used for the search synthesis. Defaults to ${DEFAULT_SEARCH_MODEL}.`,
		},
		allowed_x_handles: {
			type: "array",
			items: { type: "string" },
			description: "Only consider posts from these X handles, without @, max 20.",
		},
		excluded_x_handles: {
			type: "array",
			items: { type: "string" },
			description: "Exclude posts from these X handles, without @, max 20.",
		},
		from_date: {
			type: "string",
			description: "Optional start date, ISO8601 format such as 2026-06-01.",
		},
		to_date: {
			type: "string",
			description: "Optional end date, ISO8601 format such as 2026-06-01.",
		},
		enable_image_understanding: {
			type: "boolean",
			description: "Let xAI analyze images in X posts encountered during search.",
		},
		enable_video_understanding: {
			type: "boolean",
			description: "Let xAI analyze videos in X posts encountered during search.",
		},
		baseUrl: {
			type: "string",
			description: "Optional xAI-compatible base URL. Defaults to https://api.x.ai/v1.",
		},
	},
} as const;

const XAI_VIDEO_PARAMETERS = {
	type: "object",
	additionalProperties: false,
	required: ["prompt"],
	properties: {
		prompt: {
			type: "string",
			description: "Text-to-video prompt for Grok Imagine video generation.",
		},
		model: {
			type: "string",
			description: `Video model. Defaults to ${DEFAULT_VIDEO_MODEL}.`,
		},
		duration: {
			type: "integer",
			description: "Video length in seconds, 1 to 15. Defaults to 8.",
		},
		aspect_ratio: {
			type: "string",
			enum: VIDEO_ASPECT_RATIOS,
			description: "Output aspect ratio. Defaults to 16:9.",
		},
		resolution: {
			type: "string",
			enum: VIDEO_RESOLUTIONS,
			description: "Output resolution. Defaults to 720p. Request 1080p only when your xAI team supports it.",
		},
		outputDir: {
			type: "string",
			description: "Directory to save the MP4. Relative paths resolve under the current workspace.",
		},
		filename: {
			type: "string",
			description: "Optional MP4 filename. Defaults to the xAI request id.",
		},
		download: {
			type: "boolean",
			description: "Download the completed MP4 to disk. Defaults to true.",
		},
		pollIntervalMs: {
			type: "integer",
			description: "Polling interval in milliseconds. Defaults to 5000.",
		},
		timeoutMs: {
			type: "integer",
			description: "Overall generation timeout in milliseconds. Defaults to 10 minutes.",
		},
		baseUrl: {
			type: "string",
			description: "Optional xAI-compatible base URL. Defaults to https://api.x.ai/v1.",
		},
		user: {
			type: "string",
			description: "Optional end-user identifier forwarded to xAI.",
		},
	},
} as const;

export function getPiAgentDir(): string {
	return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

export function getGlobalConfigPath(): string {
	return join(getPiAgentDir(), "extensions", "xai-grok.json");
}

export function getAuthFilePath(): string {
	return join(getPiAgentDir(), "extensions", "xai-grok-auth.json");
}

export function readJsonFile<T extends object>(filePath: string): Partial<T> {
	try {
		return JSON.parse(readFileSync(filePath, "utf8")) as Partial<T>;
	} catch {
		return {};
	}
}

export function loadConfig(cwd: string): ExtensionConfig {
	const globalConfig = readJsonFile<ExtensionConfig>(getGlobalConfigPath());
	const projectConfig = readJsonFile<ExtensionConfig>(join(cwd, ".pi", "extensions", "xai-grok.json"));
	return { ...globalConfig, ...projectConfig, oauth: { ...globalConfig.oauth, ...projectConfig.oauth } };
}

export function loadStoredOAuth(): StoredOAuthCredentials | undefined {
	const stored = readJsonFile<StoredOAuthCredentials>(getAuthFilePath());
	return typeof stored.accessToken === "string" && stored.accessToken ? (stored as StoredOAuthCredentials) : undefined;
}

export async function saveStoredOAuth(credentials: StoredOAuthCredentials): Promise<void> {
	const filePath = getAuthFilePath();
	await mkdir(join(filePath, ".."), { recursive: true });
	await writeFile(filePath, `${JSON.stringify(credentials, null, 2)}\n`, "utf8");
}

export async function clearStoredOAuth(): Promise<void> {
	await rm(getAuthFilePath(), { force: true });
}

export function normalizedBaseUrl(baseUrl?: string): string {
	return (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export function authHeader(auth: ResolvedAuth): Record<string, string> {
	return { Authorization: `Bearer ${auth.token}` };
}

export function resolveUnderCwd(cwd: string, filePath: string): string {
	return isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
}

export function sanitizePathPart(value: string, fallback: string): string {
	const sanitized = value
		.split("")
		.map((ch) => (/[a-zA-Z0-9_.-]/.test(ch) ? ch : "_"))
		.join("")
		.replace(/^_+|_+$/g, "")
		.slice(0, 120);
	return sanitized || fallback;
}

function assertNonBlank(value: string | undefined, field: string): string {
	const trimmed = (value || "").trim();
	if (!trimmed) throw new Error(`${field} must not be blank.`);
	return trimmed;
}

function validateHandleList(values: string[] | undefined, field: string): string[] | undefined {
	if (!values?.length) return undefined;
	if (values.length > MAX_X_HANDLES) throw new Error(`${field} supports at most ${MAX_X_HANDLES} handles.`);
	return values.map((value) => value.replace(/^@/, "").trim()).filter(Boolean);
}

export function buildXSearchRequest(params: XSearchParams, config: ExtensionConfig = {}) {
	const query = assertNonBlank(params.query, "query");
	const allowedHandles = validateHandleList(params.allowed_x_handles, "allowed_x_handles");
	const excludedHandles = validateHandleList(params.excluded_x_handles, "excluded_x_handles");
	if (allowedHandles?.length && excludedHandles?.length) {
		throw new Error("allowed_x_handles and excluded_x_handles are mutually exclusive.");
	}

	const xSearchTool: Record<string, unknown> = { type: "x_search" };
	if (allowedHandles?.length) xSearchTool.allowed_x_handles = allowedHandles;
	if (excludedHandles?.length) xSearchTool.excluded_x_handles = excludedHandles;
	if (params.from_date) xSearchTool.from_date = params.from_date;
	if (params.to_date) xSearchTool.to_date = params.to_date;
	if (params.enable_image_understanding) xSearchTool.enable_image_understanding = true;
	if (params.enable_video_understanding) xSearchTool.enable_video_understanding = true;

	return {
		model: params.model || config.searchModel || DEFAULT_SEARCH_MODEL,
		store: false,
		input: [
			{
				role: "user",
				content: query,
			},
		],
		tools: [xSearchTool],
	};
}

function collectText(value: unknown, out: string[]): void {
	if (!value) return;
	if (typeof value === "string") return;
	if (Array.isArray(value)) {
		for (const item of value) collectText(item, out);
		return;
	}
	if (typeof value !== "object") return;
	const record = value as Record<string, unknown>;
	if ((record.type === "output_text" || record.type === "text") && typeof record.text === "string") out.push(record.text);
	if (typeof record.output_text === "string") out.push(record.output_text);
	if (typeof record.content === "string") out.push(record.content);
	collectText(record.content, out);
	collectText(record.output, out);
}

export function extractResponseText(data: unknown): string {
	if (!data || typeof data !== "object") return "";
	const record = data as Record<string, unknown>;
	if (typeof record.output_text === "string") return record.output_text;
	const parts: string[] = [];
	collectText(record.output, parts);
	collectText(record.content, parts);
	return parts.join("\n").trim();
}

function pushCitation(citations: Array<{ url: string; title?: string }>, value: unknown): void {
	if (!value || typeof value !== "object") return;
	const record = value as Record<string, unknown>;
	const url = typeof record.url === "string" ? record.url : typeof record.uri === "string" ? record.uri : undefined;
	if (!url) return;
	const title = typeof record.title === "string" ? record.title : undefined;
	if (!citations.some((citation) => citation.url === url)) citations.push({ url, title });
}

function collectCitations(value: unknown, citations: Array<{ url: string; title?: string }>): void {
	if (!value) return;
	if (Array.isArray(value)) {
		for (const item of value) collectCitations(item, citations);
		return;
	}
	if (typeof value !== "object") return;
	const record = value as Record<string, unknown>;
	if (Array.isArray(record.citations)) collectCitations(record.citations, citations);
	if (Array.isArray(record.annotations)) collectCitations(record.annotations, citations);
	if (record.type === "url_citation") pushCitation(citations, record);
	if (record.url) pushCitation(citations, record);
	collectCitations(record.content, citations);
	collectCitations(record.output, citations);
}

export function extractCitations(data: unknown): Array<{ url: string; title?: string }> {
	const citations: Array<{ url: string; title?: string }> = [];
	collectCitations(data, citations);
	return citations;
}

export async function callXSearch(
	params: XSearchParams,
	auth: ResolvedAuth,
	config: ExtensionConfig = {},
	fetchFn: FetchLike = fetch,
	signal?: AbortSignal,
): Promise<XSearchResult> {
	const baseUrl = normalizedBaseUrl(params.baseUrl || auth.baseUrl || config.baseUrl);
	const response = await fetchFn(`${baseUrl}/responses`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...authHeader(auth),
		},
		body: JSON.stringify(buildXSearchRequest(params, config)),
		signal,
	});
	if (!response.ok) throw new Error(`xAI x_search failed (${response.status}): ${await response.text()}`);
	const data = await response.json();
	return {
		answer: extractResponseText(data) || "(no x_search answer text returned)",
		citations: extractCitations(data),
		raw: data,
	};
}

export function buildVideoGenerationRequest(params: VideoGenerateParams, config: ExtensionConfig = {}) {
	const prompt = assertNonBlank(params.prompt, "prompt");
	const duration = params.duration ?? DEFAULT_VIDEO_DURATION;
	if (!Number.isInteger(duration) || duration < 1 || duration > 15) throw new Error("duration must be an integer from 1 to 15.");
	const aspectRatio = params.aspect_ratio || DEFAULT_VIDEO_ASPECT_RATIO;
	if (!VIDEO_ASPECT_RATIOS.includes(aspectRatio as (typeof VIDEO_ASPECT_RATIOS)[number])) {
		throw new Error(`aspect_ratio must be one of ${VIDEO_ASPECT_RATIOS.join(", ")}.`);
	}
	const resolution = params.resolution || DEFAULT_VIDEO_RESOLUTION;
	if (!VIDEO_RESOLUTIONS.includes(resolution as (typeof VIDEO_RESOLUTIONS)[number])) {
		throw new Error(`resolution must be one of ${VIDEO_RESOLUTIONS.join(", ")}.`);
	}
	return {
		model: params.model || config.videoModel || DEFAULT_VIDEO_MODEL,
		prompt,
		duration,
		aspect_ratio: aspectRatio,
		resolution,
		...(params.user ? { user: params.user } : {}),
	};
}

export async function startVideoGeneration(
	params: VideoGenerateParams,
	auth: ResolvedAuth,
	config: ExtensionConfig = {},
	fetchFn: FetchLike = fetch,
	signal?: AbortSignal,
): Promise<string> {
	const baseUrl = normalizedBaseUrl(params.baseUrl || auth.baseUrl || config.baseUrl);
	const response = await fetchFn(`${baseUrl}/videos/generations`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...authHeader(auth),
		},
		body: JSON.stringify(buildVideoGenerationRequest(params, config)),
		signal,
	});
	if (!response.ok) throw new Error(`xAI video generation failed (${response.status}): ${await response.text()}`);
	const data = (await response.json()) as Record<string, unknown>;
	const requestId = String(data.request_id || data.id || "").trim();
	if (!requestId) throw new Error(`xAI video generation response did not include request_id: ${JSON.stringify(data)}`);
	return requestId;
}

export async function pollVideoResult(
	requestId: string,
	auth: ResolvedAuth,
	baseUrl: string,
	{
		pollIntervalMs = DEFAULT_VIDEO_POLL_INTERVAL_MS,
		timeoutMs = DEFAULT_VIDEO_TIMEOUT_MS,
	}: { pollIntervalMs?: number; timeoutMs?: number } = {},
	fetchFn: FetchLike = fetch,
	signal?: AbortSignal,
): Promise<{ data: Record<string, unknown>; polls: number }> {
	const deadline = Date.now() + timeoutMs;
	let polls = 0;
	while (Date.now() <= deadline) {
		if (signal?.aborted) throw new Error("xAI video polling was aborted.");
		polls += 1;
		const response = await fetchFn(`${normalizedBaseUrl(baseUrl)}/videos/${encodeURIComponent(requestId)}`, {
			headers: authHeader(auth),
			signal,
		});
		if (!response.ok) throw new Error(`xAI video poll failed (${response.status}): ${await response.text()}`);
		const data = (await response.json()) as Record<string, unknown>;
		const status = String(data.status || "").toLowerCase();
		if (status === "done" || status === "completed") return { data, polls };
		if (status === "failed" || status === "expired" || status === "cancelled") {
			throw new Error(`xAI video generation ended with status=${status}: ${JSON.stringify(data)}`);
		}
		await sleep(pollIntervalMs, signal);
	}
	throw new Error(`Timed out waiting for xAI video request ${requestId}.`);
}

export function videoUrlFromResult(data: Record<string, unknown>): string | undefined {
	if (typeof data.url === "string") return data.url;
	const video = data.video;
	if (video && typeof video === "object" && typeof (video as Record<string, unknown>).url === "string") {
		return (video as Record<string, string>).url;
	}
	return undefined;
}

function videoDurationFromResult(data: Record<string, unknown>): number | undefined {
	const video = data.video;
	const value = video && typeof video === "object" ? (video as Record<string, unknown>).duration : data.duration;
	return typeof value === "number" ? value : undefined;
}

export async function downloadVideoToFile(
	url: string,
	filePath: string,
	fetchFn: FetchLike = fetch,
	signal?: AbortSignal,
): Promise<number> {
	const response = await fetchFn(url, { signal });
	const body = Buffer.from(await response.arrayBuffer());
	if (!response.ok) throw new Error(`xAI video download failed (${response.status}): ${body.toString("utf8").slice(0, 500)}`);
	if (body.length < MIN_VIDEO_BYTES) throw new Error(`xAI video download was too small (${body.length} bytes).`);
	await mkdir(join(filePath, ".."), { recursive: true });
	await writeFile(filePath, body);
	return body.length;
}

export async function generateVideo(
	params: VideoGenerateParams,
	auth: ResolvedAuth,
	config: ExtensionConfig,
	cwd: string,
	sessionId: string,
	fetchFn: FetchLike = fetch,
	signal?: AbortSignal,
): Promise<VideoGenerationResult> {
	const baseUrl = normalizedBaseUrl(params.baseUrl || auth.baseUrl || config.baseUrl);
	const requestId = await startVideoGeneration(params, auth, config, fetchFn, signal);
	const { data, polls } = await pollVideoResult(
		requestId,
		auth,
		baseUrl,
		{ pollIntervalMs: params.pollIntervalMs, timeoutMs: params.timeoutMs },
		fetchFn,
		signal,
	);
	const status = String(data.status || "done");
	const url = videoUrlFromResult(data);
	const download = params.download !== false;
	let file: string | undefined;
	let bytes: number | undefined;
	if (download) {
		if (!url) throw new Error(`xAI video result did not include a downloadable URL: ${JSON.stringify(data)}`);
		const outputDir = resolveUnderCwd(cwd, params.outputDir || config.videoOutputDir || join(".pi", "generated-videos", sanitizePathPart(sessionId, "session")));
		const filename = sanitizePathPart(params.filename || requestId, requestId).replace(/\.mp4$/i, "") + ".mp4";
		file = join(outputDir, filename);
		bytes = await downloadVideoToFile(url, file, fetchFn, signal);
	}
	return {
		requestId,
		status,
		url,
		duration: videoDurationFromResult(data),
		model: typeof data.model === "string" ? data.model : buildVideoGenerationRequest(params, config).model,
		file,
		bytes,
		polls,
		raw: data,
	};
}

export function validateEndpoint(value: string, field: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`xAI OAuth discovery returned invalid ${field}: ${value}`);
	}
	if (url.protocol !== "https:") throw new Error(`xAI OAuth ${field} must use HTTPS: ${value}`);
	const host = url.hostname.toLowerCase();
	if (host !== "x.ai" && host !== "auth.x.ai" && host !== "accounts.x.ai" && !host.endsWith(".x.ai")) {
		throw new Error(`Refusing non-xAI OAuth ${field}: ${value}`);
	}
	return url.toString();
}

export async function discoverOAuth(fetchFn: FetchLike = fetch): Promise<OAuthDiscovery> {
	const response = await fetchFn(OAUTH_DISCOVERY_URL, { headers: { Accept: "application/json" } });
	if (!response.ok) throw new Error(`xAI OAuth discovery failed (${response.status}): ${await response.text()}`);
	const payload = (await response.json()) as Record<string, unknown>;
	return {
		authorization_endpoint: validateEndpoint(String(payload.authorization_endpoint || ""), "authorization_endpoint"),
		token_endpoint: validateEndpoint(String(payload.token_endpoint || ""), "token_endpoint"),
	};
}

function base64Url(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64url");
}

export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
	const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
	return { verifier, challenge: Buffer.from(digest).toString("base64url") };
}

export function buildAuthorizeUrl({
	authorizationEndpoint,
	clientId = DEFAULT_CLIENT_ID,
	redirectUri,
	scope = DEFAULT_SCOPE,
	challenge,
	state,
	nonce,
}: {
	authorizationEndpoint: string;
	clientId?: string;
	redirectUri: string;
	scope?: string;
	challenge: string;
	state: string;
	nonce: string;
}): string {
	const url = new URL(validateEndpoint(authorizationEndpoint, "authorization_endpoint"));
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", clientId);
	url.searchParams.set("redirect_uri", redirectUri);
	url.searchParams.set("scope", scope);
	url.searchParams.set("code_challenge", challenge);
	url.searchParams.set("code_challenge_method", "S256");
	url.searchParams.set("state", state);
	url.searchParams.set("nonce", nonce);
	url.searchParams.set("plan", "generic");
	url.searchParams.set("referrer", "pi-xai-grok");
	return url.toString();
}

export function buildCodeExchangeBody({
	clientId = DEFAULT_CLIENT_ID,
	code,
	redirectUri,
	verifier,
	challenge,
}: {
	clientId?: string;
	code: string;
	redirectUri: string;
	verifier: string;
	challenge: string;
}): URLSearchParams {
	return new URLSearchParams({
		grant_type: "authorization_code",
		client_id: clientId,
		code,
		redirect_uri: redirectUri,
		code_verifier: verifier,
		code_challenge: challenge,
		code_challenge_method: "S256",
	});
}

export function buildRefreshBody(refreshToken: string, clientId = DEFAULT_CLIENT_ID): URLSearchParams {
	return new URLSearchParams({
		grant_type: "refresh_token",
		client_id: clientId,
		refresh_token: refreshToken,
	});
}

export async function exchangeCodeForToken(
	args: {
		tokenEndpoint: string;
		code: string;
		redirectUri: string;
		verifier: string;
		challenge: string;
		clientId?: string;
		baseUrl?: string;
	},
	fetchFn: FetchLike = fetch,
): Promise<StoredOAuthCredentials> {
	const tokenEndpoint = validateEndpoint(args.tokenEndpoint, "token_endpoint");
	const response = await fetchFn(tokenEndpoint, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
		body: buildCodeExchangeBody(args).toString(),
	});
	if (!response.ok) throw new Error(`xAI token exchange failed (${response.status}): ${await response.text()}`);
	const payload = (await response.json()) as Record<string, unknown>;
	return tokenPayloadToCredentials(payload, tokenEndpoint, args.baseUrl);
}

export async function refreshOAuthToken(
	credentials: StoredOAuthCredentials,
	fetchFn: FetchLike = fetch,
	clientId = DEFAULT_CLIENT_ID,
): Promise<StoredOAuthCredentials> {
	if (!credentials.refreshToken) throw new Error("Missing xAI refresh token. Run /xai-grok-login again.");
	const tokenEndpoint = validateEndpoint(credentials.tokenEndpoint || (await discoverOAuth(fetchFn)).token_endpoint, "token_endpoint");
	const response = await fetchFn(tokenEndpoint, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
		body: buildRefreshBody(credentials.refreshToken, clientId).toString(),
	});
	if (!response.ok) throw new Error(`xAI token refresh failed (${response.status}): ${await response.text()}`);
	const payload = (await response.json()) as Record<string, unknown>;
	return { ...credentials, ...tokenPayloadToCredentials(payload, tokenEndpoint, credentials.baseUrl), tokenEndpoint };
}

export function tokenPayloadToCredentials(payload: Record<string, unknown>, tokenEndpoint: string, baseUrl?: string): StoredOAuthCredentials {
	const accessToken = String(payload.access_token || "");
	if (!accessToken) throw new Error("xAI token response did not include access_token.");
	const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token : undefined;
	const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : Number(payload.expires_in || 3600);
	return {
		accessToken,
		refreshToken,
		expiresAt: Date.now() + expiresIn * 1000 - TOKEN_REFRESH_SKEW_MS,
		tokenEndpoint,
		tokenType: typeof payload.token_type === "string" ? payload.token_type : "Bearer",
		idToken: typeof payload.id_token === "string" ? payload.id_token : undefined,
		baseUrl: baseUrl || DEFAULT_BASE_URL,
	};
}

export async function resolveAuth(cwd: string, fetchFn: FetchLike = fetch): Promise<ResolvedAuth> {
	const config = loadConfig(cwd);
	const baseUrl = normalizedBaseUrl(process.env.PI_XAI_BASE_URL || process.env.XAI_BASE_URL || config.baseUrl);
	const apiKey = process.env.XAI_API_KEY || process.env.PI_XAI_API_KEY || config.apiKey;
	if (apiKey) return { kind: "api-key", token: apiKey, baseUrl };
	const rawToken = process.env.XAI_OAUTH_TOKEN || process.env.PI_XAI_OAUTH_TOKEN || config.accessToken;
	if (rawToken && !config.refreshToken) return { kind: "bearer", token: rawToken, baseUrl };
	let stored = loadStoredOAuth();
	if (!stored && rawToken) {
		stored = {
			accessToken: rawToken,
			refreshToken: config.refreshToken,
			expiresAt: config.expiresAt,
			baseUrl,
		};
	}
	if (!stored) {
		throw new Error("Missing xAI credentials. Set XAI_API_KEY/PI_XAI_API_KEY or run /xai-grok-login to create Pi-owned OAuth credentials.");
	}
	if (stored.expiresAt && stored.expiresAt <= Date.now() + 60_000 && stored.refreshToken) {
		stored = await refreshOAuthToken(stored, fetchFn, config.oauth?.clientId || DEFAULT_CLIENT_ID);
		await saveStoredOAuth(stored);
		return { kind: "oauth", token: stored.accessToken, baseUrl: normalizedBaseUrl(stored.baseUrl || baseUrl), refreshed: true };
	}
	return { kind: "oauth", token: stored.accessToken, baseUrl: normalizedBaseUrl(stored.baseUrl || baseUrl) };
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) throw new Error("Operation was aborted.");
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(resolve, ms);
		if (!signal) return;
		const abort = () => {
			clearTimeout(timeout);
			reject(new Error("Operation was aborted."));
		};
		signal.addEventListener("abort", abort, { once: true });
	});
}

async function startCallbackServer(host: string, preferredPort: number, callbackPath: string): Promise<{
	server: Server;
	redirectUri: string;
	waitForCallback: (timeoutMs: number) => Promise<CallbackResult>;
}> {
	let settle: ((value: CallbackResult) => void) | undefined;
	const callbackPromise = new Promise<CallbackResult>((resolve) => {
		settle = resolve;
	});
	const server = createServer((req, res) => {
		const url = new URL(req.url || "/", `http://${host}`);
		if (url.pathname !== callbackPath) {
			res.statusCode = 404;
			res.end("Not found");
			return;
		}
		const result: CallbackResult = {
			code: url.searchParams.get("code") || undefined,
			state: url.searchParams.get("state") || undefined,
			error: url.searchParams.get("error") || undefined,
			errorDescription: url.searchParams.get("error_description") || undefined,
		};
		res.statusCode = result.error ? 400 : 200;
		res.setHeader("Content-Type", "text/html; charset=utf-8");
		res.end(result.error ? "<h1>xAI authorization failed.</h1>" : "<h1>xAI authorization received. You can close this tab.</h1>");
		settle?.(result);
	});
	const port = await new Promise<number>((resolvePort) => {
		const onError = () => {
			server.removeListener("error", onError);
			server.listen(0, host, () => {
				const address = server.address();
				resolvePort(typeof address === "object" && address ? address.port : preferredPort);
			});
		};
		server.once("error", onError);
		server.listen(preferredPort, host, () => {
			server.removeListener("error", onError);
			const address = server.address();
			resolvePort(typeof address === "object" && address ? address.port : preferredPort);
		});
	});
	return {
		server,
		redirectUri: `http://${host}:${port}${callbackPath}`,
		waitForCallback: (timeoutMs) =>
			Promise.race([
				callbackPromise,
				new Promise<CallbackResult>((resolve) => setTimeout(() => resolve({ error: "timeout", errorDescription: "Timed out waiting for xAI OAuth callback." }), timeoutMs)),
			]),
	};
}

function openBrowser(url: string): void {
	const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
	const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
	try {
		const child = spawn(command, args, { stdio: "ignore", detached: true });
		child.unref();
	} catch {
		// The command UI still prints the URL for manual opening.
	}
}

export async function runOAuthLogin(
	config: ExtensionConfig,
	callbacks: { onAuthUrl?: (url: string, redirectUri: string) => void } = {},
	fetchFn: FetchLike = fetch,
): Promise<StoredOAuthCredentials> {
	const discovery = await discoverOAuth(fetchFn);
	const { verifier, challenge } = await createPkce();
	const state = base64Url(crypto.getRandomValues(new Uint8Array(16)));
	const nonce = base64Url(crypto.getRandomValues(new Uint8Array(16)));
	const host = config.oauth?.callbackHost || DEFAULT_AUTH_HOST;
	const port = config.oauth?.callbackPort || DEFAULT_AUTH_PORT;
	const callback = await startCallbackServer(host, port, DEFAULT_AUTH_PATH);
	try {
		const authUrl = buildAuthorizeUrl({
			authorizationEndpoint: discovery.authorization_endpoint,
			clientId: config.oauth?.clientId || DEFAULT_CLIENT_ID,
			redirectUri: callback.redirectUri,
			scope: config.oauth?.scope || DEFAULT_SCOPE,
			challenge,
			state,
			nonce,
		});
		callbacks.onAuthUrl?.(authUrl, callback.redirectUri);
		openBrowser(authUrl);
		const result = await callback.waitForCallback(180_000);
		if (result.error) throw new Error(result.errorDescription || result.error);
		if (result.state !== state) throw new Error("xAI OAuth state mismatch.");
		if (!result.code) throw new Error("xAI OAuth callback did not include an authorization code.");
		const credentials = await exchangeCodeForToken(
			{
				tokenEndpoint: discovery.token_endpoint,
				code: result.code,
				redirectUri: callback.redirectUri,
				verifier,
				challenge,
				clientId: config.oauth?.clientId || DEFAULT_CLIENT_ID,
				baseUrl: config.baseUrl || DEFAULT_BASE_URL,
			},
			fetchFn,
		);
		credentials.authorizationEndpoint = discovery.authorization_endpoint;
		return credentials;
	} finally {
		callback.server.close();
	}
}

function getSessionId(ctx: { sessionManager?: { getSessionId?: () => string }; sessionId?: string }): string {
	return ctx.sessionManager?.getSessionId?.() || ctx.sessionId || `session-${Date.now()}`;
}

function formatXSearchResult(result: XSearchResult): string {
	let text = result.answer;
	if (result.citations.length) {
		text += "\n\nSources:\n";
		for (const citation of result.citations) text += `- ${citation.title ? `${citation.title} ` : ""}${citation.url}\n`;
	}
	return text;
}

export default function xaiGrokExtension(pi: ExtensionAPI) {
	pi.registerCommand("xai-grok-login", {
		description: "Authenticate xAI/Grok with Pi-owned OAuth credentials",
		handler: async (_args, ctx) => {
			const config = loadConfig(ctx.cwd || process.cwd());
			const credentials = await runOAuthLogin(config, {
				onAuthUrl: (url, redirectUri) => {
					ctx.ui.notify(`Open xAI authorization URL in your browser. Callback: ${redirectUri}`, "info");
					console.log(`xAI authorization URL:\n${url}\n`);
				},
			});
			await saveStoredOAuth(credentials);
			ctx.ui.notify("xAI/Grok OAuth credentials saved for Pi.", "info");
		},
	});

	pi.registerCommand("xai-grok-status", {
		description: "Show xAI/Grok extension auth status",
		handler: async (_args, ctx) => {
			const config = loadConfig(ctx.cwd || process.cwd());
			const hasApiKey = Boolean(process.env.XAI_API_KEY || process.env.PI_XAI_API_KEY || config.apiKey);
			const stored = loadStoredOAuth();
			const mode = hasApiKey ? "API key" : stored ? "OAuth token" : "not configured";
			ctx.ui.notify(`xAI/Grok auth: ${mode}. Base URL: ${normalizedBaseUrl(config.baseUrl)}.`, hasApiKey || stored ? "info" : "warning");
		},
	});

	pi.registerCommand("xai-grok-logout", {
		description: "Remove Pi-owned xAI/Grok OAuth credentials",
		handler: async (_args, ctx) => {
			await clearStoredOAuth();
			ctx.ui.notify("Removed Pi-owned xAI/Grok OAuth credentials.", "info");
		},
	});

	pi.registerTool({
		name: "xai_grok_x_search",
		label: "xAI X Search",
		description: "Search X (Twitter) through xAI/Grok's native x_search tool without depending on external agent CLIs.",
		promptSnippet: "Search X/Twitter posts and threads through xAI/Grok native x_search.",
		promptGuidelines: [
			"Use xai_grok_x_search when current information from X/Twitter is required and xAI/Grok credentials are configured.",
			"xai_grok_x_search uses XAI_API_KEY/PI_XAI_API_KEY or Pi-owned /xai-grok-login OAuth credentials; it does not depend on other agent harnesses.",
		],
		parameters: XAI_X_SEARCH_PARAMETERS,
		async execute(_toolCallId, params: XSearchParams, signal, onUpdate, ctx) {
			const config = loadConfig(ctx.cwd);
			const auth = await resolveAuth(ctx.cwd);
			onUpdate?.({ content: [{ type: "text", text: `Searching X with ${params.model || config.searchModel || DEFAULT_SEARCH_MODEL}...` }], details: { authKind: auth.kind } });
			const result = await callXSearch(params, auth, config, fetch, signal);
			return {
				content: [{ type: "text", text: formatXSearchResult(result) }],
				details: { authKind: auth.kind, citationCount: result.citations.length, raw: result.raw },
			};
		},
	});

	pi.registerTool({
		name: "xai_grok_video_generate",
		label: "xAI Grok Video",
		description: "Generate a text-to-video MP4 through xAI/Grok Imagine Video and save it locally, without depending on external agent CLIs.",
		promptSnippet: "Generate Grok Imagine Video MP4 assets through xAI.",
		promptGuidelines: [
			"Use xai_grok_video_generate when the user requests Grok video generation or project video assets.",
			"Default to the highest broadly supported xAI team resolution: 720p. Request 1080p only when the user's xAI team explicitly supports it.",
			"xai_grok_video_generate returns temporary xAI video URLs and, by default, downloads the MP4 into the workspace.",
		],
		parameters: XAI_VIDEO_PARAMETERS,
		async execute(_toolCallId, params: VideoGenerateParams, signal, onUpdate, ctx) {
			const config = loadConfig(ctx.cwd);
			const auth = await resolveAuth(ctx.cwd);
			const sessionId = getSessionId(ctx);
			onUpdate?.({ content: [{ type: "text", text: `Starting ${params.model || config.videoModel || DEFAULT_VIDEO_MODEL} video generation...` }], details: { authKind: auth.kind } });
			const result = await generateVideo(params, auth, config, ctx.cwd, sessionId, fetch, signal);
			const summary = [
				`Grok video request ${result.requestId} finished with status ${result.status}.`,
				result.url ? `Temporary URL: ${result.url}` : undefined,
				result.file ? `Saved MP4: ${result.file}` : undefined,
				result.bytes ? `Bytes: ${result.bytes}` : undefined,
			]
				.filter(Boolean)
				.join(" ");
			return {
				content: [{ type: "text", text: summary }],
				details: { authKind: auth.kind, ...result },
			};
		},
	});
}

// Useful for quick smoke checks in tests or one-off extension loading.
export function extensionFilesExist(): boolean {
	return existsSync(new URL(import.meta.url));
}
