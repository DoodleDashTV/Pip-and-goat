import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in __import__("sys").path:
    __import__("sys").path.insert(0, str(ROOT))

from forest_ground_detail_recovery_v1 import (
    FEATURE,
    LOCKED_MATERIAL_LIGHTING,
    STAMP_PREFIXES,
)


class ForestGroundDetailRecoveryTest(unittest.TestCase):
    def test_lighting_lock_matches_v3(self):
        self.assertEqual(FEATURE, "forest_ground_detail_recovery_v1")
        self.assertEqual(LOCKED_MATERIAL_LIGHTING["hdriStrength"], 0.12)
        self.assertEqual(LOCKED_MATERIAL_LIGHTING["exposure"], 1.10)
        self.assertEqual(LOCKED_MATERIAL_LIGHTING["fillColor"], (0.82, 0.78, 0.70))
        self.assertEqual(LOCKED_MATERIAL_LIGHTING["viewTransform"], "AgX")

    def test_does_not_rebuild_locks_or_stamps(self):
        source = (ROOT / "forest_ground_detail_recovery_v1.py").read_text(encoding="utf-8")
        self.assertIn("TJ_CoverLitterPatch_", source)
        self.assertIn("paint_rainbow_object_ids", source)
        self.assertIn("replace_failed_micro_dressing", source)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", source)
        self.assertTrue(any(name.startswith("TJ_CoverMossPatch_") or name == "TJ_CoverMossPatch_" for name in STAMP_PREFIXES) or "TJ_CoverMossPatch_" in STAMP_PREFIXES)
        proof = (ROOT / "stagegraph" / "forest_ground_detail_recovery_proof_v1.py").read_text(encoding="utf-8")
        self.assertIn("FOREST_RAINBOW_SPECK_OBJECT_ID_V1.png", proof)
        self.assertIn("PROOF_WOULD_OVERWRITE", proof)
        self.assertIn("verify_production_camera", proof)
        self.assertIn("1280", proof)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", proof)


if __name__ == "__main__":
    unittest.main()
