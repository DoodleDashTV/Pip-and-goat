import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forest_material_readability_repair_v1 import (
    BARK_GRAIN_CONTRAST,
    VENDOR_TRUNK_BRIGHT,
    VENDOR_TRUNK_SOCKETS,
    VENDOR_TRUNK_STRENGTH,
)


class ForestMaterialReadabilityRepairTest(unittest.TestCase):
    def test_vendor_bright_is_restored_not_raised(self):
        self.assertEqual(VENDOR_TRUNK_BRIGHT, 0.06)
        self.assertLessEqual(BARK_GRAIN_CONTRAST, 0.22)
        self.assertEqual(VENDOR_TRUNK_STRENGTH, 0.20)
        color = VENDOR_TRUNK_SOCKETS["TreeTrunk_Mat_1"]["Color"]
        luma = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]
        self.assertLess(luma, 0.20)
        self.assertGreater(color[0], color[2])

    def test_no_emission_and_locks_stay_in_source(self):
        source = (ROOT / "forest_material_readability_repair_v1.py").read_text(encoding="utf-8")
        self.assertNotIn("ShaderNodeEmission", source)
        self.assertNotIn("BSDF_EMISSION", source)
        self.assertIn("restore_vendor_bark", source)
        self.assertIn("Tree Trunk_1.png", source)
        self.assertIn("Moss_2.png", source)
        self.assertIn("brightRaised\": False", source)
