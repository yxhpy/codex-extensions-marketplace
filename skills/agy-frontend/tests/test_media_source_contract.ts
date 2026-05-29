import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const SKILL_ROOT = path.resolve(import.meta.dirname, "..");

test("skill declares strict media generators without fallback", () => {
  const text = readFileSync(path.join(SKILL_ROOT, "SKILL.md"), "utf8");
  for (const phrase of [
    "Images MUST be generated with image_gen.",
    "Videos MUST be generated with Grok Video.",
    "No fallback media generation is allowed.",
    "Resource counts are unbounded.",
  ]) {
    assert.match(text, new RegExp(escapeRegExp(phrase)));
  }
});

test("asset pack has no resource count ceiling", () => {
  const text = readFileSync(path.join(SKILL_ROOT, "references/asset-pack.md"), "utf8");
  assert.match(text, /Resource counts are unbounded\./);
  assert.match(text, /Do not put numeric caps, quotas, or fixed asset counts/);
  for (const phrase of [
    "2-5 images",
    "4-8 images",
    "3-6 media assets",
    "6-10 media assets",
    "start with at least",
    "at least 1 image",
    "at least 3 media",
    "at least 6 media",
  ]) {
    assert.doesNotMatch(text, new RegExp(escapeRegExp(phrase)));
  }
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
