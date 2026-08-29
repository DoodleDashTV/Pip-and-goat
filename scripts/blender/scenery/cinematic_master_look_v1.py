"""TivvleJoy cinematic master look (Blender 4.2). Lighting, atmosphere, finish.

Does not rebuild scenery. Does not move Camera C. Does not change the
locked water architecture or TJ_LouisFaceFill.
"""
from __future__ import annotations

import json
import math

import bpy
from mathutils import Vector


LOUIS_FILL_NAME = "TJ_LouisFaceFill"
# V42 lock. Do not change energy, location, or color.
LOUIS_FILL_LOCK = {
    "energy": 260.0,
    "location": (1.0, 24.0, 15.0),
    "color": (1.0, 0.90, 0.78),
}


def _log(event: str, **payload) -> None:
    print(json.dumps({"event": event, **payload}), flush=True)


def apply_cinematic_daylight() -> dict:
    """Motivated late-morning sun. Open crushed shadows without studio rims."""
    changed = {}
    sun = bpy.data.objects.get("TJ_KeySun")
    if sun and sun.type == "LIGHT":
        sun.data.energy = 3.55
        sun.data.angle = math.radians(7.2)
        sun.rotation_euler = (math.radians(44.0), math.radians(12.0), math.radians(42.0))
        if hasattr(sun.data, "color"):
            sun.data.color = (1.0, 0.94, 0.80)
        changed["sun"] = {"energy": 3.55, "angleDeg": 7.2, "eulerDeg": [44.0, 12.0, 42.0]}
    sky = bpy.data.objects.get("TJ_SkyFill")
    if sky and sky.type == "LIGHT":
        sky.data.energy = 520.0
        sky.data.size = 120.0
        sky.location = (2.0, -8.0, 62.0)
        if hasattr(sky.data, "color"):
            sky.data.color = (0.86, 0.90, 0.98)
        changed["skyFill"] = 520.0
    bounce = bpy.data.objects.get("TJ_GroundBounce")
    if bounce and bounce.type == "LIGHT":
        bounce.data.energy = 520.0
        bounce.data.size = 52.0
        bounce.location = (1.0, -6.0, 1.15)
        if hasattr(bounce.data, "color"):
            bounce.data.color = (1.0, 0.84, 0.60)
        changed["groundBounce"] = 520.0
    forest = bpy.data.objects.get("TJ_ForestFill")
    if forest and forest.type == "LIGHT":
        forest.data.energy = 240.0
        forest.data.size = 46.0
        if hasattr(forest.data, "color"):
            forest.data.color = (0.96, 0.88, 0.72)
        changed["forestFill"] = 240.0
    creek = bpy.data.objects.get("TJ_CreekFill")
    if creek and creek.type == "LIGHT":
        # Soft warm bank bounce. Do not teal-wash the locked water.
        creek.data.energy = 90.0
        creek.data.size = 30.0
        creek.location = (0.4, -12.2, 1.05)
        if hasattr(creek.data, "color"):
            creek.data.color = (0.82, 0.80, 0.72)
        changed["creekFill"] = 90.0
    louis = bpy.data.objects.get(LOUIS_FILL_NAME)
    if louis and louis.type == "LIGHT":
        louis.data.energy = LOUIS_FILL_LOCK["energy"]
        louis.location = Vector(LOUIS_FILL_LOCK["location"])
        if hasattr(louis.data, "color"):
            louis.data.color = LOUIS_FILL_LOCK["color"]
        changed["louisFillLocked"] = True
    _log("cinematic_daylight_applied", **changed)
    return changed


def apply_world_atmosphere() -> dict:
    """Distance haze in the world volume. Foreground stays readable."""
    world = bpy.context.scene.world
    if world is None or world.node_tree is None:
        return {"mode": "missing_world"}
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    out = next((node for node in nodes if node.type == "OUTPUT_WORLD"), None)
    if out is None:
        return {"mode": "missing_output"}
    for node in list(nodes):
        if str(node.name).startswith("TJ_ATMO_"):
            nodes.remove(node)
    # Volume scatter in this valley eats the creek. Aerial depth is mist-only.
    if "Volume" in out.inputs:
        for link in list(out.inputs["Volume"].links):
            links.remove(link)
    if hasattr(world, "mist_settings"):
        world.mist_settings.use_mist = True
        # Louis sits ~45 m from Camera C. A 78 m depth left the range
        # almost clear. Start after the creek, finish across the peaks.
        world.mist_settings.start = 12.0
        world.mist_settings.depth = 38.0
        world.mist_settings.falloff = "QUADRATIC"
    view = bpy.context.scene.view_layers[0]
    if hasattr(view, "use_pass_mist"):
        view.use_pass_mist = True
    _log("cinematic_atmosphere_applied", density=0.0, mistStart=12.0, mistDepth=38.0)
    return {"mode": "mist_only", "density": 0.0}


def apply_foliage_transmission() -> int:
    """Gentle leaf/needle transmission. No neon edges."""
    touched = 0
    keys = ("leaf", "needle", "pine", "spruce", "fir", "grass", "foliage", "branch")
    skip = ("water", "river", "window", "void", "plug", "rock", "stone", "cabin")
    for mat in bpy.data.materials:
        if mat is None or not mat.use_nodes or mat.node_tree is None:
            continue
        name = (mat.name or "").lower()
        if any(word in name for word in skip):
            continue
        if not any(word in name for word in keys):
            continue
        if any(node.name.startswith("TJ_FOLIAGE_") for node in mat.node_tree.nodes):
            continue
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        out = next((node for node in nodes if node.type == "OUTPUT_MATERIAL"), None)
        surface = out.inputs["Surface"].links[0].from_socket if out and out.inputs["Surface"].links else None
        if out is None or surface is None:
            continue
        translucent = nodes.new("ShaderNodeBsdfTranslucent")
        translucent.name = "TJ_FOLIAGE_Translucent"
        if "Color" in translucent.inputs:
            translucent.inputs["Color"].default_value = (0.22, 0.34, 0.12, 1.0)
        mix = nodes.new("ShaderNodeMixShader")
        mix.name = "TJ_FOLIAGE_Mix"
        mix.inputs[0].default_value = 0.13
        links.new(surface, mix.inputs[1])
        links.new(translucent.outputs["BSDF"], mix.inputs[2])
        for link in list(out.inputs["Surface"].links):
            links.remove(link)
        links.new(mix.outputs["Shader"], out.inputs["Surface"])
        touched += 1
    _log("cinematic_foliage_transmission", materials=touched)
    return touched


def apply_material_cohesion() -> dict:
    """Pull purchased packs toward one late-morning valley, not three catalogs."""
    notes = {}
    meadow = bpy.data.materials.get("TJ_CinematicValleyMeadow")
    if meadow and meadow.node_tree:
        for node in meadow.node_tree.nodes:
            if node.type == "VALTORGB":
                # Keep grass green, slightly warmer and less lime.
                for element in node.color_ramp.elements:
                    col = list(element.color)
                    if col[1] > col[0] + 0.04:
                        element.color = (
                            min(1.0, col[0] * 1.08 + 0.01),
                            min(1.0, col[1] * 0.92),
                            min(1.0, col[2] * 0.82),
                            col[3],
                        )
        notes["meadow"] = "warmed"
    stone = bpy.data.materials.get("TJ_WetStone")
    if stone and stone.node_tree:
        body = next((node for node in stone.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if body and "Roughness" in body.inputs:
            body.inputs["Roughness"].default_value = 0.42
        notes["rock"] = "micro-roughness 0.42"
    _log("cinematic_material_cohesion", **notes)
    return notes


def apply_hdri_cinematic_balance() -> dict:
    """Keep the water lock. Put painted clouds in the SHOT_02 sky and de-teal reflections."""
    world = bpy.context.scene.world
    if world is None or world.node_tree is None:
        return {"mode": "missing_world"}
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    env = next(
        (node for node in nodes if node.type == "TEX_ENVIRONMENT" and not str(node.name).startswith("TJ_HDRI_")),
        None,
    )
    if env is not None and "Vector" in env.inputs and not env.inputs["Vector"].links:
        tex = nodes.new("ShaderNodeTexCoord")
        tex.name = "TJ_ATMO_CamCoord"
        mapping = nodes.new("ShaderNodeMapping")
        mapping.name = "TJ_ATMO_CamMap"
        mapping.inputs["Rotation"].default_value = (0.0, 0.0, 1.05)
        links.new(tex.outputs["Generated"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], env.inputs["Vector"])
    bg = next(
        (node for node in nodes if node.type == "BACKGROUND" and not str(node.name).startswith("TJ_HDRI_")),
        None,
    )
    if bg is not None and "Strength" in bg.inputs:
        bg.inputs["Strength"].default_value = 1.28
    dim = nodes.get("TJ_HDRI_Dim")
    if dim is not None:
        if "Color2" in dim.inputs:
            dim.inputs["Color2"].default_value = (0.30, 0.30, 0.28, 1.0)
        if "Fac" in dim.inputs:
            dim.inputs["Fac"].default_value = 0.18
    mul = nodes.get("TJ_HDRI_Mul")
    if mul is not None and "Color2" in mul.inputs:
        mul.inputs["Color2"].default_value = (0.62, 0.58, 0.50, 1.0)
    refl_map = nodes.get("TJ_HDRI_ReflMap")
    if refl_map is not None and "Rotation" in refl_map.inputs:
        refl_map.inputs["Rotation"].default_value = (0.0, 0.0, 0.48)
    _log("cinematic_hdri_balance", cameraRotationZ=1.05, reflectionRotationZ=0.48, strength=1.28)
    return {"cameraRotationZ": 1.05, "reflectionRotationZ": 0.48, "strength": 1.28}


def _lift_shadow_curve(curves_node) -> bool:
    mapping = getattr(curves_node, "mapping", None)
    if mapping is None or not getattr(mapping, "curves", None):
        return False
    combined = mapping.curves[0]
    combined.points[0].location = (0.0, 0.05)
    combined.points[-1].location = (1.0, 0.98)
    if len(combined.points) < 3:
        combined.points.new(0.42, 0.46)
    mapping.update()
    return True


def apply_compositor_finish() -> None:
    """V44-safe mist mix, then a tiny shadow lift. Beauty always stays in Color1."""
    scene = bpy.context.scene
    scene.use_nodes = True
    nodes = scene.node_tree.nodes
    links = scene.node_tree.links
    nodes.clear()
    render = nodes.new("CompositorNodeRLayers")
    composite = nodes.new("CompositorNodeComposite")
    mix = nodes.new("CompositorNodeMixRGB")
    mix.blend_type = "MIX"
    fac = mix.inputs.get("Fac") or mix.inputs[0]
    color1 = mix.inputs.get("Color1") or mix.inputs.get("A") or mix.inputs[1]
    color2 = mix.inputs.get("Color2") or mix.inputs.get("B") or mix.inputs[2]
    color2.default_value = (0.76, 0.82, 0.90, 1.0)
    if "Mist" in render.outputs:
        scale = nodes.new("CompositorNodeMath")
        scale.operation = "MULTIPLY"
        scale.inputs[1].default_value = 0.48
        links.new(render.outputs["Mist"], scale.inputs[0])
        links.new(scale.outputs["Value"], fac)
    else:
        fac.default_value = 0.08
    links.new(render.outputs["Image"], color1)
    out_sock = mix.outputs.get("Color") or mix.outputs.get("Result") or mix.outputs[0]
    finish = out_sock
    curves = nodes.new("CompositorNodeCurveRGB")
    if _lift_shadow_curve(curves):
        image_in = curves.inputs.get("Image") or curves.inputs[1]
        image_out = curves.outputs.get("Image") or curves.outputs[0]
        links.new(out_sock, image_in)
        finish = image_out
    links.new(finish, composite.inputs["Image"])
    _log("cinematic_compositor_applied", haze=True, hazeScale=0.48, glare=False, vignette=False, grain=False, shadowLift=True)


def apply_color_management() -> dict:
    """AgX with an open look. Medium-High Contrast crushed the V44 cabin."""
    scene = bpy.context.scene
    if not hasattr(scene, "view_settings"):
        return {"mode": "missing"}
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Base Contrast"
    scene.view_settings.exposure = 0.40
    scene.view_settings.gamma = 1.0
    _log("cinematic_color_management", viewTransform="AgX", look="AgX - Base Contrast", exposure=0.40)
    return {"viewTransform": "AgX", "look": "AgX - Base Contrast", "exposure": 0.40}


def apply_cycles_hero_quality() -> dict:
    scene = bpy.context.scene
    if not hasattr(scene, "cycles"):
        return {"mode": "no_cycles"}
    cycles = scene.cycles
    if hasattr(cycles, "max_bounces"):
        cycles.max_bounces = 10
    if hasattr(cycles, "diffuse_bounces"):
        cycles.diffuse_bounces = 4
    if hasattr(cycles, "glossy_bounces"):
        cycles.glossy_bounces = 4
    if hasattr(cycles, "transmission_bounces"):
        cycles.transmission_bounces = 10
    if hasattr(cycles, "volume_bounces"):
        cycles.volume_bounces = 2
    if hasattr(cycles, "transparent_max_bounces"):
        cycles.transparent_max_bounces = 12
    if hasattr(cycles, "sample_clamp_indirect"):
        cycles.sample_clamp_indirect = 8.0
    if hasattr(cycles, "sample_clamp_direct"):
        cycles.sample_clamp_direct = 0.0
    if hasattr(cycles, "use_denoising"):
        cycles.use_denoising = True
    _log("cinematic_cycles_quality", bounces=10, clampIndirect=8.0, denoise=True)
    return {"bounces": 10, "clampIndirect": 8.0}


def install_camera_rig_empties() -> list[str]:
    """Document reusable rig nodes. Do not reparent or move Camera C."""
    scene = bpy.context.scene
    created = []
    cam = bpy.data.objects.get("TJ_SHOT_02_CAM")
    look = bpy.data.objects.get("TJ_SHOT_02_CAM_LOOK")
    if cam is None:
        return created
    if bpy.data.objects.get("TJ_CAM_DOLLY") is None:
        dolly = bpy.data.objects.new("TJ_CAM_DOLLY", None)
        dolly.empty_display_type = "PLAIN_AXES"
        dolly.location = cam.location.copy()
        scene.collection.objects.link(dolly)
        created.append(dolly.name)
    if look is not None and bpy.data.objects.get("TJ_CAM_TRACK") is None:
        track = bpy.data.objects.new("TJ_CAM_TRACK", None)
        track.empty_display_type = "SPHERE"
        track.location = look.location.copy()
        scene.collection.objects.link(track)
        created.append(track.name)
    _log("cinematic_camera_rig_empties", created=created, cameraCMoved=False)
    return created


def apply_cinematic_master_pre_profile() -> dict:
    daylight = apply_cinematic_daylight()
    atmo = apply_world_atmosphere()
    hdri = apply_hdri_cinematic_balance()
    cohesion = apply_material_cohesion()
    apply_compositor_finish()
    return {
        "daylight": daylight,
        "atmosphere": atmo,
        "hdri": hdri,
        "foliageMaterials": 0,
        "cohesion": cohesion,
    }


def apply_cinematic_master_post_profile() -> dict:
    color = apply_color_management()
    cycles = apply_cycles_hero_quality()
    rig = install_camera_rig_empties()
    return {"color": color, "cycles": cycles, "rig": rig}
