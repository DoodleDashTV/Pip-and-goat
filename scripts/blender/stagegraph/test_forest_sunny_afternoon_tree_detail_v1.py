import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in __import__("sys").path:
    __import__("sys").path.insert(0, str(ROOT))

from forest_cinematic_lighting_recovery_v1 import CINEMATIC_FILL_COLOR
from forest_ground_detail_recovery_v1 import LOCKED_MATERIAL_LIGHTING
from forest_sunny_afternoon_tree_detail_v1 import (
    AFTERNOON_SUN_COLOR,
    AFTERNOON_SUN_ENERGY,
    ATMOSPHERE_DENSITY_CLEAR,
    FEATURE,
    MIST_STRENGTH_OFF,
    SKY_IMAGE_NAME,
)


class ForestSunnyAfternoonTreeDetailTest(unittest.TestCase):
    def test_afternoon_is_brighter_and_warmer_than_cinematic_v1(self):
        self.assertEqual(FEATURE, "forest_sunny_afternoon_tree_detail_v1")
        self.assertEqual(SKY_IMAGE_NAME, "Sky_World_2.png")
        self.assertGreater(AFTERNOON_SUN_ENERGY, 7.4)
        self.assertGreater(AFTERNOON_SUN_COLOR[1], 0.82)
        self.assertGreater(AFTERNOON_SUN_COLOR[2], 0.62)
        self.assertEqual(MIST_STRENGTH_OFF, 0.0)
        self.assertLess(ATMOSPHERE_DENSITY_CLEAR, 0.0005)
        self.assertEqual(CINEMATIC_FILL_COLOR, LOCKED_MATERIAL_LIGHTING["fillColor"])

    def test_does_not_rebuild_ground_or_unlock_camera(self):
        source = (ROOT / "forest_sunny_afternoon_tree_detail_v1.py").read_text(encoding="utf-8")
        self.assertIn("install_camera_visible_afternoon_sky", source)
        self.assertIn("install_camera_sky_card", source)
        self.assertIn("scatter_canopy_leaf_cards", source)
        self.assertIn("generate_afternoon_sky_texture", source)
        self.assertIn("AFTERNOON_SKY_TEXTURE_UNAVAILABLE", source)
        self.assertIn("_assign_quad_uvs", source)
        self.assertIn("make_canopy_leaf_sprite", source)
        self.assertIn("sharpen_canopy_materials", source)
        self.assertIn("verify_material_lighting_lock", source)
        self.assertIn("hide_identified_rainbow_specks", (ROOT / "stagegraph" / "forest_sunny_afternoon_tree_detail_proof_v1.py").read_text(encoding="utf-8"))
        self.assertNotIn("apply_cinematic_world", source)
        self.assertNotIn("apply_ground_lookdev", source)
        self.assertNotIn("apply_purchased_forest_floor", source)
        proof = (ROOT / "stagegraph" / "forest_sunny_afternoon_tree_detail_proof_v1.py").read_text(encoding="utf-8")
        self.assertIn("FOREST_SUNNY_AFTERNOON_TREE_DETAIL_PROOF_V3.png", proof)
        self.assertIn("replace_failed_micro_dressing", proof)
        self.assertIn("PROOF_WOULD_OVERWRITE", proof)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", proof)


if __name__ == "__main__":
    unittest.main()
