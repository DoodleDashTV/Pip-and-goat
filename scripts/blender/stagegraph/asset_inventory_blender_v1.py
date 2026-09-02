"""Sanitized read-only inventory for vendor-reference scene planning."""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path


def parse_args():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--out", required=True)
    return parser.parse_args(raw)


def _names(items, limit=1000):
    values = sorted({str(item.name) for item in items if getattr(item, "name", None)})
    return values[:limit], len(values) > limit


def main():
    import bpy

    args = parse_args()
    collection_names, collections_truncated = _names(bpy.data.collections)
    node_group_names, node_groups_truncated = _names(bpy.data.node_groups)
    material_names, materials_truncated = _names(bpy.data.materials)

    by_type = {}
    for object_type in sorted({obj.type for obj in bpy.data.objects}):
        names, truncated = _names([obj for obj in bpy.data.objects if obj.type == object_type])
        by_type[object_type] = {
            "count": sum(1 for obj in bpy.data.objects if obj.type == object_type),
            "names": names,
            "truncated": truncated,
        }

    collection_summaries = []
    for collection in sorted(bpy.data.collections, key=lambda item: item.name):
        types = Counter(obj.type for obj in collection.objects)
        collection_summaries.append({
            "name": collection.name,
            "objectCount": len(collection.objects),
            "objectTypes": dict(sorted(types.items())),
        })

    payload = {
        "schema": "TIVVLEJOY_STAGEGRAPH_ASSET_INVENTORY_V1",
        "sourceId": args.source_id,
        "blendFile": Path(bpy.data.filepath).name,
        "blenderVersion": ".".join(str(value) for value in bpy.app.version),
        "readOnly": True,
        "counts": {
            "scenes": len(bpy.data.scenes),
            "collections": len(bpy.data.collections),
            "objects": len(bpy.data.objects),
            "materials": len(bpy.data.materials),
            "nodeGroups": len(bpy.data.node_groups),
            "images": len(bpy.data.images),
        },
        "sceneNames": sorted(scene.name for scene in bpy.data.scenes),
        "collectionNames": collection_names,
        "collectionsTruncated": collections_truncated,
        "collectionSummaries": collection_summaries,
        "objectsByType": by_type,
        "nodeGroupNames": node_group_names,
        "nodeGroupsTruncated": node_groups_truncated,
        "materialNames": material_names,
        "materialsTruncated": materials_truncated,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"schema": payload["schema"], "status": "PASS", "counts": payload["counts"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
