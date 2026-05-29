---
name: grok-augment
description: Use when Codex should call the local Grok CLI for non-mutating current research, independent critique, creative direction, divergent candidate paths, or Grok-video-only briefs before Codex implements and verifies locally.
---

# Grok Augment

Use this skill when Grok should enhance Codex without taking over local execution.

## Workflow

1. Verify the configured CLI:

```bash
python3 scripts/grok_augment.py inspect --json
```

2. Choose one mode:

```bash
python3 scripts/grok_augment.py research --json "<question>"
python3 scripts/grok_augment.py critic --json "<summary, diff, or test result>"
python3 scripts/grok_augment.py creative --json "<product or frontend brief>"
python3 scripts/grok_augment.py video --json "<video asset brief>"
GROK_VIDEO_API_KEY="$LOCAL_GROK2API_KEY" python3 scripts/grok_augment.py video-generate --json "<video prompt>"
python3 scripts/grok_augment.py diverge --json "<stuck point or decision>"
```

3. Codex must verify or implement the result locally. Grok output is advisory unless a local check proves it.

Use `--effort` only after the selected Grok model is known to support it. The default path omits effort so `grok-build` can run without a reasoning-effort error.

## Boundaries

- Grok must not be used as the primary local file editor, test runner, committer, or release gate.
- Do not pass secrets, raw credentials, private tokens, or unnecessary full-repo context to Grok. Summarize or redact first.
- Do not add `--always-approve` or permissive mutation modes to Grok calls from this plugin.
- No fallback provider is allowed. If Grok is unavailable, report the failure.
- Image assets must use `image_gen` when image generation is required. Video assets must use Grok video.
- Do not limit the number of resources unless the user explicitly asks for a cap.

## Video Use

Use `video` mode to produce a Grok-video-only generation brief with shot list, style, duration, aspect ratio, camera movement, and output checks. If a later workflow performs the actual generation, it must preserve the Grok provider requirement and fail visibly if Grok video is unavailable.

Use `video-generate` only when a Grok-compatible `/v1/videos` endpoint is configured. It sends a text-only video request to Grok video and downloads the resulting MP4; it does not call any image provider or use image references.
