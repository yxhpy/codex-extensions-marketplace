from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
VERIFY_SCRIPT = SKILL_ROOT / "scripts" / "verify-static-frontend.sh"


def run_verify(site_root: Path, **env_overrides: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.update(env_overrides)
    env.setdefault("VERIFY_BROWSER", "0")
    return subprocess.run(
        [str(VERIFY_SCRIPT), str(site_root)],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
        check=False,
    )


class VerifyStaticFrontendVideoAssetsTest(unittest.TestCase):
    def test_video_minimum_fails_when_referenced_video_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            site = Path(temp_dir)
            (site / "index.html").write_text(
                "<!doctype html><title>Video check</title>"
                '<video src="media/missing-loop.mp4"></video>',
                encoding="utf-8",
            )

            result = run_verify(site, ASSET_MIN_VIDEOS="1")

            self.assertNotEqual(result.returncode, 0, result.stdout)
            self.assertIn("missing", result.stdout)
            self.assertIn("ASSET_MIN_VIDEOS=1", result.stdout)

    def test_video_minimum_passes_when_referenced_video_exists(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            site = Path(temp_dir)
            media = site / "media"
            media.mkdir()
            (media / "hero-loop.mp4").write_bytes(b"not-empty-video-placeholder")
            (site / "index.html").write_text(
                "<!doctype html><title>Video check</title>"
                '<video src="media/hero-loop.mp4"></video>',
                encoding="utf-8",
            )

            result = run_verify(site, ASSET_MIN_VIDEOS="1")

            self.assertEqual(result.returncode, 0, result.stdout)
            self.assertIn("local video assets referenced: 1", result.stdout)


if __name__ == "__main__":
    unittest.main()
