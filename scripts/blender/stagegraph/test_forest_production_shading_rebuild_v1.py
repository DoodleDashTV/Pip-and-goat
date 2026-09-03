import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forest_production_shading_rebuild_v1 import (
    BARK_BUMP_DISTANCE,
    BARK_BUMP_STRENGTH,
    BARK_ROUGH_MAX,
    BARK_ROUGH_MIN,
    CANOPY_FILL_ENERGY,
    EARTH_A,
    EARTH_B,
    EARTH_DAMP,
    EXPOSURE,
    FALLEN_LEAF_TARGET,
    FILL_ENERGY,
    FLORA_WRAPPER,
    MOSS_DRESSING,
    TRUNK_MAT_PREFIX,
    VENDOR_WOOD,
    _flora_role,
)


class ForestProductionShadingRebuildTest(unittest.TestCase):
    def test_bark_uses_vendor_wood_and_noncolor_grain(self):
        luma = 0.2126 * VENDOR_WOOD[0] + 0.7152 * VENDOR_WOOD[1] + 0.0722 * VENDOR_WOOD[2]
        self.assertLess(luma, 0.20)
        self.assertGreater(VENDOR_WOOD[0], VENDOR_WOOD[1])
        self.assertGreater(VENDOR_WOOD[1], VENDOR_WOOD[2])
        self.assertGreater(BARK_BUMP_STRENGTH, 0.45)
        self.assertLessEqual(BARK_BUMP_STRENGTH, 1.0)
        self.assertGreater(BARK_BUMP_DISTANCE, 0.02)
        self.assertLessEqual(BARK_BUMP_DISTANCE, 0.14)
        self.assertGreaterEqual(BARK_ROUGH_MIN, 0.70)
        self.assertGreater(BARK_ROUGH_MAX, BARK_ROUGH_MIN)
        self.assertEqual(TRUNK_MAT_PREFIX, "TJ_ProdTrunk_")

    def test_earth_is_brown_not_mustard_and_moss_is_not_albedo(self):
        self.assertGreater(EARTH_A[0], EARTH_A[1])
        self.assertGreater(EARTH_A[1], EARTH_A[2])
        self.assertGreater(EARTH_B[0], EARTH_B[2])
        self.assertLess(EARTH_A[1] / max(EARTH_A[0], 1e-6), 0.85)
        self.assertLess(EARTH_DAMP[0], EARTH_A[0])
        self.assertGreater(MOSS_DRESSING[1], MOSS_DRESSING[0])
        self.assertLess(MOSS_DRESSING[1] / max(MOSS_DRESSING[0], 1e-6), 1.55)
        source = (ROOT / "forest_production_shading_rebuild_v1.py").read_text(encoding="utf-8")
        earth_fn = source.split("def install_production_earth", 1)[1].split("def _flora_role", 1)[0]
        self.assertNotIn("Moss_1.png", earth_fn)
        self.assertNotIn("Moss_2.png", earth_fn)
        self.assertIn("mossTexturesUsedAsAlbedo\": False", earth_fn)

    def test_flora_wrapper_preserves_vendor_shader_and_separates_roles(self):
        self.assertEqual(_flora_role("TreeTrunk_Mat_1"), None)
        self.assertEqual(_flora_role("TJ_VendorGround_Mat"), None)
        self.assertEqual(_flora_role("Branch_1.002"), "branch")
        self.assertEqual(_flora_role("Bush_1"), "bush")
        self.assertEqual(_flora_role("TreeLeaf_1"), "leaf")
        self.assertEqual(_flora_role("Fallen Leaf_0"), "fallen")
        self.assertEqual(FLORA_WRAPPER, "TJ_ProdFloraPrincipled_V1")
        self.assertGreaterEqual(FALLEN_LEAF_TARGET, 150)
        source = (ROOT / "forest_production_shading_rebuild_v1.py").read_text(encoding="utf-8")
        self.assertIn("_first_mask_image", source)
        self.assertIn("color1_mask", source)
        self.assertIn("Shader_Cycles", source)
        wrapper = source.split("def install_flora_production_wrappers", 1)[1]
        self.assertIn("TJ_ProdFloraAlpha_V1", wrapper)
        self.assertIn("GREATER_THAN", wrapper)
        self.assertNotIn("links.new(image_node.outputs[\"Color\"], _mix_ab(tint)[0])", wrapper)

    def test_lighting_is_rebalanced_not_washed(self):
        self.assertEqual(EXPOSURE, 0.38)
        self.assertLess(FILL_ENERGY, 240.0)
        self.assertLess(CANOPY_FILL_ENERGY, 420.0)
        self.assertGreater(FILL_ENERGY, 100.0)

    def test_no_emission_and_failed_principled_override_is_not_called(self):
        source = (ROOT / "forest_production_shading_rebuild_v1.py").read_text(encoding="utf-8")
        self.assertNotIn("ShaderNodeEmission", source)
        self.assertNotIn("BSDF_EMISSION", source)
        self.assertNotIn("install_cycles_safe_flora_surfaces", source)
        self.assertIn("Non-Color", source)
        self.assertIn("vendorShaderPreserved", source)
        self.assertIn("Tree Trunk_1.png", source)
        apply_src = source.split("def apply_forest_production_shading_rebuild", 1)[1]
        self.assertIn("install_production_trunk_materials", apply_src)
        self.assertIn("install_production_earth", apply_src)
        self.assertIn("install_flora_production_wrappers", apply_src)
        self.assertIn("install_atmospheric_camera_world", apply_src)
        self.assertIn("cameraChanged\": False", apply_src)
        self.assertIn("geometryRebuilt\": False", apply_src)
