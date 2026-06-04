# SkillOpt Setup

This directory contains a local Microsoft SkillOpt setup for optimizing the
dispatcher skill with a small routing benchmark.

## What Is Installed

- Python virtual environment: `.venv/skillopt`
- Pinned package: `skillopt==0.1.0`
- Config: `tools/skillopt/configs/dispatch-routing-smoke.yaml`
- Split data: `tools/skillopt/data/dispatch-routing/{train,val,test}/items.json`
- Setup validator: `npm run skillopt:validate`
- Codex CLI compatibility runner: `tools/skillopt/codex_skillopt_runner.py`

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

## Configure Codex CLI

The default path uses local Codex CLI auth instead of API keys. Confirm Codex
is installed and logged in:

```bash
codex --version
codex exec --ephemeral --sandbox read-only --skip-git-repo-check "Return only OK"
```

Optional overrides:

```bash
export SKILLOPT_BACKEND="codex_cli"
export SKILLOPT_CODEX_BIN="codex"
export SKILLOPT_CODEX_SANDBOX="read-only"
export CODEX_EXEC_USE_SDK="cli"
export CODEX_EXEC_FULL_AUTO="false"
# Leave unset to inherit the Codex CLI default model, or set explicitly:
# export SKILLOPT_OPTIMIZER_MODEL="gpt-5.5"
# export SKILLOPT_TARGET_MODEL="gpt-5.5"
```

SkillOpt 0.1.0 includes Codex exec support for target rollout, but its optimizer
registry only accepts chat API providers. The repository runner installs an
in-memory compatibility patch before the SkillOpt trainer loads, so
`optimizer_backend=codex_exec` and `target_backend=codex_exec` both route
through `codex exec` without editing third-party files in `.venv/skillopt`.

To use the old OpenAI-compatible API path instead, set
`SKILLOPT_BACKEND=openai_chat` and export:

```bash
export AZURE_OPENAI_ENDPOINT="https://api.openai.com/v1"
export AZURE_OPENAI_AUTH_MODE="openai_compatible"
export AZURE_OPENAI_API_KEY="<your key>"
export SKILLOPT_OPTIMIZER_MODEL="gpt-5.5"
export SKILLOPT_TARGET_MODEL="gpt-5.5"
```

## Run A Training Pass

This runs the real SkillOpt training loop and writes outputs under
`.tmp/skillopt-runs/dispatch-routing`. By default, both optimizer calls and
target rollout calls use Codex CLI.

```bash
npm run skillopt:train
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
npm run skillopt:eval
```

To evaluate a reviewed candidate explicitly:

```bash
npm run skillopt:eval -- .tmp/skillopt-runs/dispatch-routing/best_skill.md
```

## Sources

- SkillOpt repository: https://github.com/microsoft/SkillOpt
- SkillOpt project page: https://microsoft.github.io/SkillOpt/
- SkillOpt paper: https://arxiv.org/abs/2605.23904
