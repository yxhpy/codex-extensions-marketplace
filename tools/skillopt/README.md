# SkillOpt Setup

This directory contains a local Microsoft SkillOpt setup for optimizing the
dispatcher skill with a small routing benchmark.

## What Is Installed

- Python virtual environment: `.venv/skillopt`
- Pinned package: `skillopt==0.1.0`
- Config: `tools/skillopt/configs/dispatch-routing-smoke.yaml`
- Split data: `tools/skillopt/data/dispatch-routing/{train,val,test}/items.json`
- Setup validator: `npm run skillopt:validate`

The benchmark uses SkillOpt's built-in `searchqa` environment. Each item asks a
routing question and expects an exact plugin-route answer. The initial skill is
`plugins/codex-augment-dispatcher/skills/dispatch/SKILL.md`.

## Install Or Repair The Environment

```bash
python3 -m venv .venv/skillopt
.venv/skillopt/bin/python -m pip install --upgrade pip setuptools wheel
.venv/skillopt/bin/python -m pip install -r tools/skillopt/requirements.txt
npm run skillopt:install-prompts
npm run skillopt:validate
```

`skillopt==0.1.0` from PyPI includes the train/eval CLIs but does not currently
install the markdown prompt files required by the training reflection stage.
`npm run skillopt:install-prompts` copies those prompts from the official
Microsoft/SkillOpt `v0.1.0` tag into the local virtual environment.

## Configure Credentials

Do not commit real keys. Export credentials in your shell or copy
`tools/skillopt/env.example` to a private location and edit it.

For OpenAI-compatible mode:

```bash
export AZURE_OPENAI_ENDPOINT="https://api.openai.com/v1"
export AZURE_OPENAI_AUTH_MODE="openai_compatible"
export AZURE_OPENAI_API_KEY="<your key>"
export SKILLOPT_OPTIMIZER_MODEL="gpt-5.5"
export SKILLOPT_TARGET_MODEL="gpt-5.5"
```

SkillOpt intentionally reuses the `AZURE_OPENAI_*` environment names for this
mode. The config uses SkillOpt's `openai_chat` optimizer and target backends;
the `AZURE_OPENAI_*` values tell that backend which endpoint and auth mode to
use.

## Run A Training Pass

This runs the real SkillOpt training loop and writes outputs under
`.tmp/skillopt-runs/dispatch-routing`.

```bash
.venv/skillopt/bin/skillopt-train \
  --config tools/skillopt/configs/dispatch-routing-smoke.yaml \
  --azure_openai_endpoint "$AZURE_OPENAI_ENDPOINT" \
  --azure_openai_auth_mode "$AZURE_OPENAI_AUTH_MODE" \
  --azure_openai_api_key "$AZURE_OPENAI_API_KEY" \
  --optimizer_model "$SKILLOPT_OPTIMIZER_MODEL" \
  --target_model "$SKILLOPT_TARGET_MODEL"
```

The main artifact to inspect is:

```text
.tmp/skillopt-runs/dispatch-routing/best_skill.md
```

Do not automatically replace deployed plugin skills with `best_skill.md`.
Review the diff, extract bounded edits, run the plugin validators/tests, and
preserve upstream sync constraints for vendored skills.

## Evaluate A Produced Skill

```bash
.venv/skillopt/bin/skillopt-eval \
  --config tools/skillopt/configs/dispatch-routing-smoke.yaml \
  --skill .tmp/skillopt-runs/dispatch-routing/best_skill.md \
  --split all \
  --azure_openai_endpoint "$AZURE_OPENAI_ENDPOINT" \
  --azure_openai_auth_mode "$AZURE_OPENAI_AUTH_MODE" \
  --azure_openai_api_key "$AZURE_OPENAI_API_KEY" \
  --target_model "$SKILLOPT_TARGET_MODEL"
```

## Sources

- SkillOpt repository: https://github.com/microsoft/SkillOpt
- SkillOpt project page: https://microsoft.github.io/SkillOpt/
- SkillOpt paper: https://arxiv.org/abs/2605.23904
