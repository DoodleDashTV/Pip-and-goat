import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forest_lookdev_isolation_v1 import (
    CAMERA_NAME,
    COLLECTION_NAME,
    FILL_ENERGY,
    KEY_ENERGY,
    LOOKDEV_EXPOSURE,
    ORIGIN,
    RIM_ENERGY,
    analyze_bark_texture,
)


class ForestLookdevIsolationTest(unittest.TestCase):
    def test_lookdev_stays_isolated_from_production(self):
        self.assertEqual(COLLECTION_NAME, "TJ_LOOKDEV_ISOLATION_V1")
        self.assertEqual(CAMERA_NAME, "TJ_LookdevIsolation_Camera")
        self.assertGreater(ORIGIN[0], 40.0)
        source = (ROOT / "forest_lookdev_isolation_v1.py").read_text(encoding="utf-8")
        self.assertIn("LOOKDEV_PRODUCTION_CAMERA_LOCATION_CHANGED", source)
        self.assertIn("productionGeometryChanged\": False", source)
        self.assertIn("forest_botaniq_hidden", source)
        self.assertNotIn("ShaderNodeEmission", source)
        apply_src = source.split("def apply_forest_lookdev_isolation", 1)[1]
        self.assertIn("verify_production_camera", apply_src)

    def test_studio_lighting_is_neutral_not_cinematic(self):
        self.assertGreater(KEY_ENERGY, FILL_ENERGY * 3)
        self.assertLess(FILL_ENERGY, 120.0)
        self.assertGreater(RIM_ENERGY, 40.0)
        self.assertEqual(LOOKDEV_EXPOSURE, 0.0)

    def test_bark_texture_analysis_reports_low_contrast(self):
        report = analyze_bark_texture()
        if not report.get("found"):
            self.skipTest("Tree Trunk_1.png not extracted in this environment")
        self.assertLess(report["std"], 18.0)
        self.assertTrue(report["lowContrast"])
        self.assertTrue(report["narrowRange"])
        self.assertGreater(report["uniqueValues"], 20)
