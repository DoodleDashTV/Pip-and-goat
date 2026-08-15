#!/usr/bin/env python3
"""Repair pass: revert shredded Pip wings; shrink/place Goat corneas in-eye.

  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \\
    /usr/local/bin/blender -b -noaudio -P scripts/assets/repair_targeted_corrections.py
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "assets"))

from build_final_character_production import (  # noqa: E402
    CHAR_LEFT,
    FACING,
    add_camera,
    append_blend,
    bounds,
    render_path,
    save_blend,
)
from correct_targeted_characters import (  # noqa: E402
    color_image,
    mesh_obj,
    sample_colors,
    shoot,
)
from polish_final_character_finish import feature_lights  # noqa: E402
from theatrical_rebuild_common import assert_not_production_library  # noqa: E402

HIRES = REPO / "theatrical-foundation/proposed/final-character-production/high-resolution"
WORKING = REPO / "theatrical-foundation/proposed/final-character-production/working"
CORR = REPO / "artifacts/theatrical-v2/final-character-production/corrections"
REPORTS = REPO / "theatrical-foundation/proposed/final-character-production/reports"


def repair_goat() -> dict:
    path = HIRES / "goat_highres_candidate.blend"
    assert_not_production_library(path)
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False)
    removed = []
    for obj in list(bpy.data.objects):
        if obj.name.startswith("Goat_Catch"):
            removed.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    goat = mesh_obj("Goat")
    img = color_image()
    colors = sample_colors(goat, img)
    # Dark, forward iris verts only.
    pts = []
    mw = goat.matrix_world
    for vid, col in colors.items():
        r, g, b = col
        w = mw @ goat.data.vertices[vid].co
        if w.x < 0.28 or not (2.16 < w.z < 2.40) or abs(w.y) < 0.08:
            continue
        if (r + g + b) > 0.70:
            continue
        pts.append(w)
    left = [p for p in pts if p.y >= 0]
    right = [p for p in pts if p.y < 0]
    centers = []
    for group in (left, right):
        if len(group) < 4:
            continue
        group = sorted(group, key=lambda p: p.x, reverse=True)[: max(4, len(group) // 2)]
        centers.append(sum(group, Vector()) / len(group))
    scaled = []
    corneas = sorted(
        [o for o in bpy.data.objects if o.name.startswith("Goat_Cornea")],
        key=lambda o: o.location.y,
        reverse=True,
    )
    for i, cornea in enumerate(corneas):
        # Keep the cornea object. Shrink it into the globe. Do not delete.
        cornea.scale = Vector((0.48, 0.48, 0.48))  # 0.136 * 0.48 ≈ 0.065, in-globe
        if i < len(centers):
            cornea.location = centers[i] + FACING * 0.018
        bpy.ops.object.select_all(action="DESELECT")
        cornea.select_set(True)
        bpy.context.view_layer.objects.active = cornea
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        scaled.append({"name": cornea.name, "location": list(cornea.location), "applied_scale": 0.30})
    save_blend(path)
    feature_lights()
    mn, mx = bounds()
    center = (mn + mx) * 0.5
    height = mx.z - mn.z
    face = Vector((0.30, 0.0, height * 0.76))
    renders = [
        shoot("goat_front_close", face + FACING * 0.55, face, height * 0.40, CORR / "01_goat_corrected_front_closeup.png"),
        shoot("goat_rear", center - FACING * height * 1.45, center + Vector((0, 0, 0.02)), height * 1.28, CORR / "02_goat_corrected_rear.png"),
        shoot(
            "goat_rear_3q",
            center + (-FACING * 0.72 + CHAR_LEFT * 0.72) * height * 1.25,
            center + Vector((0, 0, 0.02)),
            height * 1.32,
            CORR / "03_goat_corrected_rear_three_quarter.png",
        ),
    ]
    return {
        "catch_removed": removed,
        "corneas": scaled,
        "eye_centers": [list(c) for c in centers],
        "renders": renders,
        "bytes": path.stat().st_size,
    }


def revert_pip_wings() -> dict:
    src = WORKING / "pip_highdetail_working.blend"
    dest = HIRES / "pip_highres_candidate.blend"
    assert_not_production_library(dest)
    shutil.copy2(src, dest)
    bpy.ops.wm.open_mainfile(filepath=str(dest), load_ui=False)
    # Re-apply finish polish materials only (no wing stretch, no extra spheres).
    from polish_final_character_finish import polish_material  # noqa: E402

    polish_material("pip")
    save_blend(dest)
    feature_lights()
    obj = mesh_obj("Pip")
    mn, mx = bounds([obj])
    center = (mn + mx) * 0.5
    height = mx.z - mn.z
    face = Vector((0.22, 0.0, height * 0.78))
    renders = [
        shoot("pip_front_close", face + FACING * 0.85, face, height * 0.36, CORR / "04_pip_corrected_front_neutral_closeup.png"),
        shoot(
            "pip_3q_close",
            face + (FACING * 0.62 + CHAR_LEFT * 0.38),
            face,
            height * 0.40,
            CORR / "05_pip_corrected_three_quarter_closeup.png",
        ),
        shoot("pip_front_full", center + FACING * height * 1.45, center + Vector((0, 0, 0.02)), height * 1.28, CORR / "06_pip_corrected_front_full.png"),
        shoot(
            "pip_3q_full",
            center + (FACING * 0.72 + CHAR_LEFT * 0.72) * height * 1.35,
            center + Vector((0, 0, 0.02)),
            height * 1.32,
            CORR / "07_pip_corrected_three_quarter_full.png",
        ),
    ]
    return {
        "wings_reverted": True,
        "reason": "Fused Prism wing verts shredded into vertical shards when lower feathers were translated. Stop condition hit.",
        "renders": renders,
        "bytes": dest.stat().st_size,
    }


def render_pair() -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pips = append_blend(HIRES / "pip_highres_candidate.blend")
    goats = append_blend(HIRES / "goat_highres_candidate.blend")
    for obj in pips:
        if obj.type == "MESH":
            obj.location.y -= 0.95
    for obj in goats:
        if obj.type == "MESH":
            obj.location.y += 1.15
    bpy.context.view_layer.update()
    feature_lights()
    both = [o for o in bpy.data.objects if o.type == "MESH"]
    mn, mx = bounds(both)
    center = (mn + mx) * 0.5
    height = mx.z - mn.z
    span = max(mx.x - mn.x, mx.y - mn.y, height)
    dest = CORR / "08_corrected_pair.png"
    path = shoot("pair", center + FACING * span * 1.35, center + Vector((0, 0, 0.02)), max(span * 1.15, height * 1.72), dest, samples=28)
    return {"render": path}


def main() -> int:
    goat = repair_goat()
    pip = revert_pip_wings()
    pair = render_pair()
    report = {
        "approved": False,
        "canonical_mutated": False,
        "theatrical_bound": False,
        "merge": False,
        "paid_resources": False,
        "goat": goat,
        "pip": pip,
        "pair": pair,
        "wing_stop": True,
        "eye_stop": "Pip eye verts could not be isolated from the fused textured mesh without risking a face tear. No eye geometry edit was applied.",
    }
    (REPORTS / "TARGETED_REPAIR.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"ok": True, "goat": goat["corneas"], "pip_reverted": True, "catch_removed": goat["catch_removed"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
