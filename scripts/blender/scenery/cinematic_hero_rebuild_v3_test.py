#!/usr/bin/env python3
"""Pure tests for V3 authored terrain (no Blender)."""
from __future__ import annotations

from cinematic_hero_v3_land import authored_height, channel_profile


def test_channel_has_a_creek():
    dist, _signed = channel_profile(-2.0, -12.2)
    assert dist < 0.35
    far, _ = channel_profile(0.0, 8.0)
    assert far > 4.0


def test_authored_bank_is_a_profile_not_noise():
    bed = authored_height(-2.0, -12.2)
    gravel = authored_height(-2.0, -14.0)
    soil = authored_height(-2.0, -15.6)
    meadow = authored_height(-2.0, -18.5)
    assert bed[1] == "bed"
    assert gravel[1] in {"gravel", "bed"}
    assert soil[1] in {"soil", "gravel", "short"}
    assert meadow[1] in {"short", "lush", "path"}
    assert bed[0] < gravel[0] <= soil[0] <= meadow[0] + 0.05
    # Broad forms: nearby meadow samples stay close. No lumpy noise.
    a = authored_height(-4.0, -19.0)[0]
    b = authored_height(-3.6, -18.8)[0]
    assert abs(a - b) < 0.12


def test_negative_space_path_exists():
    kinds = {authored_height(x, y)[1] for x, y in ((-6.4, -4.0), (-6.0, -3.2), (-5.4, -2.4))}
    assert "path" in kinds or any(authored_height(x, -4.0)[1] == "path" for x in (-7.0, -6.2, -5.4))


if __name__ == "__main__":
    test_channel_has_a_creek()
    test_authored_bank_is_a_profile_not_noise()
    test_negative_space_path_exists()
    print("cinematic_hero_rebuild_v3_test PASS")
