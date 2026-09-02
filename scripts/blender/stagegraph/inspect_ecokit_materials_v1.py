"""Zero-paid Blender inspect of EcoKit materials after vendor-reference prepare."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from ecokit_cycles_alpha_v1 import (
    classify_material,
    incoming_socket_names,
    inspect_material,
    is_cycles_output,
    is_eevee_output,
    normalize_blender_path,
)


def parse_args():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--out", required=True)
    return parser.parse_args(raw)


def _exists(filepath: str) -> bool:
    if not filepath:
        return False
    try:
        import bpy

        return Path(bpy.path.abspath(normalize_blender_path(filepath))).exists() or Path(bpy.path.abspath(filepath)).exists()
    except Exception:
        return Path(normalize_blender_path(filepath)).exists()


def main():
    import bpy

    args = parse_args()
    materials = []
    for material in bpy.data.materials:
        info = inspect_material(material)
        info["classification"] = classify_material(info)
        materials.append(info)
    images = []
    missing = []
    backslash = 0
    for image in bpy.data.images:
        raw = str(getattr(image, "filepath", "") or "")
        if "\\" in raw:
            backslash += 1
        exists = bool(getattr(image, "packed_file", None)) or _exists(raw)
        row = {
            "name": image.name,
            "filepath": raw,
            "normalized": normalize_blender_path(raw),
            "exists": exists,
            "packed": bool(getattr(image, "packed_file", None)),
        }
        images.append(row)
        if image.source == "FILE" and not row["packed"] and not exists:
            missing.append(raw)
    dual = {"count": 0, "eeveeActive": 0, "cyclesActive": 0}
    for material in bpy.data.materials:
        if not material.use_nodes or material.node_tree is None:
            continue
        outputs = [node for node in material.node_tree.nodes if node.type == "OUTPUT_MATERIAL"]
        if len(outputs) < 2:
            continue
        dual["count"] += 1
        links = list(material.node_tree.links)
        for node in outputs:
            if not getattr(node, "is_active_output", False):
                continue
            if is_eevee_output(node, links):
                dual["eeveeActive"] += 1
            if is_cycles_output(node, links):
                dual["cyclesActive"] += 1
    foliage = [row for row in materials if row["classification"] == "FOLIAGE_CUTOUT"]
    unused_alpha = [row["name"] for row in foliage if row.get("unusedImageAlpha")]
    blended = [
        row["name"]
        for row in foliage
        if row.get("blendMethod") in {"BLEND", "BLENDED"} or row.get("surfaceRenderMethod") == "BLENDED"
    ]
    payload = {
        "schema": "TIVVLEJOY_STAGEGRAPH_ECOKIT_MATERIAL_INSPECT_V1",
        "sourceId": args.source_id,
        "blenderVersion": ".".join(str(value) for value in bpy.app.version),
        "materialCount": len(materials),
        "foliageCutoutCount": len(foliage),
        "unusedImageAlphaMaterials": unused_alpha,
        "nonTrivialBlendMaterials": blended,
        "backslashImagePaths": backslash,
        "missingImages": missing,
        "warnings": (
            ["NON_TRIVIAL_ALPHA_BLENDING_WARNINGS_PRESENT_FOR_FOLIAGE_MATERIALS"] if blended or unused_alpha else []
        ),
        "dualMaterialOutputs": dual,
        "rootCauseCandidates": {
            "unusedImageAlphaWouldRenderBlackRgb": bool(unused_alpha),
            "eeveeBlendModeOnFoliage": bool(blended),
            "unresolvedImagePaths": bool(missing),
            "windowsBackslashPaths": backslash > 0,
            "eeveeMaterialOutputActiveForCycles": dual["eeveeActive"] > 0,
        },
        "materials": foliage,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "schema": payload["schema"],
        "foliageCutoutCount": payload["foliageCutoutCount"],
        "unusedImageAlpha": len(unused_alpha),
        "nonTrivialBlend": len(blended),
        "missingImages": len(missing),
        "warnings": payload["warnings"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
