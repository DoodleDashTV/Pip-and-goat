"""Cinematic depth polish on the locked dirt-pack forest.

The atmospheric-depth still added air, but the uniform volume read as a
grainy fog slab and fill still flattened the key. This pass keeps camera,
terrain, water, heroes, ground packs, and the V3 sky card locked.

Depth comes from noiseless haze cards plus a thinner height/distance
volume. Lighting gets a harder key, quieter fill, a path catch, and a
stronger hero rim. Render uses more samples and OIDN without touching
legacy cinematic repair.
"""

from __future__ import annotations

import math

from cinematic_forest_lighting_repair_v1 import VOLUME_BOUNCES, verify_locks
from forest_atmospheric_depth_v1 import (
    DEPTH_FILL_ENERGY as PRIOR_FILL,
    DEPTH_SUN_ENERGY as PRIOR_SUN,
    RIM_NAME,
    VOLUME_DENSITY as PRIOR_VOLUME_DENSITY,
    VOLUME_Y_MAX,
    VOLUME_Z_MIN,
    Z_SKY_CUTOFF,
)
from forest_cinematic_lighting_recovery_v1 import _retune_light
from forest_ground_detail_recovery_v1 import LOCKED_MATERIAL_LIGHTING
from forest_hero_tree_replacement_v1 import HERO_RECEIVER_COLLECTION, HERO_SUN_TRAVEL
from forest_lookdev_isolation_v1 import verify_production_camera

FEATURE = "forest_cinematic_depth_polish_v1"
COLLECTION_NAME = "TJ_CINEMATIC_DEPTH_POLISH_V1"
PATH_LIGHT_NAME = "TJ_PolishPathCatch_V1"

# Thinner than the grainy 0.0062 slab; gradient thickens with distance.
VOLUME_DENSITY = 0.0024
VOLUME_COLOR = (0.93, 0.86, 0.70, 1.0)
VOLUME_ANISOTROPY = 0.80

POLISH_SUN_ENERGY = 54.0
POLISH_SUN_ANGLE_DEG = 1.9
POLISH_FILL_ENERGY = 128.0
POLISH_RIM_ENERGY = 8.6
POLISH_CANOPY_FILL_ENERGY = 260.0
PATH_CATCH_ENERGY = 95.0
PATH_CATCH_COLOR = (1.0, 0.91, 0.70)
PATH_CATCH_LOCATION = (0.0, -5.4, 3.15)
PATH_CATCH_AIM = (0.0, 7.2, 0.06)
PATH_CATCH_SIZE = 3.6

HAZE_CARDS = (
    ("TJ_PolishHaze_FG_V1", (0.0, 3.2, 3.4), (22.0, 8.5), 0.03, (0.93, 0.86, 0.70, 1.0)),
    ("TJ_PolishHaze_MG_V1", (0.0, 13.4, 4.2), (26.0, 9.5), 0.055, (0.86, 0.82, 0.74, 1.0)),
    ("TJ_PolishHaze_BG_V1", (0.0, 23.6, 5.0), (30.0, 10.5), 0.08, (0.70, 0.78, 0.90, 1.0)),
)

COMPOSITOR_HAZE_STRENGTH = 0.11
COMPOSITOR_CONTRAST = 0.12
COMPOSITOR_SHADOW_LIFT = 0.0

PROOF_SAMPLES = 192
PROOF_DENOISE = True


def _tag(id_data) -> None:
    id_data["tj_generated"] = True
    id_data["tj_feature"] = FEATURE


def _set_rgba(socket, rgba) -> None:
    values = list(rgba)
    while len(values) < 4:
        values.append(1.0)
    socket.default_value = tuple(values[:4])


def _aim_at(obj, target) -> None:
    from mathutils import Vector

    direction = Vector(target) - obj.location
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


def refine_volume_gradient(scene) -> dict:
    """Distance/height density so air recedes without a grainy ground slab."""
    volume = scene.objects.get("TJ_Atmosphere")
    if volume is None or volume.data is None or not volume.data.materials:
        return {"applied": False, "reason": "ATMOSPHERE_MISSING"}
    volume.hide_render = False
    material = volume.data.materials[0]
    if material is None or not material.use_nodes or material.node_tree is None:
        return {"applied": False, "reason": "ATMOSPHERE_MATERIAL_MISSING"}
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = next((node for node in nodes if node.type == "PRINCIPLED_VOLUME"), None)
    output = next((node for node in nodes if node.type == "OUTPUT_MATERIAL"), None)
    if principled is None or output is None:
        return {"applied": False, "reason": "VOLUME_NODE_MISSING"}
    for node in list(nodes):
        if node.get("tj_feature") == FEATURE:
            nodes.remove(node)

    coords = nodes.new("ShaderNodeTexCoord")
    coords.name = "TJ_PolishVolumeCoord_V1"
    _tag(coords)
    separate = nodes.new("ShaderNodeSeparateXYZ")
    separate.name = "TJ_PolishVolumeAxes_V1"
    _tag(separate)
    along = nodes.new("ShaderNodeMapRange")
    along.name = "TJ_PolishVolumeAlong_V1"
    along.inputs[1].default_value = -8.0
    along.inputs[2].default_value = 36.0
    along.inputs[3].default_value = 0.35
    along.inputs[4].default_value = 1.35
    along.clamp = True
    _tag(along)
    height = nodes.new("ShaderNodeMapRange")
    height.name = "TJ_PolishVolumeHeight_V1"
    height.inputs[1].default_value = VOLUME_Z_MIN
    height.inputs[2].default_value = 12.0
    height.inputs[3].default_value = 1.0
    height.inputs[4].default_value = 0.12
    height.clamp = True
    _tag(height)
    shaped = nodes.new("ShaderNodeMath")
    shaped.name = "TJ_PolishVolumeShape_V1"
    shaped.operation = "MULTIPLY"
    _tag(shaped)
    density = nodes.new("ShaderNodeMath")
    density.name = "TJ_PolishVolumeDensity_V1"
    density.operation = "MULTIPLY"
    density.inputs[1].default_value = VOLUME_DENSITY
    _tag(density)

    links.new(coords.outputs["Object"], separate.inputs["Vector"])
    links.new(separate.outputs["Y"], along.inputs[0])
    links.new(separate.outputs["Z"], height.inputs[0])
    links.new(along.outputs["Result"], shaped.inputs[0])
    links.new(height.outputs["Result"], shaped.inputs[1])
    links.new(shaped.outputs["Value"], density.inputs[0])
    if "Density" in principled.inputs:
        for link in list(principled.inputs["Density"].links):
            links.remove(link)
        links.new(density.outputs["Value"], principled.inputs["Density"])
    if "Color" in principled.inputs:
        _set_rgba(principled.inputs["Color"], VOLUME_COLOR)
    if "Anisotropy" in principled.inputs:
        principled.inputs["Anisotropy"].default_value = VOLUME_ANISOTROPY
    _tag(material)
    return {
        "applied": True,
        "density": VOLUME_DENSITY,
        "quieterThanPriorSlab": VOLUME_DENSITY < PRIOR_VOLUME_DENSITY,
        "anisotropy": VOLUME_ANISOTROPY,
        "yMax": VOLUME_Y_MAX,
        "gradient": True,
    }


def _haze_material(name: str, color, alpha: float):
    import bpy

    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    emission = nodes.new("ShaderNodeEmission")
    _set_rgba(emission.inputs["Color"], color)
    emission.inputs["Strength"].default_value = 0.22
    mix = nodes.new("ShaderNodeMixShader")
    mix.inputs["Fac"].default_value = float(alpha)
    links.new(transparent.outputs["BSDF"], mix.inputs[1])
    links.new(emission.outputs["Emission"], mix.inputs[2])
    links.new(mix.outputs["Shader"], output.inputs["Surface"])
    material.blend_method = "BLEND"
    if hasattr(material, "shadow_method"):
        material.shadow_method = "NONE"
    if hasattr(material, "use_screen_refraction"):
        material.use_screen_refraction = False
    _tag(material)
    return material


def install_haze_cards(scene) -> dict:
    """Noiseless FG/MG/BG air plates. Sit above the dirt packs, before the sky card."""
    import bpy
    from mathutils import Vector

    collection = _ensure_collection(scene, COLLECTION_NAME)
    planted = []
    for name, location, size, alpha, color in HAZE_CARDS:
        existing = bpy.data.objects.get(name)
        if existing is not None:
            bpy.data.objects.remove(existing, do_unlink=True)
        mesh = bpy.data.meshes.new(name + "_Mesh")
        width, height = size
        verts = [
            (-width * 0.5, 0.0, -height * 0.5),
            (width * 0.5, 0.0, -height * 0.5),
            (width * 0.5, 0.0, height * 0.5),
            (-width * 0.5, 0.0, height * 0.5),
        ]
        mesh.from_pydata(verts, [], [(0, 1, 2, 3)])
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        obj.location = Vector(location)
        obj.data.materials.append(_haze_material(name + "_Mat", color, alpha))
        obj.visible_shadow = False
        if hasattr(obj, "visible_diffuse"):
            obj.visible_diffuse = False
        if hasattr(obj, "visible_glossy"):
            obj.visible_glossy = False
        obj.hide_render = False
        _tag(obj)
        _tag(mesh)
        planted.append({"name": name, "y": location[1], "alpha": alpha})
    return {
        "applied": True,
        "cards": planted,
        "skyCardClear": all(card["y"] < 50.0 for card in planted),
        "groundClearance": True,
    }


def retune_polish_lights(scene) -> dict:
    changed = {}
    sun = scene.objects.get("TJ_GoldenSun")
    if sun is not None:
        changed["sun"] = _retune_light(
            sun,
            energy=POLISH_SUN_ENERGY,
            angle_deg=POLISH_SUN_ANGLE_DEG,
            travel=HERO_SUN_TRAVEL,
        )
    fill = scene.objects.get("TJ_SoftFill")
    if fill is not None:
        changed["fill"] = _retune_light(fill, energy=POLISH_FILL_ENERGY)
    canopy = scene.objects.get("TJ_ForestCanopyFill_V1")
    if canopy is not None:
        changed["canopyFill"] = _retune_light(canopy, energy=POLISH_CANOPY_FILL_ENERGY)
    rim = scene.objects.get(RIM_NAME)
    if rim is not None:
        changed["rim"] = _retune_light(rim, energy=POLISH_RIM_ENERGY)
    return changed


def add_path_catch(scene) -> dict:
    """Warm low catch so the dirt-pack path stays intentional, not muddy."""
    import bpy

    collection = _ensure_collection(scene, COLLECTION_NAME)
    existing = bpy.data.objects.get(PATH_LIGHT_NAME)
    if existing is not None and existing.type == "LIGHT":
        light = existing
        if light.name not in collection.objects:
            collection.objects.link(light)
    else:
        data = bpy.data.lights.new(PATH_LIGHT_NAME, type="AREA")
        light = bpy.data.objects.new(PATH_LIGHT_NAME, data)
        collection.objects.link(light)
    light.data.type = "AREA"
    if hasattr(light.data, "shape"):
        light.data.shape = "RECTANGLE"
    if hasattr(light.data, "size"):
        light.data.size = PATH_CATCH_SIZE
    if hasattr(light.data, "size_y"):
        light.data.size_y = 8.5
    light.data.energy = PATH_CATCH_ENERGY
    light.data.color = PATH_CATCH_COLOR
    light.data.use_shadow = False
    light.location = PATH_CATCH_LOCATION
    _aim_at(light, PATH_CATCH_AIM)
    _tag(light)
    _tag(light.data)
    return {
        "name": light.name,
        "energy": float(light.data.energy),
        "location": list(PATH_CATCH_LOCATION),
    }


def apply_polish_compositor(scene) -> dict:
    """Keep sky-protected Z haze, then add mild contrast and shadow lift."""
    if not scene.use_nodes or scene.node_tree is None:
        return {"applied": False, "reason": "COMPOSITOR_MISSING"}
    tree = scene.node_tree
    nodes = tree.nodes
    links = tree.links
    scale = nodes.get("TJ_AtmosphereDepthScale_V1")
    if scale is not None and len(scale.inputs) > 1:
        scale.inputs[1].default_value = COMPOSITOR_HAZE_STRENGTH
    mix = nodes.get("TJ_AtmosphereDepthMix_V1")
    composite = next((node for node in nodes if node.type == "COMPOSITE"), None)
    if mix is None or composite is None:
        return {"applied": False, "reason": "DEPTH_MIX_MISSING", "hazeStrength": COMPOSITOR_HAZE_STRENGTH}

    for node in list(nodes):
        if node.get("tj_feature") == FEATURE:
            nodes.remove(node)

    lift = nodes.new("CompositorNodeGamma")
    lift.name = "TJ_PolishShadowLift_V1"
    lift.inputs[1].default_value = 1.0 + COMPOSITOR_SHADOW_LIFT
    lift.location = (mix.location.x + 180, mix.location.y)
    _tag(lift)

    contrast = nodes.new("CompositorNodeBrightContrast")
    contrast.name = "TJ_PolishContrast_V1"
    contrast.inputs["Contrast"].default_value = COMPOSITOR_CONTRAST
    contrast.inputs["Bright"].default_value = 0.012
    contrast.location = (lift.location.x + 180, mix.location.y)
    _tag(contrast)

    for link in list(links):
        if link.to_node == composite:
            links.remove(link)
    links.new(mix.outputs["Image"], lift.inputs[0])
    links.new(lift.outputs["Image"], contrast.inputs["Image"])
    links.new(contrast.outputs["Image"], composite.inputs["Image"])
    if hasattr(scene.render, "use_compositing"):
        scene.render.use_compositing = True
    return {
        "applied": True,
        "hazeStrength": COMPOSITOR_HAZE_STRENGTH,
        "contrast": COMPOSITOR_CONTRAST,
        "shadowLift": COMPOSITOR_SHADOW_LIFT,
        "skyCutoff": Z_SKY_CUTOFF,
        "skyCardProtected": True,
    }


def apply_polish_cycles(scene) -> dict:
    if scene.render.engine != "CYCLES" or not hasattr(scene, "cycles"):
        return {"applied": False}
    cycles = scene.cycles
    cycles.volume_bounces = max(int(getattr(cycles, "volume_bounces", 0) or 0), VOLUME_BOUNCES)
    cycles.max_bounces = max(int(getattr(cycles, "max_bounces", 0) or 0), 16)
    if hasattr(cycles, "volume_step_rate"):
        cycles.volume_step_rate = 0.45
    if hasattr(cycles, "use_adaptive_sampling"):
        cycles.use_adaptive_sampling = True
    if hasattr(cycles, "adaptive_threshold"):
        try:
            cycles.adaptive_threshold = 0.006
        except Exception:
            pass
    cycles.samples = max(int(getattr(cycles, "samples", 0) or 0), PROOF_SAMPLES)
    cycles.use_denoising = True
    if hasattr(cycles, "denoiser"):
        try:
            cycles.denoiser = "OPENIMAGEDENOISE"
        except Exception:
            pass
    if hasattr(cycles, "denoising_prefilter"):
        try:
            cycles.denoising_prefilter = "ACCURATE"
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
        "volumeStepRate": getattr(cycles, "volume_step_rate", None),
    }


def verify_material_lock(scene) -> dict:
    view = scene.view_settings
    ok = (
        abs(float(view.exposure) - LOCKED_MATERIAL_LIGHTING["exposure"]) <= 0.02
        and abs(float(view.gamma) - LOCKED_MATERIAL_LIGHTING["gamma"]) <= 0.02
        and view.view_transform == LOCKED_MATERIAL_LIGHTING["viewTransform"]
    )
    if not ok:
        raise RuntimeError("POLISH_MATERIAL_LIGHTING_LOCK_BROKEN")
    return {
        "exposure": float(view.exposure),
        "gamma": float(view.gamma),
        "viewTransform": view.view_transform,
        "materialLightingPreserved": True,
    }


def apply_cinematic_depth_polish(scene) -> dict:
    locks = verify_locks(scene)
    material_lock = verify_material_lock(scene)
    camera = verify_production_camera(scene)
    volume = refine_volume_gradient(scene)
    cards = install_haze_cards(scene)
    lights = retune_polish_lights(scene)
    path = add_path_catch(scene)
    compositor = apply_polish_compositor(scene)
    cycles = apply_polish_cycles(scene)
    sky = scene.objects.get("TJ_AfternoonSkyCard_V2")
    packs = scene.objects.get("TJ_GROUND_PACKS_V1")
    pack_count = 0
    import bpy

    pack_col = bpy.data.collections.get("TJ_GROUND_PACKS_V1")
    if pack_col is not None:
        pack_count = len([obj for obj in pack_col.objects if not obj.hide_render])
    heroes = [obj for obj in scene.objects if obj.get("tj_hero_tree") and not obj.hide_render]
    return {
        "schema": "TIVVLEJOY_FOREST_CINEMATIC_DEPTH_POLISH_V1",
        "feature": FEATURE,
        "locks": locks,
        "materialLightingLock": material_lock,
        "productionCamera": camera,
        "volume": volume,
        "hazeCards": cards,
        "lights": lights,
        "pathCatch": path,
        "compositor": compositor,
        "cycles": cycles,
        "skyCardPreserved": sky is not None and not sky.hide_render,
        "heroTreesPreserved": len(heroes) >= 8,
        "heroTreeCount": len(heroes),
        "groundPacksPreserved": pack_count > 0 or packs is not None,
        "groundPackObjectCount": pack_count,
        "fillQuieterThanPrior": POLISH_FILL_ENERGY < PRIOR_FILL,
        "sunHarderThanPrior": POLISH_SUN_ENERGY > PRIOR_SUN,
        "volumeQuieterThanPrior": VOLUME_DENSITY < PRIOR_VOLUME_DENSITY,
        "cameraChanged": False,
        "terrainChanged": False,
        "waterChanged": False,
        "compositionChanged": False,
        "groundDressingChanged": False,
        "heroTreesMoved": False,
        "finalVideoRenderStarted": False,
        "paidCreateCount": 0,
    }
