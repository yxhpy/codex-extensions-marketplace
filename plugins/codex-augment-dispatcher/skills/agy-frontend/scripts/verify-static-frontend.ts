#!/usr/bin/env -S node --experimental-strip-types
import { spawnSync } from "node:child_process";
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEXT_EXTS = new Set([".html", ".css", ".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".svg"]);
const VIDEO_EXTS = new Set([".mp4", ".webm", ".mov", ".m4v", ".ogv"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".playwright-cli"]);

let failures = 0;
let server: ReturnType<typeof createServer> | null = null;

function say(message: string): void {
  console.log(message);
}

function fail(message: string): void {
  failures += 1;
  console.error(`FAIL: ${message}`);
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        out.push(path.join(dir, entry.name));
      }
    }
  }
  walk(root);
  return out;
}

function textFiles(root: string): string[] {
  return walkFiles(root).filter((file) => TEXT_EXTS.has(path.extname(file).toLowerCase()));
}

function scanText(root: string, pattern: RegExp, failureMessage: string, passMessage: string): void {
  const hits: string[] = [];
  for (const file of textFiles(root)) {
    const text = readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (pattern.test(line)) hits.push(`${path.relative(root, file)}:${index + 1}:${line}`);
      pattern.lastIndex = 0;
    });
  }
  if (hits.length) {
    hits.forEach((hit) => say(hit));
    fail(failureMessage);
  } else {
    say(`PASS: ${passMessage}`);
  }
}

function checkJavaScript(root: string): void {
  for (const file of walkFiles(root).filter((item) => path.extname(item) === ".js")) {
    const completed = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (completed.status !== 0) fail(`JavaScript syntax failed: ${file}`);
  }
  say("PASS: JavaScript parse check completed");
}

function parseNonnegativeInt(name: string): number {
  const raw = process.env[name] || "0";
  if (!/^\d+$/.test(raw)) {
    fail("asset minimums must be numeric");
    return 0;
  }
  return Number(raw);
}

function checkMediaAssets(root: string, minImages: number, minVideos: number, minMedia: number): void {
  if (minImages === 0 && minVideos === 0 && minMedia === 0) return;
  const patterns = [
    /(?:src|href|poster)\s*=\s*["']([^"']+\.(?:png|jpe?g|webp|avif|gif|svg|mp4|webm|mov|m4v|ogv))(?:[#?][^"']*)?["']/gi,
    /url\(\s*["']?([^"')]+\.(?:png|jpe?g|webp|avif|gif|svg|mp4|webm|mov|m4v|ogv))(?:[#?][^"')]+)?["']?\s*\)/gi,
  ];
  const seen = new Map<string, "image" | "video">();
  for (const file of textFiles(root)) {
    const text = readFileSync(file, "utf8");
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const ref = match[1];
        if (!ref || /^(https?:|data:|#)/.test(ref)) continue;
        const cleanRef = ref.split("?")[0].split("#")[0];
        const absolute = ref.startsWith("/")
          ? path.resolve(root, ref.slice(1))
          : path.resolve(path.dirname(file), cleanRef);
        if (!absolute.startsWith(root)) continue;
        const ext = path.extname(cleanRef).toLowerCase();
        seen.set(absolute, VIDEO_EXTS.has(ext) ? "video" : "image");
      }
    }
  }

  const existingImages: string[] = [];
  const existingVideos: string[] = [];
  const missing: string[] = [];
  const emptyVideos: string[] = [];
  for (const [file, mediaType] of seen) {
    if (!existsSync(file)) {
      missing.push(file);
      continue;
    }
    if (mediaType === "video") {
      if (statSync(file).size <= 0) emptyVideos.push(file);
      else existingVideos.push(file);
    } else {
      existingImages.push(file);
    }
  }

  say(`local image assets referenced: ${existingImages.length}`);
  for (const file of existingImages.sort()) say(`  image ok: ${path.relative(root, file)}`);
  say(`local video assets referenced: ${existingVideos.length}`);
  for (const file of existingVideos.sort()) say(`  video ok: ${path.relative(root, file)}`);
  for (const file of missing.sort()) say(`  missing: ${file}`);
  for (const file of emptyVideos.sort()) say(`  empty video: ${path.relative(root, file)}`);

  if (missing.length || emptyVideos.length) fail(`local media asset check failed for ASSET_MIN_IMAGES=${minImages} ASSET_MIN_VIDEOS=${minVideos} ASSET_MIN_MEDIA=${minMedia}`);
  if (existingImages.length < minImages) fail(`expected at least ${minImages} image asset(s)`);
  if (existingVideos.length < minVideos) fail(`expected at least ${minVideos} video asset(s)`);
  if (existingImages.length + existingVideos.length < minMedia) fail(`expected at least ${minMedia} total media asset(s)`);
  if (!missing.length && !emptyVideos.length && existingImages.length >= minImages && existingVideos.length >= minVideos && existingImages.length + existingVideos.length >= minMedia) {
    say(`PASS: local media asset counts meet ASSET_MIN_IMAGES=${minImages} ASSET_MIN_VIDEOS=${minVideos} ASSET_MIN_MEDIA=${minMedia}`);
  }
}

async function startServer(root: string): Promise<string> {
  server = createServer((req, res) => {
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
    const file = path.resolve(root, pathname.slice(1));
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200);
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to bind local server");
  return `http://127.0.0.1:${address.port}/index.html`;
}

async function httpCheck(url: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (response.ok) say(`PASS: served ${url}`);
    else fail(`failed to serve ${url}`);
  } catch {
    fail(`failed to serve ${url}`);
  }
}

function runBrowserChecks(url: string): void {
  const pwcli = process.env.PWCLI || "";
  if (process.env.VERIFY_BROWSER === "0" || !existsSync(pwcli)) {
    say("WARN: Playwright browser verification skipped");
    return;
  }
  const session = `asv${process.pid}`;
  const open = spawnSync(pwcli, [`-s=${session}`, "open", url], { encoding: "utf8" });
  if (open.status !== 0) {
    process.stdout.write(open.stdout || "");
    process.stderr.write(open.stderr || "");
    fail("Playwright browser open failed");
    return;
  }
  const consoleCheck = spawnSync(pwcli, [`-s=${session}`, "console", "error"], { encoding: "utf8" });
  if (/Errors: 0/.test(consoleCheck.stdout || "")) say("PASS: browser console has no errors");
  else {
    process.stdout.write(consoleCheck.stdout || "");
    fail("browser console errors found");
  }
  const overflow = spawnSync(
    pwcli,
    [
      `-s=${session}`,
      "eval",
      "() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, title: document.title })",
    ],
    { encoding: "utf8" },
  );
  if (/"overflow": false/.test(overflow.stdout || "")) say("PASS: no horizontal overflow at default viewport");
  else {
    process.stdout.write(overflow.stdout || "");
    fail("horizontal overflow detected or overflow check failed");
  }
  spawnSync(pwcli, [`-s=${session}`, "close"], { encoding: "utf8" });
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const root = path.resolve(argv[0] || process.cwd());
  let url = argv[1] || "";

  say("== static frontend verify ==");
  say(`root: ${root}`);

  scanText(root, /(https?:\/\/|@import|fonts\.google|cdn\.)/g, "unexpected external URL/import text found", "no external URL/import text found");
  scanText(root, /(TODO|FIXME|PLACEHOLDER|Lorem ipsum|rest of code|implement here|for brevity|continue pattern)/g, "placeholder or unfinished marker found", "no placeholder markers found");
  checkJavaScript(root);
  checkMediaAssets(root, parseNonnegativeInt("ASSET_MIN_IMAGES"), parseNonnegativeInt("ASSET_MIN_VIDEOS"), parseNonnegativeInt("ASSET_MIN_MEDIA"));

  if (!url) url = await startServer(root);
  await httpCheck(url);
  runBrowserChecks(url);

  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  if (failures > 0) {
    say(`RESULT: ${failures} failure(s)`);
    return 1;
  }
  say("RESULT: pass");
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
