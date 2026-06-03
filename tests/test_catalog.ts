import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

function readJson(filePath: string) {
	return JSON.parse(readFileSync(filePath, "utf8"));
}

test("repo catalog and marketplace install only the merged plugin", () => {
	const pkg = readJson(path.join(REPO_ROOT, "package.json"));
	const catalog = readJson(path.join(REPO_ROOT, "catalog.json"));
	const marketplace = readJson(
		path.join(REPO_ROOT, ".agents/plugins/marketplace.json"),
	);

	assert.equal(pkg.version, "0.1.20");
	assert.ok(pkg.keywords.includes("pi-package"));
	assert.ok(
		pkg.dependencies["@types/node"],
		"Pi production installs must include Node type declarations",
	);
	assert.deepEqual(pkg.pi.skills, [
		"./plugins/codex-augment-dispatcher/skills",
	]);
	assert.deepEqual(pkg.pi.extensions, [
		"./extensions/codex-image-gen/index.ts",
		"./extensions/xai-grok/index.ts",
	]);

	assert.deepEqual(
		catalog.plugins.map((plugin: { name: string }) => plugin.name),
		["codex-augment-dispatcher"],
	);
	assert.equal(catalog.skills.length, 0);
	assert.deepEqual(
		marketplace.plugins.map((plugin: { name: string }) => plugin.name),
		["codex-augment-dispatcher"],
	);
	assert.equal(
		marketplace.plugins[0].source.path,
		"./plugins/codex-augment-dispatcher",
	);
});

test("install docs include recommended AGENTS.md proactive trigger rules", () => {
	const readme = readFileSync(path.join(REPO_ROOT, "README.md"), "utf8");
	const agents = readFileSync(path.join(REPO_ROOT, "AGENTS.md"), "utf8");

	assert.match(readme, /Recommended project instructions/);
	assert.match(readme, /Install in Pi/);
	assert.match(
		readme,
		/pi install git:github\.com\/yxhpy\/codex-extensions-marketplace@main/,
	);
	assert.match(readme, /Mandatory gated execution/);
	assert.match(readme, /Plugin evidence/);
	assert.match(readme, /codex_generate_image/);
	assert.match(readme, /Codex image generation in Pi/);
	assert.match(readme, /xai_grok_x_search/);
	assert.match(readme, /xAI\/Grok X Search and video in Pi/);
	assert.match(readme, /dynamic-workflow/);
	assert.match(readme, /reliable-agent-workflow/);
	assert.match(readme, /Pi, Codex, Claude Code, Grok/);
	assert.match(readme, /sync_reliable_agent_workflow\.ts/);
	assert.match(readme, /release:check/);
	assert.match(readme, /dynamic_workflow\.ts/);
	assert.match(readme, /asset-slicer/);
	assert.match(readme, /ui-ux-closed-loop/);
	assert.match(readme, /asset_slice\.ts/);
	assert.match(readme, /SVG and emoji are prohibited/);
	assert.match(readme, /high-quality image_gen\/Grok Video/);
	assert.match(readme, /subagent fanout/);
	assert.match(readme, /AGENTS\.md/);
	assert.match(readme, /proactively choose/);
	assert.match(agents, /Plugin Trigger Rules/);
	assert.match(agents, /Use plugins proactively/);
	assert.match(agents, /`reliable-agent-workflow`: complex coding/);
	assert.match(agents, /Pi, Codex, Claude Code, Grok/);
	assert.match(agents, /`dynamic-workflow`: broad multi-track/);
	assert.match(agents, /background threads/);
	assert.match(agents, /SVG and emoji are prohibited/);
	assert.match(agents, /`task-gate`: broad/);
	assert.match(agents, /`grok-augment`: current research/);
	assert.match(agents, /`agy-frontend`: frontend build/);
	assert.match(agents, /`asset-slicer`: generated icon sheets/);
	assert.match(agents, /`ui-ux-closed-loop`/);
	assert.match(agents, /Agent Thread And Subagent Fanout/);
	assert.match(agents, /`workflow`: create or update/);
	assert.match(agents, /`research`: read-only context gathering/);
	assert.match(agents, /`review`: independent risk review/);
	assert.match(
		agents,
		/Do not let multiple threads write the same working tree/,
	);
	assert.match(agents, /Extending to More CLIs/);
});

test("install docs describe background thread owner and verification boundaries", () => {
	const readme = readFileSync(path.join(REPO_ROOT, "README.md"), "utf8");
	const changelog = readFileSync(path.join(REPO_ROOT, "CHANGELOG.md"), "utf8");

	assert.match(readme, /Agent Threads And Subagents/);
	assert.match(
		readme,
		/one owner\s+thread keeps responsibility for edits, tests,\s+release gates,\s+integration, and final claims/,
	);
	assert.match(readme, /Research thread: read-only context gathering/);
	assert.match(
		readme,
		/Review thread: release, regression, or security risk review/,
	);
	assert.match(
		readme,
		/Never run parallel writers against the same working tree/,
	);
	assert.match(changelog, /0\.1\.19 - 2026-06-03/);
	assert.match(changelog, /UI\/UX closed loop/);
	assert.match(changelog, /external skill references/);
	assert.match(changelog, /0\.1\.18 - 2026-06-03/);
	assert.match(changelog, /SkillOpt/);
	assert.match(changelog, /dispatcher MCP stdio surface/);
	assert.match(changelog, /0\.1\.16 - 2026-06-01/);
	assert.match(changelog, /0\.1\.17 - 2026-06-02/);
	assert.match(changelog, /reliable-agent-workflow-skill/);
	assert.match(changelog, /0\.3\.1/);
	assert.match(changelog, /1080p.*not available/);
	assert.match(changelog, /0\.1\.15 - 2026-06-01/);
	assert.match(changelog, /SVG\/emoji prohibition/);
	assert.match(changelog, /subagent trigger/);
	assert.match(changelog, /0\.1\.14 - 2026-06-01/);
	assert.match(changelog, /dynamic-workflow/);
	assert.match(changelog, /Codex and Pi E2E/);
	assert.match(changelog, /0\.1\.11 - 2026-06-01/);
	assert.match(changelog, /xai_grok_video_generate/);
	assert.match(changelog, /0\.1\.10 - 2026-06-01/);
	assert.match(changelog, /codex_generate_image/);
	assert.match(changelog, /0\.1\.9 - 2026-06-01/);
	assert.match(changelog, /production dependencies/);
	assert.match(changelog, /0\.1\.8 - 2026-06-01/);
	assert.match(changelog, /isolated Codex\/Pi CLI E2E coverage/);
	assert.match(changelog, /0\.1\.5 - 2026-05-30/);
	assert.match(changelog, /maximum of three entries/);
	assert.match(changelog, /0\.1\.4 - 2026-05-30/);
	assert.match(changelog, /128-character limit/);
	assert.match(changelog, /0\.1\.3 - 2026-05-30/);
	assert.match(changelog, /background thread fanout guidance/);
});

test("cross-harness example agents referenced by launcher are shipped", () => {
	for (const relative of [
		"docs/examples/codex-agents/researcher.toml",
		"docs/examples/codex-agents/reviewer.toml",
		"docs/examples/codex-agents/implementer.toml",
		"docs/examples/codex-agents/verifier.toml",
		"docs/examples/claude-agents/reliable-researcher.md",
		"docs/examples/claude-agents/reliable-reviewer.md",
		"docs/examples/claude-agents/reliable-implementer.md",
		"docs/examples/claude-agents/reliable-verifier.md",
	]) {
		const contents = readFileSync(path.join(REPO_ROOT, relative), "utf8");
		assert.ok(contents.trim(), `empty example agent: ${relative}`);
	}
});
