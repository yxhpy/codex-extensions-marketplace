import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import xaiGrokExtension, {
	DEFAULT_CLIENT_ID,
	DEFAULT_VIDEO_MODEL,
	buildAuthorizeUrl,
	buildCodeExchangeBody,
	buildVideoGenerationRequest,
	buildXSearchRequest,
	callXSearch,
	extractCitations,
	extractResponseText,
	generateVideo,
	validateEndpoint,
	type FetchLike,
} from "../extensions/xai-grok/index.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const EXTENSION_PATH = path.join(REPO_ROOT, "extensions/xai-grok/index.ts");

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: { "Content-Type": "application/json" },
		...init,
	});
}

test("xAI x_search request builder maps tool parameters", () => {
	const request = buildXSearchRequest({
		query: "recent Grok video updates",
		allowed_x_handles: ["@xai", "grok"],
		from_date: "2026-06-01",
		enable_image_understanding: true,
		enable_video_understanding: true,
	});

	assert.equal(request.model, "grok-4.3");
	assert.deepEqual(request.input, [
		{ role: "user", content: "recent Grok video updates" },
	]);
	assert.deepEqual(request.tools, [
		{
			type: "x_search",
			allowed_x_handles: ["xai", "grok"],
			from_date: "2026-06-01",
			enable_image_understanding: true,
			enable_video_understanding: true,
		},
	]);

	assert.throws(
		() =>
			buildXSearchRequest({
				query: "bad",
				allowed_x_handles: ["xai"],
				excluded_x_handles: ["spam"],
			}),
		/mutually exclusive/,
	);
});

test("xAI response parsing extracts answer text and citations", () => {
	const payload = {
		output: [
			{
				type: "message",
				content: [
					{
						type: "output_text",
						text: "Grok video shipped new controls.",
						annotations: [
							{ type: "url_citation", url: "https://x.com/xai/status/1", title: "xAI post" },
						],
					},
				],
			},
		],
		citations: [{ url: "https://x.com/xai/status/2", title: "second" }],
	};

	assert.equal(extractResponseText(payload), "Grok video shipped new controls.");
	assert.deepEqual(extractCitations(payload), [
		{ url: "https://x.com/xai/status/2", title: "second" },
		{ url: "https://x.com/xai/status/1", title: "xAI post" },
	]);
});

test("callXSearch posts to /responses with bearer auth", async () => {
	let capturedUrl = "";
	let capturedInit: RequestInit | undefined;
	const fakeFetch: FetchLike = async (input, init) => {
		capturedUrl = String(input);
		capturedInit = init;
		return jsonResponse({ output_text: "answer" });
	};

	const result = await callXSearch(
		{ query: "grok", model: "grok-4.3", baseUrl: "https://api.x.ai/v1/" },
		{ kind: "api-key", token: "secret", baseUrl: "https://api.x.ai/v1" },
		{},
		fakeFetch,
	);

	assert.equal(result.answer, "answer");
	assert.equal(capturedUrl, "https://api.x.ai/v1/responses");
	assert.equal((capturedInit?.headers as Record<string, string>).Authorization, "Bearer secret");
	assert.equal(JSON.parse(String(capturedInit?.body)).tools[0].type, "x_search");
});

test("video generation builds request, polls, downloads MP4", async () => {
	const cwd = mkdtempSync(path.join(tmpdir(), "xai-video-test-"));
	const calls: string[] = [];
	let pollCount = 0;
	const fakeFetch: FetchLike = async (input, init) => {
		const url = String(input);
		calls.push(url);
		if (url.endsWith("/videos/generations")) {
			const body = JSON.parse(String(init?.body));
			assert.equal(body.model, DEFAULT_VIDEO_MODEL);
			assert.equal(body.prompt, "neon arena loop");
			assert.equal(body.duration, 6);
			assert.equal(body.aspect_ratio, "16:9");
			return jsonResponse({ request_id: "vid_123" });
		}
		if (url.endsWith("/videos/vid_123")) {
			pollCount += 1;
			return jsonResponse(
				pollCount === 1
					? { status: "pending" }
					: { status: "done", model: DEFAULT_VIDEO_MODEL, video: { url: "https://vidgen.x.ai/vid_123.mp4", duration: 6 } },
			);
		}
		if (url === "https://vidgen.x.ai/vid_123.mp4") {
			return new Response(Buffer.alloc(10_001), { status: 200 });
		}
		return new Response("unexpected", { status: 500 });
	};

	const result = await generateVideo(
		{ prompt: "neon arena loop", duration: 6, outputDir: "videos", pollIntervalMs: 1 },
		{ kind: "api-key", token: "secret", baseUrl: "https://api.x.ai/v1" },
		{},
		cwd,
		"session-1",
		fakeFetch,
	);

	assert.equal(result.requestId, "vid_123");
	assert.equal(result.status, "done");
	assert.equal(result.polls, 2);
	assert.ok(result.file?.endsWith("videos/vid_123.mp4"));
	assert.ok(existsSync(result.file || ""));
	assert.deepEqual(calls, [
		"https://api.x.ai/v1/videos/generations",
		"https://api.x.ai/v1/videos/vid_123",
		"https://api.x.ai/v1/videos/vid_123",
		"https://vidgen.x.ai/vid_123.mp4",
	]);
});

test("video request validation locks official xAI parameter ranges", () => {
	assert.deepEqual(buildVideoGenerationRequest({ prompt: "test" }), {
		model: DEFAULT_VIDEO_MODEL,
		prompt: "test",
		duration: 8,
		aspect_ratio: "16:9",
		resolution: "720p",
	});
	assert.throws(() => buildVideoGenerationRequest({ prompt: "test", duration: 16 }), /duration/);
	assert.throws(() => buildVideoGenerationRequest({ prompt: "test", aspect_ratio: "21:9" }), /aspect_ratio/);
});

test("OAuth helpers build xAI PKCE URLs and echo challenge in token exchange", () => {
	const authUrl = buildAuthorizeUrl({
		authorizationEndpoint: "https://auth.x.ai/oauth2/authorize",
		redirectUri: "http://127.0.0.1:56121/callback",
		challenge: "challenge",
		state: "state",
		nonce: "nonce",
	});
	const parsed = new URL(authUrl);
	assert.equal(parsed.searchParams.get("client_id"), DEFAULT_CLIENT_ID);
	assert.equal(parsed.searchParams.get("code_challenge"), "challenge");
	assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
	assert.equal(parsed.searchParams.get("plan"), "generic");

	const body = buildCodeExchangeBody({
		code: "code",
		redirectUri: "http://127.0.0.1:56121/callback",
		verifier: "verifier",
		challenge: "challenge",
	});
	assert.equal(body.get("grant_type"), "authorization_code");
	assert.equal(body.get("code_verifier"), "verifier");
	assert.equal(body.get("code_challenge"), "challenge");
	assert.equal(body.get("code_challenge_method"), "S256");

	assert.equal(validateEndpoint("https://accounts.x.ai/oauth2/token", "token_endpoint"), "https://accounts.x.ai/oauth2/token");
	assert.throws(() => validateEndpoint("https://evil.example/token", "token_endpoint"), /non-xAI/);
});

test("extension registers xAI commands and tools", () => {
	const commands: string[] = [];
	const tools: string[] = [];
	const fakePi = {
		registerCommand(name: string) {
			commands.push(name);
		},
		registerTool(definition: { name: string }) {
			tools.push(definition.name);
		},
	};

	xaiGrokExtension(fakePi as any);
	assert.deepEqual(commands, ["xai-grok-login", "xai-grok-status", "xai-grok-logout"]);
	assert.deepEqual(tools, ["xai_grok_x_search", "xai_grok_video_generate"]);
});

test("xAI extension code has no hard dependency on Hermes runtime paths or commands", () => {
	const source = readFileSync(EXTENSION_PATH, "utf8");
	assert.doesNotMatch(source, /\.hermes/);
	assert.doesNotMatch(source, /from\s+["'][^"']*hermes/i);
	assert.doesNotMatch(source, /spawn\([^)]*hermes/i);
});
