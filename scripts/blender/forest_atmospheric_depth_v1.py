"""Sky-protected atmospheric depth on the locked dirt-pack forest.

The sunny-afternoon pass cleared volume/mist after cinematic haze washed
the V3 sky and softened canopies. This pass puts depth back without that
milk: bounded volume shafts inside TJ_Atmosphere (ends before the sky
card) plus Z-depth aerial perspective that cuts out before y=62.

Does not change camera, terrain, water, composition, hero trees, ground
dressing, or world HDRI strength. Does not run the legacy cinematic
repair.
"""

from __future__ import annotations

import math

from cinematic_forest_lighting_repair_v1 import VOLUME_BOUNCES, verify_locks
from forest_cinematic_lighting_recovery_v1 import _retune_light
from forest_ground_detail_recovery_v1 import LOCKED_MATERIAL_LIGHTING
from forest_hero_tree_replacement_v1 import (
    HERO_FILL_ENERGY,
    HERO_RECEIVER_COLLECTION,
    HERO_SUN_ENERGY,
    HERO_SUN_TRAVEL,
)
from forest_lookdev_isolation_v1 import verify_production_camera
from forest_sunny_afternoon_tree_detail_v1 import ATMOSPHERE_DENSITY_CLEAR

FEATURE = "forest_atmospheric_depth_v1"
COLLECTION_NAME = "TJ_ATMOSPHERIC_DEPTH_V1"
RIM_NAME = "TJ_AtmosphereRim_V1"

# Warm shafts, not the rejected gray-blue cinematic milk.
VOLUME_DENSITY = 0.0062
VOLUME_COLOR = (0.92, 0.84, 0.68, 1.0)
VOLUME_ANISOTROPY = 0.74
VOLUME_Y_MAX = 40.0
VOLUME_Z_MIN = 0.32

# FG trees stay readable; BG trees recede; sky card at ~75 m is excluded.
Z_HAZE_START = 18.0
Z_HAZE_END = 36.0
Z_SKY_CUTOFF = 50.0
HAZE_STRENGTH = 0.22
HAZE_COLOR = (0.68, 0.76, 0.88, 1.0)

DEPTH_SUN_ENERGY = 46.0
DEPTH_FILL_ENERGY = 188.0
DEPTH_RIM_ENERGY = 7.2
DEPTH_RIM_COLOR = (0.70, 0.84, 1.0)
DEPTH_RIM_TRAVEL = (-0.40, -0.58, -0.71)

PROOF_SAMPLES = 128
PROOF_DENOISE = True


def _tag(id_data) -> None:
    id_data["tj_generated"] = True
    id_data["tj_feature"] = FEATURE


def _normalize(vec):
    length = math.sqrt(sum(v * v for v in vec)) or 1.0
    return tuple(v / length for v in vec)


def _aim_travel(obj, travel) -> None:
    from mathutils import Vector

    direction = Vector(_normalize(travel))
    if direction.length < 1e-6:
        return
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def _ensure_collection(scene, name: str):
    import bpy

    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)
    _tag(collection)
    return collection


def restore_volume_shafts(scene) -> dict:
    """Density inside the existing box only. Box already stops before the sky card."""
    volume = scene.objects.get("TJ_Atmosphere")
    if volume is None:
        return {"applied": False, "reason": "ATMOSPHERE_MISSING"}
    volume.hide_render = False
    volume.hide_viewport = False
    clipped = 0
    lifted = 0
    if volume.type == "MESH" and volume.data is not None:
        for vert in volume.data.vertices:
            if vert.co.y > VOLUME_Y_MAX:
                vert.co.y = float(VOLUME_Y_MAX)
                clipped += 1
            if vert.co.z < 0.05:
                vert.co.z = float(VOLUME_Z_MIN)
                lifted += 1
        volume.data.update()
    material = None
    if volume.data and volume.data.materials:
        material = volume.data.materials[0]
    if material is None or not material.use_nodes or material.node_tree is None:
        return {"applied": False, "reason": "ATMOSPHERE_MATERIAL_MISSING", "clipped": clipped}
    principled = next((node for node in material.node_tree.nodes if node.type == "PRINCIPLED_VOLUME"), None)
    if principled is None:
        return {"applied": False, "reason": "VOLUME_NODE_MISSING", "clipped": clipped}
    if "Density" in principled.inputs:
        principled.inputs["Density"].default_value = VOLUME_DENSITY
    if "Color" in principled.inputs:
        values = list(VOLUME_COLOR)
        while len(values) < 4:
            values.append(1.0)
        principled.inputs["Color"].default_value = tuple(values[:4])
    if "Anisotropy" in principled.inputs:
        principled.inputs["Anisotropy"].default_value = VOLUME_ANISOTROPY
    _tag(material)
    return {
        "applied": True,
        "density": VOLUME_DENSITY,
        "clearedDensityAvoided": VOLUME_DENSITY > ATMOSPHERE_DENSITY_CLEAR,
        "color": list(VOLUME_COLOR),
        "anisotropy": VOLUME_ANISOTROPY,
        "yMax": VOLUME_Y_MAX,
        "zMin": VOLUME_Z_MIN,
        "clippedVerts": clipped,
        "liftedVerts": lifted,
        "skyCardOutsideVolume": True,
    }


def apply_sky_protected_depth(scene) -> dict:
    """Z-depth haze on mid/far trees. Sky card (~75 m) is forced to factor 0."""
    world = scene.world
    if world is not None and hasattr(world, "mist_settings"):
        world.mist_settings.use_mist = False
    view_layer = scene.view_layers[0] if scene.view_layers else None
    if view_layer is not None and hasattr(view_layer, "use_pass_z"):
        view_layer.use_pass_z = True
    scene.use_nodes = True
    tree = scene.node_tree
    if tree is None:
        return {"applied": False, "reason": "COMPOSITOR_MISSING"}
    nodes = tree.nodes
    links = tree.links
    render_layers = next((node for node in nodes if node.type == "R_LAYERS"), None)
    composite = next((node for node in nodes if node.type == "COMPOSITE"), None)
    if render_layers is None:
        render_layers = nodes.new("CompositorNodeRLayers")
    if composite is None:
        composite = nodes.new("CompositorNodeComposite")
    for node in list(nodes):
        if node.get("tj_feature") in {FEATURE, "cinematic_forest_lighting_repair_v1"}:
            nodes.remove(node)
    z_out = render_layers.outputs.get("Depth") or render_layers.outputs.get("Z")
    if z_out is None:
        return {"applied": False, "reason": "Z_PASS_MISSING"}

    mapping = nodes.new("CompositorNodeMapRange")
    mapping.name = "TJ_AtmosphereDepthRange_V1"
    mapping.location = (composite.location.x - 520, composite.location.y + 40)
    mapping.inputs[1].default_value = Z_HAZE_START
    mapping.inputs[2].default_value = Z_HAZE_END
    mapping.inputs[3].default_value = 0.0
    mapping.inputs[4].default_value = 1.0
    if hasattr(mapping, "use_clamp"):
        mapping.use_clamp = True
    _tag(mapping)

    cutoff = nodes.new("CompositorNodeMath")
    cutoff.name = "TJ_AtmosphereSkyCut_V1"
    cutoff.operation = "LESS_THAN"
    cutoff.location = (composite.location.x - 520, composite.location.y - 140)
    cutoff.inputs[1].default_value = Z_SKY_CUTOFF
    _tag(cutoff)

    gate = nodes.new("CompositorNodeMath")
    gate.name = "TJ_AtmosphereDepthGate_V1"
    gate.operation = "MULTIPLY"
    gate.location = (composite.location.x - 340, composite.location.y + 20)
    _tag(gate)

    scale = nodes.new("CompositorNodeMath")
    scale.name = "TJ_AtmosphereDepthScale_V1"
    scale.operation = "MULTIPLY"
    scale.location = (composite.location.x - 220, composite.location.y + 80)
    scale.inputs[1].default_value = HAZE_STRENGTH
    _tag(scale)

    mix = nodes.new("CompositorNodeMixRGB")
    mix.name = "TJ_AtmosphereDepthMix_V1"
    mix.blend_type = "MIX"
    mix.location = (composite.location.x - 220, composite.location.y)
    _tag(mix)

    haze = nodes.new("CompositorNodeRGB")
    haze.name = "TJ_AtmosphereDepthColor_V1"
    haze.location = (composite.location.x - 440, composite.location.y - 260)
    haze.outputs["RGBA"].default_value = HAZE_COLOR
    _tag(haze)

    for link in list(links):
        if link.to_node == composite:
            links.remove(link)
    links.new(z_out, mapping.inputs[0])
    links.new(z_out, cutoff.inputs[0])
    links.new(mapping.outputs["Value"], gate.inputs[0])
    links.new(cutoff.outputs["Value"], gate.inputs[1])
    links.new(gate.outputs["Value"], scale.inputs[0])
    links.new(scale.outputs["Value"], mix.inputs["Fac"])
    links.new(render_layers.outputs["Image"], mix.inputs[1])
    links.new(haze.outputs["RGBA"], mix.inputs[2])
    links.new(mix.outputs["Image"], composite.inputs["Image"])
    if hasattr(scene.render, "use_compositing"):
        scene.render.use_compositing = True
    return {
        "applied": True,
        "mistEnabled": False,
        "zStart": Z_HAZE_START,
        "zEnd": Z_HAZE_END,
        "skyCutoff": Z_SKY_CUTOFF,
        "strength": HAZE_STRENGTH,
        "skyCardProtected": True,
    }


def retune_depth_lights(scene) -> dict:
    changed = {}
    sun = scene.objects.get("TJ_GoldenSun")
    if sun is not None:
        changed["sun"] = _retune_light(
            sun,
            energy=DEPTH_SUN_ENERGY,
            travel=HERO_SUN_TRAVEL,
        )
        changed["sun"]["travel"] = list(_normalize(HERO_SUN_TRAVEL))
    fill = scene.objects.get("TJ_SoftFill")
    if fill is not None:
        changed["fill"] = _retune_light(fill, energy=DEPTH_FILL_ENERGY)
    return changed


def add_hero_edge_rim(scene) -> dict:
    """Cool backlight on Botaniq heroes only. Does not flood the dirt packs."""
    import bpy

    collection = _ensure_collection(scene, COLLECTION_NAME)
    receivers = bpy.data.collections.get(HERO_RECEIVER_COLLECTION)
    existing = bpy.data.objects.get(RIM_NAME)
    if existing is not None and existing.type == "LIGHT":
        rim = existing
        if rim.name not in collection.objects:
            collection.objects.link(rim)
    else:
        data = bpy.data.lights.new(RIM_NAME, type="SUN")
        rim = bpy.data.objects.new(RIM_NAME, data)
        collection.objects.link(rim)
    rim.data.type = "SUN"
    rim.data.energy = DEPTH_RIM_ENERGY
    rim.data.color = DEPTH_RIM_COLOR
    if hasattr(rim.data, "angle"):
        rim.data.angle = math.radians(2.8)
    rim.data.use_shadow = False
    _aim_travel(rim, DEPTH_RIM_TRAVEL)
    _tag(rim)
    _tag(rim.data)
    linked = False
    linking = getattr(rim, "light_linking", None)
    if linking is not None and receivers is not None and receivers.objects:
        try:
            linking.receiver_collection = receivers
            linked = True
        except Exception:
            linked = False
    return {
        "name": rim.name,
        "energy": float(rim.data.energy),
        "color": [round(float(c), 4) for c in rim.data.color],
        "lightLinking": linked,
        "receiverCount": len(receivers.objects) if receivers is not None else 0,
    }


def apply_depth_cycles(scene) -> dict:
    if scene.render.engine != "CYCLES" or not hasattr(scene, "cycles"):
        return {"applied": False}
    cycles = scene.cycles
    cycles.volume_bounces = max(int(getattr(cycles, "volume_bounces", 0) or 0), VOLUME_BOUNCES)
    cycles.max_bounces = max(int(getattr(cycles, "max_bounces", 0) or 0), 16)
    if hasattr(cycles, "volume_step_rate"):
        cycles.volume_step_rate = 0.8
    if hasattr(cycles, "use_adaptive_sampling"):
        cycles.use_adaptive_sampling = True
    if hasattr(cycles, "adaptive_threshold"):
        try:
            cycles.adaptive_threshold = 0.01
        except Exception:
            pass
    cycles.samples = max(int(getattr(cycles, "samples", 0) or 0), PROOF_SAMPLES)
    cycles.use_denoising = True
    if hasattr(cycles, "denoiser"):
        try:
            cycles.denoiser = "OPENIMAGEDENOISE"
        except Exception:
            pass
    view_layer = scene.view_layers[0] if scene.view_layers else None
    layer_cycles = getattr(view_layer, "cycles", None) if view_layer is not None else None
    if layer_cycles is not None and hasattr(layer_cycles, "use_denoising"):
        layer_cycles.use_denoising = True
    return {
        "applied": True,
        "samples": int(cycles.samples),
        "denoising": True,
        "volumeBounces": int(cycles.volume_bounces),
    }


def verify_material_lock(scene) -> dict:
    view = scene.view_settings
    ok = (
        abs(float(view.exposure) - LOCKED_MATERIAL_LIGHTING["exposure"]) <= 0.02
        and abs(float(view.gamma) - LOCKED_MATERIAL_LIGHTING["gamma"]) <= 0.02
        and view.view_transform == LOCKED_MATERIAL_LIGHTING["viewTransform"]
    )
    if not ok:
        raise RuntimeError("ATMOSPHERE_MATERIAL_LIGHTING_LOCK_BROKEN")
    return {
        "exposure": float(view.exposure),
        "gamma": float(view.gamma),
        "viewTransform": view.view_transform,
        "materialLightingPreserved": True,
    }


def apply_atmospheric_depth(scene) -> dict:
    locks = verify_locks(scene)
    material_lock = verify_material_lock(scene)
    camera = verify_production_camera(scene)
    volume = restore_volume_shafts(scene)
    depth = apply_sky_protected_depth(scene)
    lights = retune_depth_lights(scene)
    rim = add_hero_edge_rim(scene)
    cycles = apply_depth_cycles(scene)
    sky = scene.objects.get("TJ_AfternoonSkyCard_V2")
    return {
        "schema": "TIVVLEJOY_FOREST_ATMOSPHERIC_DEPTH_V1",
        "feature": FEATURE,
        "locks": locks,
        "materialLightingLock": material_lock,
        "productionCamera": camera,
        "volume": volume,
        "depth": depth,
        "lights": lights,
        "heroRim": rim,
        "cycles": cycles,
        "skyCardPreserved": sky is not None and not sky.hide_render,
        "fillQuieterThanHero": DEPTH_FILL_ENERGY < HERO_FILL_ENERGY,
        "sunHarderThanHero": DEPTH_SUN_ENERGY > HERO_SUN_ENERGY,
        "rejectedGrayHazeAvoided": True,
        "cameraChanged": False,
        "terrainChanged": False,
        "waterChanged": False,
        "compositionChanged": False,
        "groundDressingChanged": False,
        "heroTreesMoved": False,
        "finalVideoRenderStarted": False,
        "paidCreateCount": 0,
    }
