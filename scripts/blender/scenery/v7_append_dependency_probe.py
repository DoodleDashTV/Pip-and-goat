#!/usr/bin/env python3
"""Controlled append: one Botaniq asset, no explicit image list."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy

from cinematic_hero_rebuild_v5 import BOTANIQ_SOURCES
from memory_safe_asset_loader_v1 import append_named_objects, dependency_integrity, image_audit, inspect_library


def main() -> int:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    beech = BOTANIQ_SOURCES["beech_a"]
    inspect = inspect_library(beech)
    # Append only the first object name. Dependencies must auto-resolve.
    names = inspect.get("objects") or []
    primary = names[:1]
    receipt = append_named_objects(beech, primary, hide_as_library=False)
    objs = receipt.get("objects") or []
    mats = []
    images = []
    for obj in objs:
        for slot in obj.material_slots:
            if slot.material:
                mats.append(slot.material.name)
                tree = slot.material.node_tree
                if tree:
                    for node in tree.nodes:
                        img = getattr(node, "image", None)
                        if img is not None:
                            images.append({
                                "name": img.name,
                                "size": list(img.size),
                                "hasPixels": bool(img.size[0] and img.size[1]),
                            })
    audit = image_audit()
    integrity = dependency_integrity()
    out = {
        "schema": "TJ_APPEND_DEPENDENCY_PROBE_V1",
        "blend": beech.name,
        "sourceObjectCount": inspect.get("objectCount"),
        "sourceImageCount": inspect.get("imageCount"),
        "requested": primary,
        "loadedObjects": [obj.name for obj in objs],
        "explicitAllImages": False,
        "materialsOnObject": mats,
        "imagesOnNodes": images,
        "integrity": integrity,
        "audit": {
            "loadedCount": audit["loadedCount"],
            "estimatedRawBytes": audit["estimatedRawBytes"],
            "unreferencedCount": audit["unreferencedCount"],
        },
        "amplification": receipt.get("amplification"),
    }
    dest = Path("/workspace/artifacts/tivvlejoy-scenery-showcase-30s/cinematic-contextual-recovery-v7/APPEND_DEPENDENCY_PROBE.json")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({"event": "append_probe_done", **{k: out[k] for k in ("requested", "loadedObjects", "explicitAllImages")}}), flush=True)
    return 0 if integrity.get("ok") and objs else 1


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    raise SystemExit(main())
