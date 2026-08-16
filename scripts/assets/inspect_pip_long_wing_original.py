#!/usr/bin/env python3
"""Inspect the untouched reconstructed original Pip long-wing GLB.

Imports /tmp/pip_long_wing_candidate_original.glb only. Does not overwrite
current Pip, write production-library/, save the 61MB GLB into the repo,
retopo, rig, merge, or declare canon.

  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \\
    /usr/local/bin/blender -b -noaudio -P scripts/assets/inspect_pip_long_wing_original.py
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import bpy

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "assets"))

from build_final_character_production import PIP_HEIGHT, meshes, snap_and_scale  # noqa: E402
from inspect_pip_long_wing_candidate import analyze, nonmanifold, render_turn, sample_colors  # noqa: E402
from theatrical_rebuild_common import assert_not_production_library  # noqa: E402

GLB = Path("/tmp/pip_long_wing_candidate_original.glb")
EXPECTED = "9158dea0e23e5ebb086a574badb0b5a62982d0b90e1d8b118f54cfac0549c4f2"
CURRENT = REPO / "theatrical-foundation/proposed/final-character-production/high-resolution/pip_highres_candidate.blend"
PREVIEWS = REPO / "artifacts/theatrical-v2/final-character-production/long-wing-original"
REPORTS = REPO / "theatrical-foundation/proposed/final-character-production/reports"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    assert_not_production_library(CURRENT)
    if not GLB.exists():
        raise FileNotFoundError(GLB)
    digest = sha256(GLB)
    if digest != EXPECTED:
        raise SystemExit(f"hash mismatch: {digest}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(GLB))
    found = meshes()
    extras = []
    for obj in found:
        extras.append({
            "name": obj.name,
            "verts": len(obj.data.vertices),
            "faces": len(obj.data.polygons),
            "materials": [s.material.name for s in obj.material_slots if s.material],
        })
        if "Pip" not in obj.name:
            obj.name = "Pip_LongWingOriginal"
    obj = found[0]
    from build_final_character_production import bounds

    mn, mx = bounds()
    opened = {
        "opened": True,
        "source": str(GLB),
        "sha256": digest,
        "bytes": GLB.stat().st_size,
        "objects": extras,
        "native_min": list(mn),
        "native_max": list(mx),
        "native_height": mx.z - mn.z,
        "images": [{"name": img.name, "size": list(img.size)} for img in bpy.data.images if img.size[0] > 4],
        "armatures": [o.name for o in bpy.data.objects if o.type == "ARMATURE"],
        "shape_keys": [o.name for o in found if o.data.shape_keys],
        "nonmanifold": nonmanifold(obj),
    }
    colors, img_name = sample_colors(obj)
    opened["color_image"] = img_name
    opened["native_landmarks"] = analyze(obj, colors, opened["native_height"])
    scaled = snap_and_scale(PIP_HEIGHT)
    bpy.context.view_layer.update()
    obj = meshes()[0]
    colors, _ = sample_colors(obj)
    landmarks = analyze(obj, colors, scaled["to_height"])
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    renders = render_turn("pip_long_wing_original", PREVIEWS)
    report = {
        "role": "untouched_original_comparison_only",
        "current_pip_overwritten": False,
        "production_library_touched": False,
        "canonical_mutated": False,
        "theatrical_bound": False,
        "merge": False,
        "paid_resources": False,
        "reconstructed_glb_committed": False,
        "blender": "4.2.3 LTS",
        "sha256": digest,
        "opened": opened,
        "scaled": scaled,
        "landmarks_at_2_05": landmarks,
        "renders": renders,
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "PIP_LONG_WING_ORIGINAL.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({
        "opened": True,
        "sha256": digest,
        "objects": extras,
        "native_height": opened["native_height"],
        "scaled_height": scaled["to_height"],
        "verts": scaled["verts"],
        "faces": scaled["faces"],
        "nonmanifold": opened["nonmanifold"],
        "wings": landmarks["wings"],
        "strap": {
            "continuous": landmarks["strap_continuous_across_back"],
            "laterality": landmarks["strap_laterality"],
            "back": landmarks["strap_back"],
            "bag": landmarks["bag"],
        },
        "eyes": landmarks["eyes"],
        "crest_n": landmarks["crest"].get("n"),
        "images": opened["images"],
        "renders": renders,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
