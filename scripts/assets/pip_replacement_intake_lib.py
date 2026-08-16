"""Pip replacement intake — host-side library (no Blender, no paid resources).

Preserves uploaded files unchanged, records SHA-256 + provenance, classifies
BLEND/GLB/GLTF/FBX/OBJ/texture/ZIP packages, and builds a comparison package
that never auto-replaces current Pip, canon, or production-library/.

Used by:
  python3 scripts/assets/pip_replacement_intake.py ingest <source>
  scripts/tivvlejoy/ingest-next-pip.sh <source>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parents[2]

INTAKE_ROOT = REPO_ROOT / "theatrical-foundation/proposed/pip-replacement-intake"
INBOX_ROOT = INTAKE_ROOT / "inbox"
CATALOGS = INTAKE_ROOT / "catalogs"
PRESETS = INTAKE_ROOT / "presets"
RIGS = INTAKE_ROOT / "rigs"
ARTIFACTS = REPO_ROOT / "artifacts/theatrical-v2/pip-replacement-intake"

PRODUCTION_LIBRARY = REPO_ROOT / "production-library"
CURRENT_PIP = (
    REPO_ROOT
    / "theatrical-foundation/proposed/final-character-production/high-resolution"
    / "pip_highres_candidate.blend"
)
CURRENT_GOAT = (
    REPO_ROOT
    / "theatrical-foundation/proposed/final-character-production/high-resolution"
    / "goat_highres_candidate.blend"
)
LONG_WING_PARTS = [
    REPO_ROOT
    / "theatrical-foundation/proposed/final-character-production"
    / "pip_long_wing_original.part01.bin",
    REPO_ROOT
    / "theatrical-foundation/proposed/final-character-production"
    / "pip_long_wing_original.part02.bin",
    REPO_ROOT
    / "theatrical-foundation/proposed/final-character-production"
    / "pip_long_wing_original.part03.bin",
]
LONG_WING_ORIGINAL_SHA256 = "9158dea0e23e5ebb086a574badb0b5a62982d0b90e1d8b118f54cfac0549c4f2"
APPROVED_LIBRARY_FINGERPRINT = "7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7"

BINDING_REFS = REPO_ROOT / "artifacts/theatrical-v2/source-package-validation/refs"
PIP_BINDING_VIEWS = (
    "Pip_front.jpeg",
    "Pip_three_quarter.jpeg",
    "Pip_back.jpeg",
    "Pip_profile_facing_left.jpeg",
    "Pip_profile_facing_right.jpeg",
)

MODEL_EXTENSIONS = {".blend", ".glb", ".gltf", ".fbx", ".obj"}
TEXTURE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tga", ".exr", ".tif", ".tiff", ".webp", ".bmp"}
PACKAGE_EXTENSIONS = {".zip"}
SUPPORTED_EXTENSIONS = MODEL_EXTENSIONS | TEXTURE_EXTENSIONS | PACKAGE_EXTENSIONS

MODEL_PREFERENCE = (".blend", ".glb", ".gltf", ".fbx", ".obj")

PIP_TARGET_HEIGHT = 2.05
GOAT_SCALE = 1.50
FACING = (1.0, 0.0, 0.0)
CHAR_LEFT = (0.0, 1.0, 0.0)
CHAR_RIGHT = (0.0, -1.0, 0.0)

BLENDER_BIN = Path("/usr/local/bin/blender")
REQUIRED_BLENDER = "4.2.3"

FORBIDDEN_WRITE_ROOTS = (
    PRODUCTION_LIBRARY,
    CURRENT_PIP,
    CURRENT_GOAT,
    *LONG_WING_PARTS,
)

PIP_COMPARISON_ITEMS: tuple[dict[str, str], ...] = (
    {
        "id": "face_and_green_eyes",
        "label": "Face and green/teal glossy eyes",
        "authority": "binding five-view JPEGs + conditionally approved long-wing appearance",
    },
    {
        "id": "bright_yellow_cgi_finish",
        "label": "Bright yellow CGI feather finish (warm chartreuse / golden-lime, cream face/chest)",
        "authority": "binding five-view JPEGs + conditionally approved long-wing appearance",
    },
    {
        "id": "three_coral_crest_feathers",
        "label": "Exactly three coral crown/crest feathers",
        "authority": "binding five-view JPEGs",
    },
    {
        "id": "long_layered_wings",
        "label": "Long layered wings",
        "authority": "conditionally approved long-wing appearance",
    },
    {
        "id": "teal_scarf",
        "label": "Teal neckerchief/scarf, separate from strap tails",
        "authority": "binding five-view JPEGs",
    },
    {
        "id": "one_continuous_cross_body_strap",
        "label": "Exactly one continuous cross-body strap (not two backpack risers)",
        "authority": "Justin strap addendum + binding sheets",
    },
    {
        "id": "character_right_shoulder_origin",
        "label": "Strap originates over character-right shoulder (−Y)",
        "authority": "binding laterality",
    },
    {
        "id": "diagonal_front_and_rear_path",
        "label": "Diagonal strap path on both front and rear",
        "authority": "Justin strap addendum",
    },
    {
        "id": "character_left_hip_satchel",
        "label": "Satchel/bag on character-left hip (+Y)",
        "authority": "binding laterality",
    },
    {
        "id": "copper_spiral",
        "label": "Copper spiral clasp",
        "authority": "binding five-view JPEGs",
    },
    {
        "id": "feet_toes_rear_hallux",
        "label": "Feet, toes, and rear hallux",
        "authority": "binding five-view JPEGs",
    },
    {
        "id": "accessories_separated_or_fused",
        "label": "Accessories are separate objects vs fused into the body",
        "authority": "production suitability",
    },
    {
        "id": "front_exactly_one_diagonal_strap",
        "label": "Front has exactly one diagonal cross-body strap",
        "authority": "Justin strap addendum",
    },
)

BACKPACK_COMPARISON_ITEMS: tuple[dict[str, str], ...] = (
    {
        "id": "face_and_green_eyes",
        "label": "Face and green/teal glossy eyes",
        "authority": "binding five-view JPEGs + conditionally approved long-wing appearance",
    },
    {
        "id": "bright_yellow_cgi_finish",
        "label": "Bright yellow CGI feather finish",
        "authority": "binding five-view JPEGs + conditionally approved long-wing appearance",
    },
    {
        "id": "three_coral_crest_feathers",
        "label": "Exactly three coral crown/crest feathers",
        "authority": "binding five-view JPEGs",
    },
    {
        "id": "long_layered_wings_visible",
        "label": "Long layered wings remain visible",
        "authority": "conditionally approved long-wing appearance + backpack accessory refs",
    },
    {
        "id": "teal_scarf",
        "label": "Teal neckerchief/scarf, not intersected by backpack",
        "authority": "binding five-view JPEGs + backpack accessory refs",
    },
    {
        "id": "true_backpack_centered_on_back",
        "label": "True backpack centered on Pip’s back",
        "authority": "four newest Pip backpack pictures + written accessory spec",
    },
    {
        "id": "two_symmetrical_shoulder_straps",
        "label": "Two symmetrical shoulder straps",
        "authority": "four newest Pip backpack pictures + written accessory spec",
    },
    {
        "id": "no_satchel",
        "label": "No satchel",
        "authority": "written accessory spec",
    },
    {
        "id": "no_cross_body_strap",
        "label": "No cross-body strap",
        "authority": "written accessory spec",
    },
    {
        "id": "no_hip_bag",
        "label": "No hip bag",
        "authority": "written accessory spec",
    },
    {
        "id": "backpack_no_intersection",
        "label": "Backpack must not intersect wings, scarf, neck, tail, or body",
        "authority": "written accessory spec",
    },
    {
        "id": "feet_toes_rear_hallux",
        "label": "Feet, toes, and rear hallux",
        "authority": "binding five-view JPEGs",
    },
    {
        "id": "accessories_separated_or_fused",
        "label": "Accessories are separate objects vs fused into the body",
        "authority": "production suitability",
    },
    {
        "id": "proportions_and_cgi_appearance",
        "label": "Preserve approved face, eyes, yellow finish, crest, wings, feet, proportions, CGI appearance",
        "authority": "conditionally approved long-wing appearance",
    },
)


def detect_accessory_profile(name: str) -> str:
    lowered = name.lower()
    if "backpack" in lowered:
        return "backpack"
    return "satchel"


def backpack_closeup_cameras(
    center: tuple[float, float, float],
    height: float,
    facing: tuple[float, float, float] = FACING,
    left: tuple[float, float, float] = CHAR_LEFT,
    right: tuple[float, float, float] = CHAR_RIGHT,
) -> dict[str, dict[str, tuple[float, float, float] | float]]:
    """Close-up cameras relative to mesh bounds, not world origin.

    Uploaded Tripo meshes are often centered on the origin (feet below z=0).
    Origin-relative close-ups then frame empty sky above the crest.
    """
    cx, cy, cz = center
    h = max(float(height), 0.001)
    fx, fy, fz = facing
    lx, ly, lz = left
    rx, ry, rz = right
    shoulder_z = cz + h * 0.22
    pack_z = cz + h * 0.10
    return {
        "shoulder_left": {
            "location": (cx + fx * h * 0.42 + lx * h * 0.28, cy + fy * h * 0.42 + ly * h * 0.28, shoulder_z),
            "look": (cx + lx * h * 0.08, cy + ly * h * 0.08, shoulder_z),
            "ortho": h * 0.48,
        },
        "shoulder_right": {
            "location": (cx + fx * h * 0.42 + rx * h * 0.28, cy + fy * h * 0.42 + ry * h * 0.28, shoulder_z),
            "look": (cx + rx * h * 0.08, cy + ry * h * 0.08, shoulder_z),
            "ortho": h * 0.48,
        },
        "backpack_attachment": {
            "location": (cx - fx * h * 0.70, cy - fy * h * 0.70, pack_z + h * 0.04),
            "look": (cx, cy, pack_z),
            "ortho": h * 0.52,
        },
        "backpack_wing_clearance": {
            "location": (cx - fx * h * 0.48 + lx * h * 0.42, cy - fy * h * 0.48 + ly * h * 0.42, pack_z + h * 0.10),
            "look": (cx - fx * h * 0.04 + lx * h * 0.08, cy - fy * h * 0.04 + ly * h * 0.08, pack_z + h * 0.04),
            "ortho": h * 0.56,
        },
    }


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_slug(name: str) -> str:
    stem = Path(name).name
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._")
    return cleaned[:80] or "upload"


def detect_kind(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in MODEL_EXTENSIONS:
        return "model"
    if suffix in TEXTURE_EXTENSIONS:
        return "texture"
    if suffix in PACKAGE_EXTENSIONS:
        return "package"
    return "other"


def sniff_magic(path: Path) -> str | None:
    if not path.is_file():
        return None
    with path.open("rb") as handle:
        head = handle.read(16)
    if head.startswith(b"glTF"):
        return "glb"
    if head.startswith(b"BLENDER"):
        return "blend"
    if head.startswith(b"PK"):
        return "zip"
    if head.startswith(b"\x89PNG"):
        return "png"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if head.startswith(b"Kaydara FBX") or b"FBX" in head[:16]:
        return "fbx"
    return None


def classify_file(path: Path) -> dict[str, Any]:
    return {
        "filename": path.name,
        "relative": path.name,
        "extension": path.suffix.lower(),
        "kind": detect_kind(path),
        "bytes": path.stat().st_size if path.is_file() else 0,
        "sha256": sha256_file(path) if path.is_file() else None,
        "magic": sniff_magic(path) if path.is_file() else None,
        "supported": path.suffix.lower() in SUPPORTED_EXTENSIONS,
    }


def assert_not_protected_write(path: Path) -> None:
    resolved = path.resolve()
    lib = PRODUCTION_LIBRARY.resolve()
    if resolved == lib or lib in resolved.parents:
        raise PermissionError(f"refusing to write inside production-library/: {path}")
    for forbidden in (CURRENT_PIP, CURRENT_GOAT, *LONG_WING_PARTS):
        if resolved == forbidden.resolve():
            raise PermissionError(f"refusing to overwrite protected character file: {path}")


def assert_intake_destination(path: Path) -> None:
    assert_not_protected_write(path)
    resolved = path.resolve()
    allowed_parents = (
        INTAKE_ROOT.resolve(),
        ARTIFACTS.resolve(),
        Path("/tmp").resolve(),
    )
    if not any(resolved == root or root in resolved.parents for root in allowed_parents):
        raise PermissionError(f"intake outputs must stay under intake, artifacts, or /tmp: {path}")


def copy_original_unchanged(source: Path, dest_dir: Path) -> Path:
    if not source.is_file():
        raise FileNotFoundError(f"source file not found: {source}")
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / source.name
    assert_intake_destination(dest)
    if dest.exists():
        raise FileExistsError(f"refusing to overwrite preserved original: {dest}")
    shutil.copy2(source, dest)
    if sha256_file(source) != sha256_file(dest):
        raise RuntimeError("copied original hash does not match source")
    dest.chmod(dest.stat().st_mode & ~0o222)
    return dest


def _safe_zip_member(name: str) -> Path:
    if name.startswith("/") or name.startswith("\\"):
        raise ValueError(f"zip member has absolute path: {name}")
    relative = Path(name)
    if ".." in relative.parts:
        raise ValueError(f"zip member escapes package: {name}")
    return relative


def extract_zip_safely(archive: Path, dest_dir: Path) -> list[Path]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    assert_intake_destination(dest_dir)
    written: list[Path] = []
    with zipfile.ZipFile(archive) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            relative = _safe_zip_member(info.filename)
            out = dest_dir / relative
            assert_intake_destination(out)
            out.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, out.open("wb") as dst:
                shutil.copyfileobj(src, dst)
            written.append(out)
    return written


def choose_primary_model(files: Iterable[Path]) -> Path | None:
    by_suffix: dict[str, list[Path]] = {ext: [] for ext in MODEL_PREFERENCE}
    for path in files:
        suffix = path.suffix.lower()
        if suffix in by_suffix:
            by_suffix[suffix].append(path)
    for suffix in MODEL_PREFERENCE:
        if by_suffix[suffix]:
            return sorted(by_suffix[suffix], key=lambda p: p.name.lower())[0]
    return None


def classify_package(files: Iterable[Path], root: Path) -> dict[str, Any]:
    records = []
    for path in sorted(files, key=lambda p: str(p).lower()):
        record = classify_file(path)
        try:
            record["relative"] = str(path.relative_to(root))
        except ValueError:
            record["relative"] = path.name
        records.append(record)
    models = [Path(root / rec["relative"]) for rec in records if rec["kind"] == "model"]
    textures = [rec for rec in records if rec["kind"] == "texture"]
    others = [rec for rec in records if rec["kind"] not in {"model", "texture"}]
    primary = choose_primary_model(models)
    return {
        "files": records,
        "modelCount": len(models),
        "textureCount": len(textures),
        "otherCount": len(others),
        "primaryModel": None
        if primary is None
        else {
            "filename": primary.name,
            "relative": str(primary.relative_to(root)),
            "extension": primary.suffix.lower(),
            "sha256": sha256_file(primary),
            "bytes": primary.stat().st_size,
        },
        "supported": primary is not None,
    }


def new_package_id(source_name: str, digest: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{stamp}_{safe_slug(source_name)}_{digest[:12]}"


def package_paths(package_id: str, root: Path | None = None) -> dict[str, Path]:
    base = (root or INBOX_ROOT) / package_id
    return {
        "root": base,
        "original": base / "original",
        "unpacked": base / "unpacked",
        "reports": base / "reports",
        "previews": base / "previews",
        "preview_blend": base / "preview",
    }


def empty_checklist(profile: str = "satchel") -> list[dict[str, Any]]:
    items = BACKPACK_COMPARISON_ITEMS if profile == "backpack" else PIP_COMPARISON_ITEMS
    return [
        {
            **item,
            "status": "REQUIRES_JUSTIN",
            "automated": False,
            "notes": "Visual comparison only. Intake never auto-approves this item.",
        }
        for item in items
    ]


def apply_measured_hints(checklist: list[dict[str, Any]], measured: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Attach measurements as hints. Never promote a visual item to PASS."""
    if not measured:
        return checklist
    hints = {
        "accessories_separated_or_fused": measured.get("objectSeparation"),
        "three_coral_crest_feathers": measured.get("crestHint"),
        "one_continuous_cross_body_strap": measured.get("strapHint"),
        "front_exactly_one_diagonal_strap": measured.get("frontStrapHint"),
        "character_right_shoulder_origin": measured.get("lateralityHint"),
        "character_left_hip_satchel": measured.get("bagHint"),
        "true_backpack_centered_on_back": measured.get("backpackHint"),
        "two_symmetrical_shoulder_straps": measured.get("strapPairHint"),
        "no_satchel": measured.get("noSatchelHint"),
        "no_cross_body_strap": measured.get("noCrossBodyHint"),
        "no_hip_bag": measured.get("noHipBagHint"),
        "backpack_no_intersection": measured.get("intersectionHint"),
        "long_layered_wings_visible": measured.get("wingHint"),
    }
    out = []
    for item in checklist:
        row = dict(item)
        hint = hints.get(item["id"])
        if hint:
            row["measuredHint"] = hint
            row["notes"] = (
                "Automated hint only. Status stays REQUIRES_JUSTIN until Justin "
                "visually approves against the binding five-views."
            )
        out.append(row)
    return out


def evaluate_replacement_gate(
    *,
    justinApproved: bool = False,
    visualChecklistPassed: bool = False,
    requestCanonReplace: bool = False,
    requestTheatricalBind: bool = False,
    requestMerge: bool = False,
    requestProductionLibraryWrite: bool = False,
    requestRigBindToCurrentPip: bool = False,
) -> dict[str, Any]:
    blockers = [
        "Current fused Tripo Pip is preserved for comparison only.",
        "Next upload is a replacement candidate, not automatic canon.",
        "Justin visual approval is required before retopo, rigging, canon replacement, theatrical binding, or merging.",
    ]
    if not justinApproved:
        blockers.append("Justin has not visually approved this candidate.")
    if not visualChecklistPassed:
        blockers.append("Reference-comparison checklist is not fully approved.")
    forbidden = {
        "autoReplaceCurrentPip": False,
        "canonReplace": False,
        "theatricalBind": False,
        "merge": False,
        "productionLibraryWrite": False,
        "finalRigBindToCurrentPip": False,
        "paidResources": False,
    }
    if requestCanonReplace:
        blockers.append("Canon replacement requested and refused.")
    if requestTheatricalBind:
        blockers.append("Theatrical binding requested and refused.")
    if requestMerge:
        blockers.append("Merge requested and refused.")
    if requestProductionLibraryWrite:
        blockers.append("production-library write requested and refused.")
    if requestRigBindToCurrentPip:
        blockers.append("Final Pip rig bind to current candidate requested and refused.")
    return {
        "role": "replacement_candidate_only",
        "autoReplaceCurrentPip": False,
        "approved": False,
        "canonicalMutated": False,
        "theatricalBound": False,
        "merge": False,
        "productionLibraryTouched": False,
        "paidResources": False,
        "currentPipOverwritten": False,
        "goatTouched": False,
        "stopForJustin": True,
        "forbidden": forbidden,
        "blockers": blockers,
        "nextAllowed": [
            "Preserve the uploaded file unchanged.",
            "Record filename and SHA-256.",
            "Open in Blender 4.2.3 LTS.",
            "Generate geometry report, five-views, close-ups, and turntable.",
            "Fill the reference-comparison checklist as REQUIRES_JUSTIN.",
            "Stop for Justin visual approval.",
        ],
        "nextForbidden": [
            "final Pip retopology",
            "final Pip UV replacement",
            "final Pip texture lock",
            "final Pip rig binding",
            "final Pip facial rig",
            "final Pip groom/feather lock",
            "final Pip animation",
            "final Pip collision fitting",
            "final character-dependent camera framing",
            "final Pip-and-Goat scale binding",
            "hero shots or final episode renders",
            "canonical replacement",
            "theatrical binding",
            "merging an unapproved character",
            "deployment or paid rendering",
        ],
    }


def build_provenance(
    *,
    package_id: str,
    source_name: str,
    source_sha256: str,
    source_bytes: int,
    license_name: str,
    origin: str,
    notes: str = "",
    unpacked: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "schema": "tivvlejoy.pip_replacement_intake.provenance.v1",
        "packageId": package_id,
        "characterCode": "CHAR_PIP_001",
        "role": "replacement_candidate_only",
        "createdAt": utc_now(),
        "blender": REQUIRED_BLENDER + " LTS",
        "original": {
            "filename": source_name,
            "sha256": source_sha256,
            "bytes": source_bytes,
            "preservedUnchanged": True,
        },
        "license": {
            "name": license_name or "UNKNOWN_PENDING",
            "source": origin or "UNKNOWN_PENDING",
            "paidResource": False,
            "thirdPartyMarketplace": False,
        },
        "notes": notes,
        "unpacked": unpacked,
        "protected": {
            "currentPip": str(CURRENT_PIP.relative_to(REPO_ROOT)),
            "currentGoat": str(CURRENT_GOAT.relative_to(REPO_ROOT)),
            "longWingOriginalSha256": LONG_WING_ORIGINAL_SHA256,
            "productionLibraryFingerprint": APPROVED_LIBRARY_FINGERPRINT,
        },
        "gate": evaluate_replacement_gate(),
    }


def suggested_scale(native_height: float, target: float = PIP_TARGET_HEIGHT) -> dict[str, float | bool]:
    height = max(float(native_height), 1e-6)
    factor = target / height
    return {
        "nativeHeight": height,
        "targetHeight": target,
        "suggestedFactor": factor,
        "withinTenPercent": abs(height - target) / target <= 0.10,
        "appliedToOriginal": False,
    }


def orientation_expectations() -> dict[str, Any]:
    return {
        "charactersFace": "+X",
        "characterLeft": "+Y",
        "characterRight": "-Y",
        "strapShoulder": "character-right (−Y)",
        "satchelHip": "character-left (+Y)",
        "whenFacingCamera": {
            "cameraLooksToward": "−X",
            "strapViewerSide": "viewer-left",
            "bagViewerSide": "viewer-right",
        },
        "autoCorrectOriginal": False,
    }


def write_json(path: Path, payload: dict[str, Any]) -> Path:
    assert_intake_destination(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")
    return path


def prepare_package(
    source: Path,
    *,
    license_name: str = "UNKNOWN_PENDING",
    origin: str = "UNKNOWN_PENDING",
    notes: str = "",
    inbox: Path | None = None,
) -> dict[str, Any]:
    source = source.expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"source file not found: {source}")
    if source.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"unsupported source {source.suffix}; expected one of {sorted(SUPPORTED_EXTENSIONS)}"
        )

    digest = sha256_file(source)
    package_id = new_package_id(source.name, digest)
    paths = package_paths(package_id, inbox)
    for key in ("root", "original", "unpacked", "reports", "previews", "preview_blend"):
        assert_intake_destination(paths[key])
        paths[key].mkdir(parents=True, exist_ok=True)

    original = copy_original_unchanged(source, paths["original"])
    original_record = classify_file(original)

    unpacked_files: list[Path] = []
    if original.suffix.lower() == ".zip":
        unpacked_files = extract_zip_safely(original, paths["unpacked"])
        classification = classify_package(unpacked_files, paths["unpacked"])
    else:
        classification = classify_package([original], paths["original"])

    profile = detect_accessory_profile(source.name)
    provenance = build_provenance(
        package_id=package_id,
        source_name=source.name,
        source_sha256=digest,
        source_bytes=source.stat().st_size,
        license_name=license_name,
        origin=origin,
        notes=notes,
        unpacked=classification,
    )
    provenance["accessoryProfile"] = profile
    checklist = empty_checklist(profile)
    write_json(paths["reports"] / "PROVENANCE.json", provenance)
    write_json(
        paths["reports"] / "COMPARISON_CHECKLIST.json",
        {
            "schema": "tivvlejoy.pip_replacement_intake.checklist.v1",
            "packageId": package_id,
            "accessoryProfile": profile,
            "bindingRefs": [f"artifacts/theatrical-v2/source-package-validation/refs/{name}" for name in PIP_BINDING_VIEWS],
            "accessoryBinding": (
                "written backpack spec + four newest Pip backpack pictures when present"
                if profile == "backpack"
                else "satchel / cross-body laterality from binding five-views"
            ),
            "items": checklist,
            "approved": False,
            "autoReplace": False,
        },
    )
    write_json(paths["reports"] / "GATE.json", evaluate_replacement_gate())
    write_json(
        paths["reports"] / "INTAKE_MANIFEST.json",
        {
            "schema": "tivvlejoy.pip_replacement_intake.manifest.v1",
            "packageId": package_id,
            "createdAt": provenance["createdAt"],
            "original": original_record,
            "classification": classification,
            "paths": {key: str(value) for key, value in paths.items()},
            "blenderValidation": "pending",
            "accessoryProfile": profile,
            "renders": [],
            "approved": False,
            "autoReplaceCurrentPip": False,
        },
    )
    return {
        "packageId": package_id,
        "paths": {key: str(value) for key, value in paths.items()},
        "original": original_record,
        "classification": classification,
        "provenance": provenance,
        "checklist": checklist,
        "gate": evaluate_replacement_gate(),
    }


def parse_ingest_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest the next Pip model as a replacement candidate. Never auto-replaces current Pip."
    )
    parser.add_argument("command", choices=["ingest", "validate-package"])
    parser.add_argument("source", help="BLEND, GLB, GLTF, FBX, OBJ, texture, or ZIP path; or an existing package dir")
    parser.add_argument("--license", default="UNKNOWN_PENDING")
    parser.add_argument("--origin", default="UNKNOWN_PENDING")
    parser.add_argument("--notes", default="")
    parser.add_argument("--skip-blender", action="store_true")
    parser.add_argument("--skip-renders", action="store_true", help="Import and report only; skip preview stills")
    parser.add_argument("--inbox", default=None, help="Override inbox root (tests only)")
    parser.add_argument("--blender-package", default=None, help="Internal: package dir for Blender validation")
    return parser.parse_args(argv)


def blender_command(package_dir: Path) -> list[str]:
    return [
        str(BLENDER_BIN),
        "-b",
        "-noaudio",
        "-P",
        str(REPO_ROOT / "scripts/assets/pip_replacement_intake.py"),
        "--",
        "validate-package",
        str(package_dir),
        "--blender-package",
        str(package_dir),
    ]
