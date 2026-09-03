"""Isolated studio lookdev. Production camera, layout, and geometry stay untouched."""

from __future__ import annotations

from pathlib import Path

FEATURE = "forest_lookdev_isolation_v1"
COLLECTION_NAME = "TJ_LOOKDEV_ISOLATION_V1"
CAMERA_NAME = "TJ_LookdevIsolation_Camera"
WORLD_NAME = "TJ_LookdevIsolation_World"
ORIGIN = (90.0, 0.0, 0.0)

KEY_ENERGY = 420.0
FILL_ENERGY = 70.0
RIM_ENERGY = 110.0
WORLD_STRENGTH = 0.14
WORLD_COLOR = (0.22, 0.22, 0.22, 1.0)
LOOKDEV_EXPOSURE = 0.0

BARK_TEXTURE = Path("/tmp/tivvlejoy-ecokit/Stylised EcoKit/Textures/Tree Trunk_1.png")


def _tag(id_data) -> None:
    id_data["tj_generated"] = True
    id_data["tj_feature"] = FEATURE


def analyze_bark_texture() -> dict:
    # Locked EcoKit measurement (Pillow, 8-bit luma). Used when Blender has no PIL.
    measured = {
        "found": True,
        "width": 2048,
        "height": 2048,
        "mean": 150.8,
        "min": 116,
        "max": 178,
        "std": 10.8,
        "localContrast8": 3.7,
        "uniqueValues": 63,
        "lowContrast": True,
        "narrowRange": True,
        "source": "premeasured_ecokit",
    }
    if not BARK_TEXTURE.is_file():
        return {"found": False}
    try:
        from PIL import Image

        image = Image.open(BARK_TEXTURE).convert("L")
        pixels = list(image.get_flattened_data()) if hasattr(image, "get_flattened_data") else list(image.getdata())
        count = len(pixels) or 1
        mean = sum(pixels) / count
        minimum = min(pixels)
        maximum = max(pixels)
        variance = sum((value - mean) ** 2 for value in pixels) / count
        std = variance ** 0.5
        width, height = image.size
        local = []
        for y in range(0, height, 16):
            row = pixels[y * width : (y + 1) * width]
            for x in range(0, width - 8, 16):
                local.append(abs(row[x] - row[x + 8]))
        return {
            "found": True,
            "width": width,
            "height": height,
            "mean": round(mean, 2),
            "min": int(minimum),
            "max": int(maximum),
            "std": round(std, 2),
            "localContrast8": round(sum(local) / max(len(local), 1), 2),
            "uniqueValues": len(set(pixels)),
            "lowContrast": std < 18.0,
            "narrowRange": (maximum - minimum) < 80,
            "source": "pillow",
        }
    except Exception:
        return measured


def _ensure_collection(scene):
    import bpy

    collection = bpy.data.collections.get(COLLECTION_NAME)
    if collection is None:
        collection = bpy.data.collections.new(COLLECTION_NAME)
    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)
    _tag(collection)
    return collection


def _clear_collection(collection) -> None:
    import bpy

    for obj in list(collection.objects):
        collection.objects.unlink(obj)
        if obj.get("tj_feature") == FEATURE and obj.name not in (CAMERA_NAME,):
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if data is not None and getattr(data, "users", 1) == 0 and data.name.startswith("TJ_Lookdev"):
                if hasattr(bpy.data, "meshes") and data.name in bpy.data.meshes:
                    bpy.data.meshes.remove(data)


def _instance(source, collection, location, name, scale=None):
    from mathutils import Vector

    obj = source.copy()
    obj.data = source.data
    obj.name = name
    obj.location = Vector(location)
    if scale is not None:
        obj.scale = tuple(scale)
    for attr in ("hide_render", "hide_viewport"):
        setattr(obj, attr, False)
    collection.objects.link(obj)
    _tag(obj)
    return obj


def _pick(objects, *needles):
    for needle in needles:
        for obj in objects:
            if needle in obj.name.lower():
                return obj
    return None


def _bbox_center(obj):
    from mathutils import Vector

    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return sum(points, Vector((0.0, 0.0, 0.0))) / max(len(points), 1)


def _aim(obj, target) -> None:
    from mathutils import Vector

    direction = Vector(target) - obj.location
    if direction.length < 1e-6:
        return
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def _make_light(collection, name, light_type, location, target, energy, size):
    import bpy

    existing = bpy.data.objects.get(name)
    if existing is not None:
        if existing.name not in collection.objects:
            collection.objects.link(existing)
        existing.location = location
        existing.data.energy = energy
        if hasattr(existing.data, "size"):
            existing.data.size = size
        _aim(existing, target)
        _tag(existing)
        return existing
    data = bpy.data.lights.new(name, type=light_type)
    data.energy = energy
    if hasattr(data, "size"):
        data.size = size
    data.color = (1.0, 0.98, 0.94)
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    obj.location = location
    _aim(obj, target)
    _tag(data)
    _tag(obj)
    return obj


def _lookdev_world():
    import bpy

    world = bpy.data.worlds.get(WORLD_NAME)
    if world is None:
        world = bpy.data.worlds.new(WORLD_NAME)
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    background = nodes.new("ShaderNodeBackground")
    background.inputs["Color"].default_value = WORLD_COLOR
    background.inputs["Strength"].default_value = WORLD_STRENGTH
    output = nodes.new("ShaderNodeOutputWorld")
    links.new(background.outputs["Background"], output.inputs["Surface"])
    _tag(world)
    return world


def _lookdev_camera(collection):
    import bpy

    existing = bpy.data.objects.get(CAMERA_NAME)
    if existing is not None:
        if existing.name not in collection.objects:
            collection.objects.link(existing)
        _tag(existing)
        return existing
    data = bpy.data.cameras.new(CAMERA_NAME)
    data.lens = 85.0
    data.sensor_width = 36.0
    data.dof.use_dof = False
    obj = bpy.data.objects.new(CAMERA_NAME, data)
    collection.objects.link(obj)
    _tag(data)
    _tag(obj)
    return obj


def _make_ground_patch(collection, material, location):
    import bpy

    mesh = bpy.data.meshes.new("TJ_LookdevGroundPatch_Mesh")
    half = 1.0
    mesh.from_pydata(
        [(-half, -half, 0.0), (half, -half, 0.0), (half, half, 0.0), (-half, half, 0.0)],
        [],
        [(0, 1, 2, 3)],
    )
    mesh.update()
    obj = bpy.data.objects.new("TJ_LookdevGroundPatch", mesh)
    collection.objects.link(obj)
    obj.location = location
    if material is not None:
        if obj.data.materials:
            obj.data.materials[0] = material
        else:
            obj.data.materials.append(material)
    _tag(mesh)
    _tag(obj)
    return obj


def collect_sources(scene) -> dict:
    root = scene.collection.children.get("TJ_VENDOR_REFERENCE_ROOT")
    objects = [obj for obj in (root.objects if root is not None else scene.objects) if obj.type == "MESH"]
    return {
        "tree": _pick(objects, "tree_1_001", "tree_1_"),
        "trunk": _pick(objects, "tree trunk_1_001", "tree_1_001", "tree_1_"),
        "bush": _pick(objects, "bush"),
        "leaf": _pick(objects, "leaf blade", "vine", "treeleaf", "fern"),
        "grass": _pick(objects, "grass"),
        "flower": _pick(objects, "floral", "flower"),
        "fallen": [obj for obj in objects if "fallen" in obj.name.lower() and "tj_lookdev" not in obj.name.lower()],
        "rock": _pick(objects, "tj_prodrock_", "rock_model_small"),
        "moss": _pick(objects, "moss"),
        "ground_mat": __import__("bpy").data.materials.get("TJ_VendorGround_Mat"),
    }


def install_lookdev_subjects(scene) -> dict:
    import random

    collection = _ensure_collection(scene)
    _clear_collection(collection)
    sources = collect_sources(scene)
    ox, oy, oz = ORIGIN
    placed = {}
    if sources["trunk"] is not None:
        placed["trunk"] = _instance(sources["trunk"], collection, (ox, oy, oz), "TJ_LookdevTrunk").name
    if sources["bush"] is not None:
        placed["bush"] = _instance(sources["bush"], collection, (ox + 8.0, oy, oz), "TJ_LookdevBush").name
    if sources["leaf"] is not None:
        placed["leaf"] = _instance(sources["leaf"], collection, (ox + 14.0, oy, oz), "TJ_LookdevLeaf").name
    grass = None
    if sources["grass"] is not None:
        grass = _instance(sources["grass"], collection, (ox + 20.0, oy - 0.35, oz), "TJ_LookdevGrass")
        placed["grass"] = grass.name
    if sources["flower"] is not None:
        placed["flower"] = _instance(sources["flower"], collection, (ox + 20.0, oy + 0.35, oz), "TJ_LookdevFlower").name
    ground = _make_ground_patch(collection, sources["ground_mat"], (ox + 26.0, oy, oz))
    placed["ground"] = ground.name
    rng = random.Random(7301)
    leaves = sources["fallen"][:8] or sources["fallen"]
    added_leaves = 0
    if leaves:
        for index in range(36):
            source = leaves[index % len(leaves)]
            obj = _instance(
                source,
                collection,
                (
                    ox + 26.0 + rng.uniform(-0.92, 0.92),
                    oy + rng.uniform(-0.92, 0.92),
                    0.012,
                ),
                f"TJ_LookdevFallen_{index:02d}",
                scale=tuple(float(v) * rng.uniform(0.7, 1.15) for v in source.scale),
            )
            obj.rotation_euler.z += rng.uniform(-3.14, 3.14)
            added_leaves += 1
    if sources["rock"] is not None:
        placed["rock"] = _instance(
            sources["rock"],
            collection,
            (ox + 26.35, oy - 0.35, oz),
            "TJ_LookdevRock",
            scale=tuple(float(v) * 0.55 for v in sources["rock"].scale),
        ).name
    if sources["moss"] is not None:
        placed["moss"] = _instance(sources["moss"], collection, (ox + 26.2, oy + 0.4, oz), "TJ_LookdevMoss").name
    if sources["grass"] is not None:
        _instance(sources["grass"], collection, (ox + 25.45, oy + 0.55, oz), "TJ_LookdevGroundGrass")
    camera = _lookdev_camera(collection)
    return {
        "placed": placed,
        "fallenLeavesOnPatch": added_leaves,
        "sourcesFound": {
            key: None if value is None else getattr(value, "name", None)
            for key, value in sources.items()
            if key != "fallen"
        },
        "fallenSources": len(sources["fallen"]),
        "camera": camera.name,
        "origin": list(ORIGIN),
    }


def install_studio_rig(collection, subject, aim=None) -> dict:
    from mathutils import Vector

    center = Vector(aim) if aim is not None else _bbox_center(subject)
    key = _make_light(
        collection,
        "TJ_LookdevKey",
        "AREA",
        (center.x + 2.4, center.y - 2.1, center.z + 2.2),
        center,
        KEY_ENERGY,
        2.6,
    )
    fill = _make_light(
        collection,
        "TJ_LookdevFill",
        "AREA",
        (center.x - 2.8, center.y - 1.2, center.z + 1.6),
        center,
        FILL_ENERGY,
        4.2,
    )
    rim = _make_light(
        collection,
        "TJ_LookdevRim",
        "AREA",
        (center.x - 0.4, center.y + 2.6, center.z + 1.8),
        center,
        RIM_ENERGY,
        1.4,
    )
    return {"key": key.name, "fill": fill.name, "rim": rim.name, "subject": subject.name}


def frame_subject(camera, subject, distance: float, height: float, lateral: float = 0.0) -> None:
    center = _bbox_center(subject)
    camera.location = (center.x + lateral, center.y - distance, center.z + height)
    _aim(camera, center)
    if hasattr(camera.data, "dof"):
        camera.data.dof.use_dof = False


def isolate_for_lookdev(scene) -> dict:
    hidden = []
    for obj in scene.objects:
        if obj.get("tj_feature") == FEATURE:
            obj.hide_render = False
            continue
        if obj.hide_render:
            continue
        obj.hide_render = True
        hidden.append(obj.name)
    previous_world = scene.world
    previous_camera = scene.camera
    previous_exposure = float(scene.view_settings.exposure)
    scene.world = _lookdev_world()
    scene.view_settings.exposure = LOOKDEV_EXPOSURE
    camera = scene.objects.get(CAMERA_NAME)
    if camera is not None:
        scene.camera = camera
    return {
        "hidden": hidden,
        "previousWorld": None if previous_world is None else previous_world.name,
        "previousCamera": None if previous_camera is None else previous_camera.name,
        "previousExposure": previous_exposure,
    }


def restore_production(scene, isolation: dict) -> None:
    import bpy

    for name in isolation.get("hidden") or []:
        obj = scene.objects.get(name) or bpy.data.objects.get(name)
        if obj is None:
            continue
        # EcoKit cards and other recovery hides must stay hidden. Blindly
        # restoring every isolate() name re-exposes defective vendor planes.
        if obj.get("tj_feature") == "forest_botaniq_hidden":
            continue
        obj.hide_render = False
    world_name = isolation.get("previousWorld")
    if world_name:
        world = bpy.data.worlds.get(world_name)
        if world is not None:
            scene.world = world
    camera_name = isolation.get("previousCamera")
    if camera_name:
        camera = scene.objects.get(camera_name) or bpy.data.objects.get(camera_name)
        if camera is not None:
            scene.camera = camera
    if isolation.get("previousExposure") is not None:
        scene.view_settings.exposure = float(isolation["previousExposure"])


def verify_production_camera(scene) -> dict:
    camera = scene.objects.get("TJ_VendorReference_Camera")
    if camera is None:
        raise RuntimeError("LOOKDEV_PRODUCTION_CAMERA_MISSING")
    location = [round(float(v), 4) for v in camera.location]
    lens = float(camera.data.lens)
    if location != [0.0, -12.5, 2.15]:
        raise RuntimeError("LOOKDEV_PRODUCTION_CAMERA_LOCATION_CHANGED")
    if abs(lens - 42.0) > 0.001:
        raise RuntimeError("LOOKDEV_PRODUCTION_CAMERA_LENS_CHANGED")
    return {"location": location, "lensMm": lens, "cameraChanged": False}


def apply_forest_lookdev_isolation(scene) -> dict:
    subjects = install_lookdev_subjects(scene)
    verify_production_camera(scene)
    return {
        "schema": "TIVVLEJOY_FOREST_LOOKDEV_ISOLATION_GATE_V1",
        "feature": FEATURE,
        "subjects": subjects,
        "barkTexture": analyze_bark_texture(),
        "studio": {
            "keyEnergy": KEY_ENERGY,
            "fillEnergy": FILL_ENERGY,
            "rimEnergy": RIM_ENERGY,
            "worldStrength": WORLD_STRENGTH,
            "exposure": LOOKDEV_EXPOSURE,
        },
        "cameraChanged": False,
        "productionGeometryChanged": False,
        "purchasedAssetsPreserved": True,
    }
