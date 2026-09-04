#!/usr/bin/env python3
"""Locked-camera proof after cinematic depth polish."""

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

from forest_atmospheric_depth_proof_v1 import mean_abs_delta, scanlines
from forest_atmospheric_depth_v1 import apply_atmospheric_depth
from forest_canopy_lighting_repair_v1 import apply_forest_canopy_lighting_repair
from forest_cinematic_depth_polish_v1 import PROOF_DENOISE, PROOF_SAMPLES, apply_cinematic_depth_polish
from forest_cinematic_lighting_recovery_v1 import apply_cinematic_lighting_recovery
from forest_ground_detail_recovery_v1 import LOCKED_MATERIAL_LIGHTING
from forest_ground_pack_apply_v1 import apply_ground_packs
from forest_hero_tree_replacement_v1 import apply_hero_tree_replacement
from forest_hero_tree_replacement_proof_v1 import _prepare, sha256_file
from forest_interior_sun_canopy_structure_v1 import apply_interior_sun_canopy_structure
from vendor_reference_render_v1 import AUDIT_SHA256, SOURCE_SHA256, png_dimensions

HERO_PROOF = "FOREST_HERO_TREE_REPLACEMENT_PROOF_V1.png"
HERO_SHA256 = "ac00a3aa6cc897b98a59307e2b9c13309bc02781d5fb32b0692d698b3e8cad56"
DIRT_PROOF = "FOREST_DIRT_PACK_INTEGRATION_PROOF_V1.png"
DIRT_SHA256 = "127412ca40eb27cdba158ad3bd497cc911d2384c4ada1a503a7d067c05f9fdba"
ATMOS_PROOF = "FOREST_ATMOSPHERIC_DEPTH_PROOF_V1.png"
ATMOS_SHA256 = "e72f098682e9247642a29d4e3de7eb8658aac44562433cf5c87a54988d369a13"
PROOF_NAME = "FOREST_CINEMATIC_DEPTH_POLISH_PROOF_V1.png"
LOCKED_PROOFS = {HERO_PROOF, DIRT_PROOF, ATMOS_PROOF}


def parse_args():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--source-sha256", default=SOURCE_SHA256)
    parser.add_argument("--dependency-audit-sha256", default=AUDIT_SHA256)
    parser.add_argument("--owned-hdri", required=True)
    parser.add_argument("--image-bindings-json", default="[]")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--samples", type=int, default=PROOF_SAMPLES)
    parser.add_argument("--bark-kind", default="tilia")
    parser.add_argument("--proof-name", default=PROOF_NAME)
    return parser.parse_args(raw)


def render_still(scene, path: Path) -> dict:
    import bpy

    if path.name in LOCKED_PROOFS or path.exists():
        raise RuntimeError("PROOF_WOULD_OVERWRITE:" + path.name)
    scene.render.filepath = str(path)
    started = time.time()
    bpy.ops.render.render(write_still=True)
    elapsed = round(time.time() - started, 2)
    if not path.is_file():
        raise RuntimeError("POLISH_PROOF_MISSING:" + path.name)
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
    hero = out_dir / HERO_PROOF
    dirt = out_dir / DIRT_PROOF
    atmos = out_dir / ATMOS_PROOF
    if hero.is_file() and sha256_file(hero) != HERO_SHA256:
        raise RuntimeError("BASELINE_PROOF_CHANGED")
    if dirt.is_file() and sha256_file(dirt) != DIRT_SHA256:
        raise RuntimeError("DIRT_PACK_PROOF_CHANGED")
    if atmos.is_file() and sha256_file(atmos) != ATMOS_SHA256:
        raise RuntimeError("ATMOSPHERE_PROOF_CHANGED")
    prepared = _prepare(args)
    scene = prepared["scene"]
    apply_forest_canopy_lighting_repair(scene)
    apply_cinematic_lighting_recovery(scene)
    interior = apply_interior_sun_canopy_structure(scene)
    replacement = apply_hero_tree_replacement(scene)
    if replacement.get("executionStatus") == "BLOCKED":
        print(json.dumps({"schema": "TIVVLEJOY_FOREST_CINEMATIC_DEPTH_POLISH_PROOF_V1", "result": "BLOCKED"}, sort_keys=True))
        return 2
    packs = apply_ground_packs(scene)
    atmosphere = apply_atmospheric_depth(scene)
    polish = apply_cinematic_depth_polish(scene)
    scene.cycles.samples = max(int(args.samples), 128)
    scene.cycles.use_denoising = PROOF_DENOISE
    still = render_still(scene, out_dir / args.proof_name)
    receipt = {
        "schema": "TIVVLEJOY_FOREST_CINEMATIC_DEPTH_POLISH_PROOF_V1",
        "result": "RENDERED",
        "paidCreateCount": 0,
        "paidSpendUsd": 0,
        "samples": scene.cycles.samples,
        "denoising": True,
        "materialLightingLocked": LOCKED_MATERIAL_LIGHTING,
        "heroProof": HERO_PROOF,
        "heroSha256": HERO_SHA256,
        "dirtProof": DIRT_PROOF,
        "dirtSha256": DIRT_SHA256,
        "atmosphereProof": ATMOS_PROOF,
        "atmosphereSha256": ATMOS_SHA256,
        "baselinePreserved": True,
        "dirtPackPreserved": True,
        "atmosphereProofPreserved": True,
        "interiorRecovery": {"skyCardPreserved": interior.get("skyCardPreserved")},
        "replacement": replacement,
        "groundPacks": packs,
        "atmosphere": atmosphere,
        "polish": polish,
        "still": still,
        "scanlines": scanlines(out_dir / args.proof_name),
        "madVsDirtPack": mean_abs_delta(out_dir / args.proof_name, dirt),
        "madVsAtmosphere": mean_abs_delta(out_dir / args.proof_name, atmos),
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
        "samples": receipt["samples"],
        "denoising": True,
        "skyCardPreserved": polish.get("skyCardPreserved"),
        "heroTreesPreserved": polish.get("heroTreesPreserved"),
        "groundPacksPreserved": polish.get("groundPacksPreserved"),
        "scanlines": receipt["scanlines"],
        "madVsDirtPack": receipt["madVsDirtPack"],
        "madVsAtmosphere": receipt["madVsAtmosphere"],
        "cameraChanged": False,
        "paidCreateCount": 0,
        "finalVideoRenderStarted": False,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
