# xAI Grok Pi Extension

Adds standalone Pi tools for xAI/Grok without calling Hermes or reading Hermes credentials.

## Tools

- `xai_grok_x_search`: calls xAI's native `x_search` server-side tool through `/v1/responses`.
- `xai_grok_video_generate`: calls Grok Imagine Video through `/v1/videos/generations`, polls `/v1/videos/{request_id}`, and downloads the MP4 by default.

## Auth

The extension resolves credentials in this order:

1. `XAI_API_KEY` or `PI_XAI_API_KEY`.
2. `XAI_OAUTH_TOKEN` or `PI_XAI_OAUTH_TOKEN` for a raw bearer token.
3. Optional config files:
   - Global: `~/.pi/agent/extensions/xai-grok.json`
   - Project: `<project>/.pi/extensions/xai-grok.json`
4. Pi-owned OAuth credentials created by `/xai-grok-login` and stored at `~/.pi/agent/extensions/xai-grok-auth.json`.

The extension does **not** shell out to Hermes, import Hermes modules, or read `~/.hermes/auth.json`.

## Commands

- `/xai-grok-login`: browser OAuth PKCE login against xAI and save credentials under Pi's agent directory.
- `/xai-grok-status`: show whether API key or Pi-owned OAuth credentials are configured.
- `/xai-grok-logout`: delete Pi-owned OAuth credentials.

## Config

Example `~/.pi/agent/extensions/xai-grok.json`:

```json
{
  "baseUrl": "https://api.x.ai/v1",
  "searchModel": "grok-4.3",
  "videoModel": "grok-imagine-video",
  "videoOutputDir": "assets/generated/videos",
  "oauth": {
    "callbackPort": 56121
  }
}
```

Avoid putting API keys in config when environment variables are practical.

## Example usage

Ask Pi:

```text
Use xai_grok_x_search to find recent X posts from xai about Grok video.
```

Or request video generation:

```text
Use xai_grok_video_generate to create a 6 second 16:9 neon arcade fighting-game background loop and save it under assets/generated/videos.
```
