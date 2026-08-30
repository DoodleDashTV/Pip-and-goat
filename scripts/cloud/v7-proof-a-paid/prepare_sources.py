#!/usr/bin/env python3
"""Prepare Proof A sources on the unpaid Cursor VM. Never creates a pod."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SCENERY = REPO / "scripts/blender/scenery"
sys.path.insert(0, str(SCENERY))
from r2_zip_member_extract import extract_members  # noqa: E402
from worker_memory_contract_v1 import evaluate_worker_memory_contract  # noqa: E402

HDRI_KEY = "tivvlejoy-assets/source/sky-hdri/HDRi_JPG_Pack.zip"
ECOKIT_KEY = "tivvlejoy-assets/source/stylized-forest/Stylised EcoKit.zip"
BOTANIQ_KEY = (
    "tivvlejoy-assets/source/purchased-blender-tools/"
    "SRC_BOTANIQ_FULL_7_2_0/botaniq_full-7.2.0.paq.zip"
)

SOURCE_HDRI = Path("/tmp/o14-lookdev/expanded-original14/sky_hdri/HDRi_JPG_Pack/sk2/Image0001.jpg")
H8_PATH = Path("/tmp/tj_hdri_diag_8k.jpg")
ROCK_BLEND = Path("/tmp/o14-v4-source/SRC_FOREST_STYLISED_ECOKIT/Stylised EcoKit/Rock_Models.blend")
BOTANIQ_ROOT = Path("/tmp/o14-v4-source/SRC_BOTANIQ_FULL_7_2_0")
EXPECTED_SOURCE_SHA = "2c747a306f1f8a3031155d3a266cc56b62e91966431db54e67c36f772c58c20c"
EXPECTED_H8_SHA = "c41f736d1278b7a61684fa76bd34983c5722e3536ed1d04a7c96c8024c99f65e"
STAGE = Path("/tmp/v7-proof-a-stage")
OUT = REPO / "artifacts/tivvlejoy-scenery-showcase-30s/v7-proof-a-paid"

BOTANIQ_MEMBERS = (
    "bq_Tree_Fagus-sylvatica_A_summer.blend",
    "bq_Grass_Festuca_glauca_A_spring.blend",
    "bq_Grass_Carex-oshimensis_A_spring.blend",
    "bq_Plant_Dryopteris-carthusiana_A_spring-summer-autumn.blend",
    "bq_Library_Materials.blend",
)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def log(event: str, **payload) -> None:
    print(json.dumps({"event": event, **payload}), flush=True)


def ensure_hdri() -> dict:
    if SOURCE_HDRI.is_file() and sha256(SOURCE_HDRI) == EXPECTED_SOURCE_SHA:
        log("hdri_source_present", bytes=SOURCE_HDRI.stat().st_size)
    else:
        SOURCE_HDRI.parent.mkdir(parents=True, exist_ok=True)
        rows = extract_members(HDRI_KEY, ["HDRi_JPG_Pack/sk2/Image0001.jpg"], SOURCE_HDRI.parents[2])
        log("hdri_extracted", ok=sum(1 for r in rows if r["status"] == "OK"))
        # extract writes member path under dest root; relocate if needed
        found = list(SOURCE_HDRI.parents[2].rglob("sk2/Image0001.jpg"))
        if not SOURCE_HDRI.is_file() and found:
            SOURCE_HDRI.parent.mkdir(parents=True, exist_ok=True)
            if found[0].resolve() != SOURCE_HDRI.resolve():
                shutil.copy2(found[0], SOURCE_HDRI)
    digest = sha256(SOURCE_HDRI)
    if digest != EXPECTED_SOURCE_SHA:
        raise RuntimeError("HDRI_SOURCE_IDENTITY_MISMATCH")
    return {"path": str(SOURCE_HDRI), "sha256": digest, "bytes": SOURCE_HDRI.stat().st_size}


def ensure_h8() -> dict:
    if H8_PATH.is_file() and sha256(H8_PATH) == EXPECTED_H8_SHA:
        log("h8_present", bytes=H8_PATH.stat().st_size)
        return {"path": str(H8_PATH), "sha256": EXPECTED_H8_SHA, "bytes": H8_PATH.stat().st_size}
    source_before = sha256(SOURCE_HDRI)
    subprocess.check_call(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(SOURCE_HDRI),
            "-vf",
            "scale=8192:4096:flags=lanczos",
            str(H8_PATH),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if sha256(SOURCE_HDRI) != source_before:
        raise RuntimeError("HDRI_SOURCE_OVERWRITE_DETECTED")
    digest = sha256(H8_PATH)
    if digest != EXPECTED_H8_SHA:
        raise RuntimeError(f"H8_IDENTITY_MISMATCH:{digest}")
    return {"path": str(H8_PATH), "sha256": digest, "bytes": H8_PATH.stat().st_size}


def ensure_rocks() -> dict:
    if ROCK_BLEND.is_file() and ROCK_BLEND.stat().st_size > 0:
        log("rocks_present", bytes=ROCK_BLEND.stat().st_size)
        return {"path": str(ROCK_BLEND), "bytes": ROCK_BLEND.stat().st_size}
    dest = Path("/tmp/o14-v4-source/SRC_FOREST_STYLISED_ECOKIT")
    dest.mkdir(parents=True, exist_ok=True)
    rows = extract_members(ECOKIT_KEY, ["Rock_Models.blend"], dest)
    found = list(dest.rglob("Rock_Models.blend"))
    if not found:
        raise RuntimeError("ECOKIT_ROCKS_MISSING:" + ",".join(r["status"] for r in rows))
    if found[0].resolve() != ROCK_BLEND.resolve():
        ROCK_BLEND.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(found[0], ROCK_BLEND)
    return {"path": str(ROCK_BLEND), "bytes": ROCK_BLEND.stat().st_size}


def ensure_botaniq() -> dict:
    dest = BOTANIQ_ROOT
    dest.mkdir(parents=True, exist_ok=True)
    needed = []
    for name in BOTANIQ_MEMBERS:
        if not list(dest.rglob(name)):
            needed.append(name)
    if needed:
        rows = extract_members(BOTANIQ_KEY, needed, dest)
        log("botaniq_extracted", requested=len(needed), ok=sum(1 for r in rows if r["status"] == "OK"))
    present = {}
    for name in BOTANIQ_MEMBERS:
        matches = list(dest.rglob(name))
        if not matches:
            raise RuntimeError(f"BOTANIQ_MISSING:{name}")
        present[name] = {"path": str(matches[0]), "bytes": matches[0].stat().st_size}
    return present


def pack_scripts() -> dict:
    STAGE.mkdir(parents=True, exist_ok=True)
    tar_path = STAGE / "v7-scenery-scripts.tar.gz"
    with tarfile.open(tar_path, "w:gz") as tar:
        tar.add(SCENERY, arcname="scenery")
    return {"path": str(tar_path), "bytes": tar_path.stat().st_size, "sha256": sha256(tar_path)}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    hdri = ensure_hdri()
    h8 = ensure_h8()
    rocks = ensure_rocks()
    botaniq = ensure_botaniq()
    scripts = pack_scripts()
    manifest = {
        "schema": "TIVVLEJOY_V7_PROOF_A_SOURCE_STAGE_V1",
        "hdriSource": hdri,
        "h8": h8,
        "rocks": rocks,
        "botaniq": botaniq,
        "scripts": scripts,
        "sourceNotOverwritten": hdri["sha256"] == EXPECTED_SOURCE_SHA,
        "h8Identity": h8["sha256"] == EXPECTED_H8_SHA,
        "classification": "CINEMATIC_LIGHTING_HDRI_APPROVED",
        "qualityCompromise": False,
        "h4Used": False,
    }
    (OUT / "SOURCE_STAGE.json").write_text(json.dumps(manifest, indent=2) + "\n")
    row = evaluate_worker_memory_contract(
        system_ram_bytes=32 * 1024 * 1024 * 1024,
        gpu_vram_bytes=24 * 1024 * 1024 * 1024,
        memory_prediction_bytes=14 * 1024 * 1024 * 1024,
        source_manifest=["festuca_a", "carex_a", "fern_a", "beech_a", "ecokit_rocks", "hdri_jpg"],
        hdri_identity="Image0001.jpg:15000x7500",
        hdri_derivative_identity="H8:8192x4096:" + EXPECTED_H8_SHA,
        blender_version="4.2.2",
        cycles_device="GPU",
        render_profile="PROOF_A_STILL",
        paid_create_allowed=False,
    )
    (OUT / "MEMORY_CONTRACT_CATALOG.json").write_text(json.dumps(row, indent=2) + "\n")
    log("prepare_done", memoryOk=row["ok"], h8=h8["bytes"], rocks=rocks["bytes"])
    return 0 if row["ok"] and manifest["h8Identity"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
