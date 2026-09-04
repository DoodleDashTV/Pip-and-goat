import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in __import__("sys").path:
    __import__("sys").path.insert(0, str(ROOT))

from forest_atmospheric_depth_v1 import (
    DEPTH_FILL_ENERGY,
    DEPTH_SUN_ENERGY,
    FEATURE,
    HAZE_STRENGTH,
    PROOF_DENOISE,
    PROOF_SAMPLES,
    VOLUME_ANISOTROPY,
    VOLUME_DENSITY,
    VOLUME_Y_MAX,
    Z_HAZE_START,
    Z_SKY_CUTOFF,
)
from forest_hero_tree_replacement_v1 import HERO_FILL_ENERGY, HERO_SUN_ENERGY
from forest_sunny_afternoon_tree_detail_v1 import ATMOSPHERE_DENSITY_CLEAR


class ForestAtmosphericDepthTest(unittest.TestCase):
    def test_volume_is_shafts_not_cleared_or_milk(self):
        self.assertEqual(FEATURE, "forest_atmospheric_depth_v1")
        self.assertGreater(VOLUME_DENSITY, ATMOSPHERE_DENSITY_CLEAR)
        self.assertLess(VOLUME_DENSITY, 0.01)
        self.assertGreater(VOLUME_ANISOTROPY, 0.55)
        self.assertLess(VOLUME_Y_MAX, 62.0)
        self.assertLess(Z_HAZE_START, Z_SKY_CUTOFF)
        self.assertLess(Z_SKY_CUTOFF, 62.0)
        self.assertLess(HAZE_STRENGTH, 0.25)
        self.assertGreater(DEPTH_SUN_ENERGY, HERO_SUN_ENERGY)
        self.assertLess(DEPTH_FILL_ENERGY, HERO_FILL_ENERGY)
        self.assertGreaterEqual(PROOF_SAMPLES, 96)
        self.assertTrue(PROOF_DENOISE)

    def test_proof_keeps_locks_and_prior_stills(self):
        source = (ROOT / "forest_atmospheric_depth_v1.py").read_text(encoding="utf-8")
        proof = (ROOT / "stagegraph" / "forest_atmospheric_depth_proof_v1.py").read_text(encoding="utf-8")
        self.assertIn("restore_volume_shafts", source)
        self.assertIn("apply_sky_protected_depth", source)
        self.assertIn("add_hero_edge_rim", source)
        self.assertIn("TJ_AfternoonSkyCard_V2", source)
        self.assertIn("skyCardProtected", source)
        self.assertNotIn("apply_cinematic_world", source)
        self.assertNotIn("apply_ground_lookdev", source)
        self.assertNotIn("apply_purchased_forest_floor", source)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", source)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", proof)
        self.assertIn("FOREST_ATMOSPHERIC_DEPTH_PROOF_V1.png", proof)
        self.assertIn("FOREST_HERO_TREE_REPLACEMENT_PROOF_V1.png", proof)
        self.assertIn("FOREST_DIRT_PACK_INTEGRATION_PROOF_V1.png", proof)
        self.assertIn("PROOF_WOULD_OVERWRITE", proof)
        self.assertIn("apply_ground_packs", proof)
        self.assertIn("apply_hero_tree_replacement", proof)
        self.assertIn("apply_atmospheric_depth", proof)
        self.assertIn("use_denoising", proof)


if __name__ == "__main__":
    unittest.main()
