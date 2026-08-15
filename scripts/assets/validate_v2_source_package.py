#!/usr/bin/env python3
"""Validate the uploaded Pip/Goat v2 source package. No canonical mutation."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

# Visually confirmed facing in this package. Do not assume -Y is front.
FACING_XY = {
    "pip_primary": (1.0, 0.0),
    "goat_primary": (1.0, 0.0),
    "pip_prism": (1.0, 0.0),
    "goat_prism": (1.0, 0.0),
    "goat_prism_expressive": (1.0, 0.0),
    "pip_hunyuan": (0.0, -1.0),
    "goat_hunyuan": (0.0, -1.0),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_sha256sums(package: Path) -> dict:
    listed = {}
    missing = []
    mismatch = []
    ok = []
    for line in (package / "SHA256SUMS.txt").read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        digest, rel = line.split(None, 1)
        rel = rel[1:] if rel.startswith("*") else rel
        listed[rel] = digest
        path = package / rel
        if not path.is_file():
            missing.append(rel)
            continue
        actual = sha256(path)
        if actual == digest:
            ok.append(rel)
        else:
            mismatch.append({"path": rel, "expected": digest, "actual": actual})
    return {
        "listed": len(listed),
        "ok": len(ok),
        "missing": missing,
        "mismatch": mismatch,
        "all_ok": not missing and not mismatch,
    }


def parse_manifest(package: Path) -> list[dict]:
    rows = []
    with (package / "manifest.csv").open(newline="") as handle:
        for row in csv.DictReader(handle):
            rel = row["package_path"]
            path = package / rel
            rows.append(
                {
                    **row,
                    "present": path.is_file(),
                    "bytes": path.stat().st_size if path.is_file() else 0,
                }
            )
    return rows


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_source(path: Path) -> None:
    suffix = path.suffix.lower()
    if suffix == ".blend":
        bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False)
        return
    reset_scene()
    if suffix == ".glb":
        bpy.ops.import_scene.gltf(filepath=str(path))
        return
    raise ValueError(f"Unsupported source: {path}")


def mesh_objects():
    return [obj for obj in bpy.data.objects if obj.type == "MESH"]


def world_bounds(meshes) -> tuple[Vector, Vector]:
    coords = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    xs, ys, zs = zip(*[(c.x, c.y, c.z) for c in coords])
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def apply_khronos() -> None:
    scene = bpy.context.scene
    scene.view_settings.view_transform = "Khronos PBR Neutral"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.display_settings.display_device = "sRGB"
    scene.sequencer_colorspace_settings.name = "sRGB"


def setup_render(output: Path) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1080
    scene.render.resolution_y = 1920
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.filepath = str(output)
    scene.render.film_transparent = False
    scene.render.use_persistent_data = False
    scene.eevee.taa_render_samples = 24
    scene.eevee.use_shadows = True
    apply_khronos()
    world = bpy.data.worlds.new("V2SourceWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.82, 0.86, 0.90, 1.0)
    bg.inputs["Strength"].default_value = 0.85
    key_data = bpy.data.lights.new("Key", "SUN")
    key_data.energy = 2.4
    key = bpy.data.objects.new("Key", key_data)
    scene.collection.objects.link(key)
    key.rotation_euler = (0.7, 0.15, 0.4)
    fill_data = bpy.data.lights.new("Fill", "SUN")
    fill_data.energy = 0.7
    fill = bpy.data.objects.new("Fill", fill_data)
    scene.collection.objects.link(fill)
    fill.rotation_euler = (0.9, -0.4, 3.4)


def add_camera(name: str, location: Vector, target: Vector):
    cam_data = bpy.data.cameras.new(name)
    cam_data.type = "ORTHO"
    obj = bpy.data.objects.new(name, cam_data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    direction = target - location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return obj


def render_views(stem: str, out_dir: Path, views: tuple[str, ...] | None = None) -> list[str]:
    meshes = mesh_objects()
    if not meshes:
        return []
    mn, mx = world_bounds(meshes)
    center = (mn + mx) * 0.5
    size = mx - mn
    height = max(size.z, 0.001)
    radius = max(size.x, size.y, height) * 1.55
    cam_z = center.z + height * 0.04
    fx, fy = FACING_XY.get(stem, (1.0, 0.0))
    front = Vector((fx, fy, 0.0)).normalized()
    right = Vector((-front.y, front.x, 0.0))
    view_map = {
        "front": center + front * radius + Vector((0, 0, cam_z - center.z)),
        "back": center - front * radius + Vector((0, 0, cam_z - center.z)),
        "left": center - right * radius + Vector((0, 0, cam_z - center.z)),
        "right": center + right * radius + Vector((0, 0, cam_z - center.z)),
        "three_quarter": center + (front * 0.72 + right * 0.72) * radius + Vector((0, 0, height * 0.12)),
        "closeup": center + front * (radius * 0.55) + Vector((0, 0, height * 0.22)),
    }
    wanted = views or tuple(view_map)
    written = []
    for name in wanted:
        loc = view_map[name]
        look = center + Vector((0, 0, height * (0.22 if name == "closeup" else 0.02)))
        cam = add_camera(f"cam_{stem}_{name}", loc, look)
        cam.data.ortho_scale = height * (0.58 if name == "closeup" else 1.28)
        bpy.context.scene.camera = cam
        dest = out_dir / f"{stem}_{name}.png"
        setup_render(dest)
        bpy.ops.render.render(write_still=True)
        written.append(str(dest))
    return written


def audit_open_file(label: str, path: Path) -> dict:
    meshes = mesh_objects()
    armatures = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    images = []
    for img in bpy.data.images:
        if img.size[0] <= 0:
            continue
        images.append({"name": img.name, "width": int(img.size[0]), "height": int(img.size[1])})
    mn = mx = None
    if meshes:
        mn, mx = world_bounds(meshes)
    height = (mx.z - mn.z) if mn and mx else 0.0
    verts = sum(len(obj.data.vertices) for obj in meshes)
    tris = 0
    ngons = 0
    nonmanifold = 0
    materials = []
    for obj in meshes:
        obj.data.calc_loop_triangles()
        tris += len(obj.data.loop_triangles)
        ngons += sum(1 for poly in obj.data.polygons if len(poly.vertices) > 4)
        bm_non = 0
        try:
            import bmesh

            bm = bmesh.new()
            bm.from_mesh(obj.data)
            bm.edges.ensure_lookup_table()
            bm_non = sum(1 for edge in bm.edges if not edge.is_manifold)
            bm.free()
        except Exception:
            bm_non = -1
        nonmanifold += bm_non
        for slot in obj.material_slots:
            if slot.material and slot.material.name not in materials:
                materials.append(slot.material.name)
    shape_keys = []
    for obj in meshes:
        if obj.data.shape_keys:
            shape_keys.extend(key.name for key in obj.data.shape_keys.key_blocks)
    return {
        "label": label,
        "path": str(path),
        "bytes": path.stat().st_size,
        "blender_version": bpy.app.version_string,
        "objects": sorted(obj.name for obj in bpy.data.objects),
        "mesh_count": len(meshes),
        "meshes": [
            {
                "name": obj.name,
                "verts": len(obj.data.vertices),
                "faces": len(obj.data.polygons),
                "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
            }
            for obj in meshes
        ],
        "vertex_count": verts,
        "triangle_count": tris,
        "ngon_count": ngons,
        "nonmanifold_edge_count": nonmanifold,
        "materials": materials,
        "images": images,
        "armatures": [obj.name for obj in armatures],
        "bone_count": sum(len(obj.data.bones) for obj in armatures),
        "shape_keys": shape_keys,
        "actions": [action.name for action in bpy.data.actions],
        "world_min": list(mn) if mn else None,
        "world_max": list(mx) if mx else None,
        "height": height,
        "has_rig": bool(armatures),
        "has_weights": any(bool(obj.vertex_groups) for obj in meshes),
        "single_fused_mesh": len(meshes) == 1,
        "facing_xy": list(FACING_XY.get(label, (1.0, 0.0))),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", required=True)
    parser.add_argument("--out", required=True)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)
    package = Path(args.package)
    out = Path(args.out)
    clean = out / "clean"
    refs = out / "refs"
    clean.mkdir(parents=True, exist_ok=True)
    refs.mkdir(parents=True, exist_ok=True)

    hashes = verify_sha256sums(package)
    manifest = parse_manifest(package)
    present = [row for row in manifest if row["present"]]
    missing = [row for row in manifest if not row["present"]]

    for src, dest_prefix in (
        (package / "Pip/references", "Pip"),
        (package / "Goat/references", "Goat"),
    ):
        if src.is_dir():
            for image in sorted(src.glob("*.jpeg")):
                target = refs / f"{dest_prefix}_{image.name}"
                target.write_bytes(image.read_bytes())

    sources = [
        ("pip_primary", package / "Pip/models/primary/Pip_primary_source.blend", None),
        ("goat_primary", package / "Goat/models/primary/Goat_primary_source.blend", None),
        ("pip_prism", package / "Pip/models/alternates/Pip_Prism_source.glb", ("front",)),
        ("pip_hunyuan", package / "Pip/models/alternates/Pip_Hunyuan_source.glb", ("front",)),
        ("goat_prism", package / "Goat/models/alternates/Goat_Prism_source.glb", ("front",)),
        ("goat_prism_expressive", package / "Goat/models/alternates/Goat_Prism_expressive_source.glb", ("front",)),
        ("goat_hunyuan", package / "Goat/models/alternates/Goat_Hunyuan_source.glb", ("front",)),
    ]

    audits = []
    renders = []
    for label, path, views in sources:
        if not path.is_file():
            audits.append({"label": label, "path": str(path), "error": "missing"})
            continue
        import_source(path)
        audits.append(audit_open_file(label, path))
        renders.extend(render_views(label, clean, views))

    report = {
        "package": str(package),
        "branch": "assets/pip-goat-v2-source",
        "integrity": hashes,
        "manifest_present": len(present),
        "manifest_missing": [
            {
                "package_path": row["package_path"],
                "role": row["role"],
                "notes": row.get("notes", ""),
            }
            for row in missing
        ],
        "audits": audits,
        "renders": renders,
        "canonical_mutated": False,
        "merged": False,
        "approved": False,
    }
    (out / "VALIDATION.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"ok": True, "out": str(out), "integrity": hashes["all_ok"], "renders": len(renders)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
