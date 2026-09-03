import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forest_camera_ground_cover_v1 import FOOTPRINT, FEATURE, camera_footprint, in_footprint


class ForestCameraGroundCoverTest(unittest.TestCase):
    def test_footprint_covers_locked_camera_floor(self):
        self.assertEqual(FEATURE, "forest_camera_ground_cover_v1")
        box = camera_footprint()
        self.assertLessEqual(box["xMin"], -17.5)
        self.assertGreaterEqual(box["xMax"], 17.5)
        self.assertLessEqual(box["yMin"], -4.5)
        self.assertGreaterEqual(box["yMax"], 36.0)
        self.assertTrue(in_footprint(0.0, 3.5))
        self.assertFalse(in_footprint(40.0, 3.5))

    def test_does_not_touch_locks_or_vendor_shader(self):
        source = (ROOT / "forest_camera_ground_cover_v1.py").read_text(encoding="utf-8")
        self.assertIn("vendorGroundShaderChanged\": False", source)
        self.assertIn("cameraChanged\": False", source)
        self.assertIn("waterChanged\": False", source)
        self.assertIn("lightingChanged\": False", source)
        self.assertNotIn("user_remap", source)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", source)
        self.assertNotIn("TJ_VendorGround_Mat", source)
        self.assertIn("make_ovate_leaf", source)
        self.assertIn("bq_Moss_Rhytidiadelphus-squarrosus_A", source)
        self.assertNotIn("make_moss_mound", source)

    def test_proof_writes_versioned_camera_still(self):
        proof = (ROOT / "stagegraph" / "forest_camera_ground_cover_proof_v1.py").read_text(encoding="utf-8")
        self.assertIn("FOREST_GROUND_COVER_CAMERA_PROOF_V1.png", proof)
        self.assertIn("PROOF_WOULD_OVERWRITE", proof)
        self.assertIn("verify_production_camera", proof)
        self.assertIn("1280", proof)
        self.assertIn("720", proof)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", proof)
        self.assertNotIn("enforce_production_floor", proof)


if __name__ == "__main__":
    unittest.main()
