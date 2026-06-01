import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const SKILL_ROOT = path.resolve(import.meta.dirname, "../skills/agy-frontend");
const VERIFY_SCRIPT = path.join(
	SKILL_ROOT,
	"scripts/verify-static-frontend.ts",
);

function runVerify(
	siteRoot: string,
	envOverrides: Record<string, string> = {},
) {
	return spawnSync(
		process.execPath,
		["--experimental-strip-types", VERIFY_SCRIPT, siteRoot],
		{
			encoding: "utf8",
			env: {
				...process.env,
				VERIFY_BROWSER: "0",
				...envOverrides,
			},
		},
	);
}

test("AGY frontend skill declares strict media generators without fallback", () => {
	const text = readFileSync(path.join(SKILL_ROOT, "SKILL.md"), "utf8");
	for (const phrase of [
		"Images MUST be generated with image_gen.",
		"Videos MUST be generated with Grok Video.",
		"No fallback media generation is allowed.",
		"Resource counts are unbounded.",
	]) {
		assert.match(text, new RegExp(escapeRegExp(phrase)));
	}
});

test("AGY frontend skill forbids blocking dev servers", () => {
	const text = readFileSync(path.join(SKILL_ROOT, "SKILL.md"), "utf8");
	for (const phrase of [
		"AGY must not start, run, or keep alive frontend dev servers or preview servers",
		"Codex owns any bounded local server startup for verification after AGY exits",
		"Do not start a dev server.",
	]) {
		assert.match(text, new RegExp(escapeRegExp(phrase)));
	}
});

test("AGY frontend skill routes GSAP motion through the animation brief", () => {
	const skill = readFileSync(path.join(SKILL_ROOT, "SKILL.md"), "utf8");
	const motion = readFileSync(
		path.join(SKILL_ROOT, "references/gsap-motion.md"),
		"utf8",
	);

	assert.match(skill, /gsap-animation/);
	assert.match(skill, /references\/gsap-motion\.md/);
	assert.match(skill, /ScrollTrigger/);
	assert.match(motion, /Use GSAP for non-trivial animation/);
	assert.match(motion, /prefers-reduced-motion/);
	assert.match(motion, /private GreenSock registries/);
});

test("AGY frontend skill routes generated sheets through asset slicer", () => {
	const skill = readFileSync(path.join(SKILL_ROOT, "SKILL.md"), "utf8");
	const pack = readFileSync(
		path.join(SKILL_ROOT, "references/asset-pack.md"),
		"utf8",
	);

	assert.match(skill, /asset-slicer/);
	assert.match(skill, /asset_slice\.ts/);
	assert.match(skill, /asset-slices\.json/);
	assert.match(pack, /icon-sheet/);
	assert.match(pack, /sprite-sheet/);
	assert.match(pack, /clear gutters/);
});

test("AGY asset pack has no resource count ceiling", () => {
	const text = readFileSync(
		path.join(SKILL_ROOT, "references/asset-pack.md"),
		"utf8",
	);
	assert.match(text, /Resource counts are unbounded\./);
	assert.match(text, /Do not put numeric caps, quotas, or fixed asset counts/);
	for (const phrase of [
		"2-5 images",
		"4-8 images",
		"3-6 media assets",
		"6-10 media assets",
		"start with at least",
		"at least 1 image",
		"at least 3 media",
		"at least 6 media",
	]) {
		assert.doesNotMatch(text, new RegExp(escapeRegExp(phrase)));
	}
});

test("AGY static verifier fails when required video is missing", () => {
	const site = mkdtempSync(path.join(tmpdir(), "dispatcher-missing-video-"));
	writeFileSync(
		path.join(site, "index.html"),
		'<!doctype html><title>Video check</title><video src="media/missing-loop.mp4"></video>',
		"utf8",
	);

	const result = runVerify(site, { ASSET_MIN_VIDEOS: "1" });

	assert.notEqual(result.status, 0, result.stdout + result.stderr);
	assert.match(result.stdout + result.stderr, /missing/);
	assert.match(result.stdout + result.stderr, /ASSET_MIN_VIDEOS=1/);
});

test("AGY static verifier passes when referenced video exists", () => {
	const site = mkdtempSync(path.join(tmpdir(), "dispatcher-existing-video-"));
	const media = path.join(site, "media");
	mkdirSync(media);
	writeFileSync(
		path.join(media, "hero-loop.mp4"),
		"not-empty-video-placeholder",
	);
	writeFileSync(
		path.join(site, "index.html"),
		'<!doctype html><title>Video check</title><video src="media/hero-loop.mp4"></video>',
		"utf8",
	);

	const result = runVerify(site, { ASSET_MIN_VIDEOS: "1" });

	assert.equal(result.status, 0, result.stdout + result.stderr);
	assert.match(result.stdout, /local video assets referenced: 1/);
});

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
