#!/usr/bin/env python3
"""One-source-at-a-time private conditioning (no purchased bytes written to Git)."""
from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

CONDITION_CATALOG = (
    {"sourceId": "SRC_VILLAGE_BLEND_ZIP", "role": "village_blender", "kind": "geometry_library"},
    {"sourceId": "SRC_VILLAGE_TEXTURES_ZIP", "role": "village_textures", "kind": "texture_library"},
    {"sourceId": "SRC_VILLAGE_PROJECT_ZIP", "role": "village_project", "kind": "water_flora_library"},
    {"sourceId": "SRC_VILLAGE_FBX_ZIP", "role": "village_fbx", "kind": "geometry_library"},
    {"sourceId": "SRC_FOREST_MODEL_PACKAGE", "role": "forest_nature", "kind": "geometry_library"},
    {"sourceId": "SRC_FOREST_STYLISED_ECOKIT", "role": "forest_ecokit", "kind": "geometry_library"},
    {"sourceId": "SRC_LOUIS_BG_MOUNTAINS_V1", "role": "background_mountains", "kind": "geometry_library"},
    {"sourceId": "SRC_SKY_HDRI_JPG_PACK", "role": "sky_hdri", "kind": "environment"},
    {"sourceId": "SRC_PHYSICAL_STARLIGHT_1_9_4", "role": "physical_starlight", "kind": "addon_probe"},
    {"sourceId": "SRC_GAFFER_3_2_10", "role": "gaffer", "kind": "addon_probe"},
    {"sourceId": "SRC_BOTANIQ_GEOSCATTER_BIOMES", "role": "botaniq_geoscatter_biomes", "kind": "scatter_presets"},
    {"sourceId": "SRC_STYLIZED_TAVERN_INTERIOR", "role": "stylized_tavern", "kind": "geometry_library"},
    {"sourceId": "SRC_3DT_MOUNTAIN_PACK", "role": "mountains_3dt", "kind": "geometry_library"},
    {"sourceId": "SRC_BOTANIQ_FULL", "role": "botaniq_full", "kind": "vegetation_library"},
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_zip(path: Path) -> dict:
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        exts: dict[str, int] = {}
        for name in names:
            ext = Path(name).suffix.lower() or "[dir]"
            exts[ext] = exts.get(ext, 0) + 1
        scripts = [name for name in names if name.endswith(".py")]
        blends = [name for name in names if name.lower().endswith(".blend")]
        return {
            "memberCount": len(names),
            "extensionCounts": exts,
            "embeddedScriptCount": len(scripts),
            "blendCount": len(blends),
            "blendNames": [Path(name).name for name in blends[:12]],
            "embeddedScripts": [Path(name).name for name in scripts[:12]],
        }


def condition_one(source: Path, out_root: Path, source_id: str, role: str) -> dict:
    if not source.is_file():
        return {
            "sourceId": source_id,
            "role": role,
            "status": "MISSING",
            "reason": f"source file not present: {source.name}",
            "conditioned": False,
        }
    digest = sha256_file(source)
    work = out_root / source_id
    work.mkdir(parents=True, exist_ok=True)
    listing = inspect_zip(source) if source.suffix.lower() == ".zip" else {"memberCount": 1}
    addon = role in {"physical_starlight", "gaffer"}
    receipt = {
        "schema": "TIVVLEJOY_CONDITIONED_SOURCE_RECEIPT_V1",
        "sourceId": source_id,
        "role": role,
        "blender": "4.2.2",
        "sourceSha256": digest,
        "byteSize": source.stat().st_size,
        "inspectedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "privateWorkDir": str(work),
        "embeddedScriptsAutoExecuted": False,
        "addonEnabled": False,
        "licensedBytesCommitted": False,
        **listing,
    }
    if addon:
        receipt["status"] = "INSPECTED_NOT_ENABLED"
        receipt["conditioned"] = False
        receipt["reason"] = (
            "Purchased add-on scripts were inspected and not auto-enabled. "
            "Useful baked scene data may be appended from packaged .blend files without running addon.py."
        )
    elif role in {"botaniq_geoscatter_biomes"}:
        receipt["status"] = "PRESETS_ONLY"
        receipt["conditioned"] = False
        receipt["reason"] = "Geo-Scatter biome presets are present; botaniq Full vegetation library is not."
    else:
        receipt["status"] = "HASHED_AND_INSPECTED"
        receipt["conditioned"] = True
        receipt["reason"] = "Source hashed and listed. Geometry/material append happens in the private world builder."
    (work / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    return receipt


def sanitize_receipt(receipt: dict) -> dict:
    clean = dict(receipt)
    clean.pop("privateWorkDir", None)
    return clean


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets-dir", required=True)
    parser.add_argument("--private-out", default="/tmp/tivvlejoy-conditioned")
    parser.add_argument("--sanitized-out", default="")
    args = parser.parse_args()
    assets = Path(args.assets_dir)
    private_out = Path(args.private_out)
    private_out.mkdir(parents=True, exist_ok=True)
    mapping = {
        "SRC_VILLAGE_BLEND_ZIP": "01-SRC_VILLAGE_BLEND_ZIP.zip",
        "SRC_VILLAGE_TEXTURES_ZIP": "02-SRC_VILLAGE_TEXTURES_ZIP.zip",
        "SRC_VILLAGE_PROJECT_ZIP": "03-SRC_VILLAGE_PROJECT_ZIP.zip",
        "SRC_VILLAGE_FBX_ZIP": "04-SRC_VILLAGE_FBX_ZIP.zip",
        "SRC_SKY_HDRI_JPG_PACK": "08-SRC_SKY_HDRI_JPG_PACK.zip",
        "SRC_FOREST_MODEL_PACKAGE": "09-SRC_FOREST_MODEL_PACKAGE.zip",
        "SRC_FOREST_STYLISED_ECOKIT": "10-SRC_FOREST_STYLISED_ECOKIT.zip",
        "SRC_LOUIS_BG_MOUNTAINS_V1": "12-SRC_LOUIS_BG_MOUNTAINS_V1.zip",
        "SRC_GAFFER_3_2_10": "13-SRC_GAFFER_3_2_10.zip",
        "SRC_PHYSICAL_STARLIGHT_1_9_4": "14-SRC_PHYSICAL_STARLIGHT_1_9_4.zip",
        "SRC_STYLIZED_TAVERN_INTERIOR": "15-SRC_STYLIZED_TAVERN_INTERIOR.zip",
        "SRC_BOTANIQ_GEOSCATTER_BIOMES": "16-SRC_BOTANIQ_GEOSCATTER_BIOMES.zip",
        "SRC_3DT_MOUNTAIN_PACK": "SRC_3DT_MOUNTAIN_PACK.zip",
        "SRC_BOTANIQ_FULL": "SRC_BOTANIQ_FULL.zip",
    }
    receipts = []
    for spec in CONDITION_CATALOG:
        path = assets / mapping.get(spec["sourceId"], f"{spec['sourceId']}.zip")
        receipts.append(condition_one(path, private_out, spec["sourceId"], spec["role"]))
    payload = {
        "schema": "TIVVLEJOY_CONDITIONING_BATCH_V1",
        "blender": "4.2.2",
        "licensedBytesCommitted": False,
        "receipts": [sanitize_receipt(item) for item in receipts],
    }
    if args.sanitized_out:
        dest = Path(args.sanitized_out)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"conditioned": sum(1 for item in receipts if item.get("conditioned")), "inspected": len(receipts)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
