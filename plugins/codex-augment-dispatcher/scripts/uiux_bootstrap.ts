#!/usr/bin/env -S node --experimental-strip-types
import type { SpawnSyncReturns } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { spawnCliSync } from "./spawn_util.ts";
import {
	authorizeUiuxSkillAutoInstall,
	commandForPlatform,
	DEFAULT_EXTERNAL_SKILLS,
	ensureAgentsInstructions,
	formatCommand,
	revokeUiuxSkillAutoInstall,
	writeUiuxSkillInstallState,
	type ExternalSkillSpec,
} from "./uiux_shared.ts";

export type BootstrapOptions = {
	cwd: string;
	dryRun: boolean;
	installSkills: boolean;
	ensureAgents: boolean;
	strictSkills: boolean;
	authorizeAutoInstall: boolean;
	revokeAutoInstall: boolean;
	runner?: Runner;
};

export type BootstrapResult = {
	cwd: string;
	agentsPath?: string;
	agentsChanged: boolean;
	skillResults: Array<{
		id: string;
		status: "skipped" | "success" | "failed" | "dry-run";
		command: string;
		exitCode?: number | null;
		stderr?: string;
	}>;
	hookNote: string;
	autoInstallAuthPath?: string;
	autoInstallRevoked?: boolean;
	skillStatePath?: string;
};

type Runner = (
	command: string,
	args: string[],
	options: { cwd: string; env: NodeJS.ProcessEnv },
) => SpawnSyncReturns<string>;

export function runBootstrap(options: Partial<BootstrapOptions> = {}): BootstrapResult {
	const cwd = path.resolve(options.cwd || process.cwd());
	const dryRun = Boolean(options.dryRun);
	const installSkills = options.installSkills ?? true;
	const ensureAgents = options.ensureAgents ?? true;
	const strictSkills = options.strictSkills ?? false;
	const authorizeAutoInstall = options.authorizeAutoInstall ?? false;
	const revokeAutoInstall = options.revokeAutoInstall ?? false;
	const runner = options.runner || defaultRunner;
	const result: BootstrapResult = {
		cwd,
		agentsChanged: false,
		skillResults: [],
		hookNote:
			"Plugin-bundled SessionStart/UserPromptSubmit hooks are declared in hooks/hooks.json. Codex may require hook trust/enablement before they run; AGENTS.md fallback is written by this bootstrap.",
	};

	if (authorizeAutoInstall) {
		result.autoInstallAuthPath = authorizeUiuxSkillAutoInstall(cwd, dryRun);
	}
	if (revokeAutoInstall) {
		result.autoInstallAuthPath = revokeUiuxSkillAutoInstall(cwd, dryRun);
		result.autoInstallRevoked = true;
	}

	if (ensureAgents) {
		const agents = ensureAgentsInstructions(cwd, dryRun);
		result.agentsPath = agents.path;
		result.agentsChanged = agents.changed;
	}

	if (!installSkills) {
		for (const skill of DEFAULT_EXTERNAL_SKILLS) {
			result.skillResults.push({
				id: skill.id,
				status: "skipped",
				command: formatCommand(skill.command, skill.args),
			});
		}
		return result;
	}

	for (const skill of DEFAULT_EXTERNAL_SKILLS) {
		const command = commandForPlatform(skill.command);
		const formatted = formatCommand(skill.command, skill.args);
		if (dryRun) {
			result.skillResults.push({ id: skill.id, status: "dry-run", command: formatted });
			continue;
		}
		const completed = runner(command, skill.args, {
			cwd,
			env: { ...process.env, npm_config_yes: "true" },
		});
		const success = completed.status === 0;
		result.skillResults.push({
			id: skill.id,
			status: success ? "success" : "failed",
			command: formatted,
			exitCode: completed.status,
			stderr: (completed.stderr || "").trim().slice(0, 2000) || undefined,
		});
		if (!success && strictSkills && !skill.optional) {
			throw new Error(`failed to install required external skill ${skill.id}: ${completed.stderr || completed.status}`);
		}
	}

	if (installSkills) {
		result.skillStatePath = writeUiuxSkillInstallState(cwd, {
			updatedAt: new Date().toISOString(),
			dryRun,
			skillResults: result.skillResults,
		}, dryRun);
	}

	return result;
}

function defaultRunner(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }): SpawnSyncReturns<string> {
	return spawnCliSync(command, args, {
		cwd: options.cwd,
		env: options.env,
		encoding: "utf8",
		shell: false,
	}) as SpawnSyncReturns<string>;
}

function parseArgs(argv: string[]): BootstrapOptions {
	let cwd = process.cwd();
	let dryRun = false;
	let installSkills = true;
	let ensureAgents = true;
	let strictSkills = false;
	let authorizeAutoInstall = false;
	let revokeAutoInstall = false;
	for (let i = 0; i < argv.length; i += 1) {
		const item = argv[i];
		if (item === "--cwd") cwd = argv[++i] || cwd;
		else if (item === "--dry-run") dryRun = true;
		else if (item === "--no-install-skills") installSkills = false;
		else if (item === "--install-skills") installSkills = true;
		else if (item === "--no-agents") ensureAgents = false;
		else if (item === "--strict-skills") strictSkills = true;
		else if (item === "--authorize-auto-install") authorizeAutoInstall = true;
		else if (item === "--revoke-auto-install") revokeAutoInstall = true;
		else if (item === "-h" || item === "--help") {
			printHelp();
			process.exit(0);
		} else {
			throw new Error(`unknown option: ${item}`);
		}
	}
	return { cwd, dryRun, installSkills, ensureAgents, strictSkills, authorizeAutoInstall, revokeAutoInstall };
}

function printHelp(): void {
	console.log(`usage: uiux_bootstrap.ts [--cwd DIR] [--dry-run] [--no-install-skills] [--no-agents] [--strict-skills] [--authorize-auto-install] [--revoke-auto-install]\n\nInstalls recommended external UI/UX skills and creates/appends AGENTS.md rules so users can enter plain product/UI requirements while the dispatcher auto-routes the right workflow.\n\nDefault actions:\n  - install frontend-design, Vercel agent-skills, GSAP skills, and optional ui-ux-pro-max via npx skills add\n  - create or append AGENTS.md with UI/UX auto-route rules\n\nCodex plugin manifests do not support arbitrary postinstall scripts, so run this bootstrap once after plugin install or from project setup automation.`);
}

export function main(argv = process.argv.slice(2)): number {
	try {
		const result = runBootstrap(parseArgs(argv));
		console.log(JSON.stringify(result, null, 2));
		const failedRequired = result.skillResults.some((entry) =>
			entry.status === "failed" &&
			DEFAULT_EXTERNAL_SKILLS.some((skill) => skill.id === entry.id && !skill.optional),
		);
		return failedRequired ? 2 : 0;
	} catch (error) {
		console.error(`uiux-bootstrap: ${(error as Error).message}`);
		return 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
}
