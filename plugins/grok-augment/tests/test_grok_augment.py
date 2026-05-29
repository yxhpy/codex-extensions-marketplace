import io
import json
import os
import stat
import sys
import tempfile
import types
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import parse_qs
from unittest.mock import patch


PLUGIN_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PLUGIN_ROOT))


class GrokAugmentTests(unittest.TestCase):
    def test_single_turn_uses_configured_grok_without_approval_or_fallback(self):
        from scripts.grok_augment import GrokCli

        calls = []

        def fake_runner(args, **kwargs):
            calls.append((args, kwargs))
            return types.SimpleNamespace(returncode=0, stdout="ok from grok", stderr="")

        cli = GrokCli(command="/fake/grok", runner=fake_runner, timeout_seconds=17)

        response = cli.single_turn("Research this", effort="high")

        self.assertEqual(response, "ok from grok")
        args, kwargs = calls[0]
        self.assertEqual(args[0], "/fake/grok")
        self.assertIn("--no-alt-screen", args)
        self.assertIn("--output-format", args)
        self.assertEqual(args[args.index("--output-format") + 1], "plain")
        self.assertIn("--effort", args)
        self.assertEqual(args[args.index("--effort") + 1], "high")
        self.assertIn("-p", args)
        self.assertEqual(args[-1], "Research this")
        self.assertNotIn("--always-approve", args)
        self.assertNotIn("--permission-mode", args)
        self.assertEqual(kwargs["timeout"], 17)
        self.assertTrue(kwargs["capture_output"])

    def test_missing_grok_command_fails_instead_of_falling_back(self):
        from scripts.grok_augment import GrokAugmentError, GrokCli

        def fake_runner(args, **kwargs):
            raise FileNotFoundError(args[0])

        cli = GrokCli(command="/missing/grok", runner=fake_runner)

        with self.assertRaisesRegex(GrokAugmentError, "grok command not found"):
            cli.single_turn("hello")

    def test_empty_grok_response_is_rejected(self):
        from scripts.grok_augment import GrokAugmentError, GrokCli

        def fake_runner(args, **kwargs):
            return types.SimpleNamespace(returncode=0, stdout="  \n", stderr="")

        cli = GrokCli(command="/fake/grok", runner=fake_runner)

        with self.assertRaisesRegex(GrokAugmentError, "grok returned an empty response"):
            cli.single_turn("hello")

    def test_research_prompt_preserves_codex_as_local_executor(self):
        from scripts.grok_augment import build_prompt

        prompt = build_prompt("research", "Should we use Grok CLI?")

        self.assertIn("Codex owns local file edits", prompt)
        self.assertIn("source URLs", prompt)
        self.assertIn("Should we use Grok CLI?", prompt)

    def test_video_prompt_requires_grok_video_and_forbids_fallbacks(self):
        from scripts.grok_augment import build_prompt

        prompt = build_prompt("video", "Create a cinematic Dream of the Red Chamber shot")

        self.assertIn("Grok video only", prompt)
        self.assertIn("No fallback provider is allowed", prompt)
        self.assertIn("Do not use image providers for video", prompt)
        self.assertIn("Create a cinematic Dream of the Red Chamber shot", prompt)

    def test_cli_outputs_json_with_fake_grok_binary(self):
        from scripts import grok_augment

        with tempfile.TemporaryDirectory() as tmp:
            fake_grok = Path(tmp) / "grok"
            fake_grok.write_text(
                "#!/bin/sh\n"
                "case \"$*\" in\n"
                "  *--version*) echo 'grok 0.0.fake'; exit 0 ;;\n"
                "  *models*) echo 'grok-build'; exit 0 ;;\n"
                "  *) echo 'FAKE_GROK_RESPONSE'; exit 0 ;;\n"
                "esac\n",
                encoding="utf-8",
            )
            fake_grok.chmod(fake_grok.stat().st_mode | stat.S_IXUSR)
            stdout = io.StringIO()

            with patch.dict(os.environ, {"GROK_AUGMENT_GROK_BIN": str(fake_grok)}):
                with patch("sys.stdout", stdout):
                    code = grok_augment.main(["--json", "creative", "Build a dense app UI"])

        self.assertEqual(code, 0)
        payload = json.loads(stdout.getvalue())
        self.assertEqual(payload["mode"], "creative")
        self.assertEqual(payload["response"], "FAKE_GROK_RESPONSE")
        self.assertEqual(payload["provider"], "grok-cli")

    def test_inspect_accepts_json_after_subcommand(self):
        from scripts import grok_augment

        with tempfile.TemporaryDirectory() as tmp:
            fake_grok = Path(tmp) / "grok"
            fake_grok.write_text(
                "#!/bin/sh\n"
                "case \"$*\" in\n"
                "  *--version*) echo 'grok 0.0.fake'; exit 0 ;;\n"
                "  *models*) echo 'grok-build'; exit 0 ;;\n"
                "  *) echo 'unexpected'; exit 0 ;;\n"
                "esac\n",
                encoding="utf-8",
            )
            fake_grok.chmod(fake_grok.stat().st_mode | stat.S_IXUSR)
            stdout = io.StringIO()

            with patch.dict(os.environ, {"GROK_AUGMENT_GROK_BIN": str(fake_grok)}):
                with patch("sys.stdout", stdout):
                    code = grok_augment.main(["inspect", "--json"])

        self.assertEqual(code, 0)
        payload = json.loads(stdout.getvalue())
        self.assertEqual(payload["provider"], "grok-cli")
        self.assertEqual(payload["version"], "grok 0.0.fake")

    def test_video_generate_posts_to_grok_video_and_downloads_mp4(self):
        from scripts.grok_augment import GrokVideoClient

        requests = []
        mp4_bytes = b"\x00\x00\x00 ftypisom" + (b"0" * 12000)

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers.get("content-length", "0"))
                body = self.rfile.read(length).decode("utf-8")
                parsed = {key: values[0] for key, values in parse_qs(body).items()}
                requests.append((self.path, parsed))
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(
                    json.dumps(
                        {
                            "id": "video_test",
                            "status": "completed",
                            "model": parsed["model"],
                        }
                    ).encode("utf-8")
                )

            def do_GET(self):
                if self.path != "/v1/videos/video_test/content":
                    self.send_response(404)
                    self.end_headers()
                    return
                self.send_response(200)
                self.send_header("Content-Type", "video/mp4")
                self.end_headers()
                self.wfile.write(mp4_bytes)

            def log_message(self, format, *args):
                return

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as tmp:
                client = GrokVideoClient(
                    base_url=f"http://127.0.0.1:{server.server_port}",
                    api_key="test-key",
                    timeout_seconds=5,
                )
                result = client.generate("cinematic smoke", out_dir=Path(tmp))
                generated_file_exists = Path(result["file"]).exists()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)

        self.assertEqual(requests[0][0], "/v1/videos")
        self.assertEqual(requests[0][1]["model"], "grok-imagine-video")
        self.assertEqual(requests[0][1]["prompt"], "cinematic smoke")
        self.assertNotIn("image_reference", requests[0][1])
        self.assertEqual(result["provider"], "grok-video")
        self.assertEqual(result["bytes"], len(mp4_bytes))
        self.assertTrue(generated_file_exists)


if __name__ == "__main__":
    unittest.main()
