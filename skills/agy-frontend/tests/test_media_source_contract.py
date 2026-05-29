from __future__ import annotations

import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]


class MediaSourceContractTest(unittest.TestCase):
    def test_skill_declares_strict_media_generators_without_fallback(self) -> None:
        text = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")

        required_phrases = [
            "Images MUST be generated with image_gen.",
            "Videos MUST be generated with Grok Video.",
            "No fallback media generation is allowed.",
            "Resource counts are unbounded.",
        ]
        for phrase in required_phrases:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_asset_pack_has_no_resource_count_ceiling(self) -> None:
        text = (SKILL_ROOT / "references" / "asset-pack.md").read_text(encoding="utf-8")

        self.assertIn("Resource counts are unbounded.", text)
        self.assertIn("Do not put numeric caps, quotas, or fixed asset counts", text)
        forbidden_count_caps = [
            "-".join(("2", "5")) + " images",
            "-".join(("4", "8")) + " images",
            "-".join(("3", "6")) + " media assets",
            "-".join(("6", "10")) + " media assets",
            "start with " + "at least",
            "at least " + "1 image",
            "at least " + "3 media",
            "at least " + "6 media",
        ]
        for phrase in forbidden_count_caps:
            with self.subTest(phrase=phrase):
                self.assertNotIn(phrase, text)


if __name__ == "__main__":
    unittest.main()
