#!/usr/bin/env python3
"""Print materials/nodes on high-res candidates. No edits."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy

REPO = Path(__file__).resolve().parents[2]
HIRES = REPO / "theatrical-foundation/proposed/final-character-production/high-resolution"


def inspect(path: Path) -> dict:
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False)
    mats = []
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            mats.append({"name": mat.name, "nodes": False})
            continue
        nodes = []
        for node in mat.node_tree.nodes:
            info = {"type": node.type, "name": node.name}
            if node.type == "BSDF_PRINCIPLED":
                info["sockets"] = {
                    name: (
                        [round(v, 4) for v in sock.default_value]
                        if hasattr(sock.default_value, "__len__")
                        else round(float(sock.default_value), 4)
                    )
                    for name, sock in node.inputs.items()
                    if name
                    in {
                        "Base Color",
                        "Roughness",
                        "Metallic",
                        "Specular IOR Level",
                        "Specular",
                        "Subsurface Weight",
                        "Subsurface",
                        "Sheen Weight",
                        "Sheen",
                        "Coat Weight",
                        "Clearcoat",
                        "IOR",
                    }
                }
            if node.type == "TEX_IMAGE" and node.image:
                info["image"] = node.image.name
                info["size"] = list(node.image.size)
            nodes.append(info)
        mats.append({"name": mat.name, "nodes": nodes})
    images = [{"name": img.name, "size": list(img.size), "packed": bool(img.packed_file)} for img in bpy.data.images if img.size[0] > 0]
    return {"blend": str(path.name), "materials": mats, "images": images}


def main() -> int:
    report = {
        "pip": inspect(HIRES / "pip_highres_candidate.blend"),
        "goat": inspect(HIRES / "goat_highres_candidate.blend"),
    }
    print(json.dumps(report, indent=2)[:12000])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
