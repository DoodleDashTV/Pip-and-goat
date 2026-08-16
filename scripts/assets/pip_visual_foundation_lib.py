"""Host-side Pip visual-identity promotion (no Blender, no paid resources).

Records Justin's official backpack Pip design. Never writes production-library/,
never overwrites the superseded high-res candidate, never flips theatrical
binding, and never claims the fused mesh is production-ready.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pip_replacement_intake_lib import (
    APPROVED_LIBRARY_FINGERPRINT,
    CURRENT_GOAT,
    CURRENT_PIP,
    INTAKE_ROOT,
    LONG_WING_ORIGINAL_SHA256,
    PRODUCTION_LIBRARY,
    REPO_ROOT,
    assert_not_protected_write,
    sha256_file,
    utc_now,
)

APPROVED_PACKAGE_ID = "20260816T025617Z_pip_backpack_replacement.glb_dca239475c78"
APPROVED_SOURCE_SHA256 = "dca239475c78c9158ac87c36d674ceb23ef334358ee4394607758fc8f6728696"
APPROVED_SOURCE_BYTES = 62_876_180
APPROVED_INBOX_PARTS = (
    INTAKE_ROOT / "inbox" / "pip_backpack_replacement.glb.part1.bin",
    INTAKE_ROOT / "inbox" / "pip_backpack_replacement.glb.part2.bin",
    INTAKE_ROOT / "inbox" / "pip_backpack_replacement.glb.part3.bin",
)

ARCHIVE_ROOT = (
    REPO_ROOT
    / "theatrical-foundation/proposed/final-character-production/archive/pip-visual-identity"
)
WORKING_BLEND = (
    REPO_ROOT
    / "theatrical-foundation/proposed/final-character-production/working"
    / "pip_backpack_canonical_working.blend"
)
WORKING_POINTER = (
    REPO_ROOT
    / "theatrical-foundation/proposed/final-character-production/working"
    / "CURRENT_PIP.json"
)
REPORTS = (
    REPO_ROOT
    / "theatrical-foundation/proposed/final-character-production/reports"
    / "pip-visual-identity"
)
ARTIFACTS = (
    REPO_ROOT
    / "artifacts/theatrical-v2/final-character-production/pip-visual-identity"
)
IDENTITY_CATALOG = INTAKE_ROOT / "catalogs" / "pip-visual-identity.json"

BOUND_DESIGN_ELEMENTS = (
    "approved_face_eyes_cheerful_expression",
    "bright_yellow_polished_cgi_appearance",
    "three_coral_crest_feathers",
    "long_layered_yellow_wings",
    "teal_scarf",
    "orange_beak_and_feet",
    "centered_backpack",
    "two_symmetrical_shoulder_straps",
    "no_satchel",
    "no_cross_body_strap",
    "no_hip_bag",
)

REMAINING_BEFORE_PRODUCTION_READY = (
    "retopology",
    "deformation_safe_backpack_and_strap_treatment",
    "uv_and_material_preservation_on_retopo",
    "body_and_accessory_rigging",
    "facial_controls",
    "animation_validation",
)

SUPERSEDED = (
    {
        "id": "PIP_SATCHEL_REPLACEMENT",
        "sha256": "2e06f4285448167e0441c97ed73d2f1e14166db35e8d6f9eadc0fb9b14a7fb7e",
        "path": "theatrical-foundation/proposed/pip-replacement-intake/inbox/pip_replacement.glb.part{1,2,3}.bin",
        "reason": "Satchel / cross-body replacement candidate. Superseded by backpack Pip.",
    },
    {
        "id": "PIP_CURRENT_PRISM_WORKING",
        "path": "theatrical-foundation/proposed/final-character-production/high-resolution/pip_highres_candidate.blend",
        "reason": "Earlier Prism working Pip. Superseded as visual foundation. Keep for rollback.",
    },
    {
        "id": "PIP_HIGHDETAIL_WORKING",
        "path": "theatrical-foundation/proposed/final-character-production/working/pip_highdetail_working.blend",
        "reason": "Earlier high-detail working blend. Keep for rollback. Do not delete.",
    },
    {
        "id": "PIP_LONG_WING_ORIGINAL",
        "sha256": LONG_WING_ORIGINAL_SHA256,
        "path": "theatrical-foundation/proposed/final-character-production/pip_long_wing_original.part0{1,2,3}.bin",
        "reason": "Earlier long-wing original. Archive for rollback. Do not delete.",
    },
)


def write_foundation_json(path: Path, payload: dict[str, Any]) -> Path:
    assert_foundation_destination(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")
    return path


def assert_foundation_destination(path: Path) -> None:
    assert_not_protected_write(path)
    resolved = path.resolve()
    if resolved == CURRENT_PIP.resolve() or resolved == CURRENT_GOAT.resolve():
        raise PermissionError(f"refusing to overwrite superseded or Goat file: {path}")
    lib = PRODUCTION_LIBRARY.resolve()
    if resolved == lib or lib in resolved.parents:
        raise PermissionError(f"refusing to write inside production-library/: {path}")


def verify_approved_source(source: Path) -> dict[str, Any]:
    if not source.is_file():
        raise FileNotFoundError(source)
    digest = sha256_file(source)
    size = source.stat().st_size
    if size != APPROVED_SOURCE_BYTES:
        raise ValueError(f"approved source size {size} != {APPROVED_SOURCE_BYTES}")
    if digest != APPROVED_SOURCE_SHA256:
        raise ValueError(f"approved source hash {digest} != {APPROVED_SOURCE_SHA256}")
    return {"path": str(source), "sha256": digest, "bytes": size, "verified": True}


def evaluate_promotion_gate(
    *,
    justinSelectedBackpackPip: bool = True,
    requestProductionLibraryReplace: bool = False,
    requestTheatricalBind: bool = False,
    requestMerge: bool = False,
    requestDestructiveCleanup: bool = False,
    requestPaidResources: bool = False,
) -> dict[str, Any]:
    blockers = [
        "Approved visual identity is not a production-ready mesh.",
        "Retopo, deformation-safe backpack treatment, UV/material preservation, rigging, facial controls, and animation validation remain open.",
    ]
    if not justinSelectedBackpackPip:
        blockers.append("Justin has not selected the backpack Pip as official visual identity.")
    if requestProductionLibraryReplace:
        blockers.append("production-library replacement requested and refused.")
    if requestTheatricalBind:
        blockers.append("Final theatrical binding requested and refused.")
    if requestMerge:
        blockers.append("Draft PR merge requested and refused.")
    if requestDestructiveCleanup:
        blockers.append("Destructive mesh cleanup requested and refused.")
    if requestPaidResources:
        blockers.append("Paid resources requested and refused.")
    return {
        "schema": "tivvlejoy.pip_visual_identity.gate.v1",
        "visualIdentityApproved": bool(justinSelectedBackpackPip),
        "productionReady": False,
        "productionLibraryReplaced": False,
        "theatricalBound": False,
        "mergeAuthorized": False,
        "currentPipHighresOverwritten": False,
        "goatTouched": False,
        "paidResources": False,
        "stopForJustin": True,
        "blockers": blockers,
        "protected": {
            "currentPip": str(CURRENT_PIP.relative_to(REPO_ROOT)),
            "currentGoat": str(CURRENT_GOAT.relative_to(REPO_ROOT)),
            "productionLibraryFingerprint": APPROVED_LIBRARY_FINGERPRINT,
        },
    }


def build_identity_record() -> dict[str, Any]:
    return {
        "schema": "tivvlejoy.pip_visual_identity.v1",
        "characterCode": "CHAR_PIP_001",
        "displayName": "Pip",
        "role": "official_permanent_visual_identity",
        "packageId": APPROVED_PACKAGE_ID,
        "sourceSha256": APPROVED_SOURCE_SHA256,
        "sourceBytes": APPROVED_SOURCE_BYTES,
        "workingBlend": str(WORKING_BLEND.relative_to(REPO_ROOT)),
        "archiveDir": str(ARCHIVE_ROOT.relative_to(REPO_ROOT)),
        "productionReady": False,
        "productionLibraryReplaced": False,
        "theatricalBound": False,
        "mergeAuthorized": False,
        "destructiveCleanupAuthorized": False,
        "paidResources": False,
        "goatTouched": False,
        "boundDesignElements": list(BOUND_DESIGN_ELEMENTS),
        "remainingBeforeProductionReady": list(REMAINING_BEFORE_PRODUCTION_READY),
        "createdAt": utc_now(),
    }


def archive_approved_source(source: Path) -> dict[str, Any]:
    verified = verify_approved_source(source)
    assert_foundation_destination(ARCHIVE_ROOT / "FINGERPRINT.json")
    ARCHIVE_ROOT.mkdir(parents=True, exist_ok=True)
    part_records = []
    for part in APPROVED_INBOX_PARTS:
        if not part.is_file():
            raise FileNotFoundError(part)
        part_records.append(
            {
                "filename": part.name,
                "path": str(part.relative_to(REPO_ROOT)),
                "bytes": part.stat().st_size,
                "sha256": sha256_file(part),
                "immutable": True,
            }
        )
    fingerprint = {
        "schema": "tivvlejoy.pip_approved_source.fingerprint.v1",
        "packageId": APPROVED_PACKAGE_ID,
        "characterCode": "CHAR_PIP_001",
        "createdAt": utc_now(),
        "complete": verified,
        "inboxParts": part_records,
        "immutable": True,
        "paidResource": False,
        "doNotDelete": True,
        "doNotOverwrite": True,
    }
    write_foundation_json(ARCHIVE_ROOT / "FINGERPRINT.json", fingerprint)
    write_foundation_json(ARCHIVE_ROOT / "SUPERSEDED_INDEX.json", {
        "schema": "tivvlejoy.pip_superseded_archive.v1",
        "rule": "Preserve superseded models for rollback. Do not delete source files or prior evidence.",
        "items": list(SUPERSEDED),
    })
    (ARCHIVE_ROOT / "README.md").write_text(
        "\n".join(
            [
                "# Approved Pip visual-identity source",
                "",
                f"Package: `{APPROVED_PACKAGE_ID}`",
                f"SHA-256: `{APPROVED_SOURCE_SHA256}`",
                f"Size: `{APPROVED_SOURCE_BYTES}` bytes",
                "",
                "This is Justin's official permanent Pip design source.",
                "It is immutable evidence. Do not delete, overwrite, or treat the",
                "fused mesh as production-ready.",
                "",
                "Committed evidence is the three inbox split parts listed in",
                "`FINGERPRINT.json`. Reassemble only to `/tmp` after hash match.",
                "",
            ]
        )
        + "\n"
    )
    return fingerprint


def write_identity_catalogs() -> dict[str, Any]:
    identity = build_identity_record()
    assert_foundation_destination(IDENTITY_CATALOG)
    write_foundation_json(IDENTITY_CATALOG, identity)
    REPORTS.mkdir(parents=True, exist_ok=True)
    write_foundation_json(REPORTS / "VISUAL_IDENTITY.json", identity)
    write_foundation_json(REPORTS / "GATE.json", evaluate_promotion_gate())
    write_foundation_json(WORKING_POINTER, {
        "schema": "tivvlejoy.current_pip_working.v1",
        "characterCode": "CHAR_PIP_001",
        "workingBlend": str(WORKING_BLEND.relative_to(REPO_ROOT)),
        "supersedes": str(CURRENT_PIP.relative_to(REPO_ROOT)),
        "sourceSha256": APPROVED_SOURCE_SHA256,
        "productionReady": False,
        "overwritesHighresCandidate": False,
        "overwritesProductionLibrary": False,
    })
    return identity
