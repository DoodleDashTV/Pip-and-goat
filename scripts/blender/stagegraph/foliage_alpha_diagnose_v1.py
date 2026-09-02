"""Zero-paid Blender diagnostic for EcoKit foliage alpha/material behavior."""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

COLLECTION_GROUPS = {
    "trees": ["Tree_1", "Tree_2", "Tree_3", "Tree_4", "Tree_5"],
    "grass": [f"Grass_{i}" for i in range(9)],
    "ferns": [f"Fern_{i}" for i in range(1, 6)],
    "bushes": ["Bushes_1", "Bushes_2"],
    "fallenLeaves": ["Fallen Leaf_0", "Fallen Leaf_1"],
    "floral": ["Floral_1", "Floral_2"],
}


def parse_args():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    return parser.parse_args(raw)


def linked_targets(output_socket):
    targets = []
    for link in getattr(output_socket, "links", []) or []:
        targets.append({
            "node": link.to_node.name,
            "nodeType": link.to_node.type,
            "input": link.to_socket.name,
        })
    return targets


def material_summary(material):
    summary = {
        "name": material.name,
        "useNodes": bool(material.use_nodes),
        "surfaceRenderMethod": getattr(material, "surface_render_method", None),
        "blendMethod": getattr(material, "blend_method", None),
        "showTransparentBack": getattr(material, "show_transparent_back", None),
        "useTransparencyOverlap": getattr(material, "use_transparency_overlap", None),
        "nodeTypes": {},
        "principled": [],
        "images": [],
        "transparentBsdfCount": 0,
        "mixShaderCount": 0,
        "suspicions": [],
    }
    if not material.use_nodes or material.node_tree is None:
        summary["suspicions"].append("MATERIAL_WITHOUT_NODES")
        return summary

    counts = defaultdict(int)
    nodes = list(material.node_tree.nodes)
    for node in nodes:
        counts[node.type] += 1
    summary["nodeTypes"] = dict(sorted(counts.items()))
    summary["transparentBsdfCount"] = counts.get("BSDF_TRANSPARENT", 0)
    summary["mixShaderCount"] = counts.get("MIX_SHADER", 0)

    alpha_linked_anywhere = False
    rgba_images = 0

    for node in nodes:
        if node.type == "BSDF_PRINCIPLED":
            alpha = node.inputs.get("Alpha")
            alpha_links = []
            alpha_default = None
            if alpha is not None:
                alpha_default = float(alpha.default_value)
                alpha_links = [
                    {
                        "node": link.from_node.name,
                        "nodeType": link.from_node.type,
                        "output": link.from_socket.name,
                    }
                    for link in alpha.links
                ]
                if alpha_links:
                    alpha_linked_anywhere = True
            summary["principled"].append({
                "node": node.name,
                "alphaDefault": alpha_default,
                "alphaLinks": alpha_links,
            })
        elif node.type == "TEX_IMAGE":
            image = node.image
            image_info = {
                "node": node.name,
                "image": image.name if image else None,
                "basename": Path(image.filepath.replace("\\", "/")).name if image and image.filepath else None,
                "channels": int(image.channels) if image else None,
                "alphaMode": image.alpha_mode if image else None,
                "colorspace": image.colorspace_settings.name if image else None,
                "colorTargets": linked_targets(node.outputs.get("Color")) if node.outputs.get("Color") else [],
                "alphaTargets": linked_targets(node.outputs.get("Alpha")) if node.outputs.get("Alpha") else [],
            }
            if image and int(image.channels) >= 4:
                rgba_images += 1
            if image_info["alphaTargets"]:
                alpha_linked_anywhere = True
            summary["images"].append(image_info)

    if rgba_images and not alpha_linked_anywhere:
        summary["suspicions"].append("RGBA_IMAGE_PRESENT_BUT_NO_ALPHA_PATH_DETECTED")
    if rgba_images and not summary["transparentBsdfCount"] and not any(item["alphaLinks"] for item in summary["principled"]):
        summary["suspicions"].append("RGBA_IMAGE_WITHOUT_TRANSPARENT_OR_PRINCIPLED_ALPHA_PATH")
    if summary["surfaceRenderMethod"] in {"DITHERED", "BLENDED"} and not alpha_linked_anywhere:
        summary["suspicions"].append("TRANSPARENT_RENDER_METHOD_WITHOUT_ALPHA_LINK")

    return summary


def collect_material_usage():
    import bpy

    usage = defaultdict(set)
    missing_collections = []
    for category, names in COLLECTION_GROUPS.items():
        for collection_name in names:
            collection = bpy.data.collections.get(collection_name)
            if collection is None:
                missing_collections.append(collection_name)
                continue
            for obj in collection.objects:
                if obj.type != "MESH":
                    continue
                for slot in obj.material_slots:
                    if slot.material is not None:
                        usage[slot.material.name].add(category)
    return usage, sorted(set(missing_collections))


def main():
    import bpy

    args = parse_args()
    usage, missing_collections = collect_material_usage()
    materials = []
    for material_name in sorted(usage):
        material = bpy.data.materials.get(material_name)
        if material is None:
            continue
        summary = material_summary(material)
        summary["categories"] = sorted(usage[material_name])
        materials.append(summary)

    suspicious = [
        {
            "name": item["name"],
            "categories": item["categories"],
            "suspicions": item["suspicions"],
        }
        for item in materials
        if item["suspicions"]
    ]

    payload = {
        "schema": "TIVVLEJOY_STAGEGRAPH_FOLIAGE_ALPHA_DIAGNOSTIC_V1",
        "status": "PASS" if not missing_collections else "BLOCKED",
        "blenderVersion": ".".join(str(value) for value in bpy.app.version),
        "readOnly": True,
        "rendered": False,
        "paidCreateCount": 0,
        "paidSpendUsd": 0,
        "targetCollectionGroups": COLLECTION_GROUPS,
        "missingCollections": missing_collections,
        "materialCount": len(materials),
        "suspiciousMaterialCount": len(suspicious),
        "suspiciousMaterials": suspicious,
        "materials": materials,
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "schema": payload["schema"],
        "status": payload["status"],
        "materialCount": payload["materialCount"],
        "suspiciousMaterialCount": payload["suspiciousMaterialCount"],
    }, sort_keys=True))
    return 0 if payload["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
