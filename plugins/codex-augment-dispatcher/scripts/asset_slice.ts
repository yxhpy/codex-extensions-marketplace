#!/usr/bin/env -S node --experimental-strip-types
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const PNG_SIGNATURE = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export type Box = {
	x: number;
	y: number;
	width: number;
	height: number;
};

export type RgbaImage = {
	width: number;
	height: number;
	data: Uint8Array;
};

type Rgb = { r: number; g: number; b: number };

type Component = {
	index: number;
	area: number;
	rawBox: Box;
	paddedBox: Box;
	borderForegroundPixels: number;
	clippedAtSheetEdge: boolean;
	path?: string;
};

type SliceCheck = {
	name: string;
	ok: boolean;
	details?: Record<string, unknown>;
};

export type SliceReport = {
	ok: boolean;
	input: string;
	outputDir: string;
	image: { width: number; height: number };
	background: "transparent" | "auto" | string;
	backgroundColor?: Rgb;
	options: Required<
		Pick<
			SliceOptions,
			| "padding"
			| "minArea"
			| "alphaThreshold"
			| "backgroundTolerance"
			| "tolerancePx"
			| "minIou"
			| "minGap"
		>
	> & {
		expectCount?: number;
	};
	components: Component[];
	checks: SliceCheck[];
};

type ExpectedItem = {
	id?: string;
	box?: Box;
	bbox?: Box;
};

type ExpectedManifest = {
	items?: ExpectedItem[];
	tolerancePx?: number;
	minIou?: number;
};

export type SliceOptions = {
	input: string;
	outDir: string;
	background?: "auto" | "transparent" | string;
	padding?: number;
	minArea?: number;
	alphaThreshold?: number;
	backgroundTolerance?: number;
	expectCount?: number;
	expectedPath?: string;
	tolerancePx?: number;
	minIou?: number;
	minGap?: number;
	reportPath?: string;
};

type CliArgs = SliceOptions & { json?: boolean; help?: boolean };

export function readPng(filePath: string): RgbaImage {
	const buffer = readFileSync(filePath);
	if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
		throw new Error(`not a PNG file: ${filePath}`);
	}

	let offset = PNG_SIGNATURE.length;
	let width = 0;
	let height = 0;
	let bitDepth = 0;
	let colorType = 0;
	const idatChunks: Buffer[] = [];

	while (offset < buffer.length) {
		const length = buffer.readUInt32BE(offset);
		const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
		const data = buffer.subarray(offset + 8, offset + 8 + length);
		offset += 12 + length;

		if (type === "IHDR") {
			width = data.readUInt32BE(0);
			height = data.readUInt32BE(4);
			bitDepth = data[8];
			colorType = data[9];
		} else if (type === "IDAT") {
			idatChunks.push(Buffer.from(data));
		} else if (type === "IEND") {
			break;
		}
	}

	if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
		throw new Error(
			`unsupported PNG format: bitDepth=${bitDepth} colorType=${colorType}; expected RGB/RGBA 8-bit`,
		);
	}
	if (!width || !height || !idatChunks.length)
		throw new Error(`invalid PNG: ${filePath}`);

	const bytesPerPixel = colorType === 6 ? 4 : 3;
	const stride = width * bytesPerPixel;
	const inflated = inflateSync(Buffer.concat(idatChunks));
	const rgba = new Uint8Array(width * height * 4);
	let inputOffset = 0;
	let previous = new Uint8Array(stride);

	for (let y = 0; y < height; y += 1) {
		const filter = inflated[inputOffset++];
		const row = new Uint8Array(stride);
		for (let x = 0; x < stride; x += 1) {
			const raw = inflated[inputOffset++];
			const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
			const up = previous[x] || 0;
			const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] || 0 : 0;
			row[x] = unfilterByte(filter, raw, left, up, upLeft);
		}

		for (let x = 0; x < width; x += 1) {
			const source = x * bytesPerPixel;
			const target = (y * width + x) * 4;
			rgba[target] = row[source];
			rgba[target + 1] = row[source + 1];
			rgba[target + 2] = row[source + 2];
			rgba[target + 3] = colorType === 6 ? row[source + 3] : 255;
		}
		previous = row;
	}

	return { width, height, data: rgba };
}

function unfilterByte(
	filter: number,
	raw: number,
	left: number,
	up: number,
	upLeft: number,
): number {
	switch (filter) {
		case 0:
			return raw;
		case 1:
			return (raw + left) & 0xff;
		case 2:
			return (raw + up) & 0xff;
		case 3:
			return (raw + Math.floor((left + up) / 2)) & 0xff;
		case 4:
			return (raw + paeth(left, up, upLeft)) & 0xff;
		default:
			throw new Error(`unsupported PNG filter: ${filter}`);
	}
}

function paeth(left: number, up: number, upLeft: number): number {
	const p = left + up - upLeft;
	const pa = Math.abs(p - left);
	const pb = Math.abs(p - up);
	const pc = Math.abs(p - upLeft);
	if (pa <= pb && pa <= pc) return left;
	if (pb <= pc) return up;
	return upLeft;
}

export function writePng(filePath: string, image: RgbaImage): void {
	mkdirSync(path.dirname(filePath), { recursive: true });
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(image.width, 0);
	ihdr.writeUInt32BE(image.height, 4);
	ihdr[8] = 8;
	ihdr[9] = 6;
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;

	const stride = image.width * 4;
	const raw = Buffer.alloc((stride + 1) * image.height);
	let offset = 0;
	for (let y = 0; y < image.height; y += 1) {
		raw[offset++] = 0;
		raw.set(image.data.subarray(y * stride, y * stride + stride), offset);
		offset += stride;
	}

	const png = Buffer.concat([
		PNG_SIGNATURE,
		pngChunk("IHDR", ihdr),
		pngChunk("IDAT", deflateSync(raw, { level: 9 })),
		pngChunk("IEND", Buffer.alloc(0)),
	]);
	writeFileSync(filePath, png);
}

function pngChunk(type: string, data: Buffer): Buffer {
	const typeBuffer = Buffer.from(type, "ascii");
	const output = Buffer.alloc(12 + data.length);
	output.writeUInt32BE(data.length, 0);
	typeBuffer.copy(output, 4);
	data.copy(output, 8);
	output.writeUInt32BE(
		crc32(Buffer.concat([typeBuffer, data])),
		8 + data.length,
	);
	return output;
}

function crc32(buffer: Buffer): number {
	let crc = 0xffffffff;
	for (const byte of buffer) {
		crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i += 1) {
		let value = i;
		for (let bit = 0; bit < 8; bit += 1) {
			value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		}
		table[i] = value >>> 0;
	}
	return table;
})();

export function sliceImage(options: SliceOptions): SliceReport {
	const image = readPng(options.input);
	const padding = integerOption(options.padding, 2, "padding");
	const minArea = integerOption(options.minArea, 16, "minArea");
	const alphaThreshold = integerOption(
		options.alphaThreshold,
		8,
		"alphaThreshold",
	);
	const backgroundTolerance = integerOption(
		options.backgroundTolerance,
		24,
		"backgroundTolerance",
	);
	const tolerancePx = integerOption(options.tolerancePx, 1, "tolerancePx");
	const minIou = typeof options.minIou === "number" ? options.minIou : 0.95;
	const minGap = integerOption(options.minGap, 0, "minGap");
	const background = options.background || "auto";
	const backgroundColor = resolveBackground(image, background, alphaThreshold);
	const mask = buildForegroundMask(
		image,
		backgroundColor,
		alphaThreshold,
		backgroundTolerance,
	);
	const { components, componentIds } = findComponents(
		mask,
		image.width,
		image.height,
		minArea,
		padding,
	);
	const checks: SliceCheck[] = [];

	if (!components.length) {
		checks.push({
			name: "components_detected",
			ok: false,
			details: { detected: 0 },
		});
	} else {
		checks.push({
			name: "components_detected",
			ok: true,
			details: { detected: components.length },
		});
	}

	if (typeof options.expectCount === "number") {
		checks.push({
			name: "expected_count",
			ok: components.length === options.expectCount,
			details: { expected: options.expectCount, actual: components.length },
		});
	}

	for (const component of components) {
		component.borderForegroundPixels = countCropBorderForeground(
			component.paddedBox,
			componentIds,
			component.index,
			image.width,
		);
		component.clippedAtSheetEdge = touchesSheetEdge(
			component.rawBox,
			image.width,
			image.height,
		);
		checks.push({
			name: `slice_${component.index + 1}_clean_border`,
			ok: component.borderForegroundPixels === 0,
			details: {
				borderForegroundPixels: component.borderForegroundPixels,
				paddedBox: component.paddedBox,
			},
		});
		checks.push({
			name: `slice_${component.index + 1}_not_clipped`,
			ok: !component.clippedAtSheetEdge,
			details: { rawBox: component.rawBox },
		});
	}

	for (let i = 0; i < components.length; i += 1) {
		for (let j = i + 1; j < components.length; j += 1) {
			const gap = boxGap(components[i].rawBox, components[j].rawBox);
			checks.push({
				name: `slice_${i + 1}_${j + 1}_padded_boxes_do_not_overlap`,
				ok: !boxesOverlap(components[i].paddedBox, components[j].paddedBox),
				details: {
					first: components[i].paddedBox,
					second: components[j].paddedBox,
				},
			});
			if (minGap > 0) {
				checks.push({
					name: `slice_${i + 1}_${j + 1}_min_gap`,
					ok: gap >= minGap,
					details: { gap, minGap },
				});
			}
		}
	}

	const expected = options.expectedPath
		? readExpectedManifest(options.expectedPath)
		: undefined;
	if (expected?.items?.length) {
		checks.push(...compareExpected(components, expected, tolerancePx, minIou));
	}

	const outputDir = options.outDir;
	mkdirSync(outputDir, { recursive: true });
	for (const component of components) {
		const slicePath = path.join(
			outputDir,
			`slice-${String(component.index + 1).padStart(2, "0")}.png`,
		);
		writePng(slicePath, cropComponent(image, component, componentIds));
		component.path = slicePath;
	}

	const report: SliceReport = {
		ok: checks.every((check) => check.ok),
		input: options.input,
		outputDir,
		image: { width: image.width, height: image.height },
		background: backgroundColor ? background : "transparent",
		backgroundColor: backgroundColor || undefined,
		options: {
			padding,
			minArea,
			alphaThreshold,
			backgroundTolerance,
			tolerancePx,
			minIou,
			minGap,
			...(typeof options.expectCount === "number"
				? { expectCount: options.expectCount }
				: {}),
		},
		components,
		checks,
	};

	const reportPath =
		options.reportPath || path.join(outputDir, "asset-slices.json");
	writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
	return report;
}

function integerOption(
	value: number | undefined,
	defaultValue: number,
	name: string,
): number {
	const result = typeof value === "number" ? value : defaultValue;
	if (!Number.isInteger(result) || result < 0)
		throw new Error(`${name} must be a non-negative integer`);
	return result;
}

function resolveBackground(
	image: RgbaImage,
	background: string,
	alphaThreshold: number,
): Rgb | null {
	if (background === "transparent") return null;
	if (background !== "auto") return parseHexColor(background);

	let transparentBorder = 0;
	const samples: Rgb[] = [];
	for (const { x, y } of borderCoordinates(image.width, image.height)) {
		const index = (y * image.width + x) * 4;
		const alpha = image.data[index + 3];
		if (alpha <= alphaThreshold) transparentBorder += 1;
		samples.push({
			r: image.data[index],
			g: image.data[index + 1],
			b: image.data[index + 2],
		});
	}
	if (transparentBorder / Math.max(samples.length, 1) > 0.6) return null;

	const counts = new Map<string, { color: Rgb; count: number }>();
	for (const sample of samples) {
		const key = `${Math.round(sample.r / 8)},${Math.round(sample.g / 8)},${Math.round(sample.b / 8)}`;
		const existing = counts.get(key);
		if (existing) existing.count += 1;
		else counts.set(key, { color: sample, count: 1 });
	}
	return (
		[...counts.values()].sort((a, b) => b.count - a.count)[0]?.color || null
	);
}

function* borderCoordinates(
	width: number,
	height: number,
): Generator<{ x: number; y: number }> {
	for (let x = 0; x < width; x += 1) {
		yield { x, y: 0 };
		if (height > 1) yield { x, y: height - 1 };
	}
	for (let y = 1; y < height - 1; y += 1) {
		yield { x: 0, y };
		if (width > 1) yield { x: width - 1, y };
	}
}

function parseHexColor(value: string): Rgb {
	const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
	if (!match)
		throw new Error(
			`background must be auto, transparent, or #rrggbb: ${value}`,
		);
	const hex = Number.parseInt(match[1], 16);
	return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}

function buildForegroundMask(
	image: RgbaImage,
	background: Rgb | null,
	alphaThreshold: number,
	tolerance: number,
): Uint8Array {
	const mask = new Uint8Array(image.width * image.height);
	for (let i = 0; i < image.width * image.height; i += 1) {
		const pixel = i * 4;
		const alpha = image.data[pixel + 3];
		if (alpha <= alphaThreshold) continue;
		if (!background) {
			mask[i] = 1;
			continue;
		}
		const distance = colorDistance(
			{
				r: image.data[pixel],
				g: image.data[pixel + 1],
				b: image.data[pixel + 2],
			},
			background,
		);
		if (distance > tolerance) mask[i] = 1;
	}
	return mask;
}

function colorDistance(a: Rgb, b: Rgb): number {
	return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function findComponents(
	mask: Uint8Array,
	width: number,
	height: number,
	minArea: number,
	padding: number,
): {
	components: Component[];
	componentIds: Int32Array;
} {
	const visited = new Uint8Array(mask.length);
	const componentIds = new Int32Array(mask.length);
	componentIds.fill(-1);
	const components: Component[] = [];
	const stack: number[] = [];
	const pixels: number[] = [];

	for (let start = 0; start < mask.length; start += 1) {
		if (!mask[start] || visited[start]) continue;
		let minX = Number.POSITIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxX = 0;
		let maxY = 0;
		pixels.length = 0;
		stack.push(start);
		visited[start] = 1;

		while (stack.length) {
			const index = stack.pop()!;
			pixels.push(index);
			const x = index % width;
			const y = Math.floor(index / width);
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);

			for (let dy = -1; dy <= 1; dy += 1) {
				for (let dx = -1; dx <= 1; dx += 1) {
					if (dx === 0 && dy === 0) continue;
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
					const next = ny * width + nx;
					if (!mask[next] || visited[next]) continue;
					visited[next] = 1;
					stack.push(next);
				}
			}
		}

		if (pixels.length < minArea) continue;
		const rawBox = {
			x: minX,
			y: minY,
			width: maxX - minX + 1,
			height: maxY - minY + 1,
		};
		const component: Component = {
			index: components.length,
			area: pixels.length,
			rawBox,
			paddedBox: padBox(rawBox, padding, width, height),
			borderForegroundPixels: 0,
			clippedAtSheetEdge: false,
		};
		for (const pixel of pixels) componentIds[pixel] = component.index;
		components.push(component);
	}

	components.sort((a, b) => a.rawBox.y - b.rawBox.y || a.rawBox.x - b.rawBox.x);
	const remap = new Map<number, number>();
	components.forEach((component, index) => {
		remap.set(component.index, index);
		component.index = index;
	});
	for (let i = 0; i < componentIds.length; i += 1) {
		const next = remap.get(componentIds[i]);
		componentIds[i] = typeof next === "number" ? next : -1;
	}
	return { components, componentIds };
}

function padBox(box: Box, padding: number, width: number, height: number): Box {
	const x = Math.max(0, box.x - padding);
	const y = Math.max(0, box.y - padding);
	const right = Math.min(width, box.x + box.width + padding);
	const bottom = Math.min(height, box.y + box.height + padding);
	return { x, y, width: right - x, height: bottom - y };
}

function countCropBorderForeground(
	box: Box,
	componentIds: Int32Array,
	componentIndex: number,
	imageWidth: number,
): number {
	let count = 0;
	for (let x = box.x; x < box.x + box.width; x += 1) {
		if (componentIds[box.y * imageWidth + x] === componentIndex) count += 1;
		if (
			componentIds[(box.y + box.height - 1) * imageWidth + x] === componentIndex
		)
			count += 1;
	}
	for (let y = box.y + 1; y < box.y + box.height - 1; y += 1) {
		if (componentIds[y * imageWidth + box.x] === componentIndex) count += 1;
		if (componentIds[y * imageWidth + box.x + box.width - 1] === componentIndex)
			count += 1;
	}
	return count;
}

function touchesSheetEdge(
	box: Box,
	imageWidth: number,
	imageHeight: number,
): boolean {
	return (
		box.x === 0 ||
		box.y === 0 ||
		box.x + box.width === imageWidth ||
		box.y + box.height === imageHeight
	);
}

function boxesOverlap(a: Box, b: Box): boolean {
	return (
		a.x < b.x + b.width &&
		a.x + a.width > b.x &&
		a.y < b.y + b.height &&
		a.y + a.height > b.y
	);
}

function boxGap(a: Box, b: Box): number {
	const dx = Math.max(
		0,
		Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)),
	);
	const dy = Math.max(
		0,
		Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)),
	);
	return Math.round(Math.sqrt(dx * dx + dy * dy));
}

function readExpectedManifest(filePath: string): ExpectedManifest {
	const parsed = JSON.parse(readFileSync(filePath, "utf8")) as ExpectedManifest;
	if (!Array.isArray(parsed.items))
		throw new Error(`expected manifest must contain items[]: ${filePath}`);
	return parsed;
}

function compareExpected(
	components: Component[],
	expected: ExpectedManifest,
	fallbackTolerancePx: number,
	fallbackMinIou: number,
): SliceCheck[] {
	const checks: SliceCheck[] = [];
	const tolerancePx =
		typeof expected.tolerancePx === "number"
			? expected.tolerancePx
			: fallbackTolerancePx;
	const minIou =
		typeof expected.minIou === "number" ? expected.minIou : fallbackMinIou;
	checks.push({
		name: "expected_manifest_count",
		ok: components.length === expected.items!.length,
		details: { expected: expected.items!.length, actual: components.length },
	});

	for (
		let i = 0;
		i < Math.min(components.length, expected.items!.length);
		i += 1
	) {
		const expectedBox = expected.items![i].box || expected.items![i].bbox;
		if (!expectedBox)
			throw new Error(`expected item ${i + 1} missing box/bbox`);
		const actual = components[i].rawBox;
		const offset = Math.max(
			Math.abs(actual.x - expectedBox.x),
			Math.abs(actual.y - expectedBox.y),
			Math.abs(actual.width - expectedBox.width),
			Math.abs(actual.height - expectedBox.height),
		);
		const iou = intersectionOverUnion(actual, expectedBox);
		checks.push({
			name: `slice_${i + 1}_expected_alignment`,
			ok: offset <= tolerancePx && iou >= minIou,
			details: {
				id: expected.items![i].id || i + 1,
				actual,
				expected: expectedBox,
				offset,
				iou,
				tolerancePx,
				minIou,
			},
		});
	}
	return checks;
}

function intersectionOverUnion(a: Box, b: Box): number {
	const x1 = Math.max(a.x, b.x);
	const y1 = Math.max(a.y, b.y);
	const x2 = Math.min(a.x + a.width, b.x + b.width);
	const y2 = Math.min(a.y + a.height, b.y + b.height);
	const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
	const union = a.width * a.height + b.width * b.height - intersection;
	return union ? intersection / union : 0;
}

function cropComponent(
	image: RgbaImage,
	component: Component,
	componentIds: Int32Array,
): RgbaImage {
	const data = new Uint8Array(
		component.paddedBox.width * component.paddedBox.height * 4,
	);
	for (let y = 0; y < component.paddedBox.height; y += 1) {
		for (let x = 0; x < component.paddedBox.width; x += 1) {
			const sourceX = component.paddedBox.x + x;
			const sourceY = component.paddedBox.y + y;
			const sourceIndex = sourceY * image.width + sourceX;
			if (componentIds[sourceIndex] !== component.index) continue;
			const source = sourceIndex * 4;
			const target = (y * component.paddedBox.width + x) * 4;
			data[target] = image.data[source];
			data[target + 1] = image.data[source + 1];
			data[target + 2] = image.data[source + 2];
			data[target + 3] = image.data[source + 3];
		}
	}
	return {
		width: component.paddedBox.width,
		height: component.paddedBox.height,
		data,
	};
}

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = { input: "", outDir: "" };
	for (let i = 0; i < argv.length; i += 1) {
		const value = argv[i];
		if (value === "--help" || value === "-h") args.help = true;
		else if (value === "--json") args.json = true;
		else if (value === "--out-dir")
			args.outDir = requiredValue(argv, ++i, value);
		else if (value === "--background")
			args.background = requiredValue(argv, ++i, value);
		else if (value === "--padding")
			args.padding = Number(requiredValue(argv, ++i, value));
		else if (value === "--min-area")
			args.minArea = Number(requiredValue(argv, ++i, value));
		else if (value === "--alpha-threshold")
			args.alphaThreshold = Number(requiredValue(argv, ++i, value));
		else if (value === "--background-tolerance")
			args.backgroundTolerance = Number(requiredValue(argv, ++i, value));
		else if (value === "--expect-count")
			args.expectCount = Number(requiredValue(argv, ++i, value));
		else if (value === "--expected")
			args.expectedPath = requiredValue(argv, ++i, value);
		else if (value === "--tolerance-px")
			args.tolerancePx = Number(requiredValue(argv, ++i, value));
		else if (value === "--min-iou")
			args.minIou = Number(requiredValue(argv, ++i, value));
		else if (value === "--min-gap")
			args.minGap = Number(requiredValue(argv, ++i, value));
		else if (value === "--report")
			args.reportPath = requiredValue(argv, ++i, value);
		else if (!args.input) args.input = value;
		else throw new Error(`unexpected argument: ${value}`);
	}
	return args;
}

function requiredValue(argv: string[], index: number, flag: string): string {
	const value = argv[index];
	if (!value || value.startsWith("--"))
		throw new Error(`${flag} requires a value`);
	return value;
}

function printHelp(): void {
	console.log(`Usage: asset_slice.ts <sheet.png> --out-dir <dir> [options]

Deterministically split generated icon/sprite sheets into clean PNG slices.

Options:
  --background <auto|transparent|#rrggbb>  Background removal mode (default: auto)
  --padding <px>                           Transparent padding around each slice (default: 2)
  --min-area <px>                          Ignore tiny connected components (default: 16)
  --alpha-threshold <0-255>                Transparent threshold (default: 8)
  --background-tolerance <distance>        RGB distance from background (default: 24)
  --expect-count <n>                       Fail when detected slice count differs
  --expected <manifest.json>               Expected raw boxes for drift/IoU checks
  --tolerance-px <px>                      Expected box offset tolerance (default: 1)
  --min-iou <0-1>                          Expected box IoU threshold (default: 0.95)
  --min-gap <px>                           Minimum raw gutter between assets (default: 0)
  --report <report.json>                   Report path (default: <out-dir>/asset-slices.json)
  --json                                   Print structured report JSON
`);
}

export function main(argv = process.argv.slice(2)): number {
	try {
		const args = parseArgs(argv);
		if (args.help) {
			printHelp();
			return 0;
		}
		if (!args.input) throw new Error("input PNG is required");
		if (!args.outDir) throw new Error("--out-dir is required");
		if (!existsSync(args.input))
			throw new Error(`input does not exist: ${args.input}`);
		const report = sliceImage(args);
		if (args.json) console.log(JSON.stringify(report, null, 2));
		else printSummary(report);
		return report.ok ? 0 : 1;
	} catch (error) {
		console.error(
			`asset-slicer: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}
}

function printSummary(report: SliceReport): void {
	console.log(
		`${report.ok ? "PASS" : "FAIL"}: ${report.components.length} slice(s) from ${report.input}`,
	);
	for (const component of report.components) {
		console.log(
			`- slice-${String(component.index + 1).padStart(2, "0")}: box=${boxText(component.rawBox)} padded=${boxText(component.paddedBox)} area=${component.area}`,
		);
	}
	for (const check of report.checks.filter((item) => !item.ok)) {
		console.log(`FAIL ${check.name}: ${JSON.stringify(check.details || {})}`);
	}
}

function boxText(box: Box): string {
	return `${box.x},${box.y},${box.width}x${box.height}`;
}

const isMain =
	process.argv[1] &&
	fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) process.exitCode = main();
