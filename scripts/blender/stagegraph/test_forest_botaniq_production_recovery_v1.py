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
    TILIA_WORLD_HEIGHT,
    TILIA_WORLD_WIDTH,
    required_owned_paths,
)


class ForestBotaniqProductionRecoveryTest(unittest.TestCase):
    def test_locks_and_no_emission(self):
        source = (ROOT / "forest_botaniq_production_recovery_v1.py").read_text(encoding="utf-8")
        self.assertEqual(FEATURE, "forest_botaniq_production_recovery_v1")
        self.assertLess(BARK_NORMAL_STRENGTH, 0.75)
        self.assertEqual(TILIA_ASPECT, 4.0)
        self.assertEqual(TILIA_WORLD_WIDTH, 0.85)
        self.assertEqual(TILIA_WORLD_HEIGHT, 3.4)
        self.assertGreater(BACKGROUND_Y, 12.0)
        self.assertIn("cameraChanged\": False", source)
        self.assertIn("terrainChanged\": False", source)
        self.assertIn("waterChanged\": False", source)
        self.assertIn("lightingChanged\": False", source)
        self.assertNotIn("ShaderNodeEmission", source)
        self.assertIn("cylindrical_unwrap_trunk_faces", source)
        self.assertIn("bq_Soil_Loose_Diffuse", source)
        self.assertIn("ensure_cutout_png", source)
        self.assertIn("ShaderNodeNewGeometry", source)
        self.assertIn("Position", source)
        self.assertIn("_exile", source)
        self.assertIn("bind_production_ground", source)
        self.assertIn("install_production_forest_floor", source)
        self.assertIn("rebuild_vendor_ground_subdivided", source)
        self.assertIn("write_world_metre_uvs", source)
        self.assertIn("scatter_camera_footprint_carpet", source)
        self.assertIn("cluster_understory_near_trees", source)
        self.assertIn("enforce_production_floor", source)
        self.assertIn("in_place_subdivided_uv_plus_physical_carpet", source)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", source)
        self.assertNotIn("user_remap", source)

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
        self.assertIn("skip_lookdev_stills", proof)
        self.assertIn("FOREST_MATERIAL_RECOVERY_CAMERA_PROOF_V2", proof)
        self.assertIn("enforce_production_floor", proof)
        self.assertIn("view_layer.update", proof)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", proof)
