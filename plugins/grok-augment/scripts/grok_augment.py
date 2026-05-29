#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


DEFAULT_TIMEOUT_SECONDS = 300
VALID_MODES = {"research", "critic", "creative", "video", "diverge"}
DEFAULT_GROK_VIDEO_BASE_URL = "http://127.0.0.1:20080"
DEFAULT_GROK_VIDEO_MODEL = "grok-imagine-video"
DEFAULT_GROK_VIDEO_SIZE = "1024x1024"
DEFAULT_GROK_VIDEO_SECONDS = 6
DEFAULT_GROK_VIDEO_QUALITY = "standard"
MIN_VIDEO_BYTES = 10_000


class GrokAugmentError(RuntimeError):
    pass


@dataclass(frozen=True)
class GrokCli:
    command: str
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS

    def single_turn(
        self,
        prompt: str,
        *,
        effort: str | None = None,
        output_format: str = "plain",
    ) -> str:
        args = [
            self.command,
            "--no-alt-screen",
            "--output-format",
            output_format,
        ]
        if effort:
            args.extend(["--effort", effort])
        args.extend(["-p", prompt])
        completed = self._run(args)
        output = (completed.stdout or "").strip()
        if not output:
            raise GrokAugmentError("grok returned an empty response")
        return output

    def inspect(self) -> dict[str, str]:
        version = self._run([self.command, "--version"]).stdout.strip()
        models = self._run([self.command, "models"]).stdout.strip()
        if not version:
            raise GrokAugmentError("grok --version returned empty output")
        if not models:
            raise GrokAugmentError("grok models returned empty output")
        return {
            "provider": "grok-cli",
            "command": self.command,
            "version": version,
            "models": models,
        }

    def _run(self, args: list[str]) -> subprocess.CompletedProcess[str]:
        try:
            completed = self.runner(
                args,
                text=True,
                capture_output=True,
                timeout=self.timeout_seconds,
                check=False,
            )
        except FileNotFoundError as exc:
            raise GrokAugmentError(f"grok command not found: {self.command}") from exc
        except subprocess.TimeoutExpired as exc:
            raise GrokAugmentError("grok command timed out") from exc

        if completed.returncode != 0:
            stderr = (completed.stderr or "").strip()
            stdout = (completed.stdout or "").strip()
            message = stderr or stdout or f"grok exited with status {completed.returncode}"
            raise GrokAugmentError(message)
        return completed


@dataclass(frozen=True)
class GrokVideoClient:
    base_url: str = DEFAULT_GROK_VIDEO_BASE_URL
    api_key: str = ""
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS

    def generate(
        self,
        prompt: str,
        *,
        out_dir: Path,
        model: str = DEFAULT_GROK_VIDEO_MODEL,
        seconds: int = DEFAULT_GROK_VIDEO_SECONDS,
        size: str = DEFAULT_GROK_VIDEO_SIZE,
        quality: str = DEFAULT_GROK_VIDEO_QUALITY,
    ) -> dict[str, object]:
        cleaned = prompt.strip()
        if not cleaned:
            raise GrokAugmentError("video prompt must not be blank")
        out_dir.mkdir(parents=True, exist_ok=True)

        payload = {
            "model": model,
            "prompt": cleaned,
            "seconds": str(seconds),
            "size": size,
            "quality": quality,
            "resolution_name": "720p" if quality == "high" else "480p",
            "preset": "normal",
        }
        job = self._post_form("/v1/videos", payload, timeout=self.timeout_seconds)
        video_id = str(job.get("id") or "").strip()
        if not video_id:
            raise GrokAugmentError(f"grok video response missing id: {job}")

        state = str(job.get("status") or "").strip()
        deadline = time.time() + self.timeout_seconds
        polls = 1
        while state in {"queued", "in_progress"} and time.time() < deadline:
            time.sleep(5)
            job = self._get_json(f"/v1/videos/{video_id}", timeout=30)
            polls += 1
            state = str(job.get("status") or "").strip()

        if state != "completed":
            raise GrokAugmentError(f"grok video did not complete: status={state or 'unknown'}")

        video_bytes = self._download_video(job, video_id)
        if len(video_bytes) < MIN_VIDEO_BYTES:
            raise GrokAugmentError(f"grok video output too small: {len(video_bytes)} bytes")
        video_path = out_dir / f"{video_id}.mp4"
        video_path.write_bytes(video_bytes)
        return {
            "provider": "grok-video",
            "id": video_id,
            "status": state,
            "model": job.get("model") or model,
            "seconds": str(job.get("seconds") or seconds),
            "size": job.get("size") or size,
            "quality": job.get("quality") or quality,
            "polls": polls,
            "file": str(video_path),
            "bytes": len(video_bytes),
        }

    def _headers(self, *, content_type: str | None = None) -> dict[str, str]:
        headers: dict[str, str] = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        if content_type:
            headers["Content-Type"] = content_type
        return headers

    def _url(self, path: str) -> str:
        return f"{self.base_url.rstrip('/')}{path}"

    def _post_form(
        self,
        path: str,
        payload: dict[str, str],
        *,
        timeout: int,
    ) -> dict[str, object]:
        body = urllib.parse.urlencode(payload).encode("utf-8")
        req = urllib.request.Request(
            self._url(path),
            data=body,
            headers=self._headers(content_type="application/x-www-form-urlencoded"),
            method="POST",
        )
        return self._open_json(req, timeout=timeout)

    def _get_json(self, path: str, *, timeout: int) -> dict[str, object]:
        req = urllib.request.Request(self._url(path), headers=self._headers())
        return self._open_json(req, timeout=timeout)

    def _open_json(
        self,
        req: urllib.request.Request,
        *,
        timeout: int,
    ) -> dict[str, object]:
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "replace").strip()
            raise GrokAugmentError(f"grok video HTTP {exc.code}: {body}") from exc
        except urllib.error.URLError as exc:
            raise GrokAugmentError(f"grok video request failed: {exc}") from exc

    def _download_video(self, job: dict[str, object], video_id: str) -> bytes:
        video_url = job.get("url")
        url = video_url if isinstance(video_url, str) and video_url else self._url(
            f"/v1/videos/{video_id}/content"
        )
        req = urllib.request.Request(url, headers=self._headers())
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", "replace").strip()
            raise GrokAugmentError(f"grok video download HTTP {exc.code}: {body}") from exc
        except urllib.error.URLError as exc:
            raise GrokAugmentError(f"grok video download failed: {exc}") from exc


def build_prompt(mode: str, brief: str) -> str:
    cleaned = brief.strip()
    if not cleaned:
        raise GrokAugmentError("brief must not be blank")
    if mode not in VALID_MODES:
        raise GrokAugmentError(f"unknown mode: {mode}")

    headers = {
        "research": (
            "You are Grok Research for Codex. Use current web/X knowledge when useful. "
            "Return concise Markdown with: Findings, source URLs, Risks, and Codex Actions. "
            "Codex owns local file edits, command execution, verification, and commits."
        ),
        "critic": (
            "You are an independent Grok reviewer for Codex. Find missing requirements, "
            "incorrect assumptions, risk, and verification gaps. Do not edit files or ask "
            "for tool execution. Codex owns local file edits and tests."
        ),
        "creative": (
            "You are Grok Creative for a Codex/AGY workflow. Produce bold but executable "
            "visual directions, interaction ideas, copy, and asset prompts. For image assets, "
            "state that Codex must use image_gen. For video assets, state that Codex must use "
            "Grok video. Do not cap asset count unless the user asks."
        ),
        "video": (
            "You are Grok Video for Codex. Produce a video-generation brief and shot list "
            "for Grok video only. No fallback provider is allowed. Do not use image providers "
            "for video. Include prompt, duration, aspect ratio, camera movement, style, "
            "negative constraints, and expected output checks."
        ),
        "diverge": (
            "You are Grok Divergence for Codex. Generate 3 to 7 meaningfully different "
            "candidate paths, with tradeoffs, risks, and how Codex can verify each locally. "
            "Do not mutate files."
        ),
    }
    return f"{headers[mode]}\n\nUser brief:\n{cleaned}"


def build_cli() -> GrokCli:
    command = os.environ.get("GROK_AUGMENT_GROK_BIN", "grok").strip()
    if not command:
        raise GrokAugmentError("GROK_AUGMENT_GROK_BIN must not be blank")
    timeout_seconds = int(os.environ.get("GROK_AUGMENT_TIMEOUT", str(DEFAULT_TIMEOUT_SECONDS)))
    return GrokCli(command=command, timeout_seconds=timeout_seconds)


def build_video_client(args: argparse.Namespace) -> GrokVideoClient:
    base_url = (
        getattr(args, "base_url", None)
        or os.environ.get("GROK_VIDEO_BASE_URL")
        or DEFAULT_GROK_VIDEO_BASE_URL
    )
    api_key = os.environ.get(getattr(args, "api_key_env", "GROK_VIDEO_API_KEY"), "")
    timeout_seconds = int(os.environ.get("GROK_VIDEO_TIMEOUT", str(DEFAULT_TIMEOUT_SECONDS)))
    return GrokVideoClient(
        base_url=base_url,
        api_key=api_key,
        timeout_seconds=timeout_seconds,
    )


def emit_result(payload: dict[str, object], as_json: bool) -> None:
    if as_json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return
    if "response" in payload:
        print(payload["response"])
        return
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Use Grok CLI as a non-mutating research, review, creative, or video layer for Codex."
    )
    parser.add_argument("--json", action="store_true", help="Print structured JSON output.")
    parser.add_argument(
        "--effort",
        choices=["low", "medium", "high", "xhigh", "max"],
        default=None,
        help="Pass through Grok effort only for models that support it.",
    )
    parser.add_argument(
        "--print-prompt",
        action="store_true",
        help="Print the Grok prompt without calling Grok.",
    )
    subparsers = parser.add_subparsers(dest="mode", required=True)

    inspect_parser = subparsers.add_parser(
        "inspect", help="Check configured Grok CLI version and model access."
    )
    inspect_parser.add_argument("--json", action="store_true", default=argparse.SUPPRESS)

    video_generate_parser = subparsers.add_parser(
        "video-generate",
        help="Generate a real MP4 through a Grok-compatible /v1/videos endpoint.",
    )
    video_generate_parser.add_argument("--json", action="store_true", default=argparse.SUPPRESS)
    video_generate_parser.add_argument("--base-url", default=None)
    video_generate_parser.add_argument("--api-key-env", default="GROK_VIDEO_API_KEY")
    video_generate_parser.add_argument("--out-dir", default=None)
    video_generate_parser.add_argument("--model", default=DEFAULT_GROK_VIDEO_MODEL)
    video_generate_parser.add_argument("--seconds", type=int, default=DEFAULT_GROK_VIDEO_SECONDS)
    video_generate_parser.add_argument("--size", default=DEFAULT_GROK_VIDEO_SIZE)
    video_generate_parser.add_argument(
        "--quality",
        choices=["standard", "high"],
        default=DEFAULT_GROK_VIDEO_QUALITY,
    )
    video_generate_parser.add_argument("brief", nargs="*", help="Video prompt. Reads stdin if omitted.")

    for mode in sorted(VALID_MODES):
        child = subparsers.add_parser(mode, help=f"Run Grok {mode} mode.")
        child.add_argument("--json", action="store_true", default=argparse.SUPPRESS)
        child.add_argument(
            "--effort",
            choices=["low", "medium", "high", "xhigh", "max"],
            default=argparse.SUPPRESS,
        )
        child.add_argument("--print-prompt", action="store_true", default=argparse.SUPPRESS)
        child.add_argument("brief", nargs="*", help="Brief text. Reads stdin if omitted.")

    args = parser.parse_args(argv)

    try:
        if args.mode == "video-generate":
            brief = " ".join(args.brief).strip() or sys.stdin.read().strip()
            out_dir = Path(args.out_dir) if args.out_dir else Path(
                tempfile.mkdtemp(prefix="grok-augment-video-")
            )
            result = build_video_client(args).generate(
                brief,
                out_dir=out_dir,
                model=args.model,
                seconds=args.seconds,
                size=args.size,
                quality=args.quality,
            )
            emit_result(result, args.json)
            return 0

        cli = build_cli()
        if args.mode == "inspect":
            emit_result(cli.inspect(), args.json)
            return 0

        brief = " ".join(args.brief).strip() or sys.stdin.read().strip()
        prompt = build_prompt(args.mode, brief)
        if args.print_prompt:
            emit_result(
                {
                    "provider": "grok-cli",
                    "mode": args.mode,
                    "prompt": prompt,
                },
                args.json,
            )
            return 0

        response = cli.single_turn(prompt, effort=args.effort)
        emit_result(
            {
                "provider": "grok-cli",
                "mode": args.mode,
                "response": response,
            },
            args.json,
        )
        return 0
    except (GrokAugmentError, ValueError) as exc:
        print(f"grok-augment: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
