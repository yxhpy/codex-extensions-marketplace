import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
	readPng,
	writePng,
	type Box,
	type RgbaImage,
} from "../scripts/asset_slice.ts";

const PLUGIN_ROOT = path.resolve(import.meta.dirname, "..");
const SLICER_SCRIPT = path.join(PLUGIN_ROOT, "scripts/asset_slice.ts");

type Rect = Box & { color: [number, number, number, number] };

function runSlicer(args: string[]) {
	return spawnSync(
		process.execPath,
		["--experimental-strip-types", SLICER_SCRIPT, ...args],
		{
			encoding: "utf8",
		},
	);
}

function fixtureImage(
	width: number,
	height: number,
	rects: Rect[],
	background: [number, number, number, number] = [255, 255, 255, 255],
): RgbaImage {
	const data = new Uint8Array(width * height * 4);
	for (let i = 0; i < width * height; i += 1) {
		data[i * 4] = background[0];
		data[i * 4 + 1] = background[1];
		data[i * 4 + 2] = background[2];
		data[i * 4 + 3] = background[3];
	}
	for (const rect of rects) {
		for (let y = rect.y; y < rect.y + rect.height; y += 1) {
			for (let x = rect.x; x < rect.x + rect.width; x += 1) {
				const index = (y * width + x) * 4;
				data[index] = rect.color[0];
				data[index + 1] = rect.color[1];
				data[index + 2] = rect.color[2];
				data[index + 3] = rect.color[3];
			}
		}
	}
	return { width, height, data };
}

function writeExpected(
	filePath: string,
	boxes: Box[],
	tolerancePx = 0,
	minIou = 1,
): void {
	writeFileSync(
		filePath,
		JSON.stringify(
			{
				tolerancePx,
				minIou,
				items: boxes.map((box, index) => ({ id: `asset-${index + 1}`, box })),
			},
			null,
			2,
		) + "\n",
		"utf8",
	);
}

function parseReport(stdout: string) {
	return JSON.parse(stdout) as {
		ok: boolean;
		components: Array<{ rawBox: Box; paddedBox: Box; path: string }>;
		checks: Array<{
			name: string;
			ok: boolean;
			details?: Record<string, unknown>;
		}>;
	};
}

function hashFile(filePath: string): string {
	return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

test("asset slicer e2e splits a clean generated icon sheet", () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), "asset-slicer-clean-"));
	const sheet = path.join(tempDir, "sheet.png");
	const outDir = path.join(tempDir, "slices");
	const expected = path.join(tempDir, "expected.json");
	const boxes = [
		{ x: 5, y: 8, width: 10, height: 12 },
		{ x: 30, y: 8, width: 14, height: 14 },
		{ x: 60, y: 8, width: 12, height: 10 },
	];
	writePng(
		sheet,
		fixtureImage(80, 40, [
			{ ...boxes[0], color: [220, 32, 32, 255] },
			{ ...boxes[1], color: [32, 180, 64, 255] },
			{ ...boxes[2], color: [40, 80, 220, 255] },
		]),
	);
	writeExpected(expected, boxes);

	const result = runSlicer([
		sheet,
		"--out-dir",
		outDir,
		"--background",
		"#ffffff",
		"--padding",
		"2",
		"--min-gap",
		"8",
		"--expect-count",
		"3",
		"--expected",
		expected,
		"--json",
	]);

	assert.equal(result.status, 0, result.stdout + result.stderr);
	const report = parseReport(result.stdout);
	assert.equal(report.ok, true);
	assert.deepEqual(
		report.components.map((component) => component.rawBox),
		boxes,
	);
	for (const component of report.components) {
		assert.ok(existsSync(component.path), `missing slice ${component.path}`);
		const slice = readPng(component.path);
		assert.equal(slice.width, component.paddedBox.width);
		assert.equal(slice.height, component.paddedBox.height);
		assert.equal(countOpaqueBorderPixels(slice), 0);
	}
});

test("asset slicer e2e is deterministic across repeated runs", () => {
	const tempDir = mkdtempSync(
		path.join(tmpdir(), "asset-slicer-deterministic-"),
	);
	const sheet = path.join(tempDir, "sheet.png");
	writePng(
		sheet,
		fixtureImage(50, 30, [
			{ x: 6, y: 6, width: 8, height: 8, color: [0, 0, 0, 255] },
			{ x: 28, y: 8, width: 10, height: 10, color: [220, 90, 0, 255] },
		]),
	);
	const args = [
		sheet,
		"--background",
		"auto",
		"--padding",
		"3",
		"--expect-count",
		"2",
		"--json",
	];
	const first = runSlicer([...args, "--out-dir", path.join(tempDir, "out-a")]);
	const second = runSlicer([...args, "--out-dir", path.join(tempDir, "out-b")]);

	assert.equal(first.status, 0, first.stdout + first.stderr);
	assert.equal(second.status, 0, second.stdout + second.stderr);
	const firstReport = parseReport(first.stdout);
	const secondReport = parseReport(second.stdout);
	assert.deepEqual(
		firstReport.components.map((component) => component.rawBox),
		secondReport.components.map((component) => component.rawBox),
	);
	assert.deepEqual(
		firstReport.components.map((component) => hashFile(component.path)),
		secondReport.components.map((component) => hashFile(component.path)),
	);
});

test("asset slicer e2e fails dense sheets when gutters are too small", () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), "asset-slicer-dense-"));
	const sheet = path.join(tempDir, "sheet.png");
	writePng(
		sheet,
		fixtureImage(32, 24, [
			{ x: 5, y: 6, width: 10, height: 10, color: [255, 0, 0, 255] },
			{ x: 17, y: 6, width: 10, height: 10, color: [0, 0, 255, 255] },
		]),
	);

	const result = runSlicer([
		sheet,
		"--out-dir",
		path.join(tempDir, "out"),
		"--padding",
		"4",
		"--min-gap",
		"8",
		"--expect-count",
		"2",
		"--json",
	]);

	assert.notEqual(result.status, 0, result.stdout + result.stderr);
	const report = parseReport(result.stdout);
	assert.equal(report.ok, false);
	assert.ok(
		report.checks.some(
			(check) =>
				!check.ok && /padded_boxes_do_not_overlap|min_gap/.test(check.name),
		),
	);
});

test("asset slicer e2e fails blank sheets", () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), "asset-slicer-blank-"));
	const sheet = path.join(tempDir, "blank.png");
	writePng(sheet, fixtureImage(20, 20, []));

	const result = runSlicer([
		sheet,
		"--out-dir",
		path.join(tempDir, "out"),
		"--expect-count",
		"1",
		"--json",
	]);

	assert.notEqual(result.status, 0, result.stdout + result.stderr);
	const report = parseReport(result.stdout);
	assert.ok(
		report.checks.some(
			(check) => check.name === "components_detected" && !check.ok,
		),
	);
});

test("asset slicer e2e fails source assets clipped by the sheet edge", () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), "asset-slicer-clipped-"));
	const sheet = path.join(tempDir, "clipped.png");
	writePng(
		sheet,
		fixtureImage(24, 24, [
			{ x: 0, y: 6, width: 10, height: 10, color: [0, 0, 0, 255] },
		]),
	);

	const result = runSlicer([
		sheet,
		"--out-dir",
		path.join(tempDir, "out"),
		"--padding",
		"2",
		"--expect-count",
		"1",
		"--json",
	]);

	assert.notEqual(result.status, 0, result.stdout + result.stderr);
	const report = parseReport(result.stdout);
	assert.ok(
		report.checks.some(
			(check) => check.name === "slice_1_not_clipped" && !check.ok,
		),
	);
});

test("asset slicer e2e fails expected-box drift", () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), "asset-slicer-drift-"));
	const sheet = path.join(tempDir, "sheet.png");
	const expected = path.join(tempDir, "expected.json");
	writePng(
		sheet,
		fixtureImage(24, 24, [
			{ x: 5, y: 6, width: 8, height: 9, color: [128, 0, 128, 255] },
		]),
	);
	writeExpected(expected, [{ x: 6, y: 6, width: 8, height: 9 }]);

	const result = runSlicer([
		sheet,
		"--out-dir",
		path.join(tempDir, "out"),
		"--padding",
		"2",
		"--expected",
		expected,
		"--tolerance-px",
		"0",
		"--min-iou",
		"1",
		"--json",
	]);

	assert.notEqual(result.status, 0, result.stdout + result.stderr);
	const report = parseReport(result.stdout);
	assert.ok(
		report.checks.some(
			(check) => check.name === "slice_1_expected_alignment" && !check.ok,
		),
	);
});

test("asset slicer e2e fails merged touching assets when count expects two", () => {
	const tempDir = mkdtempSync(path.join(tmpdir(), "asset-slicer-merged-"));
	const sheet = path.join(tempDir, "merged.png");
	writePng(
		sheet,
		fixtureImage(34, 24, [
			{ x: 6, y: 6, width: 10, height: 10, color: [255, 0, 0, 255] },
			{ x: 16, y: 6, width: 10, height: 10, color: [0, 0, 255, 255] },
		]),
	);

	const result = runSlicer([
		sheet,
		"--out-dir",
		path.join(tempDir, "out"),
		"--expect-count",
		"2",
		"--json",
	]);

	assert.notEqual(result.status, 0, result.stdout + result.stderr);
	const report = parseReport(result.stdout);
	assert.ok(
		report.checks.some((check) => check.name === "expected_count" && !check.ok),
	);
});

function countOpaqueBorderPixels(image: RgbaImage): number {
	let count = 0;
	for (let x = 0; x < image.width; x += 1) {
		if (image.data[(0 * image.width + x) * 4 + 3]) count += 1;
		if (image.data[((image.height - 1) * image.width + x) * 4 + 3]) count += 1;
	}
	for (let y = 1; y < image.height - 1; y += 1) {
		if (image.data[(y * image.width + 0) * 4 + 3]) count += 1;
		if (image.data[(y * image.width + image.width - 1) * 4 + 3]) count += 1;
	}
	return count;
}
