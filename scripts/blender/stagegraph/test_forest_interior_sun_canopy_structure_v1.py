import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in __import__("sys").path:
    __import__("sys").path.insert(0, str(ROOT))

from forest_interior_sun_canopy_structure_v1 import (
    FEATURE,
    INTERIOR_FILL_ENERGY,
    INTERIOR_SUN_COLOR,
    INTERIOR_SUN_ENERGY,
)
from forest_sunny_afternoon_tree_detail_v1 import AFTERNOON_FILL_ENERGY, AFTERNOON_SUN_ENERGY


class ForestInteriorSunCanopyStructureTest(unittest.TestCase):
    def test_key_sun_dominates_quieter_fill(self):
        self.assertEqual(FEATURE, "forest_interior_sun_canopy_structure_v1")
        self.assertGreater(INTERIOR_SUN_ENERGY, AFTERNOON_SUN_ENERGY)
        self.assertLess(INTERIOR_FILL_ENERGY, AFTERNOON_FILL_ENERGY)
        self.assertGreater(INTERIOR_SUN_COLOR[0], INTERIOR_SUN_COLOR[2])
        self.assertGreater(INTERIOR_SUN_COLOR[1], 0.80)

    def test_keeps_v3_sky_and_does_not_rebuild_ground(self):
        source = (ROOT / "forest_interior_sun_canopy_structure_v1.py").read_text(encoding="utf-8")
        self.assertIn("apply_sunny_afternoon_tree_detail", source)
        self.assertIn("install_sun_gobo", source)
        self.assertIn("add_interior_kickers", source)
        self.assertIn("scatter_canopy_structure", source)
        self.assertIn("TJ_AfternoonSkyCard_V2", source)
        self.assertIn("generate_gobo_texture", source)
        self.assertNotIn("apply_cinematic_world", source)
        self.assertNotIn("apply_ground_lookdev", source)
        self.assertNotIn("apply_purchased_forest_floor", source)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", source)
        proof = (ROOT / "stagegraph" / "forest_interior_sun_canopy_structure_proof_v1.py").read_text(encoding="utf-8")
        self.assertIn("FOREST_INTERIOR_SUN_CANOPY_STRUCTURE_PROOF_V1.png", proof)
        self.assertIn("replace_failed_micro_dressing", proof)
        self.assertIn("hide_identified_rainbow_specks", proof)
        self.assertIn("PROOF_WOULD_OVERWRITE", proof)
        self.assertIn("apply_interior_sun_canopy_structure", proof)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", proof)


if __name__ == "__main__":
    unittest.main()
