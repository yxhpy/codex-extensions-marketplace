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
  const marketplace = readJson(path.join(REPO_ROOT, ".agents/plugins/marketplace.json"));

  assert.equal(pkg.version, "0.1.8");
  assert.ok(pkg.keywords.includes("pi-package"));
  assert.deepEqual(pkg.pi.skills, ["./plugins/codex-augment-dispatcher/skills"]);

  assert.deepEqual(
    catalog.plugins.map((plugin: { name: string }) => plugin.name),
    ["codex-augment-dispatcher"],
  );
  assert.equal(catalog.skills.length, 0);
  assert.deepEqual(
    marketplace.plugins.map((plugin: { name: string }) => plugin.name),
    ["codex-augment-dispatcher"],
  );
  assert.equal(marketplace.plugins[0].source.path, "./plugins/codex-augment-dispatcher");
});

test("install docs include recommended AGENTS.md proactive trigger rules", () => {
  const readme = readFileSync(path.join(REPO_ROOT, "README.md"), "utf8");
  const agents = readFileSync(path.join(REPO_ROOT, "AGENTS.md"), "utf8");

  assert.match(readme, /Recommended project instructions/);
  assert.match(readme, /Install in Pi/);
  assert.match(readme, /pi install git:github\.com\/yxhpy\/codex-extensions-marketplace@main/);
  assert.match(readme, /Mandatory gated execution/);
  assert.match(readme, /Plugin evidence/);
  assert.match(readme, /AGENTS\.md/);
  assert.match(readme, /proactively choose/);
  assert.match(agents, /Plugin Trigger Rules/);
  assert.match(agents, /Use plugins proactively/);
  assert.match(agents, /`task-gate`: broad/);
  assert.match(agents, /`grok-augment`: current research/);
  assert.match(agents, /`agy-frontend`: frontend build/);
  assert.match(agents, /Codex Thread Fanout/);
  assert.match(agents, /`research`: read-only context gathering/);
  assert.match(agents, /`review`: independent risk review/);
  assert.match(agents, /Do not let multiple threads write the same working tree/);
  assert.match(agents, /Extending to More CLIs/);
});

test("install docs describe background thread owner and verification boundaries", () => {
  const readme = readFileSync(path.join(REPO_ROOT, "README.md"), "utf8");
  const changelog = readFileSync(path.join(REPO_ROOT, "CHANGELOG.md"), "utf8");

  assert.match(readme, /Codex Background Threads/);
  assert.match(readme, /one owner\s+thread keeps responsibility for edits, tests, release gates, and final claims/);
  assert.match(readme, /Research thread: read-only context gathering/);
  assert.match(readme, /Review thread: release, regression, or security risk review/);
  assert.match(readme, /Never run parallel writers against the same working tree/);
  assert.match(changelog, /0\.1\.8 - 2026-06-01/);
  assert.match(changelog, /isolated Codex\/Pi CLI E2E coverage/);
  assert.match(changelog, /0\.1\.5 - 2026-05-30/);
  assert.match(changelog, /maximum of three entries/);
  assert.match(changelog, /0\.1\.4 - 2026-05-30/);
  assert.match(changelog, /128-character limit/);
  assert.match(changelog, /0\.1\.3 - 2026-05-30/);
  assert.match(changelog, /background thread fanout guidance/);
});
