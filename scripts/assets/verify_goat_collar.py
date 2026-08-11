"""ASSET_CHECK: prove Goat collar name-tag literally reads "Goat"."""
from __future__ import annotations

import json
import sys
from pathlib import Path

DEFAULT = Path("/agent/production-library/characters/goat_production.blend")


def main() -> None:
    import bpy

    blend = DEFAULT
    if "--" in sys.argv:
        after = sys.argv[sys.argv.index("--") + 1 :]
        if after:
            blend = Path(after[0])
    elif bpy.data.filepath:
        blend = Path(bpy.data.filepath)

    if not bpy.data.filepath or Path(bpy.data.filepath) != blend:
        if blend.exists():
            bpy.ops.wm.open_mainfile(filepath=str(blend))
        else:
            print(
                "DDP_GOAT_COLLAR:"
                + json.dumps({"ok": False, "status": "ASSET_CHECK_BLOCKED", "missingBlend": str(blend)})
            )
            raise SystemExit(2)

    names = {o.name for o in bpy.data.objects}
    required = {"Goat_Character", "Goat_Collar", "Goat_Tag", "Goat_Tag_Text", "Goat_Rig"}
    missing = sorted(required - names)
    text_body = None
    text_obj = bpy.data.objects.get("Goat_Tag_Text")
    mesh_ok = False
    verts = 0
    if text_obj and text_obj.type == "MESH" and text_obj.data:
        verts = len(text_obj.data.vertices)
        mesh_ok = verts >= 8
    if text_obj and text_obj.type == "FONT":
        text_body = text_obj.data.body
        mesh_ok = text_body.strip() == "Goat"

    stamped = None
    goat = bpy.data.objects.get("Goat_Character")
    if goat and "ddp_tag_text" in goat.keys():
        stamped = goat["ddp_tag_text"]

    ok = not missing and mesh_ok and stamped == "Goat"
    result = {
        "ok": ok,
        "blend": str(blend),
        "missing": missing,
        "hasTagTextObject": "Goat_Tag_Text" in names,
        "tagTextBody": text_body,
        "tagTextMeshVerts": verts,
        "tagTextMeshOk": mesh_ok,
        "stampedTagText": stamped,
        "requiredLiteral": "Goat",
        "status": "PASS" if ok else "ASSET_CHECK_BLOCKED",
        "message": (
            "Goat collar/name-tag reads Goat"
            if ok
            else "ASSET_CHECK BLOCKED — Goat name-tag text missing or not 'Goat'"
        ),
    }
    print("DDP_GOAT_COLLAR:" + json.dumps(result))
    if not ok:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
