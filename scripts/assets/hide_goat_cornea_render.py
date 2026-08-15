#!/usr/bin/env python3
"""Keep Goat cornea objects in the file but hide them from render.

The scaled cornea spheres still poke through the brow as white circles.
Painted in-eye catchlights remain. Objects are not deleted.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "assets"))

from build_final_character_production import FACING, add_camera, append_blend, bounds, render_path, save_blend  # noqa: E402
from correct_targeted_characters import mesh_obj, shoot  # noqa: E402
from polish_final_character_finish import feature_lights  # noqa: E402
from theatrical_rebuild_common import assert_not_production_library  # noqa: E402

HIRES = REPO / "theatrical-foundation/proposed/final-character-production/high-resolution"
CORR = REPO / "artifacts/theatrical-v2/final-character-production/corrections"
REPORTS = REPO / "theatrical-foundation/proposed/final-character-production/reports"


def main() -> int:
    path = HIRES / "goat_highres_candidate.blend"
    assert_not_production_library(path)
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False)
    hidden = []
    for obj in bpy.data.objects:
        if obj.name.startswith("Goat_Cornea") or "Catch" in obj.name:
            obj.hide_render = True
            obj.hide_viewport = True
            hidden.append(obj.name)
    save_blend(path)
    feature_lights()
    mn, mx = bounds()
    center = (mn + mx) * 0.5
    height = mx.z - mn.z
    face = Vector((0.30, 0.0, height * 0.76))
    r1 = shoot("goat_front_close", face + FACING * 0.55, face, height * 0.40, CORR / "01_goat_corrected_front_closeup.png")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pips = append_blend(HIRES / "pip_highres_candidate.blend")
    goats = append_blend(path)
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
    r2 = shoot("pair", center + FACING * span * 1.35, center + Vector((0, 0, 0.02)), max(span * 1.15, height * 1.72), CORR / "08_corrected_pair.png", samples=24)
    report = {"hidden_from_render_not_deleted": hidden, "renders": [r1, r2], "paid_resources": False}
    (REPORTS / "TARGETED_CORNEA_HIDDEN.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
