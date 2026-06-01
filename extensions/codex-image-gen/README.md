# Codex Image Gen Pi Extension

Adds `codex_generate_image`, a Pi tool that generates bitmap images through the OpenAI Codex Responses backend using Pi's existing `openai-codex` login.

## Auth

Run `/login` in Pi and select **ChatGPT Plus/Pro (Codex)**. No `OPENAI_API_KEY` is required for the default Codex backend path.

## Tool

`codex_generate_image` parameters:

- `prompt` (required): image prompt.
- `model`: Codex routing model, default `gpt-5.5`; backend image model is `gpt-image-2`.
- `outputFormat`: `png`, `jpeg`, or `webp`; default `png`.
- `quality`: `low`, `medium`, `high`, or `auto`.
- `size`: `auto` or a size such as `1024x1024`, `1536x1024`, `1024x1536`.
- `action`: `auto`, `generate`, or `edit`.
- `inputImages`: optional local image paths to include as references/edit inputs.
- `save`: `none`, `project`, `global`, or `custom`; default `global`.
- `saveDir`: directory for `save=custom`.

## Config

Optional config files:

- Global: `~/.pi/agent/extensions/codex-image-gen.json`
- Project: `<project>/.pi/extensions/codex-image-gen.json`

Example:

```json
{
  "save": "project",
  "model": "gpt-5.5",
  "quality": "low",
  "size": "1024x1024"
}
```

Environment overrides:

- `PI_CODEX_IMAGE_SAVE_MODE`
- `PI_CODEX_IMAGE_SAVE_DIR`

## Save modes

- `none`: return inline image only.
- `project`: save to `<project>/.pi/generated-images/<session-id>/`.
- `global`: save to `<pi-agent-dir>/generated-images/<session-id>/`.
- `custom`: save to `<saveDir>/<session-id>/`.
