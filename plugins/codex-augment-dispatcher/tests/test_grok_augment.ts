import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
	GrokCli,
	GrokVideoClient,
	buildPrompt,
} from "../scripts/grok_augment.ts";

const PLUGIN_ROOT = path.resolve(import.meta.dirname, "..");

function writeFakeGrok(tempDir: string, fallbackResponse: string): string {
	const scriptPath = path.join(tempDir, "grok-fake.mjs");
	writeFileSync(
		scriptPath,
		`const args = process.argv.slice(2).join(" ");
if (args.includes("--version")) console.log("grok 0.0.fake");
else if (args.includes("models")) console.log("grok-build");
else console.log(${JSON.stringify(fallbackResponse)});
`,
		"utf8",
	);
	if (process.platform === "win32") {
		const fakeGrok = path.join(tempDir, "grok.cmd");
		writeFileSync(
			fakeGrok,
			`@echo off

"${process.execPath}" "${scriptPath}" %*

`,
			"utf8",
		);
		return fakeGrok;
	}
	const fakeGrok = path.join(tempDir, "grok");
	writeFileSync(
		fakeGrok,
		`#!/bin/sh
exec "${process.execPath}" "${scriptPath}" "$@"
`,
		"utf8",
	);
	chmodSync(fakeGrok, 0o755);
	return fakeGrok;
}
test("single turn uses configured grok without approval or fallback", () => {
	const calls: Array<[string[], Record<string, unknown>]> = [];
	const cli = new GrokCli({
		command: "/fake/grok",
		timeoutSeconds: 17,
		runner(args, options) {
			const cwd = String(args[args.indexOf("--cwd") + 1] || "");
			assert.ok(existsSync(path.join(cwd, "README.md")));
			calls.push([args, options]);
			return { status: 0, stdout: "ok from grok", stderr: "" };
		},
	});

	const response = cli.singleTurn("Research this", {
		effort: "high",
		disableWebSearch: true,
	});

	assert.equal(response, "ok from grok");
	const [args, options] = calls[0];
	assert.equal(args[0], "/fake/grok");
	assert.ok(args.includes("--cwd"));
	assert.ok(args.includes("--no-alt-screen"));
	assert.ok(args.includes("--no-plan"));
	assert.ok(args.includes("--disable-web-search"));
	assert.ok(args.includes("--output-format"));
	assert.equal(args[args.indexOf("--output-format") + 1], "plain");
	assert.ok(args.includes("--effort"));
	assert.equal(args[args.indexOf("--effort") + 1], "high");
	assert.ok(args.includes("-p"));
	assert.equal(args[args.length - 1], "Research this");
	assert.ok(!args.includes("--always-approve"));
	assert.ok(!args.includes("--max-turns"));
	assert.ok(!args.includes("--permission-mode"));
	assert.equal(options.timeout, 17_000);
	assert.equal(options.captureOutput, true);
});

test("missing grok command fails instead of falling back", () => {
	const cli = new GrokCli({
		command: "/missing/grok",
		runner(args) {
			return {
				status: null,
				error: Object.assign(new Error(args[0]), { code: "ENOENT" }),
			};
		},
	});

	assert.throws(() => cli.singleTurn("hello"), /grok command not found/);
});

test("empty grok response is rejected", () => {
	const cli = new GrokCli({
		command: "/fake/grok",
		runner() {
			return { status: 0, stdout: "  \n", stderr: "" };
		},
	});

	assert.throws(
		() => cli.singleTurn("hello"),
		/grok returned an empty response/,
	);
});

test("research prompt preserves owner agent as local executor", () => {
	const prompt = buildPrompt("research", "Should we use Grok CLI?");

	assert.match(prompt, /owner agent owns local file edits/i);
	assert.match(prompt, /source URLs/);
	assert.match(prompt, /Should we use Grok CLI/);
});

test("video prompt requires Grok video and forbids fallbacks", () => {
	const prompt = buildPrompt(
		"video",
		"Create a cinematic Dream of the Red Chamber shot",
	);

	assert.match(prompt, /Grok video only/);
	assert.match(prompt, /No fallback provider is allowed/);
	assert.match(prompt, /Do not use image providers for video/);
	assert.match(prompt, /Create a cinematic Dream of the Red Chamber shot/);
});

test("CLI outputs JSON with fake grok binary", () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), "grok-augment-test-"));
	const fakeGrok = writeFakeGrok(tempDir, "FAKE_GROK_RESPONSE");

	const completed = spawnSync(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(PLUGIN_ROOT, "scripts/grok_augment.ts"),
			"--json",
			"creative",
			"Build a dense app UI",
		],
		{
			encoding: "utf8",
			env: { ...process.env, GROK_AUGMENT_GROK_BIN: fakeGrok },
		},
	);

	assert.equal(completed.status, 0, completed.stderr);
	const payload = JSON.parse(completed.stdout);
	assert.equal(payload.mode, "creative");
	assert.equal(payload.response, "FAKE_GROK_RESPONSE");
	assert.equal(payload.provider, "grok-cli");
});

test("inspect accepts json after subcommand", () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), "grok-augment-inspect-"));
	const fakeGrok = writeFakeGrok(tempDir, "unexpected");

	const completed = spawnSync(
		process.execPath,
		[
			"--experimental-strip-types",
			path.join(PLUGIN_ROOT, "scripts/grok_augment.ts"),
			"inspect",
			"--json",
		],
		{
			encoding: "utf8",
			env: { ...process.env, GROK_AUGMENT_GROK_BIN: fakeGrok },
		},
	);

	assert.equal(completed.status, 0, completed.stderr);
	const payload = JSON.parse(completed.stdout);
	assert.equal(payload.provider, "grok-cli");
	assert.equal(payload.version, "grok 0.0.fake");
});

test("video generate posts to Grok video and downloads MP4", async () => {
	const requests: Array<[string, Record<string, string>]> = [];
	const mp4Bytes = Buffer.concat([
		Buffer.from("\x00\x00\x00 ftypisom", "binary"),
		Buffer.alloc(12000, "0"),
	]);
	const server = createServer((req, res) => {
		if (req.method === "POST" && req.url === "/v1/videos") {
			let body = "";
			req.setEncoding("utf8");
			req.on("data", (chunk) => {
				body += chunk;
			});
			req.on("end", () => {
				const parsed = Object.fromEntries(new URLSearchParams(body).entries());
				requests.push([req.url || "", parsed]);
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						id: "video_test",
						status: "completed",
						model: parsed.model,
					}),
				);
			});
			return;
		}
		if (req.method === "GET" && req.url === "/v1/videos/video_test/content") {
			res.writeHead(200, { "Content-Type": "video/mp4" });
			res.end(mp4Bytes);
			return;
		}
		res.writeHead(404);
		res.end();
	});

	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const address = server.address();
		assert.ok(address && typeof address === "object");
		const tempDir = mkdtempSync(path.join(tmpdir(), "grok-video-"));
		const client = new GrokVideoClient({
			baseUrl: `http://127.0.0.1:${address.port}`,
			apiKey: "test-key",
			timeoutSeconds: 30,
		});
		const result = await client.generate("cinematic smoke", {
			outDir: tempDir,
		});

		assert.equal(requests[0][0], "/v1/videos");
		assert.equal(requests[0][1].model, "grok-imagine-video");
		assert.equal(requests[0][1].prompt, "cinematic smoke");
		assert.equal(requests[0][1].quality, "high");
		assert.equal(requests[0][1].resolution_name, "720p");
		assert.ok(!("image_reference" in requests[0][1]));
		assert.equal(result.provider, "grok-video");
		assert.equal(result.bytes, mp4Bytes.length);
		assert.ok(existsSync(String(result.file)));
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});
