import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in __import__("sys").path:
    __import__("sys").path.insert(0, str(ROOT))

from forest_lighting_color_recovery_v1 import DIAGNOSTIC_VARIANTS, FEATURE, baseline_values


class ForestLightingColorRecoveryTest(unittest.TestCase):
    def test_variants_are_single_class_and_named(self):
        self.assertEqual(FEATURE, "forest_lighting_color_recovery_v1")
        self.assertEqual(
            set(DIAGNOSTIC_VARIANTS),
            {"baseline", "exposure", "world", "keyfill", "neutral"},
        )
        self.assertEqual(DIAGNOSTIC_VARIANTS["baseline"]["exposure"], baseline_values()["exposure"])
        self.assertEqual(DIAGNOSTIC_VARIANTS["baseline"]["hdriStrength"], 0.58)
        self.assertEqual(DIAGNOSTIC_VARIANTS["exposure"]["hdriStrength"], 0.58)
        self.assertEqual(DIAGNOSTIC_VARIANTS["exposure"]["fillEnergy"], 520.0)
        self.assertLess(DIAGNOSTIC_VARIANTS["world"]["hdriStrength"], 0.2)
        self.assertEqual(DIAGNOSTIC_VARIANTS["world"]["fillEnergy"], 520.0)
        self.assertLess(DIAGNOSTIC_VARIANTS["keyfill"]["fillEnergy"], 200.0)
        self.assertEqual(DIAGNOSTIC_VARIANTS["keyfill"]["hdriStrength"], 0.58)
        self.assertTrue(DIAGNOSTIC_VARIANTS["neutral"]["neutralWorld"])

    def test_does_not_touch_locks_or_cinematic_rebuild(self):
        source = (ROOT / "forest_lighting_color_recovery_v1.py").read_text(encoding="utf-8")
        self.assertIn("cameraChanged\": False", source)
        self.assertIn("suppress_ecokit_visual_noise", source)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", source)
        self.assertNotIn("user_remap", source)
        proof = (ROOT / "stagegraph" / "forest_lighting_color_recovery_proof_v1.py").read_text(encoding="utf-8")
        self.assertIn("PROOF_WOULD_OVERWRITE", proof)
        self.assertIn("verify_production_camera", proof)
        self.assertIn("1280", proof)
        self.assertIn("720", proof)
        self.assertIn("apply_camera_ground_cover", proof)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", proof)


if __name__ == "__main__":
    unittest.main()
