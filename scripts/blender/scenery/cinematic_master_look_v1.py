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
        sun.data.angle = math.radians(5.4)
        sun.rotation_euler = (math.radians(47.0), math.radians(9.0), math.radians(36.0))
        if hasattr(sun.data, "color"):
            sun.data.color = (1.0, 0.92, 0.78)
        changed["sun"] = {"energy": 3.55, "angleDeg": 5.4, "eulerDeg": [47.0, 9.0, 36.0]}
    sky = bpy.data.objects.get("TJ_SkyFill")
    if sky and sky.type == "LIGHT":
        sky.data.energy = 340.0
        sky.data.size = 110.0
        sky.location = (2.0, -8.0, 62.0)
        if hasattr(sky.data, "color"):
            sky.data.color = (0.80, 0.87, 0.97)
        changed["skyFill"] = 340.0
    bounce = bpy.data.objects.get("TJ_GroundBounce")
    if bounce and bounce.type == "LIGHT":
        bounce.data.energy = 380.0
        bounce.data.size = 48.0
        bounce.location = (1.0, -6.0, 1.15)
        if hasattr(bounce.data, "color"):
            bounce.data.color = (1.0, 0.82, 0.58)
        changed["groundBounce"] = 380.0
    forest = bpy.data.objects.get("TJ_ForestFill")
    if forest and forest.type == "LIGHT":
        forest.data.energy = 150.0
        forest.data.size = 42.0
        if hasattr(forest.data, "color"):
            forest.data.color = (0.96, 0.88, 0.72)
        changed["forestFill"] = 150.0
    creek = bpy.data.objects.get("TJ_CreekFill")
    if creek and creek.type == "LIGHT":
        # Keep a soft creek bounce. Do not teal-wash the locked water.
        creek.data.energy = 70.0
        creek.data.size = 28.0
        creek.location = (0.4, -12.2, 1.05)
        if hasattr(creek.data, "color"):
            creek.data.color = (0.78, 0.80, 0.76)
        changed["creekFill"] = 70.0
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
    scatter = nodes.new("ShaderNodeVolumeScatter")
    scatter.name = "TJ_ATMO_Scatter"
    if "Color" in scatter.inputs:
        scatter.inputs["Color"].default_value = (0.78, 0.84, 0.90, 1.0)
    if "Density" in scatter.inputs:
        scatter.inputs["Density"].default_value = 0.0075
    if "Anisotropy" in scatter.inputs:
        scatter.inputs["Anisotropy"].default_value = 0.32
    if "Volume" in out.inputs:
        for link in list(out.inputs["Volume"].links):
            links.remove(link)
        links.new(scatter.outputs["Volume"], out.inputs["Volume"])
    if hasattr(world, "mist_settings"):
        world.mist_settings.use_mist = True
        world.mist_settings.start = 14.0
        world.mist_settings.depth = 78.0
        world.mist_settings.falloff = "QUADRATIC"
    view = bpy.context.scene.view_layers[0]
    if hasattr(view, "use_pass_mist"):
        view.use_pass_mist = True
    _log("cinematic_atmosphere_applied", density=0.0075, mistStart=14.0, mistDepth=78.0)
    return {"mode": "volume_scatter_plus_mist", "density": 0.0075}


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


def apply_compositor_finish() -> None:
    """Mist aerial perspective + restrained glare. No visible vignette or grain."""
    scene = bpy.context.scene
    scene.use_nodes = True
    nodes = scene.node_tree.nodes
    links = scene.node_tree.links
    nodes.clear()
    render = nodes.new("CompositorNodeRLayers")
    composite = nodes.new("CompositorNodeComposite")
    viewer = nodes.new("CompositorNodeViewer")

    haze = nodes.new("CompositorNodeMixRGB")
    haze.blend_type = "MIX"
    haze_fac = haze.inputs.get("Fac") or haze.inputs[0]
    haze_a = haze.inputs.get("Color1") or haze.inputs[1]
    haze_b = haze.inputs.get("Color2") or haze.inputs[2]
    haze_b.default_value = (0.70, 0.76, 0.84, 1.0)
    if "Mist" in render.outputs:
        curve = nodes.new("CompositorNodeMapRange")
        curve.inputs["From Min"].default_value = 0.06
        curve.inputs["From Max"].default_value = 1.0
        curve.inputs["To Min"].default_value = 0.0
        curve.inputs["To Max"].default_value = 0.58
        links.new(render.outputs["Mist"], curve.inputs["Value"])
        links.new(curve.outputs["Value"], haze_fac)
    else:
        haze_fac.default_value = 0.10
    links.new(render.outputs["Image"], haze_a)

    balance = nodes.new("CompositorNodeColorBalance")
    if hasattr(balance, "correction_method"):
        try:
            balance.correction_method = "LIFT_GAMMA_GAIN"
        except Exception:
            pass
    if hasattr(balance, "lift"):
        balance.lift = (1.04, 1.01, 0.97)
    if hasattr(balance, "gamma"):
        balance.gamma = (1.01, 1.00, 0.99)
    if hasattr(balance, "gain"):
        balance.gain = (0.98, 0.99, 1.02)
    links.new(haze.outputs.get("Color") or haze.outputs[0], balance.inputs["Image"] if "Image" in balance.inputs else balance.inputs[1])

    glare = nodes.new("CompositorNodeGlare")
    if hasattr(glare, "glare_type"):
        glare.glare_type = "FOG_GLOW"
    if hasattr(glare, "quality"):
        glare.quality = "HIGH"
    if hasattr(glare, "threshold"):
        glare.threshold = 1.15
    if hasattr(glare, "mix"):
        glare.mix = -0.88
    if hasattr(glare, "size"):
        glare.size = 6
    src = balance.outputs.get("Image") or balance.outputs[0]
    links.new(src, glare.inputs["Image"] if "Image" in glare.inputs else glare.inputs[0])
    finished = glare.outputs.get("Image") or glare.outputs[0]
    links.new(finished, composite.inputs["Image"])
    links.new(finished, viewer.inputs["Image"])
    _log("cinematic_compositor_applied", haze=True, glare="fog_glow_restrained", vignette=False, grain=False)


def apply_color_management() -> dict:
    """AgX with an open look. Medium-High Contrast crushed the V44 cabin."""
    scene = bpy.context.scene
    if not hasattr(scene, "view_settings"):
        return {"mode": "missing"}
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.18
    scene.view_settings.gamma = 1.0
    _log("cinematic_color_management", viewTransform="AgX", look="None", exposure=0.18)
    return {"viewTransform": "AgX", "look": "None", "exposure": 0.18}


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
    foliage = apply_foliage_transmission()
    cohesion = apply_material_cohesion()
    apply_compositor_finish()
    return {
        "daylight": daylight,
        "atmosphere": atmo,
        "foliageMaterials": foliage,
        "cohesion": cohesion,
    }


def apply_cinematic_master_post_profile() -> dict:
    color = apply_color_management()
    cycles = apply_cycles_hero_quality()
    rig = install_camera_rig_empties()
    return {"color": color, "cycles": cycles, "rig": rig}
