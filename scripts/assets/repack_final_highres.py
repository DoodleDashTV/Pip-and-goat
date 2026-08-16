#!/usr/bin/env python3
"""Restore Pip geometry from the working checkpoint and unpack 8K textures.

Goat keeps the painted back teardrop. Pip reverts the over-aggressive crest
vertex shrink so the scalp is not torn. Textures are saved externally so the
.blend files stay under GitHub's 100 MB limit.

  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \\
    /usr/local/bin/blender -b -noaudio -P scripts/assets/repack_final_highres.py
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import bpy

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "assets"))

from build_final_character_production import (  # noqa: E402
    append_blend,
    bounds,
    render_pair,
    render_subject,
    save_blend,
)
from theatrical_rebuild_common import assert_not_production_library  # noqa: E402

WORKING = REPO / "theatrical-foundation/proposed/final-character-production/working"
HIRES = REPO / "theatrical-foundation/proposed/final-character-production/high-resolution"
TEXTURES = REPO / "theatrical-foundation/proposed/final-character-production/textures"
REPORTS = REPO / "theatrical-foundation/proposed/final-character-production/reports"


def unpack_and_save(blend: Path, tex_name: str) -> dict:
    assert_not_production_library(blend)
    bpy.ops.wm.open_mainfile(filepath=str(blend), load_ui=False)
    TEXTURES.mkdir(parents=True, exist_ok=True)
    written = []
    for img in list(bpy.data.images):
        if img.size[0] < 64:
            continue
        dest = TEXTURES / tex_name
        img.file_format = "PNG"
        img.filepath_raw = str(dest)
        img.save()
        if img.packed_file:
            img.unpack(method="REMOVE")
        rel = f"//../textures/{tex_name}"
        img.filepath = rel
        img.filepath_raw = rel
        written.append({"name": img.name, "path": str(dest.relative_to(REPO)), "size": list(img.size)})
    save_blend(blend)
    return {"blend": str(blend.relative_to(REPO)), "textures": written, "bytes": blend.stat().st_size}


def main() -> int:
    pip_working = WORKING / "pip_highdetail_working.blend"
    pip_hi = HIRES / "pip_highres_candidate.blend"
    goat_hi = HIRES / "goat_highres_candidate.blend"
    # Restore Pip geometry from the untouched working checkpoint.
    shutil.copy2(pip_working, pip_hi)
    pip_info = unpack_and_save(pip_hi, "pip_highres_basecolor.png")
    pip_renders = render_subject("pip_final")
    goat_info = unpack_and_save(goat_hi, "goat_highres_basecolor.png")
    # Goat renders already include the teardrop; refresh back/front only via full set.
    goat_renders = render_subject("goat_final")
    pair = render_pair(pip_hi, goat_hi)
    report = {
        "pip_restored_from_working": True,
        "crest_vertex_shrink_reverted": True,
        "goat_teardrop_kept": True,
        "pip": pip_info,
        "goat": goat_info,
        "pair": pair,
        "pip_renders": pip_renders,
        "goat_renders": goat_renders,
        "paid_resources": False,
        "canonical_mutated": False,
    }
    (REPORTS / "STAGE2_REPACK.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({
        "ok": True,
        "pip_bytes": pip_info["bytes"],
        "goat_bytes": goat_info["bytes"],
        "ratio": pair["ratio"],
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
