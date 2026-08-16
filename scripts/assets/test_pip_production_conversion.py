#!/usr/bin/env python3
"""Host-side tests for Pip production conversion.

  python3 scripts/assets/test_pip_production_conversion.py
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "assets"))

from pip_replacement_intake_lib import (  # noqa: E402
    APPROVED_LIBRARY_FINGERPRINT,
    CURRENT_GOAT,
    CURRENT_PIP,
    PRODUCTION_LIBRARY,
)
from pip_visual_foundation_lib import (  # noqa: E402
    APPROVED_SOURCE_SHA256,
    WORKING_BLEND,
)
from pip_production_conversion_lib import (  # noqa: E402
    CONVERSION_BLEND,
    classify_island,
    evaluate_conversion_gate,
    evaluate_retopo_path_decision,
    should_separate_island,
    assert_conversion_destination,
    validation_bone_layout,
)


class ConversionGateTests(unittest.TestCase):
    def test_started_conversion_does_not_open_later_gates(self) -> None:
        gate = evaluate_conversion_gate(
            justinApprovedVisualIdentity=True,
            conversionStarted=True,
            conversionArtifactsPresent=True,
            requestProductionReady=True,
            requestProductionLibraryReplace=True,
            requestTheatricalBind=True,
            requestMerge=True,
            requestVoxelRemesh=True,
            requestPrimitiveRebuild=True,
            requestRigRegistryBind=True,
            requestPaidResources=True,
            requestGoatWork=True,
        )
        self.assertTrue(gate["visualIdentityApproved"])
        self.assertTrue(gate["conversionStarted"])
        self.assertFalse(gate["conversionComplete"])
        self.assertFalse(gate["justinConversionApproved"])
        self.assertTrue(gate["conversionCheckpointOnly"])
        self.assertTrue(gate["conversionPaused"])
        self.assertTrue(gate["envelopeApproachRejected"])
        self.assertTrue(gate["automatedRemeshRefused"])
        self.assertFalse(gate["productionReady"])
        self.assertFalse(gate["productionLibraryReplaced"])
        self.assertFalse(gate["theatricalBound"])
        self.assertFalse(gate["mergeAuthorized"])
        self.assertFalse(gate["rigRegistryBound"])
        self.assertFalse(gate["modularSpecBoundToFusedMesh"])
        self.assertFalse(gate["workingBlendOverwritten"])
        self.assertFalse(gate["approvedSourceOverwritten"])
        self.assertFalse(gate["goatTouched"])
        self.assertFalse(gate["paidResources"])
        self.assertFalse(gate["voxelRemesh"])
        self.assertFalse(gate["primitiveRebuild"])
        self.assertTrue(gate["stopForJustin"])
        joined = " ".join(gate["blockers"])
        self.assertIn("production-library replacement requested and refused", joined)
        self.assertIn("Final theatrical binding requested and refused", joined)
        self.assertIn("Draft PR merge requested and refused", joined)
        self.assertIn("Voxel remesh requested and refused", joined)
        self.assertIn("Goat work requested and refused", joined)
        self.assertEqual(
            gate["protected"]["productionLibraryFingerprint"],
            APPROVED_LIBRARY_FINGERPRINT,
        )
        self.assertEqual(gate["protected"]["approvedSourceSha256"], APPROVED_SOURCE_SHA256)

    def test_refuses_protected_writes(self) -> None:
        with self.assertRaises(PermissionError):
            assert_conversion_destination(PRODUCTION_LIBRARY / "characters" / "pip_production.blend")
        with self.assertRaises(PermissionError):
            assert_conversion_destination(CURRENT_PIP)
        with self.assertRaises(PermissionError):
            assert_conversion_destination(CURRENT_GOAT)
        with self.assertRaises(PermissionError):
            assert_conversion_destination(WORKING_BLEND)
        with self.assertRaises(PermissionError):
            assert_conversion_destination(REPO_ROOT / "README.md")
        assert_conversion_destination(CONVERSION_BLEND)

    def test_backpack_island_separates_and_yellow_wing_does_not(self) -> None:
        backpack = classify_island(
            {
                "verts": 12000,
                "rel_z": 0.62,
                "rearward": True,
                "lateral": 0.01,
                "size": [0.18, 0.16, 0.22],
                "color": [0.18, 0.28, 0.30],
            }
        )
        self.assertEqual(backpack["label"], "backpack")
        self.assertTrue(should_separate_island(backpack, 12000))

        wing = classify_island(
            {
                "verts": 90000,
                "rel_z": 0.58,
                "rearward": True,
                "lateral": 0.22,
                "size": [0.40, 0.55, 0.30],
                "color": [0.78, 0.72, 0.20],
            }
        )
        self.assertEqual(wing["label"], "wing")
        self.assertFalse(should_separate_island(wing, 90000))

        fused = classify_island(
            {
                "verts": 900000,
                "rel_z": 0.50,
                "rearward": False,
                "lateral": 0.0,
                "size": [0.80, 0.70, 2.0],
                "color": [0.78, 0.72, 0.20],
            }
        )
        self.assertEqual(fused["label"], "body")
        self.assertFalse(should_separate_island(fused, 900000))

    def test_validation_bones_include_accessories_and_face(self) -> None:
        bones = validation_bone_layout((0.0, -0.4, 0.0), (0.5, 0.4, 2.05))
        names = [bone["name"] for bone in bones]
        for required in ("backpack", "strap_L", "strap_R", "scarf", "head", "beak", "wing_L", "foot_L"):
            self.assertIn(required, names)
        self.assertEqual(bones[0]["name"], "root")

    def test_retopo_path_stays_closed_until_justin_chooses(self) -> None:
        pending = evaluate_retopo_path_decision()
        self.assertIsNone(pending["choice"])
        self.assertTrue(pending["stopForJustin"])
        self.assertFalse(pending["startsConversion"])
        self.assertFalse(pending["paidResourcesAuthorized"])
        paid = evaluate_retopo_path_decision("external_retopo_service_paid_needs_yes")
        self.assertTrue(paid["paidResourcesRequested"])
        self.assertFalse(paid["paidResourcesAuthorized"])
        self.assertTrue(paid["envelopeApproachRejected"])

    def test_pause_records_checkpoint_and_refuses_automated_remesh(self) -> None:
        path = evaluate_retopo_path_decision(
            "pause_keep_checkpoint",
            also_confirm=("refuse_automated_remesh",),
        )
        self.assertEqual(path["choice"], "pause_keep_checkpoint")
        self.assertTrue(path["paused"])
        self.assertTrue(path["chosen"])
        self.assertFalse(path["startsConversion"])
        self.assertFalse(path["animationReady"])
        self.assertFalse(path["paidResourcesAuthorized"])
        self.assertTrue(path["automatedRemeshRefused"])
        self.assertIn("voxel_remesh", path["refused"])
        self.assertIn("envelope_rig_on_fused_source", path["refused"])
        self.assertIn("destructive_edits_to_approved_pip", path["refused"])
        self.assertEqual(path["retopoOwner"], "justin_will_assign_separately")
        self.assertTrue(path["stopForJustin"])


if __name__ == "__main__":
    result = unittest.main(verbosity=2, exit=False).result
    print(
        f"PIP_CONVERSION_TESTS:{{\"tests\": {result.testsRun}, "
        f"\"failures\": {len(result.failures)}, \"errors\": {len(result.errors)}}}"
    )
    raise SystemExit(0 if result.wasSuccessful() else 1)
