import unittest

from asset_certify_contract_v1 import SCHEMA, evaluate_audit


def valid_audit():
    return {
        "schema": SCHEMA,
        "blenderVersion": "4.3.2",
        "sourceId": "SRC_FOREST_MODEL_PACKAGE",
        "sourceSha256": "ab" * 32,
        "missingImages": [],
        "missingLibraries": [],
        "missingFonts": [],
        "missingMovieClips": [],
        "missingVolumes": [],
        "missingCaches": [],
        "missingNodeGroups": [],
        "materialsWithoutOutput": [],
        "skippedArchiveMembers": [],
        "externalDependenciesMaterialized": True,
        "colorManagementVerified": True,
        "geometryNodesVerified": True,
        "materialOutputsVerified": True,
    }


class AssetCertificationContractTest(unittest.TestCase):
    def test_clean_native_asset_passes(self):
        result = evaluate_audit(valid_audit())
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["blockers"], [])
        self.assertEqual(len(result["auditSha256"]), 64)

    def test_missing_texture_fails_even_when_geometry_exists(self):
        audit = valid_audit()
        audit["missingImages"] = ["//textures/bark.png"]
        result = evaluate_audit(audit)
        self.assertEqual(result["status"], "BLOCKED")
        self.assertIn("MISSING_IMAGES", result["blockers"])

    def test_skipped_large_blend_member_fails(self):
        audit = valid_audit()
        audit["skippedArchiveMembers"] = ["Flora_Mat&GN&Models.blend"]
        self.assertIn("ARCHIVE_MEMBER_SKIPPED", evaluate_audit(audit)["blockers"])

    def test_wrong_blender_version_fails(self):
        audit = valid_audit()
        audit["blenderVersion"] = "4.5.0"
        self.assertIn("BLENDER_VERSION_NOT_4_3_X", evaluate_audit(audit)["blockers"])


if __name__ == "__main__":
    unittest.main()
