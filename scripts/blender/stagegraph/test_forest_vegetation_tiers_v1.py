import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forest_vegetation_tiers_v1 import classify_tier, eco_kit_allowed, required_source


class ForestVegetationTiersTest(unittest.TestCase):
    def test_distance_and_pixel_rules(self):
        self.assertEqual(classify_tier(2.0), "hero")
        self.assertEqual(classify_tier(12.0), "midground")
        self.assertEqual(classify_tier(22.0), "background")
        self.assertEqual(classify_tier(22.0, projected_px=120), "hero")

    def test_ecokit_only_in_background(self):
        self.assertFalse(eco_kit_allowed("hero"))
        self.assertFalse(eco_kit_allowed("midground"))
        self.assertTrue(eco_kit_allowed("background"))

    def test_hero_sources(self):
        self.assertEqual(required_source("hero", "bark"), "botaniq_tilia")
        self.assertEqual(required_source("hero", "grass"), "botaniq_carex")
        self.assertEqual(required_source("background", "shrub"), "ecokit_or_botaniq")
