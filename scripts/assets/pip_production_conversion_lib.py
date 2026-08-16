"""Host-side Pip production-conversion gate (no Blender, no paid resources).

Copies the official backpack working blend into a protected conversion path.
Never overwrites the approved source, the official working blend, Goat,
production-library/, or superseded archives. Never claims the fused mesh is
production-ready or binds a live Pip rig.
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
    LONG_WING_PARTS,
    PRODUCTION_LIBRARY,
    REPO_ROOT,
    sha256_file,
    utc_now,
)
from pip_visual_foundation_lib import (
    APPROVED_INBOX_PARTS,
    APPROVED_PACKAGE_ID,
    APPROVED_SOURCE_BYTES,
    APPROVED_SOURCE_SHA256,
    BOUND_DESIGN_ELEMENTS,
    WORKING_BLEND,
)

CONVERSION_BLEND = (
    REPO_ROOT
    / "theatrical-foundation/proposed/final-character-production/conversion"
    / "pip_backpack_production_conversion.blend"
)
CONVERSION_POINTER = (
    REPO_ROOT
    / "theatrical-foundation/proposed/final-character-production/conversion"
    / "CURRENT_CONVERSION.json"
)
CONVERSION_REPORTS = (
    REPO_ROOT
    / "theatrical-foundation/proposed/final-character-production/reports"
    / "pip-production-conversion"
)
CONVERSION_ARTIFACTS = (
    REPO_ROOT / "artifacts/theatrical-v2/final-character-production/pip-production-conversion"
)
CONVERSION_CATALOG = INTAKE_ROOT / "catalogs" / "pip-production-conversion.json"
OFFICIAL_STILLS = (
    REPO_ROOT / "artifacts/theatrical-v2/final-character-production/pip-visual-identity/previews"
)
GOAT_WORKING = (
    REPO_ROOT
    / "theatrical-foundation/proposed/final-character-production/working"
    / "goat_highdetail_working.blend"
)
PRIOR_WORKING = (
    REPO_ROOT
    / "theatrical-foundation/proposed/final-character-production/working"
    / "pip_highdetail_working.blend"
)

GITHUB_BLEND_BYTE_LIMIT = 100 * 1024 * 1024
ISLAND_SEPARATE_MIN_CONFIDENCE = 0.70
ISLAND_SEPARATE_MIN_VERTS = 200

VALIDATION_BONE_NAMES = (
    "root",
    "pelvis",
    "spine_01",
    "spine_02",
    "chest",
    "neck",
    "head",
    "beak",
    "eye_L",
    "eye_R",
    "crest",
    "wing_L",
    "wing_R",
    "wing_feather_L",
    "wing_feather_R",
    "thigh_L",
    "thigh_R",
    "shin_L",
    "shin_R",
    "foot_L",
    "foot_R",
    "backpack",
    "strap_L",
    "strap_R",
    "scarf",
)

DEFORMATION_POSES = (
    "rest",
    "wing_fold",
    "head_turn",
    "foot_lift",
    "backpack_sway",
    "strap_shift",
    "scarf_sway",
)

COMPARISON_VIEWS = ("front", "rear", "left", "right", "three_quarter")

PROTECTED_CONVERSION_SOURCES = (
    WORKING_BLEND,
    CURRENT_PIP,
    CURRENT_GOAT,
    GOAT_WORKING,
    PRIOR_WORKING,
    *LONG_WING_PARTS,
    *APPROVED_INBOX_PARTS,
)

REMAINING_AFTER_SAFE_CONVERSION = (
    "animation_retopo_with_clean_deformation_loops",
    "production_weights_on_retopo_not_envelopes",
    "production_facial_rig_with_lid_and_viseme_targets",
    "groom_or_feather_cards_that_deform",
    "uv_rebuild_if_retopo_changes_seams",
    "justin_visual_approval_of_this_conversion",
    "production_library_replace_still_closed",
    "theatrical_binding_still_closed",
)


def write_conversion_json(path: Path, payload: dict[str, Any]) -> Path:
    assert_conversion_destination(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")
    return path


def assert_conversion_destination(path: Path) -> None:
    resolved = path.resolve()
    lib = PRODUCTION_LIBRARY.resolve()
    if resolved == lib or lib in resolved.parents:
        raise PermissionError(f"refusing to write inside production-library/: {path}")
    for forbidden in PROTECTED_CONVERSION_SOURCES:
        if resolved == forbidden.resolve():
            raise PermissionError(f"refusing to overwrite protected source: {path}")
    allowed = (
        CONVERSION_BLEND.parent.resolve(),
        CONVERSION_REPORTS.resolve(),
        CONVERSION_ARTIFACTS.resolve(),
        (INTAKE_ROOT / "catalogs").resolve(),
        Path("/tmp").resolve(),
    )
    if not any(resolved == root or root in resolved.parents for root in allowed):
        raise PermissionError(f"conversion outputs must stay under conversion, reports, artifacts, catalogs, or /tmp: {path}")


def evaluate_conversion_gate(
    *,
    justinApprovedVisualIdentity: bool = True,
    conversionStarted: bool = False,
    conversionArtifactsPresent: bool = False,
    requestProductionReady: bool = False,
    requestProductionLibraryReplace: bool = False,
    requestTheatricalBind: bool = False,
    requestMerge: bool = False,
    requestVoxelRemesh: bool = False,
    requestPrimitiveRebuild: bool = False,
    requestRigRegistryBind: bool = False,
    requestPaidResources: bool = False,
    requestGoatWork: bool = False,
) -> dict[str, Any]:
    blockers = [
        "Official backpack Pip is the visual identity, not a production-ready mesh.",
        "Safe conversion may separate disconnected islands and add a validation armature only.",
        "Voxel remesh, Quadriflow of this density, and primitive rebuild remain refused.",
        "A later animation retopo is still required for eyelid, mouth, and wing-fold loops.",
    ]
    if not justinApprovedVisualIdentity:
        blockers.append("Justin has not approved the backpack Pip visual identity.")
    if requestProductionReady:
        blockers.append("Production-ready claim requested and refused.")
    if requestProductionLibraryReplace:
        blockers.append("production-library replacement requested and refused.")
    if requestTheatricalBind:
        blockers.append("Final theatrical binding requested and refused.")
    if requestMerge:
        blockers.append("Draft PR merge requested and refused.")
    if requestVoxelRemesh:
        blockers.append("Voxel remesh requested and refused.")
    if requestPrimitiveRebuild:
        blockers.append("Primitive rebuild requested and refused.")
    if requestRigRegistryBind:
        blockers.append("Live Pip rig registry bind requested and refused.")
    if requestPaidResources:
        blockers.append("Paid resources requested and refused.")
    if requestGoatWork:
        blockers.append("Goat work requested and refused.")
    return {
        "schema": "tivvlejoy.pip_production_conversion.gate.v1",
        "visualIdentityApproved": bool(justinApprovedVisualIdentity),
        "conversionStarted": bool(conversionStarted),
        "conversionComplete": False,
        "productionReady": False,
        "productionLibraryReplaced": False,
        "theatricalBound": False,
        "mergeAuthorized": False,
        "rigRegistryBound": False,
        "modularSpecBoundToFusedMesh": False,
        "workingBlendOverwritten": False,
        "approvedSourceOverwritten": False,
        "currentPipHighresOverwritten": False,
        "goatTouched": False,
        "paidResources": False,
        "voxelRemesh": False,
        "primitiveRebuild": False,
        "stopForJustin": True,
        "conversionArtifactsPresent": bool(conversionArtifactsPresent),
        "blockers": blockers,
        "protected": {
            "workingBlend": str(WORKING_BLEND.relative_to(REPO_ROOT)),
            "approvedSourceSha256": APPROVED_SOURCE_SHA256,
            "currentPip": str(CURRENT_PIP.relative_to(REPO_ROOT)),
            "currentGoat": str(CURRENT_GOAT.relative_to(REPO_ROOT)),
            "productionLibraryFingerprint": APPROVED_LIBRARY_FINGERPRINT,
        },
    }


def classify_island(record: dict[str, Any]) -> dict[str, Any]:
    """Spatial classification of one disconnected island. Conservative on purpose.

    World space after official normalize: feet on ground, facing +X, left = +Y.
    Color is optional. Yellow rearward masses are treated as wings, not backpack.
    """
    verts = int(record.get("verts") or 0)
    rel_z = float(record.get("rel_z") or 0.0)
    rearward = bool(record.get("rearward"))
    lateral = float(record.get("lateral") or 0.0)
    size = record.get("size") or [0.0, 0.0, 0.0]
    dx, dy, dz = (float(size[0]), float(size[1]), float(size[2]))
    extent = max(dx, dy, dz, 1e-6)
    compact = extent < 0.55 and dy < 0.28 and dx < 0.38
    thin = min(dx, dy, dz) < 0.08 and extent > 0.12
    color = record.get("color")
    r = g = b = luma = None
    yellow = teal = dark = False
    if color and len(color) >= 3:
        r, g, b = float(color[0]), float(color[1]), float(color[2])
        luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
        yellow = r > 0.55 and g > 0.45 and b < 0.48
        teal = g > r + 0.04 and b > r and g > 0.22
        dark = luma < 0.38

    reasons: list[str] = []
    label = "body"
    confidence = 0.20

    if verts < 40:
        return {"label": "body", "confidence": 0.15, "reasons": ["tiny_island_kept_with_body"]}

    if verts > 400_000:
        return {"label": "body", "confidence": 0.95, "reasons": ["dominant_fused_shell"]}

    if yellow and (abs(lateral) > 0.16 or dy > 0.30 or verts > 80_000):
        return {"label": "wing", "confidence": 0.80, "reasons": ["yellow_or_large_lateral_mass"]}

    if rel_z > 0.92 and (not dark):
        return {"label": "crest", "confidence": 0.55, "reasons": ["high_z_kept_with_body"]}

    if rearward and 0.38 < rel_z < 0.84 and abs(lateral) < 0.14 and compact and verts >= ISLAND_SEPARATE_MIN_VERTS:
        if yellow:
            label, confidence, reasons = "body", 0.35, ["rearward_but_yellow_likely_wing_or_body"]
        elif dark or teal or color is None:
            label = "backpack"
            confidence = 0.86 if dark or teal else 0.72
            reasons = ["rearward_compact_torso_island"]
    elif teal and 0.60 < rel_z < 0.93 and abs(lateral) < 0.22 and verts < 80_000 and not (rearward and compact):
        label, confidence, reasons = "scarf", 0.78, ["teal_neck_band"]
    elif 0.48 < rel_z < 0.90 and 0.07 < abs(lateral) < 0.24 and thin and verts < 40_000:
        if yellow:
            label, confidence, reasons = "body", 0.30, ["lateral_but_yellow_likely_wing"]
        else:
            label = "strap_L" if lateral > 0 else "strap_R"
            confidence = 0.74
            reasons = ["thin_shoulder_island"]

    return {"label": label, "confidence": confidence, "reasons": reasons or ["default_body"]}


def should_separate_island(classification: dict[str, Any], verts: int) -> bool:
    return (
        classification["label"] in {"backpack", "strap_L", "strap_R", "scarf"}
        and float(classification["confidence"]) >= ISLAND_SEPARATE_MIN_CONFIDENCE
        and int(verts) >= ISLAND_SEPARATE_MIN_VERTS
    )


def validation_bone_layout(mn: tuple[float, float, float], mx: tuple[float, float, float]) -> list[dict[str, Any]]:
    """World-space validation bones from the approved working bounds. Not a live rig bind."""
    minx, miny, minz = mn
    maxx, maxy, maxz = mx
    height = max(maxz - minz, 1e-6)
    cx = (minx + maxx) * 0.5
    cy = (miny + maxy) * 0.5
    face = maxx - minx

    def p(fx: float, fy: float, fz: float) -> list[float]:
        return [cx + fx * face, cy + fy * (maxy - miny), minz + fz * height]

    def bone(name: str, head: list[float], tail: list[float], parent: str | None, radius: float) -> dict[str, Any]:
        return {
            "name": name,
            "head": head,
            "tail": tail,
            "parent": parent,
            "envelopeDistance": radius * height,
            "deform": True,
        }

    return [
        bone("root", p(0.00, 0.00, 0.00), p(0.00, 0.00, 0.04), None, 0.06),
        bone("pelvis", p(0.00, 0.00, 0.12), p(0.00, 0.00, 0.28), "root", 0.10),
        bone("spine_01", p(0.00, 0.00, 0.28), p(0.00, 0.00, 0.46), "pelvis", 0.10),
        bone("spine_02", p(0.00, 0.00, 0.46), p(0.02, 0.00, 0.64), "spine_01", 0.10),
        bone("chest", p(0.02, 0.00, 0.64), p(0.04, 0.00, 0.78), "spine_02", 0.11),
        bone("neck", p(0.04, 0.00, 0.78), p(0.08, 0.00, 0.88), "chest", 0.06),
        bone("head", p(0.08, 0.00, 0.88), p(0.14, 0.00, 0.98), "neck", 0.08),
        bone("beak", p(0.16, 0.00, 0.90), p(0.28, 0.00, 0.88), "head", 0.04),
        bone("eye_L", p(0.16, 0.08, 0.93), p(0.20, 0.10, 0.94), "head", 0.03),
        bone("eye_R", p(0.16, -0.08, 0.93), p(0.20, -0.10, 0.94), "head", 0.03),
        bone("crest", p(0.08, 0.00, 0.98), p(0.04, 0.00, 1.08), "head", 0.04),
        bone("wing_L", p(0.00, 0.12, 0.70), p(-0.02, 0.42, 0.58), "chest", 0.10),
        bone("wing_R", p(0.00, -0.12, 0.70), p(-0.02, -0.42, 0.58), "chest", 0.10),
        bone("wing_feather_L", p(-0.02, 0.42, 0.58), p(-0.06, 0.62, 0.48), "wing_L", 0.08),
        bone("wing_feather_R", p(-0.02, -0.42, 0.58), p(-0.06, -0.62, 0.48), "wing_R", 0.08),
        bone("thigh_L", p(0.02, 0.08, 0.28), p(0.04, 0.10, 0.14), "pelvis", 0.05),
        bone("thigh_R", p(0.02, -0.08, 0.28), p(0.04, -0.10, 0.14), "pelvis", 0.05),
        bone("shin_L", p(0.04, 0.10, 0.14), p(0.08, 0.10, 0.05), "thigh_L", 0.04),
        bone("shin_R", p(0.04, -0.10, 0.14), p(0.08, -0.10, 0.05), "thigh_R", 0.04),
        bone("foot_L", p(0.08, 0.10, 0.05), p(0.18, 0.10, 0.02), "shin_L", 0.04),
        bone("foot_R", p(0.08, -0.10, 0.05), p(0.18, -0.10, 0.02), "shin_R", 0.04),
        bone("backpack", p(-0.10, 0.00, 0.58), p(-0.18, 0.00, 0.78), "chest", 0.08),
        bone("strap_L", p(0.04, 0.12, 0.78), p(-0.08, 0.10, 0.58), "chest", 0.04),
        bone("strap_R", p(0.04, -0.12, 0.78), p(-0.08, -0.10, 0.58), "chest", 0.04),
        bone("scarf", p(0.08, 0.00, 0.80), p(0.12, 0.00, 0.70), "neck", 0.05),
    ]


def deformation_pose_channels() -> dict[str, list[dict[str, Any]]]:
    """Small validation poses. Not animation authoring."""
    return {
        "rest": [],
        "wing_fold": [
            {"bone": "wing_L", "rotation_euler": [0.55, 0.15, 0.35]},
            {"bone": "wing_R", "rotation_euler": [0.55, -0.15, -0.35]},
            {"bone": "wing_feather_L", "rotation_euler": [0.25, 0.10, 0.20]},
            {"bone": "wing_feather_R", "rotation_euler": [0.25, -0.10, -0.20]},
        ],
        "head_turn": [
            {"bone": "neck", "rotation_euler": [0.0, 0.0, 0.28]},
            {"bone": "head", "rotation_euler": [0.05, 0.08, 0.40]},
            {"bone": "beak", "rotation_euler": [0.18, 0.0, 0.0]},
        ],
        "foot_lift": [
            {"bone": "thigh_L", "rotation_euler": [-0.35, 0.0, 0.0]},
            {"bone": "foot_L", "location": [0.02, 0.0, 0.07]},
        ],
        "backpack_sway": [
            {"bone": "backpack", "location": [-0.035, 0.0, -0.01]},
            {"bone": "backpack", "rotation_euler": [0.12, 0.0, 0.08]},
        ],
        "strap_shift": [
            {"bone": "strap_L", "location": [0.0, 0.025, 0.0]},
            {"bone": "strap_R", "location": [0.0, -0.025, 0.0]},
        ],
        "scarf_sway": [
            {"bone": "scarf", "rotation_euler": [0.15, 0.20, 0.25]},
        ],
    }


def snapshot_protected_sources() -> dict[str, Any]:
    records = []
    for path in PROTECTED_CONVERSION_SOURCES:
        if not path.is_file():
            records.append({"path": str(path.relative_to(REPO_ROOT)), "present": False})
            continue
        records.append(
            {
                "path": str(path.relative_to(REPO_ROOT)),
                "present": True,
                "bytes": path.stat().st_size,
                "sha256": sha256_file(path),
            }
        )
    return {
        "schema": "tivvlejoy.pip_production_conversion.protected_snapshot.v1",
        "createdAt": utc_now(),
        "files": records,
    }


def assert_protected_unchanged(before: dict[str, Any], after: dict[str, Any]) -> None:
    before_map = {item["path"]: item for item in before["files"]}
    after_map = {item["path"]: item for item in after["files"]}
    if before_map != after_map:
        raise RuntimeError("protected Pip/Goat/source files changed during conversion")


def build_conversion_record(*, started: bool = True, artifacts_present: bool = False) -> dict[str, Any]:
    return {
        "schema": "tivvlejoy.pip_production_conversion.v1",
        "characterCode": "CHAR_PIP_001",
        "displayName": "Pip",
        "role": "protected_production_conversion_in_progress",
        "packageId": APPROVED_PACKAGE_ID,
        "sourceSha256": APPROVED_SOURCE_SHA256,
        "sourceBytes": APPROVED_SOURCE_BYTES,
        "sourceWorkingBlend": str(WORKING_BLEND.relative_to(REPO_ROOT)),
        "conversionBlend": str(CONVERSION_BLEND.relative_to(REPO_ROOT)),
        "visualIdentityApproved": True,
        "conversionStarted": started,
        "conversionComplete": False,
        "productionReady": False,
        "productionLibraryReplaced": False,
        "theatricalBound": False,
        "mergeAuthorized": False,
        "rigRegistryBound": False,
        "modularSpecBoundToFusedMesh": False,
        "workingBlendOverwritten": False,
        "approvedSourceOverwritten": False,
        "destructiveCleanupAuthorized": False,
        "voxelRemesh": False,
        "primitiveRebuild": False,
        "paidResources": False,
        "goatTouched": False,
        "boundDesignElements": list(BOUND_DESIGN_ELEMENTS),
        "remaining": list(REMAINING_AFTER_SAFE_CONVERSION),
        "githubBlendByteLimit": GITHUB_BLEND_BYTE_LIMIT,
        "createdAt": utc_now(),
        "gate": evaluate_conversion_gate(
            conversionStarted=started,
            conversionArtifactsPresent=artifacts_present,
        ),
    }


def write_conversion_catalogs(*, started: bool = True, artifacts_present: bool = False) -> dict[str, Any]:
    record = build_conversion_record(started=started, artifacts_present=artifacts_present)
    write_conversion_json(CONVERSION_CATALOG, record)
    CONVERSION_REPORTS.mkdir(parents=True, exist_ok=True)
    write_conversion_json(CONVERSION_REPORTS / "GATE.json", record["gate"])
    write_conversion_json(CONVERSION_POINTER, {
        "schema": "tivvlejoy.current_pip_conversion.v1",
        "characterCode": "CHAR_PIP_001",
        "sourceWorkingBlend": str(WORKING_BLEND.relative_to(REPO_ROOT)),
        "conversionBlend": str(CONVERSION_BLEND.relative_to(REPO_ROOT)),
        "sourceSha256": APPROVED_SOURCE_SHA256,
        "productionReady": False,
        "overwritesWorkingBlend": False,
        "overwritesApprovedSource": False,
        "overwritesHighresCandidate": False,
        "overwritesProductionLibrary": False,
        "goatTouched": False,
    })
    _update_durable_manifest()
    _update_recovery_ledger()
    return record


def _update_durable_manifest() -> None:
    path = INTAKE_ROOT / "catalogs" / "durable-asset-manifest.json"
    manifest = json.loads(path.read_text())
    manifest["classes"]["production_conversion_in_progress"] = (
        "Protected conversion copy of the official backpack Pip. "
        "Not production-ready. Not production-library. Not theatrical-bound."
    )
    assets = manifest["assets"]
    conversion_asset = {
        "id": "PIP_PRODUCTION_CONVERSION_COPY",
        "class": "production_conversion_in_progress",
        "path": str(CONVERSION_BLEND.relative_to(REPO_ROOT)),
        "characterCode": "CHAR_PIP_001",
        "immutable": False,
        "notes": "Protected conversion copy. Do not overwrite the official working blend or approved source.",
    }
    existing = next((item for item in assets if item["id"] == conversion_asset["id"]), None)
    if existing:
        existing.update(conversion_asset)
    else:
        assets.append(conversion_asset)
    write_conversion_json(path, manifest)


def _update_recovery_ledger() -> None:
    path = INTAKE_ROOT / "catalogs" / "recovery-ledger.json"
    ledger = json.loads(path.read_text())
    point = {
        "id": "PIP_PRODUCTION_CONVERSION_START",
        "sha256": APPROVED_SOURCE_SHA256,
        "note": "Production conversion starts from the official backpack working copy. Do not overwrite that working copy or the approved source.",
    }
    ids = {item["id"] for item in ledger["rollbackPoints"]}
    if point["id"] not in ids:
        ledger["rollbackPoints"].append(point)
    write_conversion_json(path, ledger)
