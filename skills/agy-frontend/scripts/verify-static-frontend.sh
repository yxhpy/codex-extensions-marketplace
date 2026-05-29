#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$PWD}"
URL="${2:-}"
ROOT="$(cd "$ROOT" && pwd)"

failures=0
server_pid=""

say() {
  printf '%s\n' "$*"
}

fail() {
  failures=$((failures + 1))
  printf 'FAIL: %s\n' "$*" >&2
}

cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

say "== static frontend verify =="
say "root: $ROOT"

if command -v rg >/dev/null 2>&1; then
  if rg -n --glob '*.html' --glob '*.css' --glob '*.js' --glob '*.jsx' --glob '*.ts' --glob '*.tsx' --glob '*.vue' --glob '*.svelte' \
    --glob '!node_modules/**' --glob '!dist/**' --glob '!build/**' --glob '!.git/**' --glob '!.playwright-cli/**' \
    '(https?://|@import|fonts\.google|cdn\.)' "$ROOT"; then
    fail "unexpected external URL/import text found"
  else
    say "PASS: no external URL/import text found"
  fi

  if rg -n --glob '*.html' --glob '*.css' --glob '*.js' --glob '*.jsx' --glob '*.ts' --glob '*.tsx' --glob '*.vue' --glob '*.svelte' \
    --glob '!node_modules/**' --glob '!dist/**' --glob '!build/**' --glob '!.git/**' --glob '!.playwright-cli/**' \
    '(TODO|FIXME|PLACEHOLDER|Lorem ipsum|rest of code|implement here|for brevity|continue pattern)' "$ROOT"; then
    fail "placeholder or unfinished marker found"
  else
    say "PASS: no placeholder markers found"
  fi
else
  say "WARN: rg not found; skipping text scans"
fi

if command -v node >/dev/null 2>&1; then
  while IFS= read -r -d '' file; do
    node --check "$file" >/dev/null || fail "JavaScript syntax failed: $file"
  done < <(find "$ROOT" -type f -name '*.js' \
    -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/.playwright-cli/*' -print0)
  say "PASS: JavaScript parse check completed"
else
  say "WARN: node not found; skipping JavaScript parse check"
fi

asset_min_images="${ASSET_MIN_IMAGES:-0}"
asset_min_videos="${ASSET_MIN_VIDEOS:-0}"
asset_min_media="${ASSET_MIN_MEDIA:-0}"
for asset_min_value in "$asset_min_images" "$asset_min_videos" "$asset_min_media"; do
  if [[ ! "$asset_min_value" =~ ^[0-9]+$ ]]; then
    fail "asset minimums must be numeric"
  fi
done
if [[ "$asset_min_images" =~ ^[0-9]+$ && "$asset_min_videos" =~ ^[0-9]+$ && "$asset_min_media" =~ ^[0-9]+$ ]] &&
  (( asset_min_images > 0 || asset_min_videos > 0 || asset_min_media > 0 )); then
  if command -v python3 >/dev/null 2>&1; then
    if python3 - "$ROOT" "$asset_min_images" "$asset_min_videos" "$asset_min_media" <<'PY'
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1]).resolve()
min_images = int(sys.argv[2])
min_videos = int(sys.argv[3])
min_media = int(sys.argv[4])
image_exts = {".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".svg"}
video_exts = {".mp4", ".webm", ".mov", ".m4v", ".ogv"}
patterns = [
    re.compile(r'''(?:src|href|poster)\s*=\s*["']([^"']+\.(?:png|jpe?g|webp|avif|gif|svg|mp4|webm|mov|m4v|ogv))(?:[#?][^"']*)?["']''', re.I),
    re.compile(r'''url\(\s*["']?([^"')]+\.(?:png|jpe?g|webp|avif|gif|svg|mp4|webm|mov|m4v|ogv))(?:[#?][^"')]+)?["']?\s*\)''', re.I),
]
seen = {}
for suffix in ("*.html", "*.css", "*.js", "*.jsx", "*.ts", "*.tsx", "*.vue", "*.svelte"):
    for file in root.rglob(suffix):
        if any(part in {"node_modules", "dist", "build", ".git", ".playwright-cli"} for part in file.parts):
            continue
        text = file.read_text(errors="ignore")
        for pattern in patterns:
            for match in pattern.finditer(text):
                ref = match.group(1)
                if ref.startswith(("http://", "https://", "data:", "#")):
                    continue
                path = (root / ref.lstrip("/")).resolve() if ref.startswith("/") else (file.parent / ref).resolve()
                try:
                    path.relative_to(root)
                except ValueError:
                    continue
                suffix = pathlib.Path(ref.split("?", 1)[0].split("#", 1)[0]).suffix.lower()
                media_type = "video" if suffix in video_exts else "image"
                seen[str(path)] = (path, media_type)

existing_images = []
existing_videos = []
missing = []
empty_videos = []
for path, media_type in seen.values():
    if not path.exists():
        missing.append(path)
        continue
    if media_type == "video":
        if path.stat().st_size <= 0:
            empty_videos.append(path)
        else:
            existing_videos.append(path)
    else:
        existing_images.append(path)

print(f"local image assets referenced: {len(existing_images)}")
for p in sorted(existing_images):
    print(f"  image ok: {p.relative_to(root)}")
print(f"local video assets referenced: {len(existing_videos)}")
for p in sorted(existing_videos):
    print(f"  video ok: {p.relative_to(root)}")
for p in sorted(missing):
    print(f"  missing: {p}")
for p in sorted(empty_videos):
    print(f"  empty video: {p.relative_to(root)}")
if missing:
    sys.exit(2)
if empty_videos:
    sys.exit(2)
if len(existing_images) < min_images:
    print(f"expected at least {min_images} image asset(s)")
    sys.exit(3)
if len(existing_videos) < min_videos:
    print(f"expected at least {min_videos} video asset(s)")
    sys.exit(3)
if len(existing_images) + len(existing_videos) < min_media:
    print(f"expected at least {min_media} total media asset(s)")
    sys.exit(3)
PY
    then
      say "PASS: local media asset counts meet ASSET_MIN_IMAGES=$asset_min_images ASSET_MIN_VIDEOS=$asset_min_videos ASSET_MIN_MEDIA=$asset_min_media"
    else
      fail "local media asset check failed for ASSET_MIN_IMAGES=$asset_min_images ASSET_MIN_VIDEOS=$asset_min_videos ASSET_MIN_MEDIA=$asset_min_media"
    fi
  else
    say "WARN: python3 not found; skipping local media asset count"
  fi
fi

if [[ -z "$URL" ]]; then
  if ! command -v python3 >/dev/null 2>&1; then
    fail "python3 not found and no URL was provided"
  else
    PORT="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
)"
    URL="http://127.0.0.1:$PORT/index.html"
    (cd "$ROOT" && python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/agy-frontend-verify-"$PORT".log 2>&1) &
    server_pid="$!"
    sleep 1
  fi
fi

if [[ -n "$URL" ]]; then
  if command -v curl >/dev/null 2>&1; then
    if curl -fsS "$URL" >/dev/null; then
      say "PASS: served $URL"
    else
      fail "failed to serve $URL"
    fi
  else
    say "WARN: curl not found; skipping HTTP check"
  fi
fi

PWCLI="${PWCLI:-$HOME/.codex/skills/playwright/scripts/playwright_cli.sh}"
if [[ "${VERIFY_BROWSER:-1}" == "1" && -x "$PWCLI" && -n "$URL" ]]; then
  session="asv$$"
  if "$PWCLI" -s="$session" open "$URL" >/tmp/agy-frontend-pw-open-$$.log 2>&1; then
    if "$PWCLI" -s="$session" console error >/tmp/agy-frontend-pw-console-$$.log 2>&1; then
      if grep -q 'Errors: 0' /tmp/agy-frontend-pw-console-$$.log; then
        say "PASS: browser console has no errors"
      else
        cat /tmp/agy-frontend-pw-console-$$.log
        fail "browser console errors found"
      fi
    fi

    if "$PWCLI" -s="$session" eval "() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, title: document.title })" >/tmp/agy-frontend-pw-eval-$$.log 2>&1; then
      if grep -q '"overflow": false' /tmp/agy-frontend-pw-eval-$$.log; then
        say "PASS: no horizontal overflow at default viewport"
      else
        cat /tmp/agy-frontend-pw-eval-$$.log
        fail "horizontal overflow detected or overflow check failed"
      fi
    fi
  else
    cat /tmp/agy-frontend-pw-open-$$.log
    fail "Playwright browser open failed"
  fi
  "$PWCLI" -s="$session" close >/dev/null 2>&1 || true
else
  say "WARN: Playwright browser verification skipped"
fi

if [[ "$failures" -gt 0 ]]; then
  say "RESULT: $failures failure(s)"
  exit 1
fi

say "RESULT: pass"
