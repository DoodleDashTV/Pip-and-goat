import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from cinematic_forest_lighting_repair_v1 import (
    EXPOSURE,
    FLORA_AO_DISTANCE,
    FLORA_AO_VALUE,
    FLORA_BUSH_LIGHT_INTENSITY,
    FLORA_CANOPY_LIGHT_INTENSITY,
    FLORA_GRASS_LIGHT_INTENSITY,
    GAMMA,
    GROUND_EARTH,
    GROUND_MOSS,
    HDRI_CAMERA_STRENGTH,
    HDRI_LIGHT_STRENGTH,
    PREFERRED_LOOKS,
    SUN_COLOR,
    SUN_ENERGY,
    SUN_TRAVEL,
    TRANSLUCENCY_FACTOR,
    VIEW_TRANSFORM,
)


class CinematicForestLightingRepairTest(unittest.TestCase):
    def test_key_sun_is_high_side_light_not_a_global_wash(self):
        travel = SUN_TRAVEL
        self.assertGreater(travel[0], 0.35)
        self.assertGreater(travel[1], 0.30)
        self.assertLess(travel[2], -0.70)
        self.assertGreater(SUN_ENERGY, 8.0)
        self.assertGreater(SUN_COLOR[1], 0.82)
        self.assertGreater(SUN_COLOR[2], 0.65)

    def test_exposure_protects_the_sky_instead_of_washing_it(self):
        self.assertEqual(VIEW_TRANSFORM, "AgX")
        self.assertLessEqual(EXPOSURE, 0.45)
        self.assertLess(EXPOSURE, 0.65)
        self.assertEqual(GAMMA, 1.0)
        self.assertLess(HDRI_CAMERA_STRENGTH, HDRI_LIGHT_STRENGTH)
        self.assertLessEqual(HDRI_CAMERA_STRENGTH, 0.55)
        self.assertEqual(PREFERRED_LOOKS[0], "AgX - Base Contrast")

    def test_ground_recipe_is_earth_moss_not_orange(self):
        red, green, blue = GROUND_EARTH
        self.assertLess(red / max(green, 1e-6), 1.35)
        self.assertGreater(green, blue)
        self.assertGreater(GROUND_MOSS[1], GROUND_MOSS[0])

    def test_leaf_translucency_stays_physically_plausible(self):
        self.assertGreaterEqual(TRANSLUCENCY_FACTOR, 0.20)
        self.assertLessEqual(TRANSLUCENCY_FACTOR, 0.32)

    def test_flora_ao_crush_is_neutralized_without_emission(self):
        self.assertLessEqual(FLORA_AO_DISTANCE, 0.25)
        self.assertGreater(FLORA_AO_VALUE, 0.0)
        self.assertLess(FLORA_AO_VALUE, 0.3)
        self.assertGreaterEqual(FLORA_CANOPY_LIGHT_INTENSITY, 0.55)
        self.assertLess(FLORA_BUSH_LIGHT_INTENSITY, FLORA_CANOPY_LIGHT_INTENSITY)
        self.assertLess(FLORA_GRASS_LIGHT_INTENSITY, FLORA_CANOPY_LIGHT_INTENSITY)
        source = (ROOT / "cinematic_forest_lighting_repair_v1.py").read_text(encoding="utf-8")
        self.assertNotIn("ShaderNodeEmission", source)
        self.assertNotIn("BSDF_EMISSION", source)
        self.assertIn("verify_locks", source)
        self.assertIn("CINEMATIC_CAMERA_LOCATION_CHANGED", source)
        self.assertIn("repair_flora_shader_light_response", source)
        self.assertIn("install_cycles_safe_flora_surfaces", source)
        self.assertIn("TJ_CinematicCyclesPrincipled_V1", source)
