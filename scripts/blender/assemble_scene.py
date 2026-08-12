"""Assemble and render a Doodle Dash production scene (real bpy implementation)."""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

# Allow running both inside Blender (--python) and importing helpers.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import emit, parse_blender_args, require_asset  # noqa: E402


def eevee_engine_id(scene) -> str:
    """Return the EEVEE engine enum id for the running Blender version.

    Blender 4.2+ renamed the real-time engine from ``BLENDER_EEVEE`` to
    ``BLENDER_EEVEE_NEXT``. Pick whichever enum this build actually exposes so
    the same production script renders on 3.x and 4.2+.
    """
    try:
        prop = scene.render.bl_rna.properties["engine"]
        available = {item.identifier for item in prop.enum_items}
    except Exception:  # pragma: no cover - defensive
        available = set()
    if "BLENDER_EEVEE_NEXT" in available:
        return "BLENDER_EEVEE_NEXT"
    return "BLENDER_EEVEE"


def set_eevee(scene, samples: int = 32) -> None:
    scene.render.engine = eevee_engine_id(scene)
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = max(1, samples)
    # EEVEE-Next: raytraced shadows give real contact shadows and occlusion, so
    # characters sit in the scene instead of looking pasted onto the grass. The
    # legacy gtao switch is a no-op in this engine.
    if hasattr(scene, "eevee"):
        for attr in ("use_raytracing", "use_shadows", "use_soft_shadows"):
            if hasattr(scene.eevee, attr):
                setattr(scene.eevee, attr, True)


def append_object(blend_path: str, names: list[str] | None = None):
    import bpy

    with bpy.data.libraries.load(blend_path, link=False) as (data_from, data_to):
        if names:
            data_to.objects = [n for n in data_from.objects if n in names]
            data_to.actions = list(data_from.actions)
            data_to.armatures = list(data_from.armatures)
        else:
            data_to.objects = list(data_from.objects)
            data_to.actions = list(data_from.actions)
            data_to.armatures = list(data_from.armatures)
    imported = []
    for obj in data_to.objects:
        if obj is not None:
            bpy.context.collection.objects.link(obj)
            imported.append(obj)
    return imported


def find_armature(objects):
    for obj in objects:
        if obj.type == "ARMATURE":
            return obj
    return None


def strip_imported_lights_and_cameras(objects) -> dict:
    """Remove lights/cameras that ride along inside asset blends.

    Every founding blend ships its own reference lighting rig and reference
    camera. Appending four of them stacked 8 lights and 3 stray cameras into the
    shot, which is what washed out the first 1080p acceptance render. The shot
    owns its lighting and camera; assets only contribute geometry.
    """
    import bpy

    # Snapshot names first: removing an object invalidates every Python handle to
    # it, so the survivor list has to be rebuilt by name afterwards.
    inventory = [(obj.name, obj.type) for obj in objects]
    removed = {"lights": [], "cameras": []}
    for name, kind in inventory:
        if kind not in ("LIGHT", "CAMERA"):
            continue
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        removed["lights" if kind == "LIGHT" else "cameras"].append(name)
        bpy.data.objects.remove(obj, do_unlink=True)
    removed["survivors"] = [name for name, kind in inventory if kind not in ("LIGHT", "CAMERA")]
    return removed


def placement_root(role: str, objects):
    """The single object to move so a whole multi-object asset travels together.

    Moving "the first imported mesh" detached ``MapMark`` from ``AdventureMap``.
    Prefer the armature, then an existing root parent, otherwise group the
    asset's top-level objects under a fresh empty and move that, which preserves
    every internal transform and parent/child relationship.
    """
    import bpy

    arm = find_armature(objects)
    if arm is not None:
        return arm, "armature"

    live = [o for o in objects if o.name in bpy.data.objects]
    if not live:
        return None, "none"

    tops = [o for o in live if o.parent is None or o.parent not in live]
    if len(tops) == 1:
        return tops[0], "existing-root"

    root = bpy.data.objects.new(f"{role}_Root", None)
    bpy.context.collection.objects.link(root)
    for obj in tops:
        # keep_transform equivalent: preserve the world matrix across reparenting
        world = obj.matrix_world.copy()
        obj.parent = root
        obj.matrix_world = world
    # Reparenting leaves cached world matrices stale until the depsgraph runs.
    bpy.context.view_layer.update()
    return root, "created-root"


def apply_action(arm, action_name: str | None, frame_start: int, frame_end: int) -> bool:
    """Bind a named action to an armature. Returns False when it cannot be found.

    Matching is exact (case-insensitive) rather than fuzzy substring: a loose
    match silently binding the wrong action is worse than failing closed.
    """
    import bpy

    if not arm or not action_name:
        return False
    action = bpy.data.actions.get(action_name)
    if not action:
        wanted = action_name.lower()
        action = next((a for a in bpy.data.actions if a.name.lower() == wanted), None)
    if not action:
        return False
    if not arm.animation_data:
        arm.animation_data_create()
    arm.animation_data.action = action
    arm.animation_data.action_extrapolation = "HOLD"

    # An action shorter than the shot would otherwise freeze on its last pose for
    # the remainder of the render. Repeat it instead so the character stays alive.
    a_start, a_end = action.frame_range
    if (a_end - a_start) > 0 and (a_end - a_start) < (frame_end - frame_start):
        for fcurve in action.fcurves:
            if not any(m.type == "CYCLES" for m in fcurve.modifiers):
                fcurve.modifiers.new(type="CYCLES")
    return True


def apply_viseme_cues(mesh_obj, cues: list[dict], fps: int) -> None:
    if not mesh_obj or not mesh_obj.data.shape_keys:
        return
    keys = mesh_obj.data.shape_keys.key_blocks
    alias = {
        "REST": "viseme_REST",
        "A": "viseme_A",
        "E": "viseme_E",
        "I": "viseme_I",
        "O": "viseme_O",
        "U": "viseme_U",
        "MBP": "viseme_MBP",
        "M_B_P": "viseme_MBP",
        "FV": "viseme_FV",
        "F_V": "viseme_FV",
        "L": "viseme_L",
        "WQ": "viseme_WQ",
        "TH": "viseme_L",
    }
    for cue in cues:
        vis = str(cue.get("viseme") or cue.get("code") or "REST")
        key_name = alias.get(vis, vis if vis.startswith("viseme_") else f"viseme_{vis}")
        if key_name not in keys:
            continue
        start_ms = int(cue.get("startMs") or cue.get("start_ms") or 0)
        end_ms = int(cue.get("endMs") or cue.get("end_ms") or start_ms + 80)
        weight = float(cue.get("weight") or 1.0)
        f0 = max(1, int(round(start_ms / 1000 * fps)))
        f1 = max(f0 + 1, int(round(end_ms / 1000 * fps)))
        kb = keys[key_name]
        kb.value = 0.0
        kb.keyframe_insert(data_path="value", frame=max(1, f0 - 1))
        kb.value = weight
        kb.keyframe_insert(data_path="value", frame=f0)
        kb.value = weight
        kb.keyframe_insert(data_path="value", frame=f1)
        kb.value = 0.0
        kb.keyframe_insert(data_path="value", frame=f1 + 1)


def configure_camera(scene, preset: str, width: int, height: int) -> None:
    import bpy

    cam = scene.camera
    if not cam:
        cam_data = bpy.data.cameras.new("ProdCam")
        cam = bpy.data.objects.new("ProdCam", cam_data)
        bpy.context.collection.objects.link(cam)
        scene.camera = cam
    preset = (preset or "WIDE").upper()
    if preset in ("CLOSE_UP", "REACTION"):
        cam.location = (0.4, -3.2, 1.5)
        cam.rotation_euler = (math.radians(85), 0, math.radians(8))
        cam.data.lens = 50
    elif preset in ("PUSH_IN", "FOLLOW"):
        cam.location = (0, -6.5, 2.0)
        cam.rotation_euler = (math.radians(78), 0, 0)
        cam.data.lens = 35
        # simple push keyframes
        cam.keyframe_insert(data_path="location", frame=1)
        cam.location = (0, -4.8, 1.7)
        cam.keyframe_insert(data_path="location", frame=scene.frame_end)
    elif preset in ("TWO_SHOT", "MEDIUM"):
        cam.location = (0.2, -5.5, 1.8)
        cam.rotation_euler = (math.radians(80), 0, 0)
        cam.data.lens = 35
    else:  # WIDE / ESTABLISHING
        cam.location = (0, -8.0, 2.4)
        cam.rotation_euler = (math.radians(75), 0, 0)
        cam.data.lens = 28
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False


# The authoritative lighting layer. One named key/fill/rim rig per state, with an
# explicit world strength, so exposure is deterministic and never accumulates.
#
# Energies are tuned against measured frame statistics, not guessed. The first
# 1080p acceptance render measured mean luma 167-175, darkest pixel 50/255 and
# mean saturation 12.6/128 — milky and desaturated, because four appended blends
# stacked 8 lights and nothing was ever in shadow. Each state below keeps one
# bright key, a deliberately weak fill so the shadow side stays dark, a rim for
# separation, and a low world strength; combined with EEVEE-Next raytraced
# shadows and the AgX Punchy look this measures mean 111, darkest 12.7 and
# saturation 57.8 on the same shot.
LIGHTING_STATES: dict[str, dict] = {
    "DAY_SOFT": {
        "world": {"color": (0.42, 0.62, 0.85), "strength": 0.28},
        "look": "AgX - Punchy",
        "exposure": -2.2,
        "sky": {"color": (0.38, 0.62, 0.95), "strength": 1.6},
        "key": {"type": "SUN", "energy": 3.4, "location": (4.0, -5.0, 9.0), "rotation": (0.72, 0.12, 0.5)},
        "fill": {"type": "AREA", "energy": 4.0, "size": 6.0, "location": (-3.2, -4.6, 3.4)},
        "rim": {"type": "AREA", "energy": 7.0, "size": 3.0, "location": (1.6, 3.4, 3.6)},
    },
    "DAY_KEY": {
        "world": {"color": (0.40, 0.60, 0.84), "strength": 0.25},
        "look": "AgX - Punchy",
        "exposure": -2.2,
        "sky": {"color": (0.35, 0.60, 0.95), "strength": 1.6},
        "key": {"type": "SUN", "energy": 4.0, "location": (3.4, -4.4, 9.0), "rotation": (0.66, 0.1, 0.42)},
        "fill": {"type": "AREA", "energy": 3.0, "size": 5.0, "location": (-3.4, -4.2, 3.0)},
        "rim": {"type": "AREA", "energy": 8.0, "size": 2.6, "location": (1.2, 3.8, 4.0)},
    },
    "GOLDEN_HOUR": {
        "world": {"color": (0.52, 0.42, 0.32), "strength": 0.22},
        "look": "AgX - Punchy",
        "exposure": -2.0,
        "sky": {"color": (0.95, 0.55, 0.30), "strength": 1.4},
        "key": {"type": "SUN", "energy": 3.2, "location": (-5.5, -3.0, 3.2), "rotation": (1.18, 0.0, -0.75)},
        "fill": {"type": "AREA", "energy": 2.2, "size": 6.0, "location": (3.0, -4.0, 2.4)},
        "rim": {"type": "AREA", "energy": 9.0, "size": 2.4, "location": (2.2, 3.2, 3.2)},
    },
    "OVERCAST": {
        "world": {"color": (0.55, 0.58, 0.62), "strength": 0.45},
        "look": "AgX - Base Contrast",
        "exposure": -2.0,
        "sky": {"color": (0.68, 0.71, 0.75), "strength": 1.5},
        "key": {"type": "SUN", "energy": 1.6, "location": (2.0, -4.0, 10.0), "rotation": (0.5, 0.0, 0.2)},
        "fill": {"type": "AREA", "energy": 4.5, "size": 8.0, "location": (-2.0, -4.0, 4.0)},
        "rim": {"type": "AREA", "energy": 3.0, "size": 4.0, "location": (0.0, 3.6, 3.4)},
    },
}
DEFAULT_LIGHTING_STATE = "DAY_SOFT"
# Every light this layer owns carries this prefix, so re-running assembly
# replaces its own rig instead of stacking a second one.
DDP_LIGHT_PREFIX = "DDP_"


def resolve_lighting_state(requested: str | None) -> str:
    state = str(requested or "").strip().upper().replace("-", "_").replace(" ", "_")
    return state if state in LIGHTING_STATES else DEFAULT_LIGHTING_STATE


def apply_sky_emission(spec: dict) -> list[str]:
    """Make environment sky domes self-lit.

    A sky dome is a plain diffuse mesh, so its brightness otherwise depends on
    whichever lights happen to reach it: lowering the fill to get real shadows
    turned the meadow's sky navy and the whole shot read as dusk. Driving it from
    the lighting state keeps the sky bright and deterministic no matter how the
    key/fill/rim rig is tuned.
    """
    import bpy

    sky = spec.get("sky")
    if not sky:
        return []
    material = bpy.data.materials.get("DDP_Sky") or bpy.data.materials.new("DDP_Sky")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs[0].default_value = (*sky["color"], 1.0)
    emission.inputs[1].default_value = sky["strength"]
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(emission.outputs[0], out.inputs[0])

    applied = []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or "sky" not in obj.name.lower():
            continue
        obj.data.materials.clear()
        obj.data.materials.append(material)
        # The meadow's sky is a radius-40 dome that ENCLOSES the whole set,
        # including the lights. As a shadow caster it blocked the sun completely:
        # measured with raytraced shadows on, driving the key light from 8.5 to
        # 500 W/m2 changed mean frame luma by 0.01, because every ray was stopped
        # by the dome overhead. A background dome must never occlude the key.
        if hasattr(obj, "visible_shadow"):
            obj.visible_shadow = False
        applied.append(obj.name)
    return applied


def apply_lighting_state(scene, requested: str | None) -> dict:
    """Install exactly one deterministic key/fill/rim rig plus world strength."""
    import bpy

    state_name = resolve_lighting_state(requested)
    spec = LIGHTING_STATES[state_name]

    world = scene.world or bpy.data.worlds.new("DDP_World")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    bg = nodes.new(type="ShaderNodeBackground")
    bg.inputs[0].default_value = (*spec["world"]["color"], 1.0)
    bg.inputs[1].default_value = spec["world"]["strength"]
    out = nodes.new(type="ShaderNodeOutputWorld")
    links.new(bg.outputs[0], out.inputs[0])

    # Idempotent: clear any rig this layer previously created.
    for obj in [o for o in bpy.data.objects if o.type == "LIGHT" and o.name.startswith(DDP_LIGHT_PREFIX)]:
        bpy.data.objects.remove(obj, do_unlink=True)

    created = []
    for role in ("key", "fill", "rim"):
        cfg = spec[role]
        name = f"{DDP_LIGHT_PREFIX}{role.capitalize()}"
        light_data = bpy.data.lights.new(name=name, type=cfg["type"])
        light_data.energy = cfg["energy"]
        if cfg["type"] == "AREA" and "size" in cfg:
            light_data.size = cfg["size"]
        light_obj = bpy.data.objects.new(name, light_data)
        light_obj.location = cfg["location"]
        if "rotation" in cfg:
            light_obj.rotation_euler = cfg["rotation"]
        bpy.context.collection.objects.link(light_obj)
        created.append(name)

    # Filmic tone mapping. Without a look, AgX renders this palette flat and
    # desaturated, which is a large part of why the first render looked milky.
    scene.view_settings.exposure = float(spec.get("exposure", 0.0))
    look = spec.get("look") or "None"
    look_applied = None
    try:
        scene.view_settings.look = look
        look_applied = scene.view_settings.look
    except (TypeError, ValueError):  # look unavailable in this build's OCIO config
        look_applied = scene.view_settings.look

    sky_objects = apply_sky_emission(spec)

    total = [o.name for o in bpy.data.objects if o.type == "LIGHT"]
    return {
        "skyObjects": sky_objects,
        "lightingState": state_name,
        "requested": requested or None,
        "created": created,
        "activeLightCount": len(total),
        "activeLights": sorted(total),
        "worldStrength": spec["world"]["strength"],
        "look": look_applied,
        "lookRequested": look,
        "exposure": scene.view_settings.exposure,
        "viewTransform": scene.view_settings.view_transform,
    }


def parse_resolution(value: str) -> tuple[int, int]:
    w, h = value.lower().split("x")
    return int(w), int(h)


def main() -> None:
    import bpy

    parser = argparse.ArgumentParser(description="Assemble and render a production shot.")
    parser.add_argument("--scene-id", required=True)
    parser.add_argument(
        "--resolution",
        choices=["270x480", "360x640", "540x960", "720x1280", "1080x1920"],
        default="540x960",
    )
    parser.add_argument("--fps", type=int, choices=[24, 30, 60], default=30)
    parser.add_argument("--engine", choices=["EEVEE", "CYCLES"], default="EEVEE")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--assets-json", default="[]")
    parser.add_argument("--start-frame", type=int, default=1)
    parser.add_argument("--end-frame", type=int, default=0)
    parser.add_argument("--samples", type=int, default=24)
    parser.add_argument("--camera-preset", default="WIDE")
    parser.add_argument("--shot-meta-json", default="{}")
    args = parse_blender_args(parser)

    assets = json.loads(args.assets_json)
    if not isinstance(assets, list):
        emit("INVALID_ARGUMENT", "assets-json must decode to a list.")
        raise SystemExit(2)

    missing = []
    for asset in assets:
        local_path = asset.get("localPath") if isinstance(asset, dict) else None
        role = asset.get("role", "asset") if isinstance(asset, dict) else "asset"
        try:
            require_asset(local_path, role)
        except SystemExit:
            missing.append({"role": role, "path": local_path})
    if missing:
        emit("MISSING_ASSET", "One or more scene assets are missing.", missing=missing)
        raise SystemExit(2)

    shot_meta = json.loads(args.shot_meta_json) if args.shot_meta_json else {}
    width, height = parse_resolution(args.resolution)
    fps = args.fps
    end_frame = args.end_frame if args.end_frame > 0 else int(shot_meta.get("endFrame") or 45)
    start_frame = args.start_frame

    built = build_scene(
        assets=assets,
        shot_meta=shot_meta,
        width=width,
        height=height,
        fps=fps,
        start_frame=start_frame,
        end_frame=end_frame,
        camera_preset=args.camera_preset or shot_meta.get("cameraPreset") or "WIDE",
        engine=args.engine,
        samples=args.samples,
    )
    scene = bpy.context.scene
    lighting = built["lighting"]
    stripped = built["stripped"]
    roots = built["placementRoots"]
    applied_actions = built["appliedActions"]
    imported_by_role = built["importedByRole"]

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(out_dir / "frame_")

    emit(
        "OK",
        "Scene assembled; beginning EEVEE frame render.",
        sceneId=args.scene_id,
        resolution=args.resolution,
        fps=fps,
        engine=scene.render.engine,
        frames=[start_frame, end_frame],
        roles=sorted(imported_by_role.keys()),
        lighting=lighting,
        strippedFromAssets=stripped,
        placementRoots=roots,
        appliedActions=applied_actions,
    )
    bpy.ops.render.render(animation=True)
    frame_count = len(list(out_dir.glob("frame_*.png")))
    meta = {
        "ok": True,
        "sceneId": args.scene_id,
        "resolution": args.resolution,
        "fps": fps,
        "engine": scene.render.engine,
        "frameCount": frame_count,
        "outputDir": str(out_dir),
        "lighting": lighting,
        "strippedFromAssets": stripped,
        "placementRoots": roots,
        "appliedActions": applied_actions,
    }
    (out_dir / "assemble_meta.json").write_text(json.dumps(meta, indent=2))
    emit("RENDER_OK", "Frames rendered.", **meta)


def build_scene(
    assets: list,
    shot_meta: dict,
    width: int,
    height: int,
    fps: int,
    start_frame: int,
    end_frame: int,
    camera_preset: str,
    engine: str = "EEVEE",
    samples: int = 24,
) -> dict:
    """Construct the production shot. Shared by the renderer and the QC gates."""
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = fps
    scene.frame_start = start_frame
    scene.frame_end = end_frame

    imported_by_role: dict[str, list] = {}
    for asset in assets:
        role = str(asset.get("id") or asset.get("role") or "other")
        local_path = asset["localPath"]
        objs = append_object(local_path)
        imported_by_role.setdefault(role, []).extend(objs)

    keep_imported = bool(shot_meta.get("keepImportedLights"))
    stripped = {"lights": [], "cameras": []}
    if not keep_imported:
        for role in list(imported_by_role):
            result = strip_imported_lights_and_cameras(imported_by_role[role])
            stripped["lights"].extend(result["lights"])
            stripped["cameras"].extend(result["cameras"])
            imported_by_role[role] = [
                bpy.data.objects[name] for name in result["survivors"] if name in bpy.data.objects
            ]

    # Position characters if metadata provides offsets
    placements = shot_meta.get("placements") or {}
    missing_actions = []
    applied_actions = {}
    roots = {}
    for role, objs in imported_by_role.items():
        arm = find_armature(objs)
        target, root_kind = placement_root(role, objs)
        if not target:
            continue
        roots[role] = {"object": target.name, "kind": root_kind}
        place = placements.get(role) or {}
        if "location" in place:
            target.location = tuple(place["location"])
        if "rotation" in place:
            target.rotation_euler = tuple(place["rotation"])
        action = place.get("action") or (shot_meta.get("actions") or {}).get(role)
        if action:
            if apply_action(arm, action, start_frame, end_frame):
                applied_actions[role] = action
            else:
                missing_actions.append({"role": role, "action": action})
        mesh = next((o for o in objs if o.type == "MESH" and "Character" in o.name), None)
        if mesh is None:
            mesh = next((o for o in objs if o.type == "MESH"), None)
        cues = (shot_meta.get("lipSync") or {}).get(role) or []
        if mesh and cues:
            apply_viseme_cues(mesh, cues, fps)

    # Fail closed: silently dropping a requested action is what let the first
    # acceptance render ship with a completely motionless goat.
    if missing_actions:
        emit(
            "MISSING_ACTION",
            "One or more requested actions do not exist in the supplied assets.",
            missing=missing_actions,
            available=sorted(a.name for a in bpy.data.actions),
        )
        raise SystemExit(2)

    lighting = apply_lighting_state(scene, shot_meta.get("lightingState"))
    configure_camera(scene, camera_preset, width, height)
    if str(engine).upper() == "EEVEE":
        set_eevee(scene, samples)
    else:
        scene.render.engine = "CYCLES"

    return {
        "importedByRole": imported_by_role,
        "lighting": lighting,
        "stripped": stripped,
        "placementRoots": roots,
        "appliedActions": applied_actions,
    }


if __name__ == "__main__":
    main()
