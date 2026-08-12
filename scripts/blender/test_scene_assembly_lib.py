"""Unit tests for lighting ownership + hierarchy helpers (no bpy required)."""

from __future__ import annotations

import unittest

from scene_assembly_lib import (
    DEFAULT_LIGHTING_PRESET,
    LIGHTING_PRESETS,
    normalize_lighting_state,
    select_placement_roots,
    validate_lighting_report,
)


class FakeObj:
    def __init__(self, name: str, parent=None, type_: str = "MESH"):
        self.name = name
        self.parent = parent
        self.type = type_


class NormalizeLightingStateTests(unittest.TestCase):
    def test_default_when_empty(self):
        resolved = normalize_lighting_state({})
        self.assertEqual(resolved["preset"], DEFAULT_LIGHTING_PRESET)
        self.assertEqual(resolved["source"], "default")
        self.assertGreaterEqual(len(resolved["lights"]), 1)

    def test_manifest_preset_meadow(self):
        resolved = normalize_lighting_state({"preset": "MEADOW_DAY_SOFT"})
        self.assertEqual(resolved["preset"], "MEADOW_DAY_SOFT")
        self.assertEqual(resolved["source"], "manifest.lightingState")
        self.assertIn(resolved["preset"], LIGHTING_PRESETS)

    def test_alias_sunny_playroom(self):
        resolved = normalize_lighting_state({"preset": "sunnyPlayroom"})
        self.assertEqual(resolved["preset"], "SUNNY_PLAYROOM")

    def test_unknown_preset_fails_closed(self):
        with self.assertRaises(ValueError) as ctx:
            normalize_lighting_state({"preset": "NOT_A_REAL_PRESET"})
        self.assertIn("LIGHTING_STATE_INVALID", str(ctx.exception))

    def test_non_object_fails_closed(self):
        with self.assertRaises(ValueError):
            normalize_lighting_state("MEADOW_DAY_SOFT")


class PlacementRootTests(unittest.TestCase):
    def test_map_siblings_are_both_roots(self):
        adventure = FakeObj("AdventureMap")
        mark = FakeObj("MapMark")
        roots = select_placement_roots([adventure, mark])
        self.assertEqual({r.name for r in roots}, {"AdventureMap", "MapMark"})

    def test_child_not_selected_as_root(self):
        parent = FakeObj("AdventureMap")
        child = FakeObj("MapMark", parent=parent)
        roots = select_placement_roots([parent, child])
        self.assertEqual([r.name for r in roots], ["AdventureMap"])


class LightingReportValidationTests(unittest.TestCase):
    def test_valid_report(self):
        errors = validate_lighting_report(
            {
                "appliedPreset": "MEADOW_DAY_SOFT",
                "activeLightCount": 2,
                "importedLightCount": 7,
                "importedLightsRemoved": True,
                "duplicateOwnedLights": 0,
            }
        )
        self.assertEqual(errors, [])

    def test_imported_lights_remaining_fails(self):
        errors = validate_lighting_report(
            {
                "appliedPreset": "MEADOW_DAY_SOFT",
                "activeLightCount": 8,
                "importedLightCount": 7,
                "importedLightsRemoved": False,
                "duplicateOwnedLights": 0,
            }
        )
        self.assertIn("IMPORTED_LIGHTS_REMAIN", errors)
        self.assertIn("TOO_MANY_ACTIVE_LIGHTS", errors)


if __name__ == "__main__":
    unittest.main()
