#!/usr/bin/env python3
"""Export Color/Normal/ORM as separate files and relink high-res blends.

  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \\
    /usr/local/bin/blender -b -noaudio -P scripts/assets/fix_final_texture_links.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "assets"))
from theatrical_rebuild_common import assert_not_production_library  # noqa: E402

HIRES = REPO / "theatrical-foundation/proposed/final-character-production/high-resolution"
TEXTURES = REPO / "theatrical-foundation/proposed/final-character-production/textures"
REPORTS = REPO / "theatrical-foundation/proposed/final-character-production/reports"


def kind_of(name: str) -> str:
    lower = name.lower()
    if "normal" in lower:
        return "normal"
    if "orm" in lower or "occlusion" in lower:
        return "orm"
    return "basecolor"


def export_and_relink(blend: Path, stem: str) -> dict:
    assert_not_production_library(blend)
    bpy.ops.wm.open_mainfile(filepath=str(blend), load_ui=False)
    TEXTURES.mkdir(parents=True, exist_ok=True)
    written = []
    for img in list(bpy.data.images):
        if img.size[0] < 64:
            continue
        kind = kind_of(img.name)
        dest = TEXTURES / f"{stem}_{kind}.png"
        img.file_format = "PNG"
        img.filepath_raw = str(dest)
        img.save()
        if img.packed_file:
            img.unpack(method="REMOVE")
        rel = f"//../textures/{dest.name}"
        img.filepath = rel
        img.filepath_raw = rel
        written.append({
            "name": img.name,
            "kind": kind,
            "path": str(dest.relative_to(REPO)),
            "size": list(img.size),
            "bytes": dest.stat().st_size,
        })
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True)
    return {
        "blend": str(blend.relative_to(REPO)),
        "blend_bytes": blend.stat().st_size,
        "textures": written,
    }


def main() -> int:
    report = {
        "pip": export_and_relink(HIRES / "pip_highres_candidate.blend", "pip_highres"),
        "goat": export_and_relink(HIRES / "goat_highres_candidate.blend", "goat_highres"),
    }
    (REPORTS / "TEXTURE_LINKS.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
