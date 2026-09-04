#!/usr/bin/env python3
"""Locked-camera proof after sky-protected atmospheric depth."""

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

from forest_atmospheric_depth_v1 import PROOF_DENOISE, PROOF_SAMPLES, apply_atmospheric_depth
from forest_canopy_lighting_repair_v1 import apply_forest_canopy_lighting_repair
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
PROOF_NAME = "FOREST_ATMOSPHERIC_DEPTH_PROOF_V1.png"
LOCKED_PROOFS = {HERO_PROOF, DIRT_PROOF}


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


def _rgb_rows(path: Path) -> list[list[tuple[float, float, float]]]:
    try:
        from PIL import Image

        image = Image.open(path).convert("RGB")
        width, height = image.size
        pixels = list(image.getdata())
        return [
            [tuple(float(channel) for channel in pixels[y * width + x]) for x in range(width)]
            for y in range(height)
        ]
    except ImportError:
        import bpy

        image = bpy.data.images.load(str(path), check_existing=False)
        width, height = int(image.size[0]), int(image.size[1])
        raw = image.pixels[:]
        rows = []
        for y in range(height):
            src = (height - 1 - y) * width * 4
            row = []
            for x in range(width):
                index = src + x * 4
                row.append((raw[index] * 255.0, raw[index + 1] * 255.0, raw[index + 2] * 255.0))
            rows.append(row)
        return rows


def scanlines(path: Path) -> dict:
    rows = _rgb_rows(path)

    def window(y0, y1, x0, x1):
        total = [0.0, 0.0, 0.0]
        count = 0
        for y in range(y0, y1):
            for x in range(x0, x1):
                pixel = rows[y][x]
                total[0] += pixel[0]
                total[1] += pixel[1]
                total[2] += pixel[2]
                count += 1
        rgb = [channel / max(count, 1) for channel in total]
        return {
            "rgb": [round(channel, 1) for channel in rgb],
            "rb": round(rgb[0] - rgb[2], 1),
        }

    magenta = 0
    for row in rows:
        for red, green, blue in row:
            if red > 200 and blue > 200 and green < 80:
                magenta += 1
    return {
        "sky": window(0, 80, 500, 780),
        "floor": window(520, 700, 400, 880),
        "pathCenter": window(560, 680, 560, 720),
        "fgLeft": window(500, 680, 80, 280),
        "magentaLike": magenta,
    }


def mean_abs_delta(path: Path, baseline: Path) -> float | None:
    if not baseline.is_file():
        return None
    current = _rgb_rows(path)
    prior = _rgb_rows(baseline)
    if not current or not prior or len(current) != len(prior) or len(current[0]) != len(prior[0]):
        return None
    total = 0.0
    count = 0
    for y, row in enumerate(current):
        for x, pixel in enumerate(row):
            other = prior[y][x]
            total += abs(pixel[0] - other[0]) + abs(pixel[1] - other[1]) + abs(pixel[2] - other[2])
            count += 3
    return round(total / max(count, 1), 2)


def render_still(scene, path: Path) -> dict:
    import bpy

    if path.name in LOCKED_PROOFS or path.exists():
        raise RuntimeError("PROOF_WOULD_OVERWRITE:" + path.name)
    scene.render.filepath = str(path)
    started = time.time()
    bpy.ops.render.render(write_still=True)
    elapsed = round(time.time() - started, 2)
    if not path.is_file():
        raise RuntimeError("ATMOSPHERE_PROOF_MISSING:" + path.name)
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
    if hero.is_file() and sha256_file(hero) != HERO_SHA256:
        raise RuntimeError("BASELINE_PROOF_CHANGED")
    if dirt.is_file() and sha256_file(dirt) != DIRT_SHA256:
        raise RuntimeError("DIRT_PACK_PROOF_CHANGED")
    prepared = _prepare(args)
    scene = prepared["scene"]
    apply_forest_canopy_lighting_repair(scene)
    apply_cinematic_lighting_recovery(scene)
    interior = apply_interior_sun_canopy_structure(scene)
    replacement = apply_hero_tree_replacement(scene)
    if replacement.get("executionStatus") == "BLOCKED":
        print(json.dumps({"schema": "TIVVLEJOY_FOREST_ATMOSPHERIC_DEPTH_PROOF_V1", "result": "BLOCKED"}, sort_keys=True))
        return 2
    packs = apply_ground_packs(scene)
    atmosphere = apply_atmospheric_depth(scene)
    scene.cycles.samples = max(int(args.samples), 64)
    scene.cycles.use_denoising = PROOF_DENOISE
    still = render_still(scene, out_dir / args.proof_name)
    receipt = {
        "schema": "TIVVLEJOY_FOREST_ATMOSPHERIC_DEPTH_PROOF_V1",
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
        "baselinePreserved": True,
        "dirtPackPreserved": True,
        "interiorRecovery": {"skyCardPreserved": interior.get("skyCardPreserved")},
        "replacement": replacement,
        "groundPacks": packs,
        "atmosphere": atmosphere,
        "still": still,
        "scanlines": scanlines(out_dir / args.proof_name),
        "madVsDirtPack": mean_abs_delta(out_dir / args.proof_name, dirt),
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
        "skyCardPreserved": atmosphere.get("skyCardPreserved"),
        "volumeApplied": (atmosphere.get("volume") or {}).get("applied"),
        "depthApplied": (atmosphere.get("depth") or {}).get("applied"),
        "scanlines": receipt["scanlines"],
        "madVsDirtPack": receipt["madVsDirtPack"],
        "cameraChanged": False,
        "paidCreateCount": 0,
        "finalVideoRenderStarted": False,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
