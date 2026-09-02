import unittest

from ecokit_cycles_alpha_v1 import (
    classify_material,
    is_cycles_output,
    is_eevee_output,
    material_name_looks_like_foliage,
    material_name_skips_alpha,
    normalize_blender_path,
)


class _Sock:
    def __init__(self, name):
        self.name = name


class _Link:
    def __init__(self, to_node, from_socket):
        self.to_node = to_node
        self.from_socket = _Sock(from_socket)


class EcoKitCyclesAlphaTest(unittest.TestCase):
    def test_normalizes_windows_texture_paths(self):
        self.assertEqual(normalize_blender_path("//Textures\\Tree Trunk_1.png"), "//Textures/Tree Trunk_1.png")

    def test_tree_leaf_is_foliage_and_trunk_is_not(self):
        self.assertTrue(material_name_looks_like_foliage("Leaf_Tree_1"))
        self.assertTrue(material_name_skips_alpha("Tree Trunk_2"))
        self.assertFalse(material_name_skips_alpha("Flora_Leaf"))

    def test_unused_image_alpha_is_cutout_even_on_tree_materials(self):
        self.assertEqual(
            classify_material({"name": "Tree_1_Leaf", "unusedImageAlpha": True, "principledAlphaLinked": False}),
            "FOLIAGE_CUTOUT",
        )
        self.assertEqual(
            classify_material({"name": "Tree Trunk_1", "unusedImageAlpha": False, "hasTransparentBsdf": False}),
            "OPAQUE_SUPPORT",
        )

    def test_identifies_purchased_cycles_versus_eevee_outputs(self):
        cycles = object()
        eevee = object()
        links = [_Link(cycles, "Shader_Cycles"), _Link(eevee, "Shader_EEVEE")]
        self.assertTrue(is_cycles_output(cycles, links))
        self.assertTrue(is_eevee_output(eevee, links))
        self.assertFalse(is_cycles_output(eevee, links))

    def test_eevee_blend_mode_is_cutout_risk(self):
        self.assertEqual(
            classify_material({"name": "Grass_3", "blendMethod": "BLEND", "principledAlphaLinked": True}),
            "FOLIAGE_CUTOUT",
        )


if __name__ == "__main__":
    unittest.main()
