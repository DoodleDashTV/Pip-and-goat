from __future__ import annotations

import unittest
from pathlib import Path

from rig_contract import evaluate_rig_contract, qa_subject_names, select_body_candidate


class RigContractTests(unittest.TestCase):
    def test_live_inspector_cannot_recreate_the_v6_placeholder_rig(self) -> None:
        execute = (Path(__file__).resolve().parent / "execute.py").read_text(encoding="utf-8")
        for forbidden in (
            "def _first_mesh",
            "bpy.data.armatures.new",
            "mesh.vertex_groups.new",
            "mesh.shape_key_add",
            "pbone.constraints.new",
        ):
            self.assertNotIn(forbidden, execute)

    def test_selects_named_body_instead_of_first_eye_mesh(self) -> None:
        selected = select_body_candidate(
            [
                {"name": "Eye_L_GEO", "role": "EYES", "vertices": 387},
                {"name": "Goat_Body_GEO", "role": "BODY", "vertices": 24000},
            ]
        )
        self.assertTrue(selected["ok"])
        self.assertEqual(selected["selected"]["name"], "Goat_Body_GEO")

    def test_rejects_v6_unrigged_source(self) -> None:
        report = evaluate_rig_contract(
            {
                "bodyCandidates": [{"name": "Goat_Body_GEO", "role": "BODY", "vertices": 24000}],
                "body": {"vertexCount": 24000, "armatureModifiers": [], "vertexGroupCount": 0},
                "armature": {},
                "actions": [],
                "accessories": [],
            }
        )
        self.assertFalse(report["ok"])
        self.assertIn("ARTIST_ARMATURE_MISSING", report["blockers"])
        self.assertIn("TEST_ANIMATION_MISSING", report["blockers"])

    def test_rejects_ambiguous_duplicate_body_meshes(self) -> None:
        selected = select_body_candidate(
            [
                {"name": "Goat_Body_GEO", "role": "BODY", "vertices": 24000},
                {"name": "Goat_Body_GEO.001", "role": "BODY", "vertices": 23000},
            ]
        )
        self.assertFalse(selected["ok"])
        self.assertEqual(selected["code"], "GOAT_BODY_MESH_AMBIGUOUS")

    def test_accepts_complete_artist_rig_snapshot(self) -> None:
        report = evaluate_rig_contract(
            {
                "bodyCandidates": [{"name": "Goat_Body_GEO", "role": "BODY", "vertices": 24000}],
                "body": {
                    "vertexCount": 24000,
                    "armatureModifiers": ["Goat_RIG"],
                    "vertexGroupCount": 24,
                    "weightedVertexFraction": 0.99,
                    "maxInfluences": 4,
                    "faceShapeKeyCount": 10,
                    "visemeCount": 8,
                },
                "armature": {
                    "name": "Goat_RIG",
                    "boneCount": 42,
                    "deformBoneCount": 28,
                    "controlBoneCount": 18,
                    "constraintCount": 12,
                    "faceBoneCount": 6,
                },
                "actions": [{"name": "Goat_Idle", "fcurveCount": 12}],
                "accessories": [
                    {"name": "Goat_Collar", "role": "COLLAR", "bound": True},
                    {"name": "Goat_Tag", "role": "TAG", "bound": True},
                ],
            }
        )
        self.assertTrue(report["ok"])
        self.assertEqual(report["blockers"], [])

    def test_qa_framing_excludes_large_scene_plane(self) -> None:
        subjects = qa_subject_names(
            [
                {"name": "Goat_Body_GEO", "role": "BODY", "extentRatio": 1.0},
                {"name": "Fur_01", "role": "FUR", "extentRatio": 1.02},
                {"name": "Hi-Light", "role": "UNKNOWN", "extentRatio": 18.0},
            ],
            "Goat_Body_GEO",
            "Goat_RIG",
        )
        self.assertEqual(subjects["included"], ["Fur_01", "Goat_Body_GEO"])
        self.assertEqual(subjects["excluded"], ["Hi-Light"])


if __name__ == "__main__":
    unittest.main()
