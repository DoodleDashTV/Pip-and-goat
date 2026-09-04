import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCENERY = ROOT / "scenery"
for path in (str(ROOT), str(SCENERY)):
    if path not in __import__("sys").path:
        __import__("sys").path.insert(0, path)

from condition_purchased_source import CONDITION_CATALOG
from forest_ground_pack_apply_v1 import PACKS
from ground_pack_intake import PACKS as INTAKE_PACKS


class PurchasedGroundPacksTest(unittest.TestCase):
    def test_catalog_names_and_roles(self):
        names = [item["displayName"] for item in PACKS]
        self.assertEqual(
            names,
            [
                "TivvleJoy Dirt 4K",
                "TivvleJoy Sparse Grass 4K",
                "TivvleJoy Grass Path 2 4K",
            ],
        )
        catalog_ids = {item["sourceId"] for item in CONDITION_CATALOG}
        intake_files = {item["file"] for item in INTAKE_PACKS}
        for spec in PACKS:
            self.assertIn(spec["sourceId"], catalog_ids)
        self.assertEqual(
            intake_files,
            {"dirt_4k.blend.zip", "sparse_grass_4k.blend.zip", "grass_path_2_4k.blend.zip"},
        )

    def test_apply_and_proof_keep_locks(self):
        apply = (ROOT / "forest_ground_pack_apply_v1.py").read_text(encoding="utf-8")
        proof = (ROOT / "stagegraph" / "forest_dirt_pack_integration_proof_v1.py").read_text(encoding="utf-8")
        self.assertIn("apply_ground_packs", apply)
        self.assertIn("verify_production_camera", apply)
        self.assertIn("FOREST_DIRT_PACK_INTEGRATION_PROOF_V1.png", proof)
        self.assertIn("FOREST_HERO_TREE_REPLACEMENT_PROOF_V1.png", proof)
        self.assertIn("PROOF_WOULD_OVERWRITE", proof)
        self.assertIn("apply_hero_tree_replacement", proof)
        self.assertNotIn("apply_cinematic_forest_lighting_repair", proof)
        self.assertNotIn("apply_purchased_forest_floor", apply)
        self.assertNotIn("apply_ground_lookdev", apply)


if __name__ == "__main__":
    unittest.main()
