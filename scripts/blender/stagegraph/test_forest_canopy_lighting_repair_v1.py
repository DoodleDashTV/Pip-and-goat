import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forest_canopy_lighting_repair_v1 import (
    TRANSLUCENCY_FACTOR,
    _euler_xyz_neg_z,
    _is_canopy_receiver,
    _is_thin_leaf_material,
    _root_cause_candidates,
)


class _Obj:
    def __init__(self, name):
        self.name = name


class ForestCanopyLightingRepairTest(unittest.TestCase):
    def test_key_sun_travels_with_camera_look(self):
        travel = _euler_xyz_neg_z(58.0, -8.0, -42.0)
        self.assertGreater(travel[1], 0.4)
        self.assertLess(travel[2], 0.0)

    def test_only_thin_leaf_materials_are_selected(self):
        self.assertTrue(_is_thin_leaf_material("Leaf_Tree_1"))
        self.assertTrue(_is_thin_leaf_material("Vines_2"))
        self.assertTrue(_is_thin_leaf_material("Fern_3"))
        self.assertFalse(_is_thin_leaf_material("Tree Trunk_1"))
        self.assertFalse(_is_thin_leaf_material("Grass_4"))
        self.assertFalse(_is_thin_leaf_material("TJ_VendorGround_Mat"))

    def test_fill_receivers_exclude_ground_and_grass(self):
        self.assertTrue(_is_canopy_receiver(_Obj("Tree_2.003")))
        self.assertTrue(_is_canopy_receiver(_Obj("Bushes_1.011")))
        self.assertFalse(_is_canopy_receiver(_Obj("TJ_VendorGround")))
        self.assertFalse(_is_canopy_receiver(_Obj("Grass_3.020")))
        self.assertFalse(_is_canopy_receiver(_Obj("Fallen Leaf_0.004")))

    def test_root_cause_flags_backlight_and_missing_translucency(self):
        reasons = _root_cause_candidates(
            0.62,
            0.58,
            [{"name": "TJ_ClearingBounce", "location": [0.0, 8.0, 1.4]}],
            [{"name": "Leaf_Tree_1", "meanTextureLuma": 0.22}],
            0,
        )
        self.assertIn("CAMERA_FACING_FOREST_IS_BACKLIT_BY_KEY_SUN", reasons)
        self.assertIn("EXISTING_BOUNCE_SITS_NEAR_GROUND_AND_PREFERS_TERRAIN", reasons)
        self.assertIn("LEAF_CARDS_HAVE_NO_TRANSLUCENCY_SO_BACKLIGHT_READS_OPAQUE_BLACK", reasons)

    def test_translucency_stays_conservative(self):
        self.assertGreaterEqual(TRANSLUCENCY_FACTOR, 0.10)
        self.assertLessEqual(TRANSLUCENCY_FACTOR, 0.25)


if __name__ == "__main__":
    unittest.main()
