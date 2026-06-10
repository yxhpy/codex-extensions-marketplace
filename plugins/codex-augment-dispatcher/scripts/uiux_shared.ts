import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";

export type ExternalSkillSpec = {
	id: string;
	description: string;
	command: string;
	args: string[];
	optional: boolean;
};

export const AGENTS_MARKER_START = "<!-- codex-augment-dispatcher-uiux:start -->";
export const AGENTS_MARKER_END = "<!-- codex-augment-dispatcher-uiux:end -->";

export const UIUX_AUTO_INSTALL_AUTH_RELATIVE_PATH = path.join(".codex", "codex-augment-uiux-auto-install.ok");
export const UIUX_SKILL_INSTALL_STATE_RELATIVE_PATH = path.join(".codex", "codex-augment-uiux-skills.json");

export const UIUX_AUTOMATION_SNIPPET = [
	AGENTS_MARKER_START,
	"## Codex Augment Dispatcher UI/UX Auto Route",
	"",
	"For any user request involving a page, landing page, dashboard, web app screen,",
	"frontend redesign, visual polish, UI/UX, layout, styling, animation, generated",
	"assets, or complaints like \"ugly\" / \"no planning\" / \"页面很丑\" / \"没有规划\":",
	"",
	"1. First classify complexity; do not require the user to name any skill.",
	"2. Use `ui-ux-closed-loop` automatically for full-page, redesign, product-facing,",
	"   ambiguous, high-polish, or planning-needed UI work.",
	"3. For full UI/UX work, do not jump directly to code. Produce product brief,",
	"   information architecture, desktop/mobile low-fi wireframes, design direction,",
	"   design tokens, asset/motion plan, implementation plan, and verification gates.",
	"4. Use `agy-frontend` for frontend implementation; AGY must not start dev servers.",
	"5. Use `gsap-animation` for non-trivial motion and `asset-slicer` for generated",
	"   icon/sprite sheets. SVG and emoji are not default visual assets.",
	"6. Use external skills when installed: `frontend-design`, `ui-ux-pro-max`,",
	"   Vercel `web-design-guidelines`, and official GSAP skills. If missing, fall",
	"   back to local rules. To opt into automatic external installs, set",
	"   `CODEX_AUGMENT_AUTO_INSTALL_UIUX_SKILLS=1` or run the bootstrap script.",
	"7. For tiny visual tweaks, use the lightweight `agy-frontend` path without the",
	"   full closed loop, but still verify the change.",
	"8. Final summaries for routed work must include `Plugin evidence:` lines naming",
	"   the helper route(s), artifacts, commands, or hook context used.",
	AGENTS_MARKER_END,
	"",
].join("\n");

export const DEFAULT_EXTERNAL_SKILLS: ExternalSkillSpec[] = [
	{
		id: "frontend-design",
		description: "Bold non-generic frontend aesthetics and critique.",
		command: "npx",
		args: ["skills", "add", "https://github.com/anthropics/skills", "--skill", "frontend-design"],
		optional: false,
	},
	{
		id: "vercel-agent-skills",
		description: "Vercel web design, React, composition, a11y/perf guidelines.",
		command: "npx",
		args: ["skills", "add", "https://github.com/vercel-labs/agent-skills"],
		optional: false,
	},
	{
		id: "gsap-skills",
		description: "Official GSAP/ScrollTrigger/framework animation guidance.",
		command: "npx",
		args: ["skills", "add", "https://github.com/greensock/gsap-skills"],
		optional: false,
	},
	{
		id: "ui-ux-pro-max",
		description: "Design-system, palette, typography, and UX guideline database.",
		command: "npx",
		args: ["skills", "add", "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill", "--skill", "ui-ux-pro-max"],
		optional: true,
	},
];

export function ensureAgentsInstructions(cwd: string, dryRun = false): { path: string; changed: boolean } {
	const agentsPath = path.resolve(cwd, "AGENTS.md");
	if (!existsSync(agentsPath)) {
		if (!dryRun) {
			writeFileSync(
				agentsPath,
				`# AGENTS.md\n\nThis file was created by codex-augment-dispatcher so UI/UX routing works even in projects that did not have project instructions yet.\n\n${UIUX_AUTOMATION_SNIPPET}`,
				"utf8",
			);
		}
		return { path: agentsPath, changed: true };
	}
	const existing = readFileSync(agentsPath, "utf8");
	if (existing.includes(AGENTS_MARKER_START)) {
		return { path: agentsPath, changed: false };
	}
	if (!dryRun) {
		const separator = existing.endsWith("\n") ? "\n" : "\n\n";
		writeFileSync(agentsPath, `${existing}${separator}${UIUX_AUTOMATION_SNIPPET}`, "utf8");
	}
	return { path: agentsPath, changed: true };
}

export function commandForPlatform(command: string): string {
	if (process.platform === "win32" && command === "npx") return "npx.cmd";
	return command;
}

export function formatCommand(command: string, args: string[]): string {
	return [command, ...args].map(shellQuote).join(" ");
}

function shellQuote(value: string): string {
	return /[\s"']/.test(value) ? JSON.stringify(value) : value;
}


export function uiuxAutoInstallAuthorizationPath(cwd: string): string {
	return path.resolve(cwd, UIUX_AUTO_INSTALL_AUTH_RELATIVE_PATH);
}

export function uiuxSkillInstallStatePath(cwd: string): string {
	return path.resolve(cwd, UIUX_SKILL_INSTALL_STATE_RELATIVE_PATH);
}

export function isUiuxSkillAutoInstallAuthorized(cwd: string, env: NodeJS.ProcessEnv = process.env): boolean {
	const explicit = normalizeBooleanEnv(env.CODEX_AUGMENT_AUTO_INSTALL_UIUX_SKILLS);
	if (explicit !== undefined) return explicit;
	return existsSync(uiuxAutoInstallAuthorizationPath(cwd));
}

export function hasUiuxSkillInstallState(cwd: string): boolean {
	return existsSync(uiuxSkillInstallStatePath(cwd));
}


export function readUiuxSkillInstallState(cwd: string): Record<string, unknown> | null {
	const statePath = uiuxSkillInstallStatePath(cwd);
	try {
		const parsed = JSON.parse(readFileSync(statePath, "utf8"));
		return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

export function isUiuxSkillInstallComplete(cwd: string): boolean {
	const state = readUiuxSkillInstallState(cwd);
	if (!state) return false;
	const results = Array.isArray(state.skillResults) ? state.skillResults : [];
	return DEFAULT_EXTERNAL_SKILLS
		.filter((skill) => !skill.optional)
		.every((skill) =>
			results.some((entry) =>
				entry &&
				typeof entry === "object" &&
				(entry as Record<string, unknown>).id === skill.id &&
				(entry as Record<string, unknown>).status === "success",
			),
		);
}

export function authorizeUiuxSkillAutoInstall(cwd: string, dryRun = false): string {
	const marker = uiuxAutoInstallAuthorizationPath(cwd);
	if (!dryRun) {
		mkdirSync(path.dirname(marker), { recursive: true });
		writeFileSync(
			marker,
			[
				"Codex Augment Dispatcher UI/UX external skill auto-install is authorized for this workspace.",
				"Remove this file or set CODEX_AUGMENT_AUTO_INSTALL_UIUX_SKILLS=0 to disable.",
				"",
			].join("\n"),
			"utf8",
		);
	}
	return marker;
}

export function revokeUiuxSkillAutoInstall(cwd: string, dryRun = false): string {
	const marker = uiuxAutoInstallAuthorizationPath(cwd);
	if (!dryRun) rmSync(marker, { force: true });
	return marker;
}

export function writeUiuxSkillInstallState(
	cwd: string,
	payload: Record<string, unknown>,
	dryRun = false,
): string {
	const statePath = uiuxSkillInstallStatePath(cwd);
	if (!dryRun) {
		mkdirSync(path.dirname(statePath), { recursive: true });
		writeFileSync(statePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	}
	return statePath;
}

export function normalizeBooleanEnv(value: string | undefined): boolean | undefined {
	if (value === undefined) return undefined;
	const normalized = value.trim().toLowerCase();
	if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
	if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
	return undefined;
}
