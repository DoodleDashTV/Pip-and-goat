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
        # EEVEE-Next traces shadows with very few rays and steps by default,
        # which speckles curved low-poly surfaces with shadow acne — visible on
        # the goat's flank as dirt that no amount of extra render samples
        # removes, because it is a bias artefact rather than noise.
        #
        # 2 rays / 8 steps was enough while the sun was weak. With a key strong
        # enough to throw a readable ground shadow, the same artefact returns as
        # dark stipple across Pip's belly, where a wing sits a couple of
        # centimetres from the body. Measured against a 48-sample reference, the
        # error inside Pip's silhouette falls from 4.09 RMS (60.6 peak) at 2/8 to
        # 2.06 RMS (16.3 peak) at 4/16, and neither raising render samples nor
        # pushing the shadow caster deeper inside the mesh fixes it: a deeper
        # caster self-intersects and stamps craters on the head instead. The
        # frame costs about 73% more to render, which is the price of the shadow.
        for attr, value in (("shadow_ray_count", 4), ("shadow_step_count", 16)):
            if hasattr(scene.eevee, attr):
                setattr(scene.eevee, attr, value)


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

    # Freshly appended objects have no evaluated transform yet, and reading
    # matrix_world in that state hands back a matrix with the object's scale
    # missing. Baking that into the reparent quietly reset every scaled object in
    # the meadow to scale 1: the sky dome inflated from a squashed dome to a full
    # sphere, and the flat dirt path became the 1 m cube that stood in the middle
    # of the acceptance render looking like an untextured slab.
    bpy.context.view_layer.update()

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


#: How far inside its own surface a character's shadow caster sits.
SHADOW_PROXY_SHRINK = 0.022
#: Suffix every shadow caster carries, so other tools can tell proxies apart
#: from the geometry the camera actually sees.
SHADOW_PROXY_SUFFIX = "_ShadowProxy"


def install_shadow_proxy(objects) -> list[str]:
    """Cast a character's shadow from a slightly shrunken copy of itself.

    The founding characters are three dozen interpenetrating primitives welded
    into one mesh, so wherever the head passes through the neck or an ear through
    the skull, two surfaces sit within a shadow-map texel of each other and the
    sun stipples the white fur with self-shadow acne. It reads as dirt, it is
    fixed to the model, and no shadow setting removes it: it survived ray and
    step counts, filter radius, jitter, resolution scale, bias, high bit depth
    and a hard-edged sun, and disappeared only when shadows were switched off
    entirely.

    Switching shadows off is not an option — without them the cast loses contact
    with the ground and looks pasted on. So the visible mesh stops casting and an
    invisible copy, pushed ``SHADOW_PROXY_SHRINK`` inside its own surface, casts
    instead. The proxy can never shadow the surface it sits inside, while the
    silhouette it throws on the ground is the character's own, a couple of
    centimetres smaller.
    """
    import bpy

    created = []
    for obj in [o for o in objects if o.type == "MESH" and o.name in bpy.data.objects]:
        if obj.name.endswith(SHADOW_PROXY_SUFFIX):
            continue
        proxy = obj.copy()  # shares mesh data, carries the armature modifier
        proxy.name = f"{obj.name}{SHADOW_PROXY_SUFFIX}"
        bpy.context.collection.objects.link(proxy)
        if obj.parent is not None:
            proxy.parent = obj.parent
            proxy.matrix_parent_inverse = obj.matrix_parent_inverse.copy()
        proxy.matrix_world = obj.matrix_world.copy()
        shrink = proxy.modifiers.new("DDP_ShadowShrink", "DISPLACE")
        shrink.mid_level = 0.0
        shrink.strength = -SHADOW_PROXY_SHRINK
        proxy.visible_camera = False
        for attr in ("visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter"):
            if hasattr(proxy, attr):
                setattr(proxy, attr, False)
        proxy.visible_shadow = True
        obj.visible_shadow = False
        created.append(proxy.name)
    return created


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
# Energies are tuned against frame statistics measured on the bytes stored in the
# rendered PNG (see scripts/assets/png_io.py). Earlier tunings were steered by a
# loader that encoded already-encoded sRGB a second time and so over-reported
# brightness by ~1.77x: the rig this replaces measured "mean luma 147-154" but
# really stored 86-88/255, a third of range, which reads as overcast.
#
# What the numbers below are for:
#   * A SUN key at a widened angle, so the terminator is soft enough for a
#     children's short instead of stamping an ear onto a head as a hard patch.
#     It is strong enough to be the source of the picture: the sunlit trail
#     carries the top of the tonal range and every object throws a shadow the
#     audience can see, which is what puts the cast on the ground.
#   * An AREA fill from camera left at a real level. AgX crushed everything the
#     key missed toward black, and the old fill was two orders of magnitude too
#     weak to lift it; the fill raises the darkest 1% of the frame off the floor.
#   * A SPOT rim behind and above the characters, aimed at them. This is what
#     separates white fur from a green field. It was an area light until it was
#     measured: an area light behind the characters lights the field behind them
#     just as well, and pulling it close enough to rim them poured a bright pool
#     onto the grass they stand on. The ground around the goat measured 15 luma
#     BRIGHTER than open grass, its lit side sat 2 luma above the grass touching
#     its silhouette, and no ground shadow could read against the pool. Confining
#     the same light to a cone put the goat 86 luma above the grass, put 8 luma of
#     contact shadow under both characters, and cost the frame nothing it had any
#     business keeping.
#   * A low world strength, so nothing is lit by an untracked ambient term.
#   * "Khronos PBR Neutral" rather than AgX. AgX desaturates as it rolls off, so
#     every attempt to reach a 45-50% mean under it either washed the sky white
#     or tripped the saturation floor; PBR Neutral holds 60/128 mean saturation
#     at the same exposure.
#
# DAY_KEY is the measured reference state (it is what the acceptance shot uses)
# and lands mean luma 48-49% of range, p01 ~48, p99 209-218, zero clipped
# highlights, mean saturation ~62/128, both characters 75-87 luma above the grass
# touching them and 8-16 luma of shadow on the ground under them. The others
# follow the same shape and scale; only DAY_KEY is gated.
LIGHTING_STATES: dict[str, dict] = {
    "DAY_SOFT": {
        "world": {"color": (0.42, 0.62, 0.85), "strength": 0.20},
        "viewTransform": "Khronos PBR Neutral",
        "look": "None",
        "exposure": -3.1,
        "sky": {
            "color": (0.18, 0.47, 0.93),
            "midColor": (0.36, 0.64, 0.96),
            "horizonColor": (0.74, 0.86, 0.98),
            "horizonAt": 0.46,
            "midAt": 0.60,
            "zenithAt": 0.90,
            "strength": 2.4,
        },
        "key": {
            "type": "SUN",
            "energy": 19.0,
            "angle": 0.20,
            "location": (4.0, -5.0, 9.0),
            "rotation": (0.72, 0.12, 0.5),
        },
        "fill": {"type": "AREA", "energy": 165.0, "size": 6.0, "location": (-3.2, -4.6, 3.4)},
        "rim": {
            "type": "SPOT",
            "energy": 800.0,
            "spotSize": 0.85,
            "spotBlend": 0.55,
            "radius": 0.5,
            "location": (0.7, 1.4, 2.9),
            "target": (0.05, -1.5, 0.55),
        },
    },
    "DAY_KEY": {
        "world": {"color": (0.40, 0.60, 0.84), "strength": 0.18},
        "viewTransform": "Khronos PBR Neutral",
        "look": "None",
        "exposure": -3.1,
        # Measured on the widest framing, which shows the most sky and is the
        # worst case for saturation: a near-white horizon band looks like haze but
        # costs 3 points of frame saturation and 5% of mean luma, so the ramp stays
        # a saturated blue that only lightens toward the horizon.
        #
        # Sky strength is also how the frame mean is centred. The sky covers about
        # 40% of this framing and sits below the frame mean, so it moves the mean
        # without touching the top of the range: dropping it from 3.2 to 2.6 took
        # mean luma from 49.3% to 48.1% of range and gained 1.7 points of frame
        # saturation, while the 99th percentile did not move at all.
        "sky": {
            "color": (0.11, 0.36, 0.90),
            "midColor": (0.22, 0.52, 0.95),
            "horizonColor": (0.40, 0.68, 0.98),
            "horizonAt": 0.46,
            "midAt": 0.60,
            "zenithAt": 0.90,
            "strength": 2.6,
        },
        # Sunlight, at the level where it does the job a sun does. At 9 W/m2 the
        # field was lit mostly by the rim and nothing cast a shadow worth seeing:
        # the ground under the goat's hooves darkened by 1.9 luma over 7% of the
        # area, against 9.2 over 31% at the base of the tree. Raising the sun is
        # what makes the trail the brightest large surface in frame, and it is why
        # the shadow sample budget in set_eevee had to go up with it.
        "key": {
            "type": "SUN",
            "energy": 25.0,
            "angle": 0.14,
            "location": (3.4, -4.4, 9.0),
            "rotation": (0.66, 0.1, 0.42),
        },
        "fill": {"type": "AREA", "energy": 130.0, "size": 5.0, "location": (-3.4, -4.2, 3.0)},
        # A cone from behind and above, aimed between the characters at the
        # height of their shoulders, wide enough to hold both of them and no more.
        "rim": {
            "type": "SPOT",
            "energy": 900.0,
            "spotSize": 0.72,
            "spotBlend": 0.4,
            "radius": 0.4,
            "location": (0.6, 1.2, 2.8),
            "target": (0.05, -1.5, 0.55),
        },
    },
    "GOLDEN_HOUR": {
        "world": {"color": (0.52, 0.42, 0.32), "strength": 0.16},
        "viewTransform": "Khronos PBR Neutral",
        "look": "None",
        "exposure": -3.0,
        "sky": {
            "color": (0.72, 0.40, 0.30),
            "midColor": (0.95, 0.52, 0.24),
            "horizonColor": (1.0, 0.78, 0.46),
            "horizonAt": 0.46,
            "midAt": 0.60,
            "zenithAt": 0.90,
            "strength": 2.2,
        },
        "key": {
            "type": "SUN",
            "energy": 20.0,
            "angle": 0.16,
            "location": (-5.5, -3.0, 3.2),
            "rotation": (1.18, 0.0, -0.75),
        },
        "fill": {"type": "AREA", "energy": 100.0, "size": 6.0, "location": (3.0, -4.0, 2.4)},
        "rim": {
            "type": "SPOT",
            "energy": 950.0,
            "spotSize": 0.78,
            "spotBlend": 0.45,
            "radius": 0.45,
            "location": (0.8, 1.3, 2.7),
            "target": (0.05, -1.5, 0.55),
        },
    },
    "OVERCAST": {
        "world": {"color": (0.55, 0.58, 0.62), "strength": 0.34},
        "viewTransform": "Khronos PBR Neutral",
        "look": "None",
        "exposure": -2.9,
        "sky": {
            "color": (0.60, 0.66, 0.74),
            "midColor": (0.70, 0.75, 0.80),
            "horizonColor": (0.86, 0.88, 0.90),
            "horizonAt": 0.46,
            "midAt": 0.60,
            "zenithAt": 0.90,
            "strength": 2.4,
        },
        "key": {
            "type": "SUN",
            "energy": 9.5,
            "angle": 0.35,
            "location": (2.0, -4.0, 10.0),
            "rotation": (0.5, 0.0, 0.2),
        },
        "fill": {"type": "AREA", "energy": 210.0, "size": 8.0, "location": (-2.0, -4.0, 4.0)},
        # Overcast has no sun to rim against, so the cone is wide and gentle: just
        # enough edge to keep the characters off the background.
        "rim": {
            "type": "SPOT",
            "energy": 400.0,
            "spotSize": 1.05,
            "spotBlend": 0.7,
            "radius": 0.8,
            "location": (0.4, 1.6, 3.0),
            "target": (0.05, -1.5, 0.55),
        },
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
    emission.inputs[1].default_value = sky["strength"]
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(emission.outputs[0], out.inputs[0])

    # A single flat colour across the whole dome is the giveaway of an unlit
    # background: real sky lightens and warms toward the horizon, and that
    # gradient is what separates a green field from the air above it.
    horizon = sky.get("horizonColor")
    if horizon:
        coords = nodes.new("ShaderNodeTexCoord")
        split = nodes.new("ShaderNodeSeparateXYZ")
        ramp = nodes.new("ShaderNodeValToRGB")
        links.new(coords.outputs["Generated"], split.inputs[0])
        links.new(split.outputs["Z"], ramp.inputs[0])
        elements = ramp.color_ramp.elements
        elements[0].position = float(sky.get("horizonAt", 0.48))
        elements[0].color = (*horizon, 1.0)
        elements[1].position = float(sky.get("zenithAt", 0.92))
        elements[1].color = (*sky["color"], 1.0)
        mid = ramp.color_ramp.elements.new(float(sky.get("midAt", 0.62)))
        mid.color = (*sky.get("midColor", sky["color"]), 1.0)
        links.new(ramp.outputs["Color"], emission.inputs[0])
    else:
        emission.inputs[0].default_value = (*sky["color"], 1.0)

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
        # A sun at its default 0.5-degree angle throws razor-sharp shadows, so an
        # ear reads as a painted patch on the head. Widening it softens the
        # terminator into something a children's short can use.
        if cfg["type"] == "SUN" and "angle" in cfg:
            light_data.angle = cfg["angle"]
        # A cone, for a rim that has to stay on the characters. An area light
        # behind them lights whatever else is behind them just as well, so the
        # field it spills onto rises with the edge it is meant to separate.
        if cfg["type"] == "SPOT":
            if "spotSize" in cfg:
                light_data.spot_size = cfg["spotSize"]
            if "spotBlend" in cfg:
                light_data.spot_blend = cfg["spotBlend"]
            if "radius" in cfg:
                light_data.shadow_soft_size = cfg["radius"]
        # Only the key casts. The characters and props are joined primitives, so
        # spheres intersect inside the silhouette; every extra shadow map stipples
        # those intersections with self-shadow acne that reads as dirt on white
        # fur and survives any number of render samples. Fill and rim stand in for
        # bounce light, which does not cast in the first place.
        if hasattr(light_data, "use_shadow"):
            light_data.use_shadow = bool(cfg.get("shadow", role == "key"))
        if hasattr(light_data, "shadow_buffer_bias") and "shadowBias" in cfg:
            light_data.shadow_buffer_bias = cfg["shadowBias"]
        light_obj = bpy.data.objects.new(name, light_data)
        light_obj.location = cfg["location"]
        if "rotation" in cfg:
            light_obj.rotation_euler = cfg["rotation"]
        # Aiming beats hand-written Euler angles for anything that has to hit a
        # specific place in the set: move the light and it still points at the
        # characters, so a tuning pass cannot silently leave it facing the field.
        if "target" in cfg:
            import mathutils

            direction = mathutils.Vector(cfg["target"]) - mathutils.Vector(cfg["location"])
            light_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        bpy.context.collection.objects.link(light_obj)
        created.append(name)

    # Tone mapping is part of the lighting state, not a default inherited from
    # whatever Blender happens to ship: the view transform decides how much
    # colour survives, and leaving it implicit is how a shot ends up graded
    # differently from the one that was approved.
    scene.view_settings.exposure = float(spec.get("exposure", 0.0))
    view_transform = spec.get("viewTransform")
    if view_transform:
        try:
            scene.view_settings.view_transform = view_transform
        except (TypeError, ValueError):  # not in this build's OCIO config
            pass
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


# Surface response, applied by the shot rather than baked into each asset so the
# whole cast and set stay consistent and one edit fixes all of them.
#
# The founding assets were authored as flat matte shaders at roughness 0.4-0.85
# with the specular input near zero, which is why the acceptance render read as
# untextured plastic: nothing anywhere in frame returned a highlight, so there
# was no cue for shape or material. These values are deliberately restrained —
# eyes and wet surfaces glint, fur and foliage stay soft — and every entry is
# keyed on a substring of the material name.
MATERIAL_POLISH: list[tuple[tuple[str, ...], dict]] = [
    (("catchlight",), {"roughness": 0.08, "specular": 1.0, "emission": (1.0, 1.0, 1.0), "emissionStrength": 2.6}),
    (("pupil",), {"roughness": 0.12, "specular": 0.85}),
    (("iris",), {"roughness": 0.16, "specular": 0.8}),
    (("eyewhite",), {"roughness": 0.22, "specular": 0.7}),
    (("nose", "beak"), {"roughness": 0.30, "specular": 0.6}),
    (("horn", "hoof"), {"roughness": 0.42, "specular": 0.45}),
    (("tag", "charm"), {"roughness": 0.28, "specular": 0.7}),
    (("collar", "backpack", "pouch"), {"roughness": 0.55, "specular": 0.35}),
    (("comb", "brow", "ear"), {"roughness": 0.52, "specular": 0.35}),
    (("body", "feet"), {"roughness": 0.62, "specular": 0.32}),
    # Bump scales are in object-space cycles per metre: paper fibre is sub-
    # millimetre, dirt and rock are a few centimetres.
    (("mappaper", "mapfold"), {"roughness": 0.66, "specular": 0.28, "bump": (260.0, 0.06)}),
    (("mapwater",), {"roughness": 0.18, "specular": 0.9}),
    (("mapink", "mapcoast", "maptrail", "mapaccent"), {"roughness": 0.48, "specular": 0.35}),
    (("mapstone", "bark"), {"roughness": 0.82, "specular": 0.18, "bump": (18.0, 0.28)}),
    (("grass", "path"), {"roughness": 0.88, "specular": 0.16, "bump": (22.0, 0.14)}),
    (("leaf",), {"roughness": 0.74, "specular": 0.22, "bump": (14.0, 0.16)}),
    (("flower",), {"roughness": 0.45, "specular": 0.4}),
]


def _principled(material):
    if not material.use_nodes:
        return None
    return next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)


def _set_input(node, names: tuple[str, ...], value) -> bool:
    for name in names:
        if name in node.inputs:
            node.inputs[name].default_value = value
            return True
    return False


def _add_bump(material, bsdf, scale: float, strength: float) -> None:
    """Break up a flat shader with fine procedural relief.

    Cheap in EEVEE and it is what stops grass, paper and rock from reading as
    coloured plastic under a highlight.

    The noise is driven from object coordinates, not the default generated ones.
    Generated coordinates normalise to each object's bounding box, so the same
    noise stretched along whatever axis an object happened to be longest: on the
    dirt path and the map's paper it drew centimetre-wide streaks down the length
    of the mesh and both read as varnished wood at full resolution.
    """
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    if any(n.name == "DDP_Bump" for n in nodes):
        return
    coords = nodes.new("ShaderNodeTexCoord")
    coords.name = "DDP_BumpCoords"
    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = "DDP_BumpNoise"
    noise.inputs["Scale"].default_value = scale
    links.new(coords.outputs["Object"], noise.inputs["Vector"])
    if "Detail" in noise.inputs:
        noise.inputs["Detail"].default_value = 4.0
    bump = nodes.new("ShaderNodeBump")
    bump.name = "DDP_Bump"
    bump.inputs["Strength"].default_value = strength
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])


def apply_material_polish() -> dict:
    """Give every material a deliberate, restrained surface response."""
    import bpy

    touched: dict[str, str] = {}
    for material in bpy.data.materials:
        if material.name.startswith("DDP_"):
            continue  # owned by the lighting layer
        bsdf = _principled(material)
        if bsdf is None:
            continue
        lowered = material.name.lower()
        spec = next((cfg for keys, cfg in MATERIAL_POLISH if any(k in lowered for k in keys)), None)
        if spec is None:
            continue
        _set_input(bsdf, ("Roughness",), spec["roughness"])
        _set_input(bsdf, ("Specular IOR Level", "Specular"), spec["specular"])
        if "emission" in spec:
            _set_input(bsdf, ("Emission Color", "Emission"), (*spec["emission"], 1.0))
            _set_input(bsdf, ("Emission Strength",), spec["emissionStrength"])
        if "bump" in spec:
            _add_bump(material, bsdf, *spec["bump"])
        touched[material.name] = f"roughness={spec['roughness']} specular={spec['specular']}" + (
            " +bump" if "bump" in spec else ""
        ) + (" +emission" if "emission" in spec else "")
    return {"count": len(touched), "materials": touched}


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
    shadow_proxies: list[str] = []
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
        # Only the characters need this: they are the assets built from stacked
        # primitives, and they are the ones the audience looks at.
        if arm is not None:
            shadow_proxies.extend(install_shadow_proxy(objs))

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
    materials = apply_material_polish()
    configure_camera(scene, camera_preset, width, height)
    if str(engine).upper() == "EEVEE":
        set_eevee(scene, samples)
    else:
        scene.render.engine = "CYCLES"

    return {
        "importedByRole": imported_by_role,
        "lighting": lighting,
        "materials": materials,
        "shadowProxies": shadow_proxies,
        "stripped": stripped,
        "placementRoots": roots,
        "appliedActions": applied_actions,
    }


if __name__ == "__main__":
    main()
