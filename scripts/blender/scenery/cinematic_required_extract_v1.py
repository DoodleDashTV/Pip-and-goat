#!/usr/bin/env python3
"""Fail-closed extract of required cinematic Original-14 libraries.

No Blender. No RunPod. Never substitutes reduced or placeholder assets.
Production still keeps the 180 MiB unknown-.blend cap; Flora/Rock and the
complete purchased EcoKit texture trees are required by hero rebuild v3.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from pathlib import Path

from cinematic_ecokit_image_resolve_v1 import (
    DOCUMENTED_ASSETS_LIBRARY_COUNT,
    DOCUMENTED_TEXTURE_COUNT,
    DOCUMENTED_TEXTURES_DIR_COUNT,
    REQUIRED_IMAGE_NAMES,
    REQUIRED_TEXTURE_PREFIXES,
    is_required_ecokit_texture,
    verify_ecokit_texture_tree,
)

LEGACY_BLEND_CAP = 180 * 1024 * 1024
FLORA_NAME = "Flora_Mat&GN&Models.blend"
ROCK_NAME = "Rock_Models.blend"
FLORA_MEMBER = "Stylised EcoKit/Flora_Mat&GN&Models.blend"
ROCK_MEMBER = "Stylised EcoKit/Rock_Models.blend"
# Documented uncompressed sizes. Flora from hidden-limit / lookdev tests.
# Rock from v7-proof-a SOURCE_STAGE.json (258365184).
DOCUMENTED_FLORA_BYTES = 670 * 1024 * 1024
DOCUMENTED_ROCK_BYTES = 258365184
ECOKIT_SOURCE_ID = "SRC_FOREST_STYLISED_ECOKIT"
ECOKIT_ROLE = "forest_ecokit"
ECOKIT_ZIP_SHA256 = "8370295466ae2255d6e0c0b4b36bb7f8cddbef8e9cdf5e5b847016254073c79a"
ECOKIT_EXTRACT_ROLE_LIMIT = 2000

REQUIRED_LIBRARIES = (
    {
        "name": FLORA_NAME,
        "member": FLORA_MEMBER,
        "role": ECOKIT_ROLE,
        "sourceId": ECOKIT_SOURCE_ID,
        "documentedBytes": DOCUMENTED_FLORA_BYTES,
        "minBytes": LEGACY_BLEND_CAP + 1,
        "maxBytes": 800 * 1024 * 1024,
    },
    {
        "name": ROCK_NAME,
        "member": ROCK_MEMBER,
        "role": ECOKIT_ROLE,
        "sourceId": ECOKIT_SOURCE_ID,
        "documentedBytes": DOCUMENTED_ROCK_BYTES,
        "minBytes": LEGACY_BLEND_CAP + 1,
        "maxBytes": 400 * 1024 * 1024,
    },
)

ORIGINAL_14_ROLES = (
    "village_blender",
    "village_textures",
    "village_project",
    "village_fbx",
    "village_unity_builtin",
    "village_unity_urp",
    "village_unity_hdrp",
    "sky_machine_v1",
    "sky_machine_v2",
    "sky_extra_update",
    "sky_hdri",
    "forest_nature",
    "forest_ecokit",
    "world_shaders",
)


class RequiredLibraryError(RuntimeError):
    def __init__(self, code: str, message: str, **extra):
        super().__init__(message)
        self.code = code
        self.extra = extra


def _basename(filename: str) -> str:
    return Path(str(filename).replace("\\", "/")).name


def required_spec(filename: str) -> dict | None:
    name = _basename(filename)
    for spec in REQUIRED_LIBRARIES:
        if spec["name"] == name:
            return spec
    return None


def is_required_cinematic_library(filename: str) -> bool:
    return required_spec(filename) is not None


def is_required_cinematic_dependency(filename: str) -> bool:
    return is_required_cinematic_library(filename) or is_required_ecokit_texture(filename)


def apply_role_limit_keep_required(wanted: list, required_items: list, role_limit: int) -> list:
    """Keep purchased EcoKit libraries and texture trees when the role slice would drop them."""
    limited = list(wanted[: int(role_limit)])
    for item in required_items:
        if item not in limited:
            limited.append(item)
    return limited


def expected_runtime_path(extract_root: Path, name: str) -> Path:
    spec = required_spec(name)
    if spec is None:
        raise RequiredLibraryError("REQUIRED_LIBRARY_UNKNOWN", name)
    return Path(extract_root) / spec["role"] / spec["member"]


def required_size_ok(filename: str, file_size: int) -> bool:
    spec = required_spec(filename)
    if spec is None:
        return False
    size = int(file_size or 0)
    return spec["minBytes"] <= size <= spec["maxBytes"]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def find_required(root: Path, name: str) -> Path | None:
    target = str(name)
    for path in Path(root).rglob(target):
        if path.name == target and path.is_file():
            return path
    return None


def verify_required_libraries(root: Path, *, expected_hashes: dict[str, str] | None = None) -> list[dict]:
    receipts = []
    blockers = []
    expected_hashes = expected_hashes or {}
    for spec in REQUIRED_LIBRARIES:
        found = find_required(root, spec["name"])
        row = {
            "archive": spec["sourceId"],
            "member": spec["member"],
            "name": spec["name"],
            "destination": str(found) if found else None,
            "bytes": int(found.stat().st_size) if found and found.is_file() else 0,
            "sha256": sha256_file(found) if found and found.is_file() else None,
            "status": "MISSING",
        }
        if found is None:
            blockers.append(f"MISSING:{spec['name']}")
        elif row["bytes"] <= 0:
            row["status"] = "ZERO_BYTE"
            blockers.append(f"ZERO_BYTE:{spec['name']}")
        elif not required_size_ok(spec["name"], row["bytes"]):
            row["status"] = "SIZE_OUT_OF_RANGE"
            blockers.append(f"SIZE_OUT_OF_RANGE:{spec['name']}")
        elif spec["name"] in expected_hashes and row["sha256"] != expected_hashes[spec["name"]]:
            row["status"] = "HASH_MISMATCH"
            blockers.append(f"HASH_MISMATCH:{spec['name']}")
        else:
            row["status"] = "OK"
        receipts.append(row)
    if blockers:
        raise RequiredLibraryError("REQUIRED_LIBRARY_MISSING", ",".join(blockers), receipts=receipts)
    return receipts


def verify_required_textures(root: Path) -> dict:
    report = verify_ecokit_texture_tree(root)
    if not report["ok"]:
        raise RequiredLibraryError(
            "REQUIRED_TEXTURES_MISSING",
            ",".join(report["blockers"]),
            report=report,
        )
    return report


def zip_has_required_textures(available: dict) -> bool:
    return any(is_required_ecokit_texture(name) for name in available)


def original14_manifest() -> dict:
    return {
        "schema": "TIVVLEJOY_ORIGINAL14_REQUIRED_MANIFEST_V1",
        "roles": list(ORIGINAL_14_ROLES),
        "count": len(ORIGINAL_14_ROLES),
        "requiredLibraries": [
            {
                "name": spec["name"],
                "member": spec["member"],
                "role": spec["role"],
                "sourceId": spec["sourceId"],
                "documentedBytes": spec["documentedBytes"],
                "minBytes": spec["minBytes"],
                "maxBytes": spec["maxBytes"],
            }
            for spec in REQUIRED_LIBRARIES
        ],
        "ecokitZipSha256": ECOKIT_ZIP_SHA256,
        "requiredTexturePrefixes": list(REQUIRED_TEXTURE_PREFIXES),
        "requiredTextureCount": DOCUMENTED_TEXTURE_COUNT,
        "requiredTexturesDirCount": DOCUMENTED_TEXTURES_DIR_COUNT,
        "requiredAssetsLibraryCount": DOCUMENTED_ASSETS_LIBRARY_COUNT,
        "requiredImageNames": list(REQUIRED_IMAGE_NAMES),
        "ok": len(ORIGINAL_14_ROLES) == 14,
    }


def safe_member_path(destination: Path, member: str) -> Path | None:
    rel = Path(str(member).replace("\\", "/"))
    if rel.is_absolute() or ".." in rel.parts:
        return None
    target = (destination / rel).resolve()
    dest = destination.resolve()
    if dest != target and dest not in target.parents:
        return None
    return target


def _write_zip_member(archive: zipfile.ZipFile, info: zipfile.ZipInfo, target: Path) -> int:
    size = int(info.file_size or 0)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.is_file() and target.stat().st_size == size and size > 0:
        return size
    written = 0
    with archive.open(info) as src, target.open("wb") as dst:
        while True:
            chunk = src.read(4 * 1024 * 1024)
            if not chunk:
                break
            dst.write(chunk)
            written += len(chunk)
    if written != size:
        raise RequiredLibraryError(
            "REQUIRED_LIBRARY_TRUNCATED",
            f"{target.name} wrote {written} expected {size}",
            destination=str(target),
        )
    return written


def extract_required_from_zip(zip_path: Path, destination: Path) -> list[dict]:
    destination.mkdir(parents=True, exist_ok=True)
    if not zip_path.is_file():
        raise RequiredLibraryError("REQUIRED_LIBRARY_ARCHIVE_MISSING", str(zip_path.name))
    receipts = []
    texture_receipts = []
    with zipfile.ZipFile(zip_path) as archive:
        available = {info.filename.replace("\\", "/"): info for info in archive.infolist() if not info.is_dir()}
        by_name = {_basename(name): info for name, info in available.items()}
        for spec in REQUIRED_LIBRARIES:
            info = available.get(spec["member"]) or by_name.get(spec["name"])
            if info is None:
                raise RequiredLibraryError("REQUIRED_LIBRARY_NOT_IN_ZIP", spec["name"], member=spec["member"])
            size = int(info.file_size or 0)
            if not required_size_ok(spec["name"], size):
                raise RequiredLibraryError("REQUIRED_LIBRARY_SIZE", f"{spec['name']} size {size}", bytes=size)
            target = safe_member_path(destination, info.filename)
            if target is None:
                raise RequiredLibraryError("REQUIRED_LIBRARY_UNSAFE_PATH", info.filename)
            _write_zip_member(archive, info, target)
            receipts.append({
                "archive": zip_path.name,
                "member": info.filename,
                "destination": str(target),
                "bytes": target.stat().st_size,
                "sha256": sha256_file(target),
                "status": "OK",
                "name": spec["name"],
                "kind": "library",
            })
        texture_infos = [info for name, info in available.items() if is_required_ecokit_texture(name)]
        for info in texture_infos:
            target = safe_member_path(destination, info.filename.replace("\\", "/"))
            if target is None:
                raise RequiredLibraryError("REQUIRED_LIBRARY_UNSAFE_PATH", info.filename)
            _write_zip_member(archive, info, target)
            texture_receipts.append({
                "archive": zip_path.name,
                "member": info.filename,
                "destination": str(target),
                "bytes": target.stat().st_size,
                "status": "OK",
                "name": Path(info.filename).name,
                "kind": "texture",
            })
        if zip_has_required_textures(available):
            verify_required_textures(destination)
    verify_required_libraries(destination)
    return receipts + texture_receipts


def extract_required_from_assets(assets: list[dict], extract_root: Path) -> list[dict]:
    extract_root.mkdir(parents=True, exist_ok=True)
    zip_path = None
    for asset in assets:
        if str(asset.get("role") or "") == ECOKIT_ROLE:
            zip_path = Path(asset["localPath"])
            break
    if zip_path is None:
        raise RequiredLibraryError("REQUIRED_LIBRARY_ROLE_MISSING", ECOKIT_ROLE)
    dest = extract_root / ECOKIT_ROLE
    return extract_required_from_zip(zip_path, dest)


def _cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-root", default="")
    parser.add_argument("--expected-hash-json", default="")
    parser.add_argument("--manifest-only", action="store_true")
    parser.add_argument("--extract-and-verify", action="store_true")
    parser.add_argument("--assets-json", default="")
    parser.add_argument("--extract-root", default="")
    args = parser.parse_args(argv)
    if args.manifest_only:
        print(json.dumps(original14_manifest(), indent=2))
        return 0
    expected = {}
    if args.expected_hash_json:
        expected = json.loads(Path(args.expected_hash_json).read_text())
    try:
        if args.extract_and_verify:
            assets = json.loads(args.assets_json if args.assets_json.startswith("[") or args.assets_json.startswith("{") else Path(args.assets_json).read_text())
            if isinstance(assets, dict):
                assets = assets.get("assets") or assets.get("selected") or []
            receipts = extract_required_from_assets(assets, Path(args.extract_root))
            libraries = [row for row in receipts if row.get("kind") != "texture"]
            textures = [row for row in receipts if row.get("kind") == "texture"]
            texture_tree = verify_ecokit_texture_tree(Path(args.extract_root) / ECOKIT_ROLE)
            if textures and not texture_tree["ok"]:
                raise RequiredLibraryError("REQUIRED_TEXTURES_MISSING", ",".join(texture_tree["blockers"]), report=texture_tree)
            print(json.dumps({
                "ok": True,
                "receipts": libraries,
                "textureCount": len(textures),
                "textureTree": texture_tree,
            }, indent=2))
            return 0
        if args.verify_root:
            receipts = verify_required_libraries(Path(args.verify_root), expected_hashes=expected)
            payload = {"ok": True, "receipts": receipts}
            try:
                payload["textureTree"] = verify_required_textures(Path(args.verify_root))
            except RequiredLibraryError:
                payload["textureTree"] = verify_ecokit_texture_tree(Path(args.verify_root))
            print(json.dumps(payload, indent=2))
            return 0
    except RequiredLibraryError as exc:
        print(json.dumps({"ok": False, "code": exc.code, "error": str(exc), **(exc.extra or {})}), flush=True)
        return 2
    parser.error("use --manifest-only, --verify-root, or --extract-and-verify")
    return 2


if __name__ == "__main__":
    raise SystemExit(_cli())
