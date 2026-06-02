#!/usr/bin/env -S node --experimental-strip-types
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const UPSTREAM_REPOSITORY =
	"https://github.com/yxhpy/reliable-agent-workflow-skill.git";
export const SKILL_NAME = "reliable-agent-workflow";
export const TRACKED_FILES = ["SKILL.md", "agents/openai.yaml"] as const;
export const METADATA_RELATIVE_PATH =
	"upstreams/reliable-agent-workflow.json";

type TrackedFile = {
	path: string;
	sha256: string;
	bytes: number;
};

type UpstreamMetadata = {
	schemaVersion: 1;
	name: string;
	repository: string;
	ref: string;
	commit: string;
	version: string;
	checkedAt: string;
	files: TrackedFile[];
};

type Snapshot = {
	sourceRoot: string;
	skillDir: string;
	metadata: UpstreamMetadata;
};

type CliArgs = {
	command: string;
	source?: string;
	remote: boolean;
	json: boolean;
	pluginRoot: string;
	upstreamUrl: string;
	ref: string;
};

function defaultPluginRoot(): string {
	return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function skillDir(pluginRoot: string): string {
	return path.join(pluginRoot, "skills", SKILL_NAME);
}

function metadataPath(pluginRoot: string): string {
	return path.join(pluginRoot, METADATA_RELATIVE_PATH);
}

function runGit(args: string[], cwd?: string): string {
	const completed = spawnSync("git", args, {
		cwd,
		encoding: "utf8",
	});
	if (completed.error?.code === "ENOENT") {
		throw new Error("git command not found");
	}
	if (completed.status !== 0) {
		throw new Error(
			(completed.stderr || completed.stdout || `git ${args.join(" ")} failed`)
				.trim(),
		);
	}
	return (completed.stdout || "").trim();
}

function sha256(buffer: Buffer | string): string {
	return createHash("sha256").update(buffer).digest("hex");
}

function readJson(filePath: string): Record<string, unknown> {
	return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

function resolveSourceSkillDir(sourceRoot: string): string {
	const direct = path.resolve(sourceRoot);
	if (existsSync(path.join(direct, "SKILL.md"))) return direct;
	const nested = path.join(direct, SKILL_NAME);
	if (existsSync(path.join(nested, "SKILL.md"))) return nested;
	throw new Error(
		`source must contain ${SKILL_NAME}/SKILL.md or SKILL.md: ${sourceRoot}`,
	);
}

function versionFromSource(sourceRoot: string): string {
	const packagePath = path.join(sourceRoot, "package.json");
	if (!existsSync(packagePath)) return "unknown";
	const pkg = readJson(packagePath);
	return typeof pkg.version === "string" ? pkg.version : "unknown";
}

function commitFromSource(sourceRoot: string, sourceSkillDir: string): string {
	try {
		return runGit(["rev-parse", "HEAD"], sourceRoot);
	} catch {
		const hash = createHash("sha256");
		for (const file of TRACKED_FILES) {
			hash.update(file);
			hash.update(readFileSync(path.join(sourceSkillDir, file)));
		}
		return `local-${hash.digest("hex").slice(0, 16)}`;
	}
}

function trackedFiles(sourceSkillDir: string): TrackedFile[] {
	return TRACKED_FILES.map((file) => {
		const absolute = path.join(sourceSkillDir, file);
		if (!existsSync(absolute)) throw new Error(`missing upstream file: ${file}`);
		const content = readFileSync(absolute);
		return {
			path: file,
			sha256: sha256(content),
			bytes: content.length,
		};
	});
}

function snapshotSource({
	sourceRoot,
	upstreamUrl,
	ref,
}: {
	sourceRoot: string;
	upstreamUrl: string;
	ref: string;
}): Snapshot {
	const root = path.resolve(sourceRoot);
	const sourceSkillDir = resolveSourceSkillDir(root);
	const metadata: UpstreamMetadata = {
		schemaVersion: 1,
		name: SKILL_NAME,
		repository: upstreamUrl,
		ref,
		commit: commitFromSource(root, sourceSkillDir),
		version: versionFromSource(root),
		checkedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
		files: trackedFiles(sourceSkillDir),
	};
	return { sourceRoot: root, skillDir: sourceSkillDir, metadata };
}

function cloneRemote({
	upstreamUrl,
	ref,
}: {
	upstreamUrl: string;
	ref: string;
}): string {
	const dir = mkdtempSync(path.join(tmpdir(), "reliable-agent-workflow-sync-"));
	const args = ["clone", "--depth", "1"];
	if (ref && ref !== "HEAD") args.push("--branch", ref);
	args.push(upstreamUrl, dir);
	try {
		runGit(args);
		return dir;
	} catch (error) {
		rmSync(dir, { recursive: true, force: true });
		throw error;
	}
}

function localMetadata(pluginRoot: string): UpstreamMetadata | undefined {
	const filePath = metadataPath(pluginRoot);
	if (!existsSync(filePath)) return undefined;
	return readJson(filePath) as UpstreamMetadata;
}

function compareToLocal(
	pluginRoot: string,
	source: Snapshot,
): { ok: boolean; failures: string[] } {
	const failures: string[] = [];
	const localSkillDir = skillDir(pluginRoot);
	if (!existsSync(path.join(localSkillDir, "SKILL.md"))) {
		failures.push(`missing bundled skill: skills/${SKILL_NAME}/SKILL.md`);
	}
	for (const file of source.metadata.files) {
		const localPath = path.join(localSkillDir, file.path);
		if (!existsSync(localPath)) {
			failures.push(`missing bundled file: ${file.path}`);
			continue;
		}
		const localHash = sha256(readFileSync(localPath));
		if (localHash !== file.sha256) {
			failures.push(`bundled file differs from upstream: ${file.path}`);
		}
	}
	const metadata = localMetadata(pluginRoot);
	if (!metadata) {
		failures.push(`missing upstream metadata: ${METADATA_RELATIVE_PATH}`);
	} else {
		if (metadata.commit !== source.metadata.commit) {
			failures.push(
				`upstream commit mismatch: local=${metadata.commit} upstream=${source.metadata.commit}`,
			);
		}
		if (metadata.version !== source.metadata.version) {
			failures.push(
				`upstream version mismatch: local=${metadata.version} upstream=${source.metadata.version}`,
			);
		}
	}
	return { ok: failures.length === 0, failures };
}

function syncToPlugin(pluginRoot: string, source: Snapshot): void {
	const localSkillDir = skillDir(pluginRoot);
	for (const file of TRACKED_FILES) {
		const from = path.join(source.skillDir, file);
		const to = path.join(localSkillDir, file);
		mkdirSync(path.dirname(to), { recursive: true });
		copyFileSync(from, to);
	}
	const metadataFile = metadataPath(pluginRoot);
	mkdirSync(path.dirname(metadataFile), { recursive: true });
	writeFileSync(
		metadataFile,
		JSON.stringify(source.metadata, null, 2) + "\n",
		"utf8",
	);
}

function resolveSource(args: CliArgs): { snapshot: Snapshot; cleanup?: () => void } {
	if (args.remote) {
		const sourceRoot = cloneRemote({
			upstreamUrl: args.upstreamUrl,
			ref: args.ref,
		});
		return {
			snapshot: snapshotSource({
				sourceRoot,
				upstreamUrl: args.upstreamUrl,
				ref: args.ref,
			}),
			cleanup: () => rmSync(sourceRoot, { recursive: true, force: true }),
		};
	}
	if (!args.source) {
		throw new Error("use --source <repo-or-skill-dir> or --remote");
	}
	return {
		snapshot: snapshotSource({
			sourceRoot: args.source,
			upstreamUrl: args.upstreamUrl,
			ref: args.ref,
		}),
	};
}

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = {
		command: argv[0] || "help",
		remote: false,
		json: false,
		pluginRoot: defaultPluginRoot(),
		upstreamUrl: UPSTREAM_REPOSITORY,
		ref: "main",
	};
	for (let i = 1; i < argv.length; i += 1) {
		const item = argv[i];
		if (item === "--source") args.source = argv[++i];
		else if (item === "--remote") args.remote = true;
		else if (item === "--json") args.json = true;
		else if (item === "--plugin-root") args.pluginRoot = path.resolve(argv[++i]);
		else if (item === "--upstream-url") args.upstreamUrl = argv[++i];
		else if (item === "--ref") args.ref = argv[++i] || "main";
		else if (item === "-h" || item === "--help") args.command = "help";
		else throw new Error(`unexpected argument: ${item}`);
	}
	return args;
}

function printHelp(): void {
	console.log(`usage: sync_reliable_agent_workflow.ts <command> [options]

Commands:
  check --source DIR     Verify bundled reliable-agent-workflow matches source.
  check --remote         Verify bundled skill matches GitHub ${UPSTREAM_REPOSITORY}.
  sync --source DIR      Copy latest skill files and write upstream metadata.
  sync --remote          Clone GitHub latest, sync files, and write metadata.
  metadata               Print current bundled upstream metadata.

Options:
  --plugin-root DIR      Plugin root to check or update.
  --upstream-url URL     Override upstream Git repository.
  --ref REF              Git ref for --remote, default main.
  --json                 Print structured JSON.
`);
}

function emit(payload: unknown, asJson: boolean): void {
	if (asJson) console.log(JSON.stringify(payload, null, 2));
	else console.log(typeof payload === "string" ? payload : JSON.stringify(payload, null, 2));
}

export function main(argv = process.argv.slice(2)): number {
	let cleanup: (() => void) | undefined;
	try {
		const args = parseArgs(argv);
		if (args.command === "help") {
			printHelp();
			return 0;
		}
		if (args.command === "metadata") {
			const metadata = localMetadata(args.pluginRoot);
			if (!metadata) throw new Error(`missing ${METADATA_RELATIVE_PATH}`);
			emit(metadata, args.json);
			return 0;
		}
		if (args.command !== "check" && args.command !== "sync") {
			throw new Error(`unknown command: ${args.command}`);
		}
		const resolved = resolveSource(args);
		cleanup = resolved.cleanup;
		if (args.command === "sync") syncToPlugin(args.pluginRoot, resolved.snapshot);
		const report = compareToLocal(args.pluginRoot, resolved.snapshot);
		const payload = {
			ok: report.ok,
			failures: report.failures,
			upstream: resolved.snapshot.metadata,
			pluginRoot: args.pluginRoot,
		};
		if (args.json) emit(payload, true);
		else {
			console.log(report.ok ? "reliable-agent-workflow sync check passed" : "reliable-agent-workflow sync check failed");
			for (const failure of report.failures) console.log(`- ${failure}`);
		}
		return report.ok ? 0 : 1;
	} catch (error) {
		console.error(
			`reliable-agent-workflow-sync: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	} finally {
		cleanup?.();
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
}
