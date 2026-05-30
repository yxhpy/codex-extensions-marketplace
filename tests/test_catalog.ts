import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

function readJson(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

test("repo catalog and marketplace install only the merged plugin", () => {
  const catalog = readJson(path.join(REPO_ROOT, "catalog.json"));
  const marketplace = readJson(path.join(REPO_ROOT, ".agents/plugins/marketplace.json"));

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
