"""In-memory vendor-reference lookdev. Composition stays locked; only exposure/separation change."""

from __future__ import annotations

import math

SEED = 7301
CAMERA_LENS_MM = 42.0
CAMERA_LOCATION = (0.0, -12.5, 2.15)
CAMERA_LOOK_AT = (0.0, 9.5, 2.6)
SUN_ROTATION_DEG = (58.0, -8.0, -42.0)
FILL_LOCATION = (0.0, -4.0, 8.0)
FILL_AIM = (0.0, 10.0, 2.0)
PLACED_COUNTS = {
    "trees": 14,
    "grass": 70,
    "ferns": 28,
    "bushes": 24,
    "floral": 16,
    "fallenLeaves": 65,
}

# Lookdev that produced the rejected SHA 6f31cb68… (too dark / crushed / muddy red).
LOOKDEV_REJECTED_EXPOSURE_V1 = {
    "id": "VENDOR_REFERENCE_LOOKDEV_REJECTED_EXPOSURE_V1",
    "hdriStrength": 0.28,
    "exposure": 0.0,
    "gamma": 1.0,
    "viewTransform": "AgX",
    "sunEnergy": 3.4,
    "sunColor": (1.0, 0.52, 0.24),
    "sunAngleDeg": 7.0,
    "fillEnergy": 240.0,
    "fillColor": (0.43, 0.56, 0.78),
    "rimEnabled": False,
    "bounceEnabled": False,
    "groundColor": (0.055, 0.035, 0.018),
    "atmosphereDensity": 0.009,
    "diffuseBounces": 4,
}

# Moderate exposure/shadow lift. Same camera, seed, sun direction, and placement.
LOOKDEV_EXPOSURE_REPAIR_V2 = {
    "id": "VENDOR_REFERENCE_LOOKDEV_EXPOSURE_REPAIR_V2",
    "hdriStrength": 0.58,
    "exposure": 0.65,
    "gamma": 1.06,
    "viewTransform": "AgX",
    "sunEnergy": 5.4,
    "sunColor": (1.0, 0.76, 0.55),
    "sunAngleDeg": 7.0,
    "fillEnergy": 520.0,
    "fillColor": (0.62, 0.74, 0.92),
    "rimEnabled": True,
    "rimEnergy": 1.85,
    "rimColor": (0.68, 0.80, 1.0),
    "rimRotationDeg": (38.0, 10.0, 138.0),
    "bounceEnabled": True,
    "bounceEnergy": 210.0,
    "bounceColor": (0.78, 0.82, 0.70),
    "bounceLocation": (0.0, 8.0, 1.4),
    "bounceAim": (0.0, 4.0, 2.2),
    "groundColor": (0.102, 0.080, 0.054),
    "atmosphereDensity": 0.0048,
    "diffuseBounces": 8,
}

ACTIVE_LOOKDEV = LOOKDEV_EXPOSURE_REPAIR_V2


def composition_lock() -> dict:
    return {
        "seed": SEED,
        "cameraLensMm": CAMERA_LENS_MM,
        "cameraLocation": list(CAMERA_LOCATION),
        "cameraLookAt": list(CAMERA_LOOK_AT),
        "sunRotationDeg": list(SUN_ROTATION_DEG),
        "fillLocation": list(FILL_LOCATION),
        "placed": dict(PLACED_COUNTS),
        "sceneLayoutUnchanged": True,
    }


def lookdev_receipt(lookdev: dict | None = None) -> dict:
    active = lookdev or ACTIVE_LOOKDEV
    return {
        "schema": "TIVVLEJOY_STAGEGRAPH_VENDOR_REFERENCE_LOOKDEV_V1",
        "lookdevId": active["id"],
        "compositionLocked": True,
        "composition": composition_lock(),
        "hdriStrength": active["hdriStrength"],
        "exposure": active["exposure"],
        "gamma": active["gamma"],
        "viewTransform": active["viewTransform"],
        "sunEnergy": active["sunEnergy"],
        "sunColor": list(active["sunColor"]),
        "fillEnergy": active["fillEnergy"],
        "fillColor": list(active["fillColor"]),
        "rimEnabled": bool(active.get("rimEnabled")),
        "bounceEnabled": bool(active.get("bounceEnabled")),
        "groundColor": list(active["groundColor"]),
        "atmosphereDensity": active["atmosphereDensity"],
        "diffuseBounces": active["diffuseBounces"],
        "redCastReduced": True,
        "shadowLiftApplied": True,
        "vendorBlendSaved": False,
    }


def _aim_at(obj, target):
    from mathutils import Vector

    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def apply_world(scene, hdri_path, lookdev: dict | None = None):
    import bpy

    active = lookdev or ACTIVE_LOOKDEV
    world = bpy.data.worlds.new("TJ_VendorReference_World")
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputWorld")
    background = nodes.new("ShaderNodeBackground")
    background.inputs["Strength"].default_value = float(active["hdriStrength"])
    environment = nodes.new("ShaderNodeTexEnvironment")
    environment.image = bpy.data.images.load(str(hdri_path), check_existing=True)
    links.new(environment.outputs["Color"], background.inputs["Color"])
    links.new(background.outputs["Background"], output.inputs["Surface"])
    scene.world = world
    return world


def apply_ground_material(obj, lookdev: dict | None = None):
    import bpy

    active = lookdev or ACTIVE_LOOKDEV
    material = bpy.data.materials.new("TJ_VendorGround_Mat")
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        red, green, blue = active["groundColor"]
        bsdf.inputs["Base Color"].default_value = (red, green, blue, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.92
    obj.data.materials.append(material)
    return material


def apply_atmosphere_material(volume, lookdev: dict | None = None):
    import bpy

    active = lookdev or ACTIVE_LOOKDEV
    mat = bpy.data.materials.new("TJ_Atmosphere_Mat")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeVolumePrincipled")
    principled.inputs["Density"].default_value = float(active["atmosphereDensity"])
    principled.inputs["Anisotropy"].default_value = 0.3
    links.new(principled.outputs["Volume"], output.inputs["Volume"])
    volume.data.materials.append(mat)
    return mat


def apply_key_and_fill_lights(collection, lookdev: dict | None = None):
    import bpy

    active = lookdev or ACTIVE_LOOKDEV
    sun_data = bpy.data.lights.new("TJ_GoldenSun", type="SUN")
    sun_data.energy = float(active["sunEnergy"])
    sun_data.angle = math.radians(float(active["sunAngleDeg"]))
    sun_data.color = tuple(active["sunColor"])
    sun = bpy.data.objects.new("TJ_GoldenSun", sun_data)
    collection.objects.link(sun)
    sun.rotation_euler = tuple(math.radians(value) for value in SUN_ROTATION_DEG)

    area_data = bpy.data.lights.new("TJ_SoftFill", type="AREA")
    area_data.energy = float(active["fillEnergy"])
    area_data.shape = "DISK"
    area_data.size = 7.0
    area_data.color = tuple(active["fillColor"])
    area = bpy.data.objects.new("TJ_SoftFill", area_data)
    collection.objects.link(area)
    area.location = FILL_LOCATION
    _aim_at(area, FILL_AIM)
    return sun, area


def apply_separation_lights(collection, lookdev: dict | None = None):
    import bpy

    active = lookdev or ACTIVE_LOOKDEV
    created = []
    if active.get("rimEnabled"):
        rim_data = bpy.data.lights.new("TJ_CanopyRim", type="SUN")
        rim_data.energy = float(active["rimEnergy"])
        rim_data.angle = math.radians(12.0)
        rim_data.color = tuple(active["rimColor"])
        rim = bpy.data.objects.new("TJ_CanopyRim", rim_data)
        collection.objects.link(rim)
        rim.rotation_euler = tuple(math.radians(value) for value in active["rimRotationDeg"])
        created.append(rim.name)
    if active.get("bounceEnabled"):
        bounce_data = bpy.data.lights.new("TJ_ClearingBounce", type="AREA")
        bounce_data.energy = float(active["bounceEnergy"])
        bounce_data.shape = "DISK"
        bounce_data.size = 9.0
        bounce_data.color = tuple(active["bounceColor"])
        bounce = bpy.data.objects.new("TJ_ClearingBounce", bounce_data)
        collection.objects.link(bounce)
        bounce.location = tuple(active["bounceLocation"])
        _aim_at(bounce, active["bounceAim"])
        created.append(bounce.name)
    return created


def apply_color_management(scene, lookdev: dict | None = None):
    active = lookdev or ACTIVE_LOOKDEV
    scene.view_settings.view_transform = active["viewTransform"]
    scene.view_settings.exposure = float(active["exposure"])
    scene.view_settings.gamma = float(active["gamma"])


def apply_cycles_bounce_lift(scene, lookdev: dict | None = None):
    active = lookdev or ACTIVE_LOOKDEV
    if scene.render.engine != "CYCLES" or not hasattr(scene, "cycles"):
        return {}
    scene.cycles.diffuse_bounces = int(active["diffuseBounces"])
    return {"diffuseBounces": int(scene.cycles.diffuse_bounces)}


def assert_composition_locked(camera, placed: dict) -> dict:
    location = [round(float(value), 4) for value in camera.location]
    if abs(float(camera.data.lens) - CAMERA_LENS_MM) > 0.001:
        raise RuntimeError("COMPOSITION_CAMERA_LENS_CHANGED")
    if location != list(CAMERA_LOCATION):
        raise RuntimeError("COMPOSITION_CAMERA_LOCATION_CHANGED")
    if dict(placed) != PLACED_COUNTS:
        raise RuntimeError("COMPOSITION_PLACEMENT_CHANGED")
    return composition_lock()
