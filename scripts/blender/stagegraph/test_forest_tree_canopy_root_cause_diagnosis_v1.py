import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in __import__("sys").path:
    __import__("sys").path.insert(0, str(ROOT))

from forest_tree_canopy_root_cause_diagnosis_v1 import (
    BOTANIQ_HERO_TREES,
    FEATURE,
    OVERLAY_PREFIXES,
    catalog_hero_tree_assets,
    classify_distance,
    synthesize,
)


class ForestTreeCanopyRootCauseDiagnosisTest(unittest.TestCase):
    def test_feature_and_distance_classes(self):
        self.assertEqual(FEATURE, "forest_tree_canopy_root_cause_diagnosis_v1")
        self.assertEqual(classify_distance(1.5), "foreground")
        self.assertEqual(classify_distance(10.0), "midground")
        self.assertEqual(classify_distance(18.0), "background")

    def test_hero_catalog_lists_purchased_fagus_salix(self):
        self.assertIn("bq_Tree_Fagus-sylvatica_A_summer.blend", BOTANIQ_HERO_TREES)
        self.assertIn("bq_Tree_Salix-babylonica_C_summer.blend", BOTANIQ_HERO_TREES)
        catalog = catalog_hero_tree_assets()
        self.assertTrue(catalog["heroQualityTreesCatalogued"])
        self.assertEqual(len(catalog["present"]) + len(catalog["missing"]), 6)

    def test_overlays_cover_afternoon_and_interior_prefixes(self):
        self.assertIn("TJ_CanopyLeaf_", OVERLAY_PREFIXES)
        self.assertIn("TJ_StructLeaf_", OVERLAY_PREFIXES)
        self.assertIn("TJ_StructTwig_", OVERLAY_PREFIXES)

    def test_synthesize_flags_lod_and_overlay_failure(self):
        trees = [{
            "name": "Tree_1.001",
            "assetSource": "Stylised EcoKit Flora_Mat&GN&Models.blend / collections Tree_1..Tree_5",
            "inCameraFrustumBbox": True,
            "distanceClass": "foreground",
            "geometryType": "dense_small_stamp_cards",
            "tooCloseForAssetQuality": True,
            "materials": [{
                "name": "TreeLeaf_Mat_1",
                "role": "canopy",
                "problems": ["STYLIZED_GROUP_SHADER_NO_PRINCIPLED", "NO_TRANSLUCENCY"],
                "images": [{"filepath": "//leaf.png", "size": [256, 256]}],
            }],
        }]
        summary = synthesize(
            trees,
            {"count": 587},
            {"overlayHitShareOfTreePlusOverlay": 0.02},
            [{"blocked": True}, {"blocked": True}],
            {"heroQualityTreesPresent": False},
            {"risk": True},
            [{"collection": "Tree_1", "found": True}],
        )
        self.assertEqual(summary["visibleTreeObjects"], ["Tree_1.001"])
        self.assertEqual(summary["canopyGeometryType"], "dense_small_stamp_cards")
        self.assertFalse(summary["heroQualityTreesPresent"])
        self.assertTrue(summary["lodOrProxyDetected"])
        self.assertTrue(summary["denoiseOrSampleBlurRisk"])
        self.assertIn("OVERLAY_CARDS_OCCUPY_FEW_CAMERA_RAYS", summary["lightingBlockersFound"])
        self.assertTrue(summary["lodOrProxyDetected"])
        self.assertIn("Stop overlaying", summary["bestRepairPath"])
        self.assertIn("Fagus/Salix", summary["bestRepairPath"])

    def test_proof_reuses_failed_interior_pipeline_and_does_not_overwrite_beauty(self):
        diagnosis = (ROOT / "forest_tree_canopy_root_cause_diagnosis_v1.py").read_text(encoding="utf-8")
        proof = (ROOT / "stagegraph" / "forest_tree_canopy_root_cause_diagnosis_v1.py").read_text(encoding="utf-8")
        self.assertIn("Does not repair", diagnosis)
        self.assertIn("apply_interior_sun_canopy_structure", proof)
        self.assertIn("apply_forest_canopy_lighting_repair", proof)
        self.assertIn("apply_cinematic_lighting_recovery", proof)
        self.assertIn("replace_failed_micro_dressing", proof)
        self.assertIn("FOREST_TREE_CANOPY_OBJECT_ID_PROOF_V1.png", proof)
        self.assertIn("DIAGNOSIS_MUST_NOT_OVERWRITE_FAILED_BEAUTY_PROOF", proof)
        self.assertIn("FOREST_INTERIOR_SUN_CANOPY_STRUCTURE_PROOF_V1.png", proof)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", diagnosis)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", proof)
        self.assertNotIn("apply_purchased_forest_floor", proof)
        self.assertNotIn("bpy.ops.render.render", diagnosis)


if __name__ == "__main__":
    unittest.main()
