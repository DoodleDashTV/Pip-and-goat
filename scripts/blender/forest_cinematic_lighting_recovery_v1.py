"""Cinematic lighting recovery layered on locked V3 material-readable lighting.

Preserves ground-detail dressing, bark/shrub/leaf/grass materials, camera,
terrain, water, and composition. Does not rebuild ground, trunk shaders, or
world HDRI strength.
"""

from __future__ import annotations

import math

from cinematic_forest_lighting_repair_v1 import (
    ATMOSPHERE_ANISOTROPY,
    ATMOSPHERE_COLOR,
    ATMOSPHERE_DENSITY,
    DIFFUSE_BOUNCES,
    FEATURE as LEGACY_FEATURE,
    GLOSSY_BOUNCES,
    MAX_BOUNCES,
    MIST_COLOR,
    MIST_DEPTH,
    MIST_START,
    MIST_STRENGTH,
    PREFERRED_LOOKS,
    SUN_ANGLE_DEG,
    SUN_TRAVEL,
    TRANSLUCENCY_FACTOR,
    TRANSPARENT_BOUNCES,
    TRANSMISSION_BOUNCES,
    VOLUME_BOUNCES,
    add_background_separation,
    apply_atmosphere_lookdev,
    apply_depth_cues,
    repair_flora_shader_light_response,
    repair_foliage_translucency,
    repair_treeleaf_groups,
    verify_locks,
)
from forest_ground_detail_recovery_v1 import LOCKED_MATERIAL_LIGHTING
from forest_lookdev_isolation_v1 import verify_production_camera

FEATURE = "forest_cinematic_lighting_recovery_v1"

# Side-key sun on top of the warm V3 fill/bounce recipe.
CINEMATIC_SUN_ENERGY = 7.4
CINEMATIC_SUN_COLOR = (1.0, 0.82, 0.62)

# Keep V3 warm fill/bounce for soil readability; trim energy slightly so key reads.
CINEMATIC_FILL_ENERGY = 440.0
CINEMATIC_FILL_COLOR = LOCKED_MATERIAL_LIGHTING["fillColor"]
CINEMATIC_BOUNCE_ENERGY = 210.0
CINEMATIC_BOUNCE_COLOR = LOCKED_MATERIAL_LIGHTING["bounceColor"]

CINEMATIC_RIM_ENERGY = 2.85
CINEMATIC_RIM_COLOR = (0.68, 0.80, 1.0)
CINEMATIC_RIM_TRAVEL = (-0.28, -0.52, -0.81)

FILL_SIZE = 9.0
FILL_LOCATION = (0.0, -7.2, 11.5)
FILL_AIM = (0.0, 8.0, 5.5)
BOUNCE_SIZE = 12.0
BOUNCE_LOCATION = (0.0, 8.2, 4.2)
BOUNCE_AIM = (0.0, 8.0, 9.0)


def _normalize(vec):
    length = math.sqrt(sum(v * v for v in vec)) or 1.0
    return tuple(v / length for v in vec)


def _aim_at(obj, target) -> None:
    from mathutils import Vector

    direction = Vector(target) - obj.location
    if direction.length < 1e-6:
        return
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def _aim_travel(obj, travel) -> None:
    from mathutils import Vector

    direction = Vector(_normalize(travel))
    if direction.length < 1e-6:
        return
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def _retune_light(obj, **kwargs) -> dict:
    data = obj.data
    if "energy" in kwargs:
        data.energy = float(kwargs["energy"])
    if "color" in kwargs:
        data.color = tuple(kwargs["color"])
    if "size" in kwargs and hasattr(data, "size"):
        data.size = float(kwargs["size"])
    if "angle_deg" in kwargs and hasattr(data, "angle"):
        data.angle = math.radians(float(kwargs["angle_deg"]))
    if "location" in kwargs:
        obj.location = tuple(kwargs["location"])
    if "travel" in kwargs:
        _aim_travel(obj, kwargs["travel"])
    elif "aim" in kwargs:
        _aim_at(obj, kwargs["aim"])
    return {
        "name": obj.name,
        "energy": float(getattr(data, "energy", 0) or 0),
        "color": [round(float(c), 4) for c in getattr(data, "color", (1, 1, 1))],
        "location": [round(float(v), 4) for v in obj.location],
    }


def apply_cycles_quality(scene) -> dict:
    if scene.render.engine != "CYCLES" or not hasattr(scene, "cycles"):
        return {"applied": False}
    cycles = scene.cycles
    cycles.diffuse_bounces = DIFFUSE_BOUNCES
    cycles.glossy_bounces = GLOSSY_BOUNCES
    cycles.transmission_bounces = TRANSMISSION_BOUNCES
    cycles.transparent_max_bounces = TRANSPARENT_BOUNCES
    cycles.volume_bounces = VOLUME_BOUNCES
    cycles.max_bounces = max(int(getattr(cycles, "max_bounces", 0) or 0), MAX_BOUNCES)
    if hasattr(cycles, "use_fast_gi"):
        cycles.use_fast_gi = False
    return {
        "applied": True,
        "diffuseBounces": int(cycles.diffuse_bounces),
        "maxBounces": int(cycles.max_bounces),
        "transparentMaxBounces": int(cycles.transparent_max_bounces),
    }


def apply_cinematic_look(scene) -> dict:
    """AgX contrast look only. Exposure/gamma/HDRI stay on V3 lock."""
    look = "None"
    for candidate in PREFERRED_LOOKS:
        try:
            scene.view_settings.look = candidate
            look = str(scene.view_settings.look)
            break
        except Exception:
            continue
    return {
        "viewTransform": scene.view_settings.view_transform,
        "look": look,
        "exposure": float(scene.view_settings.exposure),
        "gamma": float(scene.view_settings.gamma),
        "exposureChanged": abs(float(scene.view_settings.exposure) - LOCKED_MATERIAL_LIGHTING["exposure"]) > 0.01,
    }


def retune_cinematic_lights(scene) -> dict:
    changed = {}
    sun = scene.objects.get("TJ_GoldenSun")
    if sun is not None:
        changed["sun"] = _retune_light(
            sun,
            energy=CINEMATIC_SUN_ENERGY,
            color=CINEMATIC_SUN_COLOR,
            angle_deg=SUN_ANGLE_DEG,
            travel=SUN_TRAVEL,
        )
        changed["sun"]["travel"] = list(_normalize(SUN_TRAVEL))
    fill = scene.objects.get("TJ_SoftFill")
    if fill is not None:
        changed["fill"] = _retune_light(
            fill,
            energy=CINEMATIC_FILL_ENERGY,
            color=CINEMATIC_FILL_COLOR,
            size=FILL_SIZE,
            location=FILL_LOCATION,
            aim=FILL_AIM,
        )
    rim = scene.objects.get("TJ_CanopyRim")
    if rim is not None:
        changed["rim"] = _retune_light(
            rim,
            energy=CINEMATIC_RIM_ENERGY,
            color=CINEMATIC_RIM_COLOR,
            travel=CINEMATIC_RIM_TRAVEL,
        )
    bounce = scene.objects.get("TJ_ClearingBounce")
    if bounce is not None:
        changed["bounce"] = _retune_light(
            bounce,
            energy=CINEMATIC_BOUNCE_ENERGY,
            color=CINEMATIC_BOUNCE_COLOR,
            size=BOUNCE_SIZE,
            location=BOUNCE_LOCATION,
            aim=BOUNCE_AIM,
        )
    return changed


def verify_material_lighting_lock(scene) -> dict:
    view = scene.view_settings
    hdri_strength = None
    world = scene.world
    if world is not None and world.use_nodes and world.node_tree is not None:
        for node in world.node_tree.nodes:
            if node.bl_idname == "ShaderNodeBackground":
                hdri_strength = float(node.inputs["Strength"].default_value)
                break
    ok = (
        abs(float(view.exposure) - LOCKED_MATERIAL_LIGHTING["exposure"]) <= 0.02
        and abs(float(view.gamma) - LOCKED_MATERIAL_LIGHTING["gamma"]) <= 0.02
        and view.view_transform == LOCKED_MATERIAL_LIGHTING["viewTransform"]
        and hdri_strength is not None
        and abs(hdri_strength - LOCKED_MATERIAL_LIGHTING["hdriStrength"]) <= 0.02
    )
    if not ok:
        raise RuntimeError("CINEMATIC_MATERIAL_LIGHTING_LOCK_BROKEN")
    return {
        "exposure": float(view.exposure),
        "gamma": float(view.gamma),
        "viewTransform": view.view_transform,
        "hdriStrength": hdri_strength,
        "materialLightingPreserved": True,
    }


def apply_cinematic_lighting_recovery(scene) -> dict:
    locks = verify_locks(scene)
    material_lock = verify_material_lighting_lock(scene)
    cycles = apply_cycles_quality(scene)
    look = apply_cinematic_look(scene)
    lights = retune_cinematic_lights(scene)
    atmosphere = apply_atmosphere_lookdev(scene)
    background = add_background_separation(scene)
    flora = repair_flora_shader_light_response()
    treeleaf = repair_treeleaf_groups()
    foliage = repair_foliage_translucency(scene)
    depth = apply_depth_cues(scene)
    camera = verify_production_camera(scene)
    return {
        "schema": "TIVVLEJOY_FOREST_CINEMATIC_LIGHTING_RECOVERY_V1",
        "feature": FEATURE,
        "legacyFeatureReferenced": LEGACY_FEATURE,
        "locks": locks,
        "materialLightingLock": material_lock,
        "look": look,
        "cycles": cycles,
        "lights": lights,
        "atmosphere": atmosphere,
        "backgroundSeparation": background,
        "floraShader": flora,
        "treeleaf": treeleaf,
        "foliage": foliage,
        "depth": depth,
        "productionCamera": camera,
        "groundArchitectureChanged": False,
        "groundDressingChanged": False,
        "trunkShaderChanged": False,
        "worldHdriStrengthChanged": False,
        "emissionShadersAdded": False,
        "cameraChanged": False,
        "geometryRebuilt": False,
        "cinematicLightingStarted": True,
    }
