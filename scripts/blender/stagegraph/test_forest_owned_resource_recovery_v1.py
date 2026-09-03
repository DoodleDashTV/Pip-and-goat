import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forest_owned_resource_recovery_v1 import (
    BARK_NORMAL_STRENGTH,
    COLLECTION_NAME,
    FEATURE,
    required_owned_paths,
)


class ForestOwnedResourceRecoveryTest(unittest.TestCase):
    def test_recovery_stays_on_lookdev_collection(self):
        self.assertEqual(FEATURE, "forest_owned_resource_recovery_v1")
        self.assertEqual(COLLECTION_NAME, "TJ_LOOKDEV_ISOLATION_V1")
        source = (ROOT / "forest_owned_resource_recovery_v1.py").read_text(encoding="utf-8")
        self.assertIn("cameraChanged\": False", source)
        self.assertIn("productionGeometryChanged\": False", source)
        self.assertIn("lightingChanged\": False", source)
        self.assertNotIn("ShaderNodeEmission", source)
        self.assertLess(BARK_NORMAL_STRENGTH, 0.9)

    def test_required_owned_categories_are_named(self):
        required = required_owned_paths()
        self.assertIn("barkAlbedo", required)
        self.assertIn("soilAlbedo", required)
        self.assertIn("litterAlbedo", required)
        self.assertIn("mossAlbedo", required)
        self.assertIn("leafAlbedo", required)
        self.assertIn("shrubBlend", required)
        self.assertIn("grassBlend", required)
        names = " ".join(path.name for path in required.values())
        self.assertIn("Tilia", names)
        self.assertIn("Soil_Loose", names)
        self.assertIn("Fallen_Leaves", names)
        self.assertIn("Corylus", names)

    def test_proof_does_not_rebuild_cinematic_lighting(self):
        proof = (ROOT / "stagegraph" / "forest_owned_resource_recovery_proof_v1.py").read_text(encoding="utf-8")
        self.assertNotIn("apply_cinematic_forest_lighting_repair", proof)
        self.assertIn("LOOKDEV_BARK_OWNED_V1", proof)
        self.assertIn("verify_production_camera", proof)
