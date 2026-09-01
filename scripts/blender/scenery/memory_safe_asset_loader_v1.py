#!/usr/bin/env python3
"""TJ_MEMORY_SAFE_ASSET_LOADER_V1

Load only datablocks required by the requested objects.
Never explicitly append every image in a source library.
Blender resolves material/image dependencies of selected objects.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable

SCHEMA = "TJ_MEMORY_SAFE_ASSET_LOADER_V1"
AMPLIFICATION_CODE = "SOURCE_DEPENDENCY_AMPLIFICATION_WARNING"
AMPLIFICATION_BLOCK = "SOURCE_DEPENDENCY_AMPLIFICATION_BLOCK"
IMAGE_RATIO_WARN = 24
OBJECT_RATIO_WARN = 12
IMAGE_RATIO_BLOCK = 80


def amplification_report(
    *,
    requested_object_count: int,
    loaded_object_count: int,
    loaded_image_count: int,
    loaded_material_count: int = 0,
    source_image_count: int = 0,
    explicit_all_images: bool = False,
    memory_budget_threatened: bool = False,
) -> dict[str, Any]:
    requested = max(int(requested_object_count), 0)
    warnings: list[str] = []
    blockers: list[str] = []
    if explicit_all_images:
        warnings.append("EXPLICIT_ALL_IMAGE_APPEND")
    if requested > 0 and loaded_image_count > requested * IMAGE_RATIO_WARN:
        warnings.append("IMAGE_AMPLIFICATION")
    if requested > 0 and loaded_object_count > requested * OBJECT_RATIO_WARN:
        warnings.append("OBJECT_AMPLIFICATION")
    if requested > 0 and loaded_image_count > requested * IMAGE_RATIO_BLOCK:
        blockers.append("IMAGE_AMPLIFICATION_SEVERE")
    if memory_budget_threatened and warnings:
        blockers.append("MEMORY_BUDGET_THREATENED")
    code = None
    if blockers:
        code = AMPLIFICATION_BLOCK
    elif warnings:
        code = AMPLIFICATION_CODE
    return {
        "schema": SCHEMA,
        "requestedObjectCount": requested,
        "loadedObjectCount": int(loaded_object_count),
        "loadedImageCount": int(loaded_image_count),
        "loadedMaterialCount": int(loaded_material_count),
        "sourceImageCount": int(source_image_count),
        "explicitAllImages": bool(explicit_all_images),
        "warnings": warnings,
        "blockers": blockers,
        "code": code,
        "ok": not blockers,
    }


def is_hidden_library_master(
    *,
    hide_render: bool,
    name: str,
    is_lib_flag: bool,
    is_visible_instance: bool,
) -> bool:
    """True only for parked hide_render source masters, never planted copies."""
    if is_visible_instance:
        return False
    if not hide_render:
        return False
    if is_lib_flag:
        return True
    return name.startswith("bq_") or name.startswith("Rock_Model")


def exclude_hidden_library_masters() -> dict[str, Any]:
    """Keep purchased source masters outside the render depsgraph. A-class."""
    import bpy

    col = bpy.data.collections.get("TJ_LIB_EXCLUDE") or bpy.data.collections.new("TJ_LIB_EXCLUDE")
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    moved: list[str] = []
    for obj in list(bpy.data.objects):
        if not is_hidden_library_master(
            hide_render=bool(obj.hide_render),
            name=obj.name,
            is_lib_flag=bool(obj.get("tj_v5_lib")),
            is_visible_instance=bool(obj.get("tj_v5")) or obj.name.startswith("TJ_"),
        ):
            continue
        for existing in list(obj.users_collection):
            if existing != col:
                existing.objects.unlink(obj)
        if obj.name not in col.objects:
            col.objects.link(obj)
        moved.append(obj.name)
    layer = bpy.context.view_layer.layer_collection
    for child in layer.children:
        if child.collection == col:
            child.exclude = True
            child.hide_viewport = True
    return {"moved": moved, "excluded": True, "count": len(moved)}


def image_raw_bytes(width: int, height: int, channels: int, is_float: bool) -> int:
    w = max(int(width), 0)
    h = max(int(height), 0)
    c = max(int(channels), 0)
    bpp = 4 if is_float else 1
    return w * h * c * bpp


def sit_from_bound_box(obj, loc, bury: float) -> None:
    """Place an unparented object using object-space bounds. No depsgraph update."""
    from mathutils import Vector

    corners = [Vector(c) for c in obj.bound_box]
    scaled = [
        Vector((c.x * obj.scale.x, c.y * obj.scale.y, c.z * obj.scale.z))
        for c in corners
    ]
    rot = obj.rotation_euler.to_matrix()
    world = [rot @ c for c in scaled]
    lowest = min((c.z for c in world), default=0.0)
    obj.location = (loc[0], loc[1], loc[2] - lowest - bury)
    if obj.parent is None:
        obj.matrix_world = obj.matrix_basis


def inspect_library(blend: Path) -> dict[str, Any]:
    import bpy

    if not blend.exists():
        return {"path": str(blend), "exists": False, "objects": [], "images": [], "collections": []}
    with bpy.data.libraries.load(str(blend), link=False) as (src, _dst):
        objects = list(src.objects or [])
        images = list(src.images or [])
        collections = list(src.collections or [])
    return {
        "path": blend.name,
        "exists": True,
        "objects": objects,
        "images": images,
        "collections": collections,
        "objectCount": len(objects),
        "imageCount": len(images),
        "collectionCount": len(collections),
    }


def append_named_objects(
    blend: Path,
    names: Iterable[str],
    *,
    hide_as_library: bool = False,
    library_park: tuple[float, float, float] = (0.0, -800.0, -80.0),
) -> dict[str, Any]:
    import bpy

    wanted = [name for name in names if name]
    receipt: dict[str, Any] = {
        "schema": SCHEMA,
        "blend": blend.name,
        "requested": wanted,
        "loadedObjects": [],
        "explicitAllImages": False,
    }
    if not blend.exists():
        receipt["status"] = "MISSING"
        return receipt
    before_objects = set(bpy.data.objects.keys())
    before_images = set(bpy.data.images.keys())
    before_materials = set(bpy.data.materials.keys())
    source_image_count = 0
    with bpy.data.libraries.load(str(blend), link=False) as (src, dst):
        available = set(src.objects or [])
        source_image_count = len(src.images or [])
        dst.objects = [name for name in wanted if name in available]
        # Do NOT assign dst.images. Dependencies resolve from selected objects.
    loaded = []
    for name in wanted:
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        if obj.name not in bpy.context.scene.collection.objects:
            bpy.context.scene.collection.objects.link(obj)
        if hide_as_library:
            obj.hide_render = True
            obj.hide_viewport = True
            obj.location = library_park
        loaded.append(obj)
    new_objects = [name for name in bpy.data.objects.keys() if name not in before_objects]
    new_images = [name for name in bpy.data.images.keys() if name not in before_images]
    new_materials = [name for name in bpy.data.materials.keys() if name not in before_materials]
    amp = amplification_report(
        requested_object_count=len(wanted),
        loaded_object_count=len(loaded),
        loaded_image_count=len(new_images),
        loaded_material_count=len(new_materials),
        source_image_count=source_image_count,
        explicit_all_images=False,
    )
    receipt.update({
        "status": "LOADED",
        "loadedObjects": [obj.name for obj in loaded],
        "newObjectNames": new_objects,
        "newImageNames": new_images,
        "newMaterialNames": new_materials,
        "sourceImageCount": source_image_count,
        "amplification": amp,
        "objects": loaded,
    })
    print(json.dumps({
        "event": "memory_safe_append",
        "blend": blend.name,
        "requested": len(wanted),
        "loaded": len(loaded),
        "images": len(new_images),
        "sourceImages": source_image_count,
        "explicitAllImages": False,
    }), flush=True)
    return receipt


def append_primary_group(blend: Path, *, hide_as_library: bool = True) -> dict[str, Any]:
    """Append every object in a single-asset blend (Botaniq plant file). No all-images."""
    inspect = inspect_library(blend)
    names = inspect.get("objects") or []
    receipt = append_named_objects(blend, names, hide_as_library=hide_as_library, library_park=(0.0, -900.0, -80.0))
    receipt["mode"] = "primary_group"
    receipt["objects"] = receipt.get("objects") or []
    return receipt


def referenced_image_names() -> set[str]:
    import bpy

    names: set[str] = set()
    for mat in bpy.data.materials:
        tree = getattr(mat, "node_tree", None)
        if tree is None:
            continue
        for node in tree.nodes:
            img = getattr(node, "image", None)
            if img is not None:
                names.add(img.name)
    for img in bpy.data.images:
        if img.users > 0:
            names.add(img.name)
    return names


def image_audit() -> dict[str, Any]:
    import bpy

    referenced = referenced_image_names()
    rows = []
    for img in bpy.data.images:
        width, height = tuple(img.size) if img.size else (0, 0)
        channels = int(getattr(img, "channels", 0) or 0)
        is_float = bool(getattr(img, "is_float", False))
        raw = image_raw_bytes(width, height, channels, is_float)
        packed = bool(getattr(img, "packed_file", None))
        rows.append({
            "name": img.name,
            "width": int(width),
            "height": int(height),
            "channels": channels,
            "packed": packed,
            "isFloat": is_float,
            "rawBytes": raw,
            "users": int(img.users),
            "referenced": img.name in referenced,
            "role": "hdri" if img.name.lower().endswith((".hdr", ".exr")) or "image0001" in img.name.lower() else "texture",
        })
    rows.sort(key=lambda item: item["rawBytes"], reverse=True)
    unreferenced = [row for row in rows if not row["referenced"] and row["users"] == 0]
    return {
        "schema": "TJ_IMAGE_MEMORY_AUDIT_V1",
        "loadedCount": len(rows),
        "estimatedRawBytes": sum(row["rawBytes"] for row in rows),
        "largest10": rows[:10],
        "unreferencedCount": len(unreferenced),
        "unreferencedNames": [row["name"] for row in unreferenced],
        "images": rows,
    }


def purge_unused_datablocks() -> dict[str, Any]:
    import bpy

    before_images = len(bpy.data.images)
    before_materials = len(bpy.data.materials)
    before_meshes = len(bpy.data.meshes)
    before_objects = len(bpy.data.objects)
    removed = {"images": 0, "materials": 0, "meshes": 0, "objects": 0}
    for img in list(bpy.data.images):
        if img.users == 0:
            bpy.data.images.remove(img)
            removed["images"] += 1
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)
            removed["materials"] += 1
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
            removed["meshes"] += 1
    for obj in list(bpy.data.objects):
        if obj.users == 0:
            bpy.data.objects.remove(obj)
            removed["objects"] += 1
    return {
        "schema": "TJ_DATABLOCK_PURGE_V1",
        "removed": removed,
        "before": {
            "images": before_images,
            "materials": before_materials,
            "meshes": before_meshes,
            "objects": before_objects,
        },
        "after": {
            "images": len(bpy.data.images),
            "materials": len(bpy.data.materials),
            "meshes": len(bpy.data.meshes),
            "objects": len(bpy.data.objects),
        },
    }


def material_has_missing_images(mat) -> bool:
    tree = getattr(mat, "node_tree", None)
    if tree is None:
        return False
    for node in tree.nodes:
        img = getattr(node, "image", None)
        if node.type == "TEX_IMAGE" and img is None:
            return True
        if img is not None and getattr(img, "size", (0, 0)) == (0, 0) and not getattr(img, "packed_file", None):
            filepath = getattr(img, "filepath", "") or ""
            if filepath and not Path(bpy_abspath(filepath)).exists():
                return True
    return False


def bpy_abspath(path: str) -> str:
    try:
        import bpy

        return bpy.path.abspath(path)
    except Exception:
        return path


def dependency_integrity() -> dict[str, Any]:
    import bpy

    missing = []
    for mat in bpy.data.materials:
        if material_has_missing_images(mat):
            missing.append(mat.name)
    return {
        "ok": not missing,
        "missingTextureMaterials": missing,
        "materialCount": len(bpy.data.materials),
        "imageCount": len(bpy.data.images),
    }
