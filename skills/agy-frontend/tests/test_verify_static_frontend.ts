import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const SKILL_ROOT = path.resolve(import.meta.dirname, "..");
const VERIFY_SCRIPT = path.join(SKILL_ROOT, "scripts/verify-static-frontend.ts");

function runVerify(siteRoot: string, envOverrides: Record<string, string> = {}) {
  return spawnSync(process.execPath, ["--experimental-strip-types", VERIFY_SCRIPT, siteRoot], {
    encoding: "utf8",
    env: {
      ...process.env,
      VERIFY_BROWSER: "0",
      ...envOverrides,
    },
  });
}

test("video minimum fails when referenced video is missing", () => {
  const site = mkdtempSync(path.join(tmpdir(), "agy-missing-video-"));
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

test("video minimum passes when referenced video exists", () => {
  const site = mkdtempSync(path.join(tmpdir(), "agy-existing-video-"));
  const media = path.join(site, "media");
  mkdirSync(media);
  writeFileSync(path.join(media, "hero-loop.mp4"), "not-empty-video-placeholder");
  writeFileSync(
    path.join(site, "index.html"),
    '<!doctype html><title>Video check</title><video src="media/hero-loop.mp4"></video>',
    "utf8",
  );

  const result = runVerify(site, { ASSET_MIN_VIDEOS: "1" });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /local video assets referenced: 1/);
});
