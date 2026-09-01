#!/usr/bin/env python3
"""Safe high-size source intake for local TivvleJoy lookdev.

Production extract still uses the 180 MiB .blend cap so paid workers cannot
unpack multi-hundred-megabyte kit dumps by default. Local lookdev can opt
into verified purchased originals after ZIP integrity and allowlist checks.

This module:
- never prints credentials or storage endpoints
- never writes to production object storage
- never enables purchased add-ons
- never extracts embedded scripts or native binaries
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from showcase_original14_select import SUPPORT_EXTS, is_dump_name

PRODUCTION_INTAKE = "production"
LOOKDEV_INTAKE = "lookdev"

# Production default stays in showcase_original14_select.MAX_EXTRACT_BYTES.
# These caps apply only when intake == lookdev and the member is allowlisted.
LOOKDEV_VERIFIED_BLEND_MAX_BYTES = {
    "stylized_forest_nature_kit.blend": 700 * 1024 * 1024,
    "flora_mat&gn&models.blend": 800 * 1024 * 1024,
    "rock_models.blend": 400 * 1024 * 1024,
    "grassy.blend": 700 * 1024 * 1024,
    "meadow.blend": 700 * 1024 * 1024,
    "3dt_pack_mountains.blend": 1600 * 1024 * 1024,
}

# Individual Botaniq Full library assets are native .blend files under 80 MiB.
LOOKDEV_BOTANIQ_MEMBER_MAX_BYTES = 100 * 1024 * 1024

BOTANIQ_QUALITY_MEMBERS = (
    "botaniq_full/blends/models/deciduous/bq_Tree_Salix-babylonica_C_summer.blend",
    "botaniq_full/blends/models/deciduous/bq_Tree_Fagus-sylvatica_C_summer.blend",
    "botaniq_full/blends/models/shrubs/bq_Shrub_Corylus-avellana_C_spring-summer.blend",
    "botaniq_full/blends/models/plants/bq_Plant_Dryopteris-carthusiana_D_spring-summer-autumn.blend",
    "botaniq_full/blends/models/grass/bq_Grass_Carex-oshimensis_B_spring.blend",
    "botaniq_full/blends/models/mosses-and-lichens/bq_Moss_Rhytidiadelphus-squarrosus_A_spring-summer-autumn.blend",
)

THREEDT_QUALITY_MEMBERS = (
    "Blender Files/3DT_Pack_Mountains.blend",
)

LOOKDEV_HDR_MAX_BYTES = 96 * 1024 * 1024
LOOKDEV_TGA_MAX_BYTES = 80 * 1024 * 1024

BLOCKED_EXTRACT_EXTS = {
    ".py", ".pyc", ".pyo", ".so", ".dll", ".dylib", ".exe", ".bat",
    ".cmd", ".sh", ".ps1", ".js", ".msi", ".app",
}

# Owned R2 keys already catalogued by previous paid-worker preflight.
# Sizes are exact HEAD values from the private bucket. Recover is read-only.
R2_LOOKDEV_RECOVER = (
    {
        "sourceId": "SRC_BOTANIQ_FULL_7_2_0",
        "role": "botaniq_full",
        "filename": "botaniq_full-7.2.0.paq.zip",
        "objectKey": (
            "tivvlejoy-assets/source/purchased-blender-tools/"
            "SRC_BOTANIQ_FULL_7_2_0/botaniq_full-7.2.0.paq.zip"
        ),
        "expectedBytes": 5_153_837_530,
        "blenderNative": False,
        "notes": "Polygoniq Botaniq Full 7.2.0. Addon not auto-enabled.",
    },
    {
        "sourceId": "SRC_3DT_MOUNTAIN_PACK_BLENDER",
        "role": "mountains_3dt",
        "filename": "3DT_Mountain_Pack_Blender.zip",
        "objectKey": (
            "tivvlejoy-assets/source/purchased-blender-tools/"
            "SRC_3DT_MOUNTAIN_PACK_BLENDER/3DT_Mountain_Pack_Blender.zip"
        ),
        "expectedBytes": 1_455_791_452,
        "blenderNative": True,
        "notes": "Native Blender 3DT mountain pack. Compare to Louis; do not auto-replace.",
    },
)

LOCAL_ZIP_LOOKDEV_TARGETS = (
    {
        "sourceId": "SRC_FOREST_MODEL_PACKAGE",
        "role": "forest_nature",
        "zipName": "09-SRC_FOREST_MODEL_PACKAGE.zip",
        "members": ("Stylized_Forest_Nature_Kit.blend",),
    },
    {
        "sourceId": "SRC_FOREST_STYLISED_ECOKIT",
        "role": "forest_ecokit",
        "zipName": "10-SRC_FOREST_STYLISED_ECOKIT.zip",
        "members": (
            "Stylised EcoKit/Flora_Mat&GN&Models.blend",
            "Stylised EcoKit/Rock_Models.blend",
        ),
    },
    {
        "sourceId": "SRC_SKY_HDRI_JPG_PACK",
        "role": "sky_hdri",
        "zipName": "08-SRC_SKY_HDRI_JPG_PACK.zip",
        "members": (
            "HDRi_JPG_Pack/sk2/0001.hdr",
            "HDRi_JPG_Pack/sk2/Image0001.jpg",
            "HDRi_JPG_Pack/sk1/Image0001.jpg",
        ),
    },
    {
        "sourceId": "SRC_VILLAGE_TEXTURES_ZIP",
        "role": "village_textures",
        "zipName": "02-SRC_VILLAGE_TEXTURES_ZIP.zip",
        "members": (
            "Village (Textures)/Cabin01_ALB.png",
            "Village (Textures)/Cabin01_NRM.png",
            "Village (Textures)/Cabin01_SPE.png",
            "Village (Textures)/Wood01_ALB.png",
            "Village (Textures)/Wood01_NRM.png",
            "Village (Textures)/Straw01_ALB.png",
            "Village (Textures)/Straw01_NRM.png",
            "Village (Textures)/Straw01_SPE.png",
        ),
    },
    {
        "sourceId": "SRC_VILLAGE_BLEND_ZIP",
        "role": "village_blender",
        "zipName": "01-SRC_VILLAGE_BLEND_ZIP.zip",
        "members": (
            "Village (Blender 4.2.2)/Cabin01A.blend",
            "Village (Blender 4.2.2)/Cabin04A.blend",
        ),
    },
)


def now_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_member_path(destination: Path, member: str) -> Path | None:
    rel = Path(str(member).replace("\\", "/"))
    if rel.is_absolute() or ".." in rel.parts:
        return None
    target = (destination / rel).resolve()
    dest = destination.resolve()
    if dest != target and dest not in target.parents:
        return None
    return target


def lookdev_should_extract_member(filename: str, file_size: int, role: str) -> bool:
    """Allow verified large originals for local lookdev only."""
    rel = Path(str(filename).replace("\\", "/"))
    if rel.is_absolute() or ".." in rel.parts:
        return False
    name = rel.name.lower()
    ext = Path(name).suffix.lower()
    size = int(file_size or 0)
    if ext in BLOCKED_EXTRACT_EXTS:
        return False
    if ext not in SUPPORT_EXTS:
        return False
    if ext == ".obj" and is_dump_name(filename):
        return False
    if ext == ".blend":
        cap = LOOKDEV_VERIFIED_BLEND_MAX_BYTES.get(name)
        if cap is not None and 0 < size <= cap:
            return True
        if name.startswith("bq_") and 0 < size <= LOOKDEV_BOTANIQ_MEMBER_MAX_BYTES:
            return True
        return False
    if ext == ".hdr" and role == "sky_hdri":
        return 0 < size <= LOOKDEV_HDR_MAX_BYTES
    if ext == ".tga" and role == "forest_nature":
        return 0 < size <= LOOKDEV_TGA_MAX_BYTES
    # Cabin maps and other modest support files stay under production image caps.
    if ext in {".png", ".jpg", ".jpeg"} and size <= 20 * 1024 * 1024:
        return True
    if ext in {".fbx", ".glb", ".gltf"} and size <= 48 * 1024 * 1024:
        return True
    return False


def should_extract_member(filename: str, file_size: int, role: str, intake: str = PRODUCTION_INTAKE) -> bool:
    """Intake-aware wrapper. Production default is unchanged."""
    from showcase_original14_select import should_extract_member as production_should_extract

    if str(intake or PRODUCTION_INTAKE).lower() == LOOKDEV_INTAKE:
        return lookdev_should_extract_member(filename, file_size, role)
    return production_should_extract(filename, file_size, role)


def inspect_zip_integrity(path: Path) -> dict:
    if not path.is_file():
        return {"ok": False, "reason": "missing"}
    try:
        with zipfile.ZipFile(path) as archive:
            bad = archive.testzip()
            if bad is not None:
                return {"ok": False, "reason": f"crc_failed:{Path(bad).name}"}
            names = archive.namelist()
            scripts = [Path(name).name for name in names if Path(name).suffix.lower() in BLOCKED_EXTRACT_EXTS]
            blends = [name for name in names if name.lower().endswith(".blend")]
            return {
                "ok": True,
                "memberCount": len(names),
                "blendCount": len(blends),
                "blendNames": [Path(name).name for name in blends[:24]],
                "blockedScriptCount": len(scripts),
                "blockedScripts": scripts[:12],
            }
    except zipfile.BadZipFile:
        return {"ok": False, "reason": "bad_zip"}


def extract_verified_members(
    zip_path: Path,
    destination: Path,
    members: tuple[str, ...] | list[str],
    source_id: str,
    role: str,
) -> dict:
    destination.mkdir(parents=True, exist_ok=True)
    integrity = inspect_zip_integrity(zip_path)
    receipt = {
        "schema": "TIVVLEJOY_LOOKDEV_LARGE_SOURCE_RECEIPT_V1",
        "sourceId": source_id,
        "role": role,
        "intake": LOOKDEV_INTAKE,
        "sourceName": zip_path.name,
        "sourceBytes": zip_path.stat().st_size if zip_path.is_file() else 0,
        "sourceSha256": sha256_file(zip_path) if zip_path.is_file() else "",
        "inspectedAt": now_utc(),
        "integrity": integrity,
        "extracted": [],
        "skipped": [],
        "licensedBytesCommitted": False,
        "addonEnabled": False,
        "credentialsLogged": False,
    }
    if not integrity.get("ok"):
        receipt["status"] = "INTEGRITY_FAILED"
        return receipt
    with zipfile.ZipFile(zip_path) as archive:
        available = {info.filename: info for info in archive.infolist() if not info.is_dir()}
        for member in members:
            info = available.get(member)
            if info is None:
                receipt["skipped"].append({"member": member, "reason": "not_in_zip"})
                continue
            ext = Path(member).suffix.lower()
            if ext in BLOCKED_EXTRACT_EXTS:
                receipt["skipped"].append({"member": member, "reason": "blocked_extension"})
                continue
            if not lookdev_should_extract_member(member, int(info.file_size or 0), role):
                # Cabin .blend files are under the 180 MiB production cap and
                # are not in the large-blend allowlist. Still extract them here
                # because this is an explicit verified-member request.
                if ext == ".blend" and int(info.file_size or 0) <= 180 * 1024 * 1024:
                    pass
                elif ext in {".png", ".jpg", ".jpeg"} and int(info.file_size or 0) <= 20 * 1024 * 1024:
                    pass
                else:
                    receipt["skipped"].append({"member": member, "reason": "not_allowlisted"})
                    continue
            target = safe_member_path(destination, member)
            if target is None:
                receipt["skipped"].append({"member": member, "reason": "unsafe_path"})
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as src, target.open("wb") as dst:
                while True:
                    chunk = src.read(4 * 1024 * 1024)
                    if not chunk:
                        break
                    dst.write(chunk)
            receipt["extracted"].append({
                "member": member,
                "bytes": target.stat().st_size,
                "sha256": sha256_file(target),
            })
    receipt["status"] = "MATERIALIZED" if receipt["extracted"] else "NO_MEMBERS"
    (destination / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    return receipt


def _r2_client():
    import boto3
    from botocore.config import Config

    bucket = os.environ.get("R2_BUCKET")
    endpoint = os.environ.get("R2_ENDPOINT")
    key_id = os.environ.get("R2_ACCESS_KEY_ID")
    secret = os.environ.get("R2_SECRET_ACCESS_KEY")
    if not (bucket and endpoint and key_id and secret):
        raise RuntimeError("PRIVATE_R2_NOT_CONFIGURED")
    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=key_id,
        aws_secret_access_key=secret,
        region_name=os.environ.get("R2_REGION") or "auto",
        config=Config(signature_version="s3v4", retries={"max_attempts": 4}),
    )
    return client, bucket


def recover_cataloged_source(spec: dict, destination: Path) -> dict:
    destination.mkdir(parents=True, exist_ok=True)
    dest = destination / spec["filename"]
    receipt = {
        "schema": "TIVVLEJOY_LOOKDEV_R2_RECOVER_RECEIPT_V1",
        "sourceId": spec["sourceId"],
        "role": spec["role"],
        "filename": spec["filename"],
        "expectedBytes": spec["expectedBytes"],
        "inspectedAt": now_utc(),
        "writeToProductionStorage": False,
        "paidCompute": False,
        "addonEnabled": False,
        "credentialsLogged": False,
    }
    if dest.is_file() and dest.stat().st_size == spec["expectedBytes"]:
        receipt["status"] = "ALREADY_LOCAL"
        receipt["bytes"] = dest.stat().st_size
        receipt["sha256"] = sha256_file(dest)
        (destination / "recover-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        return receipt
    client, bucket = _r2_client()
    head = client.head_object(Bucket=bucket, Key=spec["objectKey"])
    remote_bytes = int(head["ContentLength"])
    receipt["remoteBytes"] = remote_bytes
    if remote_bytes != spec["expectedBytes"]:
        receipt["status"] = "SIZE_MISMATCH"
        receipt["reason"] = "remote size does not match cataloged purchased bytes"
        (destination / "recover-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        return receipt
    tmp = dest.with_suffix(dest.suffix + ".part")
    client.download_file(bucket, spec["objectKey"], str(tmp))
    if tmp.stat().st_size != spec["expectedBytes"]:
        tmp.unlink(missing_ok=True)
        receipt["status"] = "DOWNLOAD_SIZE_MISMATCH"
        (destination / "recover-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
        return receipt
    tmp.replace(dest)
    receipt["status"] = "RECOVERED"
    receipt["bytes"] = dest.stat().st_size
    receipt["sha256"] = sha256_file(dest)
    (destination / "recover-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    return receipt


def find_local_zip(assets_dir: Path, zip_name: str) -> Path | None:
    direct = assets_dir / zip_name
    if direct.is_file():
        return direct
    matches = list(assets_dir.glob(f"**/{zip_name}"))
    return matches[0] if matches else None


def materialize_local_lookdev(assets_dir: Path, out_root: Path) -> dict:
    receipts = []
    for spec in LOCAL_ZIP_LOOKDEV_TARGETS:
        zip_path = find_local_zip(assets_dir, spec["zipName"])
        dest = out_root / spec["sourceId"]
        if zip_path is None:
            receipts.append({
                "sourceId": spec["sourceId"],
                "status": "MISSING_LOCAL_ZIP",
                "zipName": spec["zipName"],
            })
            continue
        receipts.append(extract_verified_members(
            zip_path, dest, spec["members"], spec["sourceId"], spec["role"],
        ))
    return {
        "schema": "TIVVLEJOY_LOOKDEV_LOCAL_MATERIALIZE_V1",
        "inspectedAt": now_utc(),
        "receipts": receipts,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Safe local lookdev large-source intake.")
    parser.add_argument("--assets-dir", default="/tmp/o14-lookdev/assets")
    parser.add_argument("--out", default="/tmp/o14-v4-source")
    parser.add_argument("--recover", default="", help="Comma list: botaniq_full,mountains_3dt")
    parser.add_argument("--local-only", action="store_true")
    args = parser.parse_args()
    out_root = Path(args.out)
    out_root.mkdir(parents=True, exist_ok=True)
    payload = materialize_local_lookdev(Path(args.assets_dir), out_root)
    recover_receipts = []
    wanted = {item.strip() for item in str(args.recover).split(",") if item.strip()}
    if wanted and not args.local_only:
        for spec in R2_LOOKDEV_RECOVER:
            if spec["role"] not in wanted and spec["sourceId"] not in wanted:
                continue
            dest = out_root / spec["sourceId"]
            recover_receipts.append(recover_cataloged_source(spec, dest))
    payload["r2Recover"] = [
        {k: v for k, v in item.items() if k not in {"objectKey"}}
        for item in recover_receipts
    ]
    summary_path = out_root / "LOOKDEV_LARGE_SOURCE_INTAKE.json"
    summary_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "localMaterialized": sum(1 for item in payload["receipts"] if item.get("status") == "MATERIALIZED"),
        "r2Recovered": sum(1 for item in recover_receipts if item.get("status") in {"RECOVERED", "ALREADY_LOCAL"}),
        "summary": str(summary_path),
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
