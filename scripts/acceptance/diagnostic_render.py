"""
NON_CANONICAL_DIAGNOSTIC_TEST — Blender EEVEE diagnostic renderer.

Renders primitive-only scenes (sphere/cube/plane). NEVER Pip, Goat, Meadow,
or any production character/location asset.

Scoped exclusively to infrastructure acceptance testing.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="NON_CANONICAL diagnostic EEVEE render")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--shot-id", required=True)
    parser.add_argument("--width", type=int, required=True)
    parser.add_argument("--height", type=int, required=True)
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--frames", type=int, required=True)
    parser.add_argument("--samples", type=int, default=16)
    parser.add_argument(
        "--motion",
        choices=["slide", "spin", "orbit", "push"],
        default="slide",
        help="Camera/object motion preset for this diagnostic shot",
    )
    parser.add_argument("--seed-color", default="0.2,0.55,0.95", help="RGB 0-1 for primary object")
    return parser.parse_args(argv)


def set_engine_eevee(scene, samples: int) -> None:
    scene.render.engine = "BLENDER_EEVEE"
    # Blender 4.0 EEVEE sample control
    if hasattr(scene, "eevee"):
        if hasattr(scene.eevee, "taa_render_samples"):
            scene.eevee.taa_render_samples = max(1, samples)
        if hasattr(scene.eevee, "use_gtao"):
            scene.eevee.use_gtao = True
        if hasattr(scene.eevee, "use_bloom"):
            scene.eevee.use_bloom = True


def make_material(name: str, color: tuple[float, float, float]):
    import bpy

    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.35
    return mat


def build_scene(motion: str, color: tuple[float, float, float], frames: int, fps: int) -> None:
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = frames
    scene.render.fps = fps

    # Ground
    bpy.ops.mesh.primitive_plane_add(size=20, location=(0.0, 0.0, 0.0))
    ground = bpy.context.object
    ground.name = "DIAG_GROUND"
    ground.data.materials.append(make_material("DIAG_GROUND_MAT", (0.18, 0.22, 0.16)))

    # Sphere
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.9, location=(-2.0, 0.0, 0.9), segments=32, ring_count=16)
    sphere = bpy.context.object
    sphere.name = "DIAG_SPHERE"
    sphere.data.materials.append(make_material("DIAG_SPHERE_MAT", color))

    # Cube
    bpy.ops.mesh.primitive_cube_add(size=1.4, location=(2.2, 0.2, 0.7))
    cube = bpy.context.object
    cube.name = "DIAG_CUBE"
    cube.data.materials.append(make_material("DIAG_CUBE_MAT", (0.95, 0.55, 0.15)))

    # Lights
    bpy.ops.object.light_add(type="SUN", location=(4.0, -2.0, 10.0))
    sun = bpy.context.object
    sun.data.energy = 3.0
    sun.rotation_euler = (0.6, 0.2, 0.4)

    bpy.ops.object.light_add(type="AREA", location=(-3.0, -4.0, 5.0))
    area = bpy.context.object
    area.data.energy = 80.0
    area.data.size = 4.0

    # Camera (vertical 9:16 framing)
    cam_data = bpy.data.cameras.new("DIAG_CAM")
    cam_data.lens = 35
    cam = bpy.data.objects.new("DIAG_CAM", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam

    # Keyframed motion — non-canonical primitives only
    for f in range(1, frames + 1):
        t = (f - 1) / max(frames - 1, 1)
        if motion == "slide":
            sphere.location = (-2.5 + 5.0 * t, 0.0, 0.9 + 0.15 * math.sin(t * math.pi * 2))
            cube.location = (2.2, 0.2, 0.7)
            cam.location = (0.0, -9.5, 3.2)
            cam.rotation_euler = (1.15, 0.0, 0.0)
        elif motion == "spin":
            sphere.location = (-1.5, 0.0, 0.9)
            cube.location = (1.6, 0.0, 0.7)
            cube.rotation_euler = (0.0, 0.0, t * math.pi * 2)
            cam.location = (0.0, -8.5, 2.8)
            cam.rotation_euler = (1.2, 0.0, 0.0)
        elif motion == "orbit":
            ang = t * math.pi * 1.25
            cam.location = (math.sin(ang) * 9.0, -math.cos(ang) * 9.0, 3.0 + 0.5 * t)
            # Look toward origin
            direction = (
                -cam.location[0],
                -cam.location[1],
                1.0 - cam.location[2],
            )
            # Approximate look-at via track
            cam.rotation_euler = (1.1, 0.0, ang)
            sphere.location = (math.cos(ang) * 1.2, math.sin(ang) * 1.2, 0.9)
            cube.location = (2.0, 0.0, 0.7)
        else:  # push
            sphere.location = (-1.2, 0.0, 0.9)
            cube.location = (1.4, 0.0, 0.7)
            cam.location = (0.0, -10.0 + 4.0 * t, 3.4 - 0.6 * t)
            cam.rotation_euler = (1.15, 0.0, 0.0)

        sphere.keyframe_insert(data_path="location", frame=f)
        cube.keyframe_insert(data_path="location", frame=f)
        cube.keyframe_insert(data_path="rotation_euler", frame=f)
        cam.keyframe_insert(data_path="location", frame=f)
        cam.keyframe_insert(data_path="rotation_euler", frame=f)


def main(argv: list[str] | None = None) -> int:
    # When launched via `blender --python`, argv includes Blender's args.
    if argv is None:
        argv = sys.argv
        if "--" in argv:
            argv = argv[argv.index("--") + 1 :]
        else:
            argv = []

    args = parse_args(argv)
    color = tuple(float(x.strip()) for x in args.seed_color.split(","))
    if len(color) != 3:
        print("DIAG_ERROR invalid seed-color", flush=True)
        return 2

    import bpy

    os.makedirs(args.output_dir, exist_ok=True)
    build_scene(args.motion, color, args.frames, args.fps)
    scene = bpy.context.scene
    set_engine_eevee(scene, args.samples)
    scene.render.resolution_x = args.width
    scene.render.resolution_y = args.height
    scene.render.resolution_percentage = 100
    scene.render.fps = args.fps
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = os.path.join(args.output_dir, "frame_")

    print(
        json.dumps(
            {
                "mode": "NON_CANONICAL_DIAGNOSTIC_TEST",
                "shotId": args.shot_id,
                "engine": scene.render.engine,
                "width": args.width,
                "height": args.height,
                "fps": args.fps,
                "frames": args.frames,
                "motion": args.motion,
            }
        ),
        flush=True,
    )

    bpy.ops.render.render(animation=True)

    meta = {
        "ok": True,
        "mode": "NON_CANONICAL_DIAGNOSTIC_TEST",
        "shotId": args.shot_id,
        "engine": scene.render.engine,
        "width": args.width,
        "height": args.height,
        "fps": args.fps,
        "frames": args.frames,
        "outputDir": args.output_dir,
        "canon": False,
        "characters": [],
        "note": "Primitive-only diagnostic. Not Pip/Goat/Meadow.",
    }
    with open(os.path.join(args.output_dir, "shot_meta.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)
    print("DIAG_SHOT_OK", args.shot_id, flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
