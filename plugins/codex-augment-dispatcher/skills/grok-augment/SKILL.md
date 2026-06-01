---
name: grok-augment
description: "Grok CLI augmentation for current research, external critique, risk review, creative/product/frontend direction, divergent paths, Grok video briefs/generation, 最新信息, 调研, 外部评审 before the owner agent implements."
---

# Grok Augment

Use this skill when Grok should enhance the owner agent without taking over local execution.
Strong triggers include: current research, latest info, web/current-source check,
independent critique, outside opinion, risk review, product direction, frontend
creative direction, divergent candidate paths, Grok video, video brief, 最新信息,
调研, 外部评审, 风险复核, 创意方向.

## Script Path Resolution

For Codex plugin installs, run commands from the plugin root. For Pi package
installs, resolve this skill directory first; the plugin root is `../..` from
this `SKILL.md`, so the same helper is `../../scripts/grok_augment.ts` when
resolved relative to the skill directory.

## Workflow

1. Verify the configured CLI from the plugin root, or use the Pi-compatible
   skill-relative script path:

```bash
node --experimental-strip-types ../../scripts/grok_augment.ts inspect --json
```

2. Choose one mode:

```bash
node --experimental-strip-types ../../scripts/grok_augment.ts research --json "<question>"
node --experimental-strip-types ../../scripts/grok_augment.ts critic --json "<summary, diff, or test result>"
node --experimental-strip-types ../../scripts/grok_augment.ts creative --json "<product or frontend brief>"
node --experimental-strip-types ../../scripts/grok_augment.ts video --json "<video asset brief>"
GROK_VIDEO_API_KEY="$LOCAL_GROK2API_KEY" node --experimental-strip-types ../../scripts/grok_augment.ts video-generate --json "<video prompt>"
node --experimental-strip-types ../../scripts/grok_augment.ts diverge --json "<stuck point or decision>"
```

3. The owner agent must verify or implement the result locally. Grok output is advisory unless a local check proves it.

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
