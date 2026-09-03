import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forest_botaniq_production_recovery_v1 import (
    BACKGROUND_Y,
    BARK_NORMAL_STRENGTH,
    FEATURE,
    TILIA_ASPECT,
    required_owned_paths,
)


class ForestBotaniqProductionRecoveryTest(unittest.TestCase):
    def test_locks_and_no_emission(self):
        source = (ROOT / "forest_botaniq_production_recovery_v1.py").read_text(encoding="utf-8")
        self.assertEqual(FEATURE, "forest_botaniq_production_recovery_v1")
        self.assertLess(BARK_NORMAL_STRENGTH, 0.75)
        self.assertEqual(TILIA_ASPECT, 4.0)
        self.assertGreater(BACKGROUND_Y, 12.0)
        self.assertIn("cameraChanged\": False", source)
        self.assertIn("terrainChanged\": False", source)
        self.assertIn("waterChanged\": False", source)
        self.assertIn("lightingChanged\": False", source)
        self.assertNotIn("ShaderNodeEmission", source)
        self.assertIn("cylindrical_unwrap_trunk_faces", source)
        self.assertIn("bq_Soil_Loose_Diffuse", source)
        self.assertIn("_exile", source)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", source)

    def test_required_owned_sources(self):
        required = required_owned_paths()
        names = " ".join(path.name for path in required.values())
        self.assertIn("Tilia", names)
        self.assertIn("Corylus", names)
        self.assertIn("Carex", names)
        self.assertIn("Dryopteris", names)
        self.assertIn("Soil_Loose", names)

    def test_proof_uses_neutral_lookdev_and_locked_camera(self):
        proof = (ROOT / "stagegraph" / "forest_botaniq_production_recovery_proof_v1.py").read_text(encoding="utf-8")
        self.assertIn("LOOKDEV_BARK_PRODUCTION_V2", proof)
        self.assertIn("LOOKDEV_GRASS_FERN_PRODUCTION_V2", proof)
        self.assertIn("FOREST_MATERIAL_RECOVERY_CAMERA_PROOF_V1", proof)
        self.assertIn("verify_production_camera", proof)
        self.assertIn("_exclusive_visibility", proof)
        self.assertIn("BARK_SUBJECT_NOT_CYLINDER", proof)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", proof)
