import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in __import__("sys").path:
    __import__("sys").path.insert(0, str(ROOT))

from forest_atmospheric_depth_v1 import (
    DEPTH_FILL_ENERGY,
    DEPTH_SUN_ENERGY,
    PROOF_SAMPLES as ATMOS_SAMPLES,
    VOLUME_DENSITY as ATMOS_VOLUME,
)
from forest_cinematic_depth_polish_v1 import (
    COMPOSITOR_HAZE_STRENGTH,
    FEATURE,
    HAZE_CARDS,
    POLISH_FILL_ENERGY,
    POLISH_SUN_ENERGY,
    PROOF_DENOISE,
    PROOF_SAMPLES,
    VOLUME_ANISOTROPY,
    VOLUME_DENSITY,
    Z_SKY_CUTOFF,
)


class ForestCinematicDepthPolishTest(unittest.TestCase):
    def test_polish_is_cleaner_and_more_dramatic_than_atmosphere(self):
        self.assertEqual(FEATURE, "forest_cinematic_depth_polish_v1")
        self.assertLess(VOLUME_DENSITY, ATMOS_VOLUME)
        self.assertGreater(VOLUME_ANISOTROPY, 0.7)
        self.assertGreater(POLISH_SUN_ENERGY, DEPTH_SUN_ENERGY)
        self.assertLess(POLISH_FILL_ENERGY, DEPTH_FILL_ENERGY)
        self.assertGreater(PROOF_SAMPLES, ATMOS_SAMPLES)
        self.assertTrue(PROOF_DENOISE)
        self.assertEqual(len(HAZE_CARDS), 3)
        self.assertTrue(all(card[1][1] < Z_SKY_CUTOFF for card in HAZE_CARDS))
        self.assertLess(COMPOSITOR_HAZE_STRENGTH, 0.20)

    def test_proof_keeps_locks_and_prior_stills(self):
        source = (ROOT / "forest_cinematic_depth_polish_v1.py").read_text(encoding="utf-8")
        proof = (ROOT / "stagegraph" / "forest_cinematic_depth_polish_proof_v1.py").read_text(encoding="utf-8")
        self.assertIn("refine_volume_gradient", source)
        self.assertIn("install_haze_cards", source)
        self.assertIn("add_path_catch", source)
        self.assertIn("TJ_AfternoonSkyCard_V2", source)
        self.assertIn("TJ_GROUND_PACKS_V1", source)
        self.assertNotIn("apply_cinematic_world", source)
        self.assertNotIn("apply_ground_lookdev", source)
        self.assertNotIn("apply_purchased_forest_floor", source)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", source)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", proof)
        self.assertIn("FOREST_CINEMATIC_DEPTH_POLISH_PROOF_V1.png", proof)
        self.assertIn("FOREST_ATMOSPHERIC_DEPTH_PROOF_V1.png", proof)
        self.assertIn("FOREST_DIRT_PACK_INTEGRATION_PROOF_V1.png", proof)
        self.assertIn("FOREST_HERO_TREE_REPLACEMENT_PROOF_V1.png", proof)
        self.assertIn("PROOF_WOULD_OVERWRITE", proof)
        self.assertIn("apply_ground_packs", proof)
        self.assertIn("apply_atmospheric_depth", proof)
        self.assertIn("apply_cinematic_depth_polish", proof)
        self.assertIn("use_denoising", proof)


if __name__ == "__main__":
    unittest.main()
