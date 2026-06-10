#!/usr/bin/env -S node --experimental-strip-types
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runBootstrap } from "./uiux_bootstrap.ts";
import {
	DEFAULT_EXTERNAL_SKILLS,
	ensureAgentsInstructions,
	hasUiuxSkillInstallState,
	isUiuxSkillAutoInstallAuthorized,
	isUiuxSkillInstallComplete,
	normalizeBooleanEnv,
	uiuxAutoInstallAuthorizationPath,
	uiuxSkillInstallStatePath,
	writeUiuxSkillInstallState,
} from "./uiux_shared.ts";

export type UiuxRoute =
	| "none"
	| "simple-frontend"
	| "uiux-closed-loop";

export type UiuxRouteDecision = {
	route: UiuxRoute;
	complexity: "low" | "medium" | "high";
	reason: string;
	requiredPlugins: string[];
	recommendedStages: string[];
	signals: string[];
};

type HookInput = {
	cwd?: string;
	prompt?: string;
	userPrompt?: string;
	message?: string;
	hookEventName?: string;
	source?: string;
	payload?: Record<string, unknown>;
	[key: string]: unknown;
};

type SessionAutomationResult = {
	cwd: string;
	agentsPath?: string;
	agentsChanged: boolean;
	agentsMode: "auto-created-or-updated" | "already-present" | "disabled-fallback" | "error";
	autoInstallAuthorized: boolean;
	autoInstallAuthPath: string;
	skillStatePath: string;
	skillInstallStatus: "not-authorized" | "already-complete" | "skipped-existing-state" | "attempted" | "failed-before-run";
	skillResults: Array<{
		id: string;
		status: string;
		command?: string;
		exitCode?: number | null;
		stderr?: string;
	}>;
	error?: string;
};

const FULL_UIUX_STAGES = [
	"requirements/product brief",
	"information architecture + user flow",
	"desktop/mobile low-fidelity wireframe",
	"visual direction + design tokens",
	"asset/motion plan",
	"bounded frontend implementation",
	"UI/UX/a11y/responsive verification",
	"zero-open-issue repair loop",
];

const SIMPLE_FRONTEND_STAGES = [
	"inspect existing frontend conventions",
	"bounded AGY/frontend implementation",
	"non-blocking checks",
	"responsive/a11y smoke verification",
];

const FULL_UIUX_PATTERNS: Array<[string, RegExp]> = [
	["explicit-uiux", /ui\/?ux|ux\/?ui|用户体验|体验设计/i],
	["full-page", /\b(?:page|screen|website|site|homepage|landing page|dashboard|portal|web app|app shell)\b|页面|落地页|首页|官网|仪表盘|门户|网站|全页面/i],
	["redesign", /redesign|re[- ]?design|revamp|restyle|rework|改版|重做|重新设计|重构界面|美化|视觉升级/i],
	["planning-needed", /plan|planning|strategy|requirements?|prd|信息架构|规划|需求|产品思维|用户路径|用户旅程|用户流/i],
	["prototype", /prototype|wireframe|low[- ]?fi|low fidelity|mockup|原型|线框|低保真|草图/i],
	["design-system", /design system|tokens?|style guide|component system|设计系统|设计规范|视觉规范|视觉体系/i],
	["quality", /polish|premium|production[- ]?grade|best[- ]in[- ]class|delight|高级感|精致|生产级|质感|好看/i],
	["ugly-complaint", /ugly|bad design|looks bad|ai slop|template|generic|丑|难看|不好看|很丑|模板|没有规划|没规划|AI味/i],
	["brand-product", /brand|marketing|hero|conversion|saas|product page|pricing|品牌|营销|转化|产品页|定价/i],
];

const FRONTEND_PATTERNS: Array<[string, RegExp]> = [
	["frontend", /frontend|front[- ]?end|react|next\.js|vue|svelte|tailwind|css|html|component|layout|responsive|前端|组件|样式|布局|响应式/i],
	["controls", /button|form|nav|sidebar|modal|card|table|按钮|表单|导航|侧边栏|弹窗|卡片|表格/i],
];

const SIMPLE_TWEAK_PATTERNS: Array<[string, RegExp]> = [
	["tiny-change", /\b(?:just|only|small|tiny|quick|minor)\b|只是|只要|小改|微调|仅/i],
	["style-tweak", /change (?:the )?(?:color|copy|text|padding|margin|font size)|颜色|文案|字号|间距|边距/i],
	["bugfix", /fix bug|bug|broken|修复|报错|错误/i],
];

const MOTION_PATTERNS: Array<[string, RegExp]> = [
	["motion", /animation|motion|gsap|scrolltrigger|parallax|transition|动效|动画|滚动动画|视差/i],
];

const ASSET_PATTERNS: Array<[string, RegExp]> = [
	["assets", /image_gen|icon sheet|sprite|icons?|generated assets?|asset slic|图标|切图|素材|图片|视频|视觉资产/i],
];

export function classifyUiuxPrompt(prompt: string): UiuxRouteDecision {
	const text = prompt.trim();
	if (!text) return noneDecision("blank prompt");

	const signals: string[] = [];
	let fullScore = 0;
	let frontendScore = 0;
	let simpleScore = 0;

	for (const [name, pattern] of FULL_UIUX_PATTERNS) {
		if (pattern.test(text)) {
			signals.push(name);
			fullScore += name === "planning-needed" || name === "ugly-complaint" ? 2 : 1;
		}
	}
	for (const [name, pattern] of FRONTEND_PATTERNS) {
		if (pattern.test(text)) {
			signals.push(name);
			frontendScore += 1;
		}
	}
	for (const [name, pattern] of SIMPLE_TWEAK_PATTERNS) {
		if (pattern.test(text)) {
			signals.push(name);
			simpleScore += 1;
		}
	}
	for (const [name, pattern] of MOTION_PATTERNS) {
		if (pattern.test(text)) signals.push(name);
	}
	for (const [name, pattern] of ASSET_PATTERNS) {
		if (pattern.test(text)) signals.push(name);
	}

	const hasMotion = signals.includes("motion");
	const hasAssets = signals.includes("assets");
	const isUiOrFrontend = fullScore > 0 || frontendScore > 0 || hasMotion || hasAssets;
	if (!isUiOrFrontend) return noneDecision("no UI/frontend signal detected");

	const explicitFull = signals.some((signal) =>
		[
			"explicit-uiux",
			"prototype",
			"design-system",
			"planning-needed",
			"ugly-complaint",
			"redesign",
		].includes(signal),
	);
	const fullPage = signals.includes("full-page") || signals.includes("brand-product");
	const boundedFrontendAction =
		/\b(?:add|change|update|adjust|tweak|fix|implement|integrate)\b/i.test(text) ||
		/(?:添加|增加|加入|修改|调整|微调|修复|加上|接入|实现)/i.test(text);
	const shouldUseFullLoop =
		explicitFull ||
		(!boundedFrontendAction &&
			((fullPage && simpleScore === 0) ||
				signals.includes("brand-product") ||
				fullScore >= 2 ||
				(fullScore + frontendScore >= 3 && simpleScore === 0)));

	if (shouldUseFullLoop) {
		const required = ["ui-ux-closed-loop", "task-gate", "agy-frontend"];
		if (hasMotion) required.push("gsap-animation");
		if (hasAssets) required.push("asset-slicer");
		return {
			route: "uiux-closed-loop",
			complexity: fullScore >= 3 || explicitFull ? "high" : "medium",
			reason:
				"Full UI/UX flow is required because the prompt is page-level, ambiguous, redesign/polish-oriented, or planning-dependent.",
			requiredPlugins: dedupe(required),
			recommendedStages: FULL_UIUX_STAGES,
			signals: dedupe(signals),
		};
	}

	const required = ["agy-frontend"];
	if (hasMotion) required.push("gsap-animation");
	if (hasAssets) required.push("asset-slicer");
	return {
		route: "simple-frontend",
		complexity: simpleScore > 0 ? "low" : "medium",
		reason:
			"Frontend/UI signal detected, but scope appears bounded enough for the lightweight frontend path instead of the full UI/UX closed loop.",
		requiredPlugins: dedupe(required),
		recommendedStages: SIMPLE_FRONTEND_STAGES,
		signals: dedupe(signals),
	};
}

function noneDecision(reason: string): UiuxRouteDecision {
	return {
		route: "none",
		complexity: "low",
		reason,
		requiredPlugins: [],
		recommendedStages: [],
		signals: [],
	};
}

function dedupe(values: string[]): string[] {
	return Array.from(new Set(values.filter(Boolean)));
}

function envEnabled(name: string, defaultValue: boolean): boolean {
	const parsed = normalizeBooleanEnv(process.env[name]);
	return parsed === undefined ? defaultValue : parsed;
}

export function findAgentsFile(startCwd: string): string | null {
	let current = path.resolve(startCwd || process.cwd());
	while (true) {
		const candidate = path.join(current, "AGENTS.md");
		if (existsSync(candidate)) return candidate;
		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

export function runSessionAutomation(cwd: string): SessionAutomationResult {
	const resolvedCwd = path.resolve(cwd || process.cwd());
	const autoAgents = envEnabled("CODEX_AUGMENT_AUTO_AGENTS", true) && !envEnabled("CODEX_AUGMENT_DISABLE_AUTO_AGENTS", false);
	const autoInstallAuthorized = isUiuxSkillAutoInstallAuthorized(resolvedCwd);
	const forceSkillInstall = envEnabled("CODEX_AUGMENT_FORCE_INSTALL_UIUX_SKILLS", false);
	const stateExists = hasUiuxSkillInstallState(resolvedCwd);
	const installComplete = isUiuxSkillInstallComplete(resolvedCwd);
	const result: SessionAutomationResult = {
		cwd: resolvedCwd,
		agentsChanged: false,
		agentsMode: "already-present",
		autoInstallAuthorized,
		autoInstallAuthPath: uiuxAutoInstallAuthorizationPath(resolvedCwd),
		skillStatePath: uiuxSkillInstallStatePath(resolvedCwd),
		skillInstallStatus: autoInstallAuthorized
			? installComplete
				? "already-complete"
				: stateExists && !forceSkillInstall
					? "skipped-existing-state"
					: "attempted"
			: "not-authorized",
		skillResults: [],
	};

	try {
		if (autoAgents) {
			const existingAgents = findAgentsFile(resolvedCwd);
			if (existingAgents) {
				result.agentsPath = existingAgents;
				result.agentsChanged = false;
				result.agentsMode = "already-present";
			} else {
				const agents = ensureAgentsInstructions(resolvedCwd, false);
				result.agentsPath = agents.path;
				result.agentsChanged = agents.changed;
				result.agentsMode = "auto-created-or-updated";
			}
		} else {
			result.agentsMode = "disabled-fallback";
		}
	} catch (error) {
		result.agentsMode = "error";
		result.error = `AGENTS.md automation failed: ${(error as Error).message}`;
	}

	if (!autoInstallAuthorized || installComplete || (stateExists && !forceSkillInstall)) {
		return result;
	}

	try {
		const bootstrap = runBootstrap({
			cwd: resolvedCwd,
			dryRun: false,
			installSkills: true,
			ensureAgents: false,
			strictSkills: false,
		});
		result.skillInstallStatus = "attempted";
		result.skillResults = bootstrap.skillResults;
		result.skillStatePath = bootstrap.skillStatePath || result.skillStatePath;
	} catch (error) {
		result.skillInstallStatus = "failed-before-run";
		result.error = `${result.error ? `${result.error}; ` : ""}UI/UX skill auto-install failed: ${(error as Error).message}`;
		writeUiuxSkillInstallState(resolvedCwd, {
			updatedAt: new Date().toISOString(),
			error: result.error,
			skillResults: DEFAULT_EXTERNAL_SKILLS.map((skill) => ({
				id: skill.id,
				status: "failed-before-run",
				command: skill.command,
			})),
		});
	}
	return result;
}

function renderSessionAutomationContext(result: SessionAutomationResult): string {
	const lines = [
		"Codex Augment Dispatcher UI/UX automation ran at SessionStart.",
		`AGENTS.md automation: ${result.agentsMode}${result.agentsPath ? ` (${result.agentsPath})` : ""}${result.agentsChanged ? " [changed]" : ""}.`,
	];
	if (result.agentsMode === "disabled-fallback" || result.agentsMode === "error") {
		lines.push("Fallback UI/UX routing context is active for this session.");
	}
	if (result.autoInstallAuthorized) {
		lines.push(`External UI/UX skill auto-install: ${result.skillInstallStatus}; state=${result.skillStatePath}.`);
		const failures = result.skillResults.filter((entry) => entry.status !== "success" && entry.status !== "skipped");
		if (failures.length) {
			lines.push(`Skill install issues: ${failures.map((entry) => `${entry.id}:${entry.status}`).join(", ")}. Continue with local fallback rules unless the task explicitly requires that external skill.`);
		}
	} else {
		lines.push(`External UI/UX skill auto-install is not authorized. The model does not need the user to run npm manually; to allow automatic external installs, set CODEX_AUGMENT_AUTO_INSTALL_UIUX_SKILLS=1 or run uiux_bootstrap.ts --authorize-auto-install. Marker path: ${result.autoInstallAuthPath}.`);
	}
	if (result.error) lines.push(`Automation warning: ${result.error}`);
	lines.push(
		"User does not need to name skills. Classify UI/frontend requests automatically:",
		"- Full page/redesign/ugly/no-planning/product/wireframe/design-system/high-polish UI => use ui-ux-closed-loop first, then agy-frontend, then verification/repair.",
		"- Tiny visual tweaks => use lightweight agy-frontend path with verification.",
		"- Motion => add gsap-animation. Generated icon/sprite assets => add asset-slicer.",
		"- Do not jump directly to code for full UI/UX routes; produce planning, low-fi wireframes, design tokens, asset/motion plan, implementation, review, and Plugin evidence.",
	);
	return lines.join("\n");
}

export function buildSessionStartContext(input: HookInput): string | null {
	const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
	const always = envEnabled("CODEX_AUGMENT_ALWAYS_INJECT_UIUX", false);
	const hadAgents = Boolean(findAgentsFile(cwd));
	const automation = runSessionAutomation(cwd);
	const notable =
		always ||
		!hadAgents ||
		automation.agentsChanged ||
		automation.agentsMode !== "already-present" ||
		automation.skillInstallStatus === "attempted" ||
		Boolean(automation.error);
	return notable ? renderSessionAutomationContext(automation) : null;
}

function promptFromInput(input: HookInput): string {
	for (const value of [input.prompt, input.userPrompt, input.message, input.payload?.prompt, input.payload?.userPrompt]) {
		if (typeof value === "string" && value.trim()) return value;
	}
	return "";
}

export function buildUserPromptContext(input: HookInput): string | null {
	const prompt = promptFromInput(input);
	const decision = classifyUiuxPrompt(prompt);
	if (decision.route === "none") return null;
	const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
	const authorized = isUiuxSkillAutoInstallAuthorized(cwd);
	const complete = isUiuxSkillInstallComplete(cwd);
	const required = decision.requiredPlugins.join(", ") || "none";
	const stages = decision.recommendedStages.map((stage, index) => `${index + 1}. ${stage}`).join("\n");
	const skillInstallPolicy = authorized
		? complete
			? "External UI/UX skills were previously marked installed; compose them when available."
			: "External UI/UX skill auto-install is authorized; if missing and shell access is available, the owner/model may run uiux_bootstrap.ts automatically before implementation."
		: "External UI/UX skill auto-install is not authorized; use local fallback rules and do not require the user to remember bootstrap commands.";
	if (decision.route === "uiux-closed-loop") {
		return [
			"Codex Augment Dispatcher auto-route: UI/UX closed loop REQUIRED for this prompt.",
			`Reason: ${decision.reason}`,
			`Signals: ${decision.signals.join(", ") || "none"}`,
			`Required plugins: ${required}`,
			skillInstallPolicy,
			"Execution policy:",
			"- Do not ask the user to remember or name skills; invoke the route proactively.",
			"- Do not jump directly to final UI code. Start with product planning and low-fidelity structure.",
			"- Use external design skills when installed: frontend-design, ui-ux-pro-max, Vercel web-design-guidelines, official GSAP skills.",
			"- If an external skill is missing, use local taste/verification rules and recommend authorization without blocking unless the task explicitly requires that external.",
			"Required stages:",
			stages,
			"Final summary must include Plugin evidence naming ui-ux-closed-loop and every helper route used.",
		].join("\n");
	}
	return [
		"Codex Augment Dispatcher auto-route: lightweight frontend path for this bounded UI request.",
		`Reason: ${decision.reason}`,
		`Signals: ${decision.signals.join(", ") || "none"}`,
		`Required plugins: ${required}`,
		skillInstallPolicy,
		"Use agy-frontend for implementation when edits are visual/frontend. Do not start dev servers from AGY. Verify responsive/a11y basics and include Plugin evidence.",
	].join("\n");
}

export function buildHookOutput(event: "SessionStart" | "UserPromptSubmit", additionalContext: string): Record<string, unknown> {
	return {
		continue: true,
		suppressOutput: true,
		hookSpecificOutput: {
			hookEventName: event,
			additionalContext,
		},
	};
}

function readStdin(): string {
	try {
		return readFileSync(0, "utf8");
	} catch {
		return "";
	}
}

function parseHookInput(raw: string): HookInput {
	if (!raw.trim()) return {};
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" ? (parsed as HookInput) : {};
	} catch {
		return {};
	}
}

export function runHook(command: string, input: HookInput): string {
	if (command === "classify") {
		const prompt = promptFromInput(input);
		return JSON.stringify(classifyUiuxPrompt(prompt), null, 2) + "\n";
	}
	if (command === "session-start") {
		const context = buildSessionStartContext(input);
		return context ? JSON.stringify(buildHookOutput("SessionStart", context)) + "\n" : "";
	}
	if (command === "user-prompt-submit") {
		const context = buildUserPromptContext(input);
		return context ? JSON.stringify(buildHookOutput("UserPromptSubmit", context)) + "\n" : "";
	}
	throw new Error("usage: uiux_auto_hook.ts <session-start|user-prompt-submit|classify>");
}

export function main(argv = process.argv.slice(2)): number {
	try {
		const command = argv[0] || "classify";
		const raw = readStdin();
		const input = parseHookInput(raw);
		if (command === "classify" && !promptFromInput(input)) input.prompt = argv.slice(1).join(" ") || raw;
		process.stdout.write(runHook(command, input));
		return 0;
	} catch (error) {
		console.error(`uiux-auto-hook: ${(error as Error).message}`);
		return 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	process.exitCode = main();
}
