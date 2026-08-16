#!/usr/bin/env python3
"""Host-side tests for Pip visual-identity promotion.

  python3 scripts/assets/test_pip_visual_foundation.py
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "assets"))

from pip_replacement_intake_lib import (  # noqa: E402
    APPROVED_LIBRARY_FINGERPRINT,
    CURRENT_GOAT,
    CURRENT_PIP,
    PRODUCTION_LIBRARY,
    evaluate_replacement_gate,
)
from pip_visual_foundation_lib import (  # noqa: E402
    APPROVED_SOURCE_BYTES,
    APPROVED_SOURCE_SHA256,
    BOUND_DESIGN_ELEMENTS,
    WORKING_BLEND,
    assert_foundation_destination,
    evaluate_promotion_gate,
    verify_approved_source,
)


class PromotionGateTests(unittest.TestCase):
    def test_selection_does_not_open_later_gates(self) -> None:
        gate = evaluate_promotion_gate(
            justinSelectedBackpackPip=True,
            requestProductionLibraryReplace=True,
            requestTheatricalBind=True,
            requestMerge=True,
            requestDestructiveCleanup=True,
            requestPaidResources=True,
        )
        self.assertTrue(gate["visualIdentityApproved"])
        self.assertFalse(gate["productionReady"])
        self.assertFalse(gate["productionLibraryReplaced"])
        self.assertFalse(gate["theatricalBound"])
        self.assertFalse(gate["mergeAuthorized"])
        self.assertFalse(gate["currentPipHighresOverwritten"])
        self.assertFalse(gate["goatTouched"])
        self.assertFalse(gate["paidResources"])
        self.assertTrue(gate["stopForJustin"])
        joined = " ".join(gate["blockers"])
        self.assertIn("production-library replacement requested and refused", joined)
        self.assertIn("Final theatrical binding requested and refused", joined)
        self.assertIn("Draft PR merge requested and refused", joined)
        self.assertEqual(
            gate["protected"]["productionLibraryFingerprint"],
            APPROVED_LIBRARY_FINGERPRINT,
        )

    def test_intake_gate_records_visual_identity_without_approving_production(self) -> None:
        gate = evaluate_replacement_gate(justinApproved=True, visualChecklistPassed=True)
        self.assertTrue(gate["visualIdentityApproved"])
        self.assertEqual(gate["role"], "approved_visual_foundation")
        self.assertFalse(gate["approved"])
        self.assertFalse(gate["autoReplaceCurrentPip"])
        self.assertFalse(gate["canonicalMutated"])
        self.assertFalse(gate["theatricalBound"])

    def test_bound_design_includes_backpack_and_forbids_satchel(self) -> None:
        self.assertIn("centered_backpack", BOUND_DESIGN_ELEMENTS)
        self.assertIn("two_symmetrical_shoulder_straps", BOUND_DESIGN_ELEMENTS)
        self.assertIn("no_satchel", BOUND_DESIGN_ELEMENTS)
        self.assertIn("no_cross_body_strap", BOUND_DESIGN_ELEMENTS)
        self.assertIn("three_coral_crest_feathers", BOUND_DESIGN_ELEMENTS)

    def test_refuses_protected_writes(self) -> None:
        with self.assertRaises(PermissionError):
            assert_foundation_destination(PRODUCTION_LIBRARY / "characters" / "pip_production.blend")
        with self.assertRaises(PermissionError):
            assert_foundation_destination(CURRENT_PIP)
        with self.assertRaises(PermissionError):
            assert_foundation_destination(CURRENT_GOAT)
        assert_foundation_destination(WORKING_BLEND)

    def test_hash_mismatch_stops(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fake = Path(tmp) / "pip.glb"
            fake.write_bytes(b"not-the-approved-source")
            with self.assertRaises(ValueError):
                verify_approved_source(fake)
        self.assertEqual(APPROVED_SOURCE_BYTES, 62876180)
        self.assertEqual(
            APPROVED_SOURCE_SHA256,
            "dca239475c78c9158ac87c36d674ceb23ef334358ee4394607758fc8f6728696",
        )


if __name__ == "__main__":
    result = unittest.main(verbosity=2, exit=False).result
    print(
        f"PIP_FOUNDATION_TESTS:{{\"tests\": {result.testsRun}, "
        f"\"failures\": {len(result.failures)}, \"errors\": {len(result.errors)}}}"
    )
    raise SystemExit(0 if result.wasSuccessful() else 1)
