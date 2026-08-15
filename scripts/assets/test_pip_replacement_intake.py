#!/usr/bin/env python3
"""Host-side tests for the Pip replacement intake gate.

  python3 scripts/assets/test_pip_replacement_intake.py
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "assets"))

from pip_replacement_intake_lib import (  # noqa: E402
    APPROVED_LIBRARY_FINGERPRINT,
    CURRENT_PIP,
    LONG_WING_ORIGINAL_SHA256,
    PIP_COMPARISON_ITEMS,
    PRODUCTION_LIBRARY,
    apply_measured_hints,
    assert_not_protected_write,
    build_provenance,
    choose_primary_model,
    classify_file,
    copy_original_unchanged,
    empty_checklist,
    evaluate_replacement_gate,
    extract_zip_safely,
    prepare_package,
    sha256_bytes,
    sha256_file,
    suggested_scale,
)


def write_bytes(path: Path, data: bytes) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


class HashAndCopyTests(unittest.TestCase):
    def test_sha256_matches_known_vector(self) -> None:
        self.assertEqual(sha256_bytes(b"tivvlejoy"), sha256_bytes(b"tivvlejoy"))
        self.assertNotEqual(sha256_bytes(b"tivvlejoy"), sha256_bytes(b"tivvlejoy "))

    def test_copy_preserves_bytes_and_hash(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = write_bytes(Path(tmp) / "Pip_Next.glb", b"glTF" + b"\x00" * 32)
            dest_dir = Path(tmp) / "original"
            copied = copy_original_unchanged(source, dest_dir)
            self.assertEqual(sha256_file(source), sha256_file(copied))
            self.assertEqual(source.read_bytes(), copied.read_bytes())
            self.assertEqual(copied.name, "Pip_Next.glb")
            with self.assertRaises(FileExistsError):
                copy_original_unchanged(source, dest_dir)


class ZipAndClassifyTests(unittest.TestCase):
    def test_zip_extracts_and_chooses_blend_over_obj(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / "pkg.zip"
            with zipfile.ZipFile(archive, "w") as zf:
                zf.writestr("maps/color.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 8)
                zf.writestr("mesh/pip.obj", b"v 0 0 0\n")
                zf.writestr("mesh/pip.blend", b"BLENDER-v429")
            dest = Path(tmp) / "unpacked"
            files = extract_zip_safely(archive, dest)
            self.assertEqual(len(files), 3)
            primary = choose_primary_model(files)
            self.assertIsNotNone(primary)
            self.assertEqual(primary.suffix, ".blend")

    def test_zip_slip_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / "evil.zip"
            with zipfile.ZipFile(archive, "w") as zf:
                zf.writestr("../escape.glb", b"glTF")
            with self.assertRaises(ValueError):
                extract_zip_safely(archive, Path(tmp) / "unpacked")


class ProtectionAndGateTests(unittest.TestCase):
    def test_refuses_production_library_and_current_pip(self) -> None:
        with self.assertRaises(PermissionError):
            assert_not_protected_write(PRODUCTION_LIBRARY / "characters" / "pip_production.blend")
        with self.assertRaises(PermissionError):
            assert_not_protected_write(CURRENT_PIP)

    def test_gate_never_auto_replaces_even_if_requested(self) -> None:
        gate = evaluate_replacement_gate(
            justinApproved=True,
            visualChecklistPassed=True,
            requestCanonReplace=True,
            requestTheatricalBind=True,
            requestMerge=True,
            requestProductionLibraryWrite=True,
            requestRigBindToCurrentPip=True,
        )
        self.assertFalse(gate["autoReplaceCurrentPip"])
        self.assertFalse(gate["approved"])
        self.assertFalse(gate["canonicalMutated"])
        self.assertFalse(gate["theatricalBound"])
        self.assertFalse(gate["merge"])
        self.assertFalse(gate["productionLibraryTouched"])
        self.assertFalse(gate["paidResources"])
        self.assertTrue(gate["stopForJustin"])
        self.assertTrue(any("Canon replacement" in item for item in gate["blockers"]))

    def test_checklist_covers_required_identity_items(self) -> None:
        items = empty_checklist()
        ids = {item["id"] for item in items}
        required = {item["id"] for item in PIP_COMPARISON_ITEMS}
        self.assertEqual(ids, required)
        self.assertTrue(all(item["status"] == "REQUIRES_JUSTIN" for item in items))
        hinted = apply_measured_hints(items, {"objectSeparation": "single_or_fused"})
        fused = next(item for item in hinted if item["id"] == "accessories_separated_or_fused")
        self.assertEqual(fused["status"], "REQUIRES_JUSTIN")
        self.assertIn("single_or_fused", fused["measuredHint"])

    def test_scale_helper_does_not_mutate_original(self) -> None:
        result = suggested_scale(0.98)
        self.assertAlmostEqual(result["suggestedFactor"], 2.05 / 0.98, places=5)
        self.assertFalse(result["appliedToOriginal"])


class PreparePackageTests(unittest.TestCase):
    def test_ingest_obj_writes_provenance_and_leaves_gate_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = write_bytes(Path(tmp) / "next_pip.obj", b"v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n")
            inbox = Path(tmp) / "inbox"
            package = prepare_package(
                source,
                license_name="in-house test",
                origin="unit-test",
                inbox=inbox,
            )
            self.assertFalse(package["gate"]["autoReplaceCurrentPip"])
            reports = Path(package["paths"]["reports"])
            provenance = json.loads((reports / "PROVENANCE.json").read_text())
            self.assertEqual(provenance["original"]["sha256"], sha256_file(source))
            self.assertEqual(provenance["license"]["name"], "in-house test")
            self.assertTrue(provenance["original"]["preservedUnchanged"])
            self.assertEqual(provenance["protected"]["longWingOriginalSha256"], LONG_WING_ORIGINAL_SHA256)
            self.assertEqual(
                provenance["protected"]["productionLibraryFingerprint"],
                APPROVED_LIBRARY_FINGERPRINT,
            )
            original = Path(package["paths"]["original"]) / "next_pip.obj"
            self.assertTrue(original.is_file())
            self.assertEqual(original.read_bytes(), source.read_bytes())
            record = classify_file(original)
            self.assertEqual(record["kind"], "model")
            self.assertTrue(record["supported"])

    def test_unsupported_extension_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = write_bytes(Path(tmp) / "notes.txt", b"not a model")
            with self.assertRaises(ValueError):
                prepare_package(source, inbox=Path(tmp) / "inbox")

    def test_provenance_builder_records_unknown_license_as_pending(self) -> None:
        payload = build_provenance(
            package_id="test",
            source_name="x.glb",
            source_sha256="abc",
            source_bytes=4,
            license_name="",
            origin="",
        )
        self.assertEqual(payload["license"]["name"], "UNKNOWN_PENDING")
        self.assertFalse(payload["license"]["paidResource"])


if __name__ == "__main__":
    result = unittest.main(verbosity=2, exit=False).result
    print(
        f"PIP_INTAKE_TESTS:{{\"tests\": {result.testsRun}, "
        f"\"failures\": {len(result.failures)}, \"errors\": {len(result.errors)}}}"
    )
    raise SystemExit(0 if result.wasSuccessful() else 1)
