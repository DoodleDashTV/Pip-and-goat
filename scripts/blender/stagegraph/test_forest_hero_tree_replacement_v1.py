import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in __import__("sys").path:
    __import__("sys").path.insert(0, str(ROOT))

from forest_hero_tree_replacement_v1 import (
    BACKGROUND_Y,
    FEATURE,
    HERO_BLENDS,
    HERO_FILL_ENERGY,
    HERO_PLACEMENTS,
    HERO_PROOF_DENOISE,
    HERO_SUN_ENERGY,
    HERO_SUN_TRAVEL,
    missing_hero_paths,
)
from forest_interior_sun_canopy_structure_v1 import INTERIOR_FILL_ENERGY, INTERIOR_SUN_ENERGY
from forest_sunny_afternoon_tree_detail_v1 import AFTERNOON_FILL_ENERGY


class ForestHeroTreeReplacementTest(unittest.TestCase):
    def test_feature_and_locked_background(self):
        self.assertEqual(FEATURE, "forest_hero_tree_replacement_v1")
        self.assertEqual(BACKGROUND_Y, 18.0)
        self.assertGreaterEqual(len(HERO_PLACEMENTS), 8)
        self.assertTrue(any(xy[1] < BACKGROUND_Y for _n, _s, xy, _h, _y in HERO_PLACEMENTS))
        self.assertTrue(any(xy[1] >= BACKGROUND_Y for _n, _s, xy, _h, _y in HERO_PLACEMENTS))
        self.assertIn("fagus_a", HERO_BLENDS)
        self.assertIn("salix_a", HERO_BLENDS)

    def test_sun_is_camera_side_and_not_a_flood(self):
        self.assertGreater(HERO_SUN_TRAVEL[1], 0.35)
        self.assertLess(HERO_SUN_TRAVEL[2], 0.0)
        self.assertGreater(HERO_SUN_ENERGY, 18.0)
        self.assertLess(HERO_SUN_ENERGY, INTERIOR_SUN_ENERGY)
        self.assertLess(HERO_FILL_ENERGY, AFTERNOON_FILL_ENERGY)
        self.assertGreater(HERO_FILL_ENERGY, INTERIOR_FILL_ENERGY - 5.0)
        self.assertFalse(HERO_PROOF_DENOISE)

    def test_proof_hides_ecokit_and_does_not_rebuild_ground(self):
        source = (ROOT / "forest_hero_tree_replacement_v1.py").read_text(encoding="utf-8")
        proof = (ROOT / "stagegraph" / "forest_hero_tree_replacement_proof_v1.py").read_text(encoding="utf-8")
        self.assertIn("hide_ecokit_hero_trees", source)
        self.assertIn("hide_render = True", source)
        self.assertNotIn("bpy.data.objects.remove", source)
        self.assertIn("TJ_AfternoonSkyCard_V2", source)
        self.assertIn("FOREST_HERO_TREE_REPLACEMENT_PROOF_V1.png", proof)
        self.assertIn("apply_interior_sun_canopy_structure", proof)
        self.assertIn("apply_hero_tree_replacement", proof)
        self.assertIn("PROOF_WOULD_OVERWRITE", proof)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", proof)
        self.assertNotIn("apply_purchased_forest_floor", source)
        self.assertNotIn("apply_ground_lookdev", source)

    def test_missing_paths_are_exact_when_absent(self):
        paths = missing_hero_paths()
        self.assertIsInstance(paths, list)
        for path in paths:
            self.assertTrue(path.endswith(".blend") or path.endswith(".png") or path.endswith(".jpg"))


if __name__ == "__main__":
    unittest.main()
