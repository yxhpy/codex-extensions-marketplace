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

asset_min="${ASSET_MIN_IMAGES:-0}"
if [[ "$asset_min" =~ ^[0-9]+$ && "$asset_min" -gt 0 ]]; then
  if command -v python3 >/dev/null 2>&1; then
    if python3 - "$ROOT" "$asset_min" <<'PY'
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
minimum = int(sys.argv[2])
patterns = [
    re.compile(r'''(?:src|href)\s*=\s*["']([^"']+\.(?:png|jpe?g|webp|avif|gif|svg))(?:[#?][^"']*)?["']''', re.I),
    re.compile(r'''url\(\s*["']?([^"')]+\.(?:png|jpe?g|webp|avif|gif|svg))(?:[#?][^"')]+)?["']?\s*\)''', re.I),
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
                path = (file.parent / ref).resolve()
                try:
                    path.relative_to(root)
                except ValueError:
                    continue
                seen[str(path)] = path.exists()

existing = [p for p, ok in seen.items() if ok]
missing = [p for p, ok in seen.items() if not ok]
print(f"local image assets referenced: {len(existing)}")
for p in sorted(existing):
    print(f"  ok: {pathlib.Path(p).relative_to(root)}")
for p in sorted(missing):
    print(f"  missing: {p}")
if missing:
    sys.exit(2)
if len(existing) < minimum:
    sys.exit(3)
PY
    then
      say "PASS: local image asset count meets ASSET_MIN_IMAGES=$asset_min"
    else
      fail "local image asset check failed for ASSET_MIN_IMAGES=$asset_min"
    fi
  else
    say "WARN: python3 not found; skipping local image asset count"
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
