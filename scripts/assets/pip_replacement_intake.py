#!/usr/bin/env python3
"""Ingest the next Pip model as a replacement candidate.

Preserves the upload unchanged. Records SHA-256 and provenance. Opens the
model in Blender 4.2.3 LTS when available. Writes a comparison package.
Never overwrites current Pip, Goat, long-wing originals, or production-library/.

Host:
  python3 scripts/assets/pip_replacement_intake.py ingest /path/to/pip.glb

Documented wrapper:
  scripts/tivvlejoy/ingest-next-pip.sh /path/to/pip.glb
"""

from __future__ import annotations

import json
import math
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "assets"))

from pip_replacement_intake_lib import (  # noqa: E402
    ARTIFACTS,
    BLENDER_BIN,
    CHAR_LEFT,
    CHAR_RIGHT,
    FACING,
    PIP_TARGET_HEIGHT,
    REQUIRED_BLENDER,
    apply_measured_hints,
    assert_intake_destination,
    assert_not_protected_write,
    blender_command,
    classify_file,
    empty_checklist,
    evaluate_replacement_gate,
    orientation_expectations,
    parse_ingest_args,
    prepare_package,
    suggested_scale,
    write_json,
)

try:
    import bpy  # type: ignore
except ImportError:
    bpy = None


def _meshes():
    return [obj for obj in bpy.data.objects if obj.type == "MESH"]


def _bounds(objects=None):
    from mathutils import Vector

    objects = objects or _meshes()
    coords = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    xs, ys, zs = zip(*[(c.x, c.y, c.z) for c in coords])
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_model(path: Path) -> None:
    suffix = path.suffix.lower()
    if suffix == ".blend":
        bpy.ops.wm.open_mainfile(filepath=str(path))
        return
    reset_scene()
    if suffix in {".glb", ".gltf"}:
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif suffix == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    elif suffix == ".obj":
        bpy.ops.wm.obj_import(filepath=str(path))
    else:
        raise ValueError(f"Blender cannot import {suffix}")


def geometry_report() -> dict:
    import bmesh
    from mathutils.bvhtree import BVHTree

    objects = _meshes()
    armatures = [obj.name for obj in bpy.data.objects if obj.type == "ARMATURE"]
    report = {
        "objectCount": len(objects),
        "objectNames": [obj.name for obj in objects],
        "objectSeparation": "separated" if len(objects) > 1 else "single_or_fused",
        "armatures": armatures,
        "rigPresent": bool(armatures),
        "shapeKeys": [],
        "materials": [],
        "textures": [],
        "uvMaps": [],
        "objects": [],
        "totals": {
            "vertices": 0,
            "triangles": 0,
            "faces": 0,
            "disconnectedComponents": 0,
            "nonManifoldEdges": 0,
            "boundaryEdges": 0,
            "holesEstimate": 0,
            "invertedNormalFaces": 0,
        },
    }
    total_faces = 0
    for obj in objects:
        mesh = obj.data
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bm.verts.ensure_lookup_table()
        bm.edges.ensure_lookup_table()
        bm.faces.ensure_lookup_table()
        islands = 0
        visited = set()
        for vert in bm.verts:
            if vert.index in visited:
                continue
            islands += 1
            stack = [vert]
            visited.add(vert.index)
            while stack:
                current = stack.pop()
                for edge in current.link_edges:
                    other = edge.other_vert(current)
                    if other.index not in visited:
                        visited.add(other.index)
                        stack.append(other)
        nonmanifold = sum(1 for edge in bm.edges if not edge.is_manifold)
        boundary = sum(1 for edge in bm.edges if edge.is_boundary)
        inverted = 0
        for face in bm.faces:
            center = face.calc_center_median()
            if face.normal.dot(center.normalized() if center.length > 1e-6 else face.normal) < -0.15:
                inverted += 1
        tris = sum(len(face.verts) - 2 for face in bm.faces)
        intersections = {"checked": False, "overlappingPairs": 0, "reason": "deferred_high_density"}
        if len(bm.faces) <= 80_000:
            try:
                tree = BVHTree.FromBMesh(bm, epsilon=0.0001)
                overlaps = tree.overlap(tree)
                pairs = {tuple(sorted(pair)) for pair in overlaps if pair[0] != pair[1]}
                intersections = {
                    "checked": True,
                    "overlappingPairs": len(pairs),
                    "reason": "bvh_self_overlap",
                }
            except Exception as exc:  # noqa: BLE001
                intersections = {"checked": False, "overlappingPairs": 0, "reason": str(exc)}
        keys = []
        if mesh.shape_keys:
            keys = [block.name for block in mesh.shape_keys.key_blocks]
        uvs = [layer.name for layer in mesh.uv_layers]
        materials = [slot.material.name for slot in obj.material_slots if slot.material]
        bm.free()
        entry = {
            "name": obj.name,
            "vertices": len(mesh.vertices),
            "faces": len(mesh.polygons),
            "triangles": tris,
            "disconnectedComponents": islands,
            "nonManifoldEdges": nonmanifold,
            "boundaryEdges": boundary,
            "holesEstimate": max(boundary // 3, 0),
            "invertedNormalFaces": inverted,
            "intersections": intersections,
            "uvMaps": uvs,
            "materials": materials,
            "shapeKeys": keys,
        }
        report["objects"].append(entry)
        report["totals"]["vertices"] += entry["vertices"]
        report["totals"]["triangles"] += entry["triangles"]
        report["totals"]["faces"] += entry["faces"]
        report["totals"]["disconnectedComponents"] += islands
        report["totals"]["nonManifoldEdges"] += nonmanifold
        report["totals"]["boundaryEdges"] += boundary
        report["totals"]["holesEstimate"] += entry["holesEstimate"]
        report["totals"]["invertedNormalFaces"] += inverted
        report["shapeKeys"].extend(keys)
        report["materials"].extend(materials)
        report["uvMaps"].extend(uvs)
        total_faces += entry["faces"]
    images = []
    for image in bpy.data.images:
        if image.size[0] > 4:
            images.append({"name": image.name, "size": [int(image.size[0]), int(image.size[1])]})
    report["textures"] = images
    report["textureCheck"] = {
        "hasImageTextures": bool(images),
        "colorLike": [img for img in images if "normal" not in img["name"].lower() and "orm" not in img["name"].lower()],
        "normalLike": [img for img in images if "normal" in img["name"].lower()],
    }
    if objects:
        mn, mx = _bounds(objects)
        report["dimensions"] = {
            "min": [mn.x, mn.y, mn.z],
            "max": [mx.x, mx.y, mx.z],
            "size": [mx.x - mn.x, mx.y - mn.y, mx.z - mn.z],
            "nativeHeight": mx.z - mn.z,
        }
        report["scaleCheck"] = suggested_scale(mx.z - mn.z)
    else:
        report["dimensions"] = None
        report["scaleCheck"] = None
    report["orientationCheck"] = {
        **orientation_expectations(),
        "heuristic": "Reviewers must confirm +X facing against the binding front sheet. Intake does not auto-rotate the original.",
        "appliedToOriginal": False,
    }
    report["highDensity"] = total_faces > 200_000
    return report


def apply_lookdev():
    scene = bpy.context.scene
    scene.view_settings.view_transform = "Khronos PBR Neutral"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.display_settings.display_device = "sRGB"
    world = bpy.data.worlds.new("IntakeWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.83, 0.86, 0.89, 1.0)
    bg.inputs["Strength"].default_value = 0.88
    key = bpy.data.lights.new("IntakeKey", "SUN")
    key.energy = 2.35
    key_obj = bpy.data.objects.new("IntakeKey", key)
    scene.collection.objects.link(key_obj)
    key_obj.rotation_euler = (0.70, 0.10, 0.32)
    fill = bpy.data.lights.new("IntakeFill", "SUN")
    fill.energy = 0.62
    fill_obj = bpy.data.objects.new("IntakeFill", fill)
    scene.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = (0.95, -0.42, 3.25)


def add_camera(name, location, target, ortho):
    from mathutils import Vector

    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = ortho
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    return obj


def render_still(path: Path, samples: int = 16):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1080
    scene.render.resolution_y = 1920
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.filepath = str(path)
    scene.eevee.taa_render_samples = samples
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)


def render_comparison_views(dest: Path) -> list[str]:
    from mathutils import Vector

    apply_lookdev()
    mn, mx = _bounds()
    center = (mn + mx) * 0.5
    height = max(mx.z - mn.z, 0.001)
    radius = max(mx.x - mn.x, mx.y - mn.y, height) * 1.45
    facing = Vector(FACING)
    left = Vector(CHAR_LEFT)
    right = Vector(CHAR_RIGHT)
    focus = center + Vector((0, 0, height * 0.02))
    views = {
        "front": (center + facing * radius, height * 1.28, focus),
        "rear": (center - facing * radius, height * 1.28, focus),
        "left": (center + left * radius, height * 1.28, focus),
        "right": (center + right * radius, height * 1.28, focus),
        "three_quarter": (center + (facing * 0.72 + left * 0.72) * radius, height * 1.32, focus),
        "face": (
            center + facing * (height * 0.85) + Vector((0, 0, height * 0.28)),
            height * 0.52,
            center + Vector((0, 0, height * 0.78)),
        ),
        "shoulder_right": (
            Vector((height * 0.55, -height * 0.35, height * 0.78)),
            height * 0.62,
            Vector((0.05, -0.12, height * 0.78)),
        ),
        "satchel_left": (
            Vector((height * 0.45, height * 0.42, height * 0.42)),
            height * 0.58,
            Vector((0.0, 0.18, height * 0.38)),
        ),
    }
    written = []
    for name, (loc, ortho, look) in views.items():
        cam = add_camera(f"intake_{name}", loc, look, ortho)
        bpy.context.scene.camera = cam
        dest_path = dest / f"{name}.png"
        render_still(dest_path, samples=16)
        written.append(str(dest_path))
    for index in range(8):
        angle = math.radians(index * 45)
        loc = center + Vector((math.cos(angle), math.sin(angle), 0.0)) * radius
        loc.z = center.z
        cam = add_camera(f"intake_turn_{index:02d}", loc, focus, height * 1.30)
        bpy.context.scene.camera = cam
        dest_path = dest / f"turntable_{index:02d}.png"
        render_still(dest_path, samples=12)
        written.append(str(dest_path))
    return written


def save_preview_blend(path: Path) -> None:
    assert_intake_destination(path)
    assert_not_protected_write(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path), compress=True)


def validate_package_in_blender(package_dir: Path) -> dict:
    reports = package_dir / "reports"
    previews = package_dir / "previews"
    preview_blend = package_dir / "preview" / "candidate_preview.blend"
    manifest = json.loads((reports / "INTAKE_MANIFEST.json").read_text())
    classification = manifest["classification"]
    primary = classification.get("primaryModel")
    if not primary:
        raise FileNotFoundError("package has no primary model to import")
    if classification.get("files") and any(rec.get("kind") == "model" and rec.get("relative") for rec in classification["files"]):
        rel = primary["relative"]
        source = package_dir / "unpacked" / rel
        if not source.is_file():
            source = package_dir / "original" / Path(rel).name
    else:
        source = package_dir / "original" / primary["filename"]
    if not source.is_file():
        raise FileNotFoundError(source)

    import_model(source)
    version = bpy.app.version_string
    if REQUIRED_BLENDER not in version:
        raise RuntimeError(f"expected Blender {REQUIRED_BLENDER} LTS, got {version}")
    geo = geometry_report()
    skip_renders = "--skip-renders" in sys.argv
    renders = [] if skip_renders else render_comparison_views(previews)
    save_preview_blend(preview_blend)
    measured = {
        "objectSeparation": geo["objectSeparation"],
        "strapHint": "REQUIRES_JUSTIN — automated strap classification is a hint only",
        "frontStrapHint": "REQUIRES_JUSTIN — confirm exactly one front diagonal",
        "lateralityHint": "Expect character-right shoulder (−Y) and character-left hip (+Y)",
        "bagHint": "Expect satchel on +Y",
        "crestHint": "Expect exactly three coral crest feathers",
    }
    checklist = apply_measured_hints(empty_checklist(), measured)
    gate = evaluate_replacement_gate()
    comparison = {
        "schema": "tivvlejoy.pip_replacement_intake.comparison.v1",
        "blender": version,
        "source": str(source),
        "sourceRecord": classify_file(source),
        "geometry": geo,
        "renders": [str(Path(path).relative_to(package_dir)) if Path(path).is_relative_to(package_dir) else path for path in renders],
        "previewBlend": str(preview_blend.relative_to(package_dir)),
        "checklist": checklist,
        "gate": gate,
        "strengths": [],
        "defects": [
            "Visual strengths and defects require Justin review against the ten binding five-views.",
        ],
        "repairability": "Not assessed automatically. Fused accessories are usually not paint-repairable.",
        "productionSuitability": "NOT_PRODUCTION_READY",
        "approved": False,
        "autoReplaceCurrentPip": False,
    }
    write_json(reports / "GEOMETRY_REPORT.json", geo)
    write_json(reports / "COMPARISON_CHECKLIST.json", {
        "schema": "tivvlejoy.pip_replacement_intake.checklist.v1",
        "items": checklist,
        "approved": False,
        "autoReplace": False,
    })
    write_json(reports / "COMPARISON_PACKAGE.json", comparison)
    write_json(reports / "GATE.json", gate)
    manifest["blenderValidation"] = "complete"
    manifest["renders"] = comparison["renders"]
    write_json(reports / "INTAKE_MANIFEST.json", manifest)
    (reports / "COMPARISON_PACKAGE.md").write_text(
        "\n".join(
            [
                "# Pip replacement comparison package",
                "",
                f"Source: `{source.name}`",
                f"SHA-256: `{comparison['sourceRecord']['sha256']}`",
                f"Blender: {version}",
                "",
                "This candidate does **not** replace current Pip.",
                "Canon, production-library, theatrical binding, and merge remain untouched.",
                "",
                "Stop for Justin visual approval before retopology, rigging, canon replacement, theatrical binding, or merging.",
                "",
            ]
        )
    )
    return comparison


def run_host(args) -> int:
    source = Path(args.source)
    inbox = Path(args.inbox) if args.inbox else None
    package = prepare_package(
        source,
        license_name=args.license,
        origin=args.origin,
        notes=args.notes,
        inbox=inbox,
    )
    package_dir = Path(package["paths"]["root"])
    artifact_dir = ARTIFACTS / package["packageId"]
    artifact_dir.mkdir(parents=True, exist_ok=True)
    write_json(artifact_dir / "INTAKE_POINTER.json", {
        "packageId": package["packageId"],
        "packageDir": str(package_dir),
        "autoReplaceCurrentPip": False,
    })
    if args.skip_blender:
        print(json.dumps({"ok": True, "blender": "skipped", **package["gate"], "packageId": package["packageId"]}))
        return 0
    if not BLENDER_BIN.is_file():
        print(json.dumps({"ok": True, "blender": "missing", "packageId": package["packageId"], "gate": package["gate"]}))
        return 0
    env = os.environ.copy()
    env.setdefault("LIBGL_ALWAYS_SOFTWARE", "1")
    env.setdefault("GALLIUM_DRIVER", "llvmpipe")
    env["CLOUD_RENDER_ENABLED"] = "false"
    env["ALLOW_PAID_GPU_LAUNCH"] = "false"
    command = blender_command(package_dir)
    completed = subprocess.run(command, env=env, check=False)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)
    print(json.dumps({"ok": True, "packageId": package["packageId"], "packageDir": str(package_dir), "autoReplaceCurrentPip": False}))
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    if bpy is not None and "--" in sys.argv:
        argv = sys.argv[sys.argv.index("--") + 1 :]
    args = parse_ingest_args(argv)
    if args.command == "ingest":
        if bpy is not None and args.blender_package:
            validate_package_in_blender(Path(args.blender_package))
            return 0
        return run_host(args)
    if args.command == "validate-package":
        package_dir = Path(args.blender_package or args.source)
        if bpy is None:
            raise SystemExit("validate-package must run inside Blender 4.2.3 LTS")
        validate_package_in_blender(package_dir)
        return 0
    raise SystemExit(f"unknown command {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
