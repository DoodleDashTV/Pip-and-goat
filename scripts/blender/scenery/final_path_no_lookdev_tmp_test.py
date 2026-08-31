"""FINAL/hero path must not hardcode /tmp lookdev roots."""
from __future__ import annotations

from pathlib import Path

FORBIDDEN = (
    "/tmp/o14-lookdev",
    "/tmp/o14-v3-source",
    "/tmp/o14-v4-source",
    "/tmp/lookdev",
)

FINAL_FILES = (
    "cinematic_valley_world_v1.py",
    "cinematic_hero_rebuild_v2.py",
    "cinematic_hero_rebuild_v3.py",
    "cinematic_hero_rebuild_v5.py",
    "cinematic_creek_profile.py",
    "fail_fast_verify_v1.py",
)


def test_final_path_has_no_lookdev_tmp() -> None:
    root = Path(__file__).resolve().parent
    hits = []
    for name in FINAL_FILES:
        text = (root / name).read_text(encoding="utf-8")
        for needle in FORBIDDEN:
            if needle in text:
                hits.append(f"{name}:{needle}")
    assert hits == [], "lookdev tmp paths remain: " + ", ".join(hits)


if __name__ == "__main__":
    test_final_path_has_no_lookdev_tmp()
    print("final_path_no_lookdev_tmp_test PASS")
