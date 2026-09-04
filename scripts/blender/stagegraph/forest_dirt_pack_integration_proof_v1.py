#!/usr/bin/env python3
"""Locked-camera proof after TivvleJoy 4K ground-pack integration."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_BLENDER = SCRIPT_DIR.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
if str(REPO_BLENDER) not in sys.path:
    sys.path.insert(0, str(REPO_BLENDER))

from forest_canopy_lighting_repair_v1 import apply_forest_canopy_lighting_repair
from forest_cinematic_lighting_recovery_v1 import apply_cinematic_lighting_recovery
from forest_ground_detail_recovery_v1 import LOCKED_MATERIAL_LIGHTING
from forest_ground_pack_apply_v1 import apply_ground_packs
from forest_hero_tree_replacement_v1 import apply_hero_tree_replacement
from forest_hero_tree_replacement_proof_v1 import _prepare, sha256_file
from forest_interior_sun_canopy_structure_v1 import apply_interior_sun_canopy_structure
from vendor_reference_render_v1 import AUDIT_SHA256, SOURCE_SHA256, png_dimensions

BASELINE_PROOF = "FOREST_HERO_TREE_REPLACEMENT_PROOF_V1.png"
BASELINE_SHA256 = "ac00a3aa6cc897b98a59307e2b9c13309bc02781d5fb32b0692d698b3e8cad56"
PROOF_NAME = "FOREST_DIRT_PACK_INTEGRATION_PROOF_V1.png"


def parse_args():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--source-sha256", default=SOURCE_SHA256)
    parser.add_argument("--dependency-audit-sha256", default=AUDIT_SHA256)
    parser.add_argument("--owned-hdri", required=True)
    parser.add_argument("--image-bindings-json", default="[]")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--samples", type=int, default=48)
    parser.add_argument("--bark-kind", default="tilia")
    parser.add_argument("--proof-name", default=PROOF_NAME)
    return parser.parse_args(raw)


def render_still(scene, path: Path) -> dict:
    import bpy

    if path.name == BASELINE_PROOF or path.exists():
        raise RuntimeError("PROOF_WOULD_OVERWRITE:" + path.name)
    scene.render.filepath = str(path)
    started = time.time()
    bpy.ops.render.render(write_still=True)
    elapsed = round(time.time() - started, 2)
    if not path.is_file():
        raise RuntimeError("DIRT_PACK_PROOF_MISSING:" + path.name)
    dimensions = png_dimensions(path)
    if dimensions != [1280, 720]:
        raise RuntimeError("PROOF_DIMENSION_MISMATCH")
    return {
        "path": str(path),
        "sha256": sha256_file(path),
        "bytes": path.stat().st_size,
        "dimensions": dimensions,
        "seconds": elapsed,
    }


def main() -> int:
    args = parse_args()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    baseline = out_dir / BASELINE_PROOF
    if baseline.is_file() and sha256_file(baseline) != BASELINE_SHA256:
        raise RuntimeError("BASELINE_PROOF_CHANGED")
    prepared = _prepare(args)
    scene = prepared["scene"]
    apply_forest_canopy_lighting_repair(scene)
    apply_cinematic_lighting_recovery(scene)
    interior = apply_interior_sun_canopy_structure(scene)
    replacement = apply_hero_tree_replacement(scene)
    if replacement.get("executionStatus") == "BLOCKED":
        print(json.dumps({"schema": "TIVVLEJOY_DIRT_PACK_INTEGRATION_PROOF_V1", "result": "BLOCKED"}, sort_keys=True))
        return 2
    packs = apply_ground_packs(scene)
    scene.cycles.samples = max(int(args.samples), 24)
    scene.cycles.use_denoising = False
    still = render_still(scene, out_dir / args.proof_name)
    receipt = {
        "schema": "TIVVLEJOY_DIRT_PACK_INTEGRATION_PROOF_V1",
        "result": "RENDERED",
        "paidCreateCount": 0,
        "paidSpendUsd": 0,
        "samples": scene.cycles.samples,
        "denoising": False,
        "materialLightingLocked": LOCKED_MATERIAL_LIGHTING,
        "baselineProof": BASELINE_PROOF,
        "baselineSha256": BASELINE_SHA256,
        "baselinePreserved": True,
        "interiorRecovery": {"skyCardPreserved": interior.get("skyCardPreserved")},
        "replacement": replacement,
        "groundPacks": packs,
        "still": still,
        "productionCamera": prepared["productionCamera"],
        "cameraChanged": False,
        "terrainChanged": False,
        "waterChanged": False,
        "compositionChanged": False,
        "groundDressingChanged": False,
        "animationRendered": False,
        "finalVideoRenderStarted": False,
        "finalVideoRenderReady": False,
    }
    (out_dir / (Path(args.proof_name).stem + ".json")).write_text(
        json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps({
        "schema": receipt["schema"],
        "path": still["path"],
        "sha256": still["sha256"],
        "seconds": still["seconds"],
        "groundPacksRegistered": packs.get("groundPacksRegistered"),
        "groundPacksFound": packs.get("groundPacksFound"),
        "materialSlotsCreated": packs.get("materialSlotsCreated"),
        "heroQualityTreesPresent": replacement.get("heroQualityTreesPresent"),
        "skyCardPreserved": packs.get("skyCardPreserved"),
        "cameraChanged": False,
        "paidCreateCount": 0,
        "finalVideoRenderStarted": False,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
