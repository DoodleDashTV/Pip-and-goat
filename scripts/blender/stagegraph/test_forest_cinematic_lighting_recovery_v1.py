import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in __import__("sys").path:
    __import__("sys").path.insert(0, str(ROOT))

from forest_cinematic_lighting_recovery_v1 import (
    CINEMATIC_FILL_COLOR,
    CINEMATIC_SUN_ENERGY,
    FEATURE,
)
from forest_ground_detail_recovery_v1 import LOCKED_MATERIAL_LIGHTING


class ForestCinematicLightingRecoveryTest(unittest.TestCase):
    def test_preserves_v3_material_lock(self):
        self.assertEqual(FEATURE, "forest_cinematic_lighting_recovery_v1")
        self.assertEqual(CINEMATIC_FILL_COLOR, LOCKED_MATERIAL_LIGHTING["fillColor"])
        self.assertGreater(CINEMATIC_SUN_ENERGY, LOCKED_MATERIAL_LIGHTING["sunEnergy"])

    def test_does_not_rebuild_ground_or_legacy_cinematic_world(self):
        source = (ROOT / "forest_cinematic_lighting_recovery_v1.py").read_text(encoding="utf-8")
        self.assertIn("verify_material_lighting_lock", source)
        self.assertIn("_lighting_hdri_strength", source)
        self.assertIn("retune_cinematic_lights", source)
        self.assertNotIn("apply_cinematic_world", source)
        self.assertNotIn("apply_ground_lookdev", source)
        self.assertNotIn("apply_forest_production_shading_rebuild", source)
        self.assertNotIn("repair_trunk_readability", source)
        proof = (ROOT / "stagegraph" / "forest_cinematic_lighting_recovery_proof_v1.py").read_text(encoding="utf-8")
        self.assertIn("FOREST_CINEMATIC_LIGHTING_CAMERA_PROOF_V1.png", proof)
        self.assertIn("hide_identified_rainbow_specks", proof)
        self.assertIn("replace_failed_micro_dressing", proof)
        self.assertIn("apply_locked_material_lighting", proof)
        self.assertIn("PROOF_WOULD_OVERWRITE", proof)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", proof)


if __name__ == "__main__":
    unittest.main()
