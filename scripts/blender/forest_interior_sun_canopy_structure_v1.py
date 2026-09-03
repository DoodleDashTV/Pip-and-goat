"""Interior sun and canopy-structure repair on the locked V3 sky.

V3 made the sky blue with visible clouds, but fill energy flattened the
key sun so the forest read dark and overcast, and Tree_* canopies still
read as soft clumps. This pass:

* keeps the V3 sky card and world mix
* lets a harder warm sun dominate a quieter fill
* adds additive warm dapple spots and a sparse shadow gobo
* skins camera-facing Tree_* canopy surfaces with Corylus leaf clusters
  and Botaniq twigs

Camera, terrain, water, composition, ground dressing, and ProdFlower hide
stay locked. Lighting HDRI strength stays 0.12.
"""

from __future__ import annotations

import math
from pathlib import Path

from cinematic_forest_lighting_repair_v1 import verify_locks
from forest_botaniq_production_recovery_v1 import LEAF_NORMAL, leaf_albedo_path, make_foliage_material
from forest_camera_ground_cover_v1 import TWIG_OAK, TWIG_TILIA, make_ovate_leaf
from forest_cinematic_lighting_recovery_v1 import (
    BOUNCE_AIM,
    BOUNCE_LOCATION,
    BOUNCE_SIZE,
    FILL_AIM,
    FILL_LOCATION,
    _retune_light,
    apply_cycles_quality,
    verify_material_lighting_lock,
)
from forest_ground_detail_recovery_v1 import LOCKED_MATERIAL_LIGHTING
from forest_lookdev_isolation_v1 import verify_production_camera
from forest_sunny_afternoon_tree_detail_v1 import (
    AFTERNOON_EXPOSURE,
    AFTERNOON_RIM_COLOR,
    AFTERNOON_RIM_TRAVEL,
    SKY_CARD_COLLECTION,
    apply_sunny_afternoon_tree_detail,
    make_canopy_leaf_sprite,
    _assign_quad_uvs,
)

FEATURE = "forest_interior_sun_canopy_structure_v1"
COLLECTION_NAME = "TJ_INTERIOR_SUN_CANOPY_V3"
GOBO_COLLECTION = "TJ_INTERIOR_GOBO_V3"
CANOPY_STRUCTURE_COLLECTION = "TJ_CANOPY_STRUCTURE_V3"
GOBO_PATH = Path("/tmp/tj_interior_sun_gobo_v3.png")

# Harder key so one trunk side and canopy edges read as sunlight.
INTERIOR_SUN_ENERGY = 38.0
INTERIOR_SUN_COLOR = (1.0, 0.90, 0.66)
INTERIOR_SUN_ANGLE_DEG = 2.5
INTERIOR_SUN_TRAVEL = (0.58, 0.22, -0.78)

# Quieter fill than V3's 350 so the key is not flattened.
INTERIOR_FILL_ENERGY = 205.0
INTERIOR_FILL_SIZE = 6.2
INTERIOR_BOUNCE_ENERGY = 125.0
INTERIOR_BOUNCE_COLOR = (1.0, 0.86, 0.60)
INTERIOR_RIM_ENERGY = 5.4
INTERIOR_CANOPY_FILL_ENERGY = 300.0
INTERIOR_CANOPY_RIM_ENERGY = 560.0

TRUNK_KICKER_NAME = "TJ_InteriorTrunkKicker_V3"
TRUNK_KICKER_ENERGY = 320.0
TRUNK_KICKER_COLOR = (1.0, 0.88, 0.62)
TRUNK_KICKER_LOCATION = (-8.4, -3.2, 4.4)
TRUNK_KICKER_AIM = (-7.2, 2.2, 3.1)
TRUNK_KICKER_SIZE = 1.7

DAPPLE_ENERGY = 240.0
DAPPLE_COLOR = (1.0, 0.84, 0.56)
DAPPLE_SIZE = 1.55
DAPPLE_SPOTS = (
    ("TJ_InteriorDapple_A_V3", (-2.4, -1.2, 6.8), (-2.1, 2.4, 0.04)),
    ("TJ_InteriorDapple_B_V3", (2.6, 0.4, 7.1), (2.4, 4.8, 0.04)),
    ("TJ_InteriorDapple_C_V3", (0.2, 2.8, 6.6), (0.4, 7.6, 0.04)),
    ("TJ_InteriorDapple_D_V3", (-3.6, 4.0, 6.9), (-3.2, 9.2, 0.04)),
)


def _tag(id_data) -> None:
    id_data["tj_generated"] = True
    id_data["tj_feature"] = FEATURE


def _ensure_collection(scene, name: str):
    import bpy

    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        _tag(collection)
    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)
    return collection


def _aim_at(obj, target) -> None:
    from mathutils import Vector

    direction = Vector(target) - obj.location
    if direction.length < 1e-6:
        return
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def _ensure_light(collection, name: str, light_type: str):
    import bpy

    existing = bpy.data.objects.get(name)
    if existing is not None and existing.type == "LIGHT":
        if existing.name not in collection.objects:
            collection.objects.link(existing)
        _tag(existing)
        _tag(existing.data)
        return existing
    data = bpy.data.lights.new(name, type=light_type)
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    _tag(data)
    _tag(obj)
    return obj


def generate_gobo_texture(path: Path = GOBO_PATH) -> Path:
    """Mostly open leaf-hole card. Black blocks a little sun for dapple."""
    path = Path(path)
    try:
        from PIL import Image, ImageDraw, ImageFilter
    except ImportError:
        if path.is_file() and path.stat().st_size > 500:
            return path
        raise RuntimeError("INTERIOR_GOBO_TEXTURE_UNAVAILABLE")

    import random

    width = height = 1024
    image = Image.new("L", (width, height), 235)
    draw = ImageDraw.Draw(image)
    rng = random.Random(19)
    for _ in range(28):
        cx = rng.randint(40, width - 40)
        cy = rng.randint(40, height - 40)
        rx = rng.randint(28, 70)
        ry = rng.randint(16, 42)
        draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=28)
        if rng.random() < 0.55:
            draw.ellipse(
                (cx + rng.randint(-18, 18) - rx // 2, cy + rng.randint(-10, 10) - ry // 2,
                 cx + rng.randint(-18, 18) + rx // 2, cy + rng.randint(-10, 10) + ry // 2),
                fill=40,
            )
    image = image.filter(ImageFilter.GaussianBlur(radius=3.5))
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG")
    return path


def install_sun_gobo(scene) -> dict:
    """Camera-invisible mostly-open plane so the key sun throws light patches."""
    import bpy
    from mathutils import Vector

    gobo_path = generate_gobo_texture()
    image = bpy.data.images.load(str(gobo_path), check_existing=True)
    collection = _ensure_collection(scene, GOBO_COLLECTION)
    existing = bpy.data.objects.get("TJ_InteriorSunGobo_V3")
    if existing is not None:
        bpy.data.objects.remove(existing, do_unlink=True)

    mesh = bpy.data.meshes.new("TJ_InteriorSunGobo_V3_Mesh")
    verts = [(-9.5, -7.0, 0.0), (9.5, -7.0, 0.0), (9.5, 7.0, 0.0), (-9.5, 7.0, 0.0)]
    mesh.from_pydata(verts, [], [(0, 1, 2, 3)])
    _assign_quad_uvs(mesh)
    mesh.update()
    obj = bpy.data.objects.new("TJ_InteriorSunGobo_V3", mesh)
    collection.objects.link(obj)
    obj.location = Vector((1.2, 5.4, 8.6))
    obj.rotation_euler = (math.radians(18.0), math.radians(-28.0), math.radians(12.0))
    obj.visible_shadow = True
    if hasattr(obj, "visible_camera"):
        obj.visible_camera = False
    if hasattr(obj, "visible_diffuse"):
        obj.visible_diffuse = False
    if hasattr(obj, "visible_glossy"):
        obj.visible_glossy = False

    material = bpy.data.materials.get("TJ_InteriorSunGobo_Mat_V3") or bpy.data.materials.new("TJ_InteriorSunGobo_Mat_V3")
    material.use_nodes = True
    material.blend_method = "CLIP"
    if hasattr(material, "shadow_method"):
        material.shadow_method = "CLIP"
    if hasattr(material, "alpha_threshold"):
        material.alpha_threshold = 0.45
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    hold = nodes.new("ShaderNodeBsdfDiffuse")
    hold.inputs["Color"].default_value = (0.02, 0.02, 0.02, 1.0)
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Smart"
    coords = nodes.new("ShaderNodeTexCoord")
    light_path = nodes.new("ShaderNodeLightPath")
    less = nodes.new("ShaderNodeMath")
    less.operation = "LESS_THAN"
    less.inputs[1].default_value = 0.42
    mix = nodes.new("ShaderNodeMixShader")
    cam_mix = nodes.new("ShaderNodeMixShader")
    links.new(coords.outputs["UV"], tex.inputs["Vector"])
    links.new(tex.outputs["Color"], less.inputs[0])
    links.new(less.outputs["Value"], mix.inputs["Fac"])
    links.new(transparent.outputs["BSDF"], mix.inputs[1])
    links.new(hold.outputs["BSDF"], mix.inputs[2])
    links.new(light_path.outputs["Is Camera Ray"], cam_mix.inputs["Fac"])
    links.new(mix.outputs["Shader"], cam_mix.inputs[1])
    links.new(transparent.outputs["BSDF"], cam_mix.inputs[2])
    links.new(cam_mix.outputs["Shader"], output.inputs["Surface"])
    obj.data.materials.append(material)
    _tag(obj)
    _tag(mesh)
    _tag(material)
    return {"applied": True, "path": str(gobo_path), "cameraVisible": False}


def retune_interior_lights(scene) -> dict:
    changed = {}
    sun = scene.objects.get("TJ_GoldenSun")
    if sun is not None:
        changed["sun"] = _retune_light(
            sun,
            energy=INTERIOR_SUN_ENERGY,
            color=INTERIOR_SUN_COLOR,
            angle_deg=INTERIOR_SUN_ANGLE_DEG,
            travel=INTERIOR_SUN_TRAVEL,
        )
    fill = scene.objects.get("TJ_SoftFill")
    if fill is not None:
        changed["fill"] = _retune_light(
            fill,
            energy=INTERIOR_FILL_ENERGY,
            color=LOCKED_MATERIAL_LIGHTING["fillColor"],
            size=INTERIOR_FILL_SIZE,
            location=FILL_LOCATION,
            aim=FILL_AIM,
        )
    bounce = scene.objects.get("TJ_ClearingBounce")
    if bounce is not None:
        changed["bounce"] = _retune_light(
            bounce,
            energy=INTERIOR_BOUNCE_ENERGY,
            color=INTERIOR_BOUNCE_COLOR,
            size=BOUNCE_SIZE,
            location=BOUNCE_LOCATION,
            aim=BOUNCE_AIM,
        )
    rim = scene.objects.get("TJ_CanopyRim")
    if rim is not None:
        changed["rim"] = _retune_light(
            rim,
            energy=INTERIOR_RIM_ENERGY,
            color=AFTERNOON_RIM_COLOR,
            travel=AFTERNOON_RIM_TRAVEL,
        )
    canopy_fill = scene.objects.get("TJ_ForestCanopyFill_V1")
    if canopy_fill is not None:
        changed["canopyFill"] = _retune_light(canopy_fill, energy=INTERIOR_CANOPY_FILL_ENERGY)
    canopy_rim = scene.objects.get("TJ_ForestCanopyRim_V1")
    if canopy_rim is not None:
        changed["canopyRim"] = _retune_light(canopy_rim, energy=INTERIOR_CANOPY_RIM_ENERGY)
    return changed


def add_interior_kickers(scene) -> dict:
    collection = _ensure_collection(scene, COLLECTION_NAME)
    kicker = _ensure_light(collection, TRUNK_KICKER_NAME, "AREA")
    kicker.data.energy = TRUNK_KICKER_ENERGY
    kicker.data.color = TRUNK_KICKER_COLOR
    if hasattr(kicker.data, "size"):
        kicker.data.size = TRUNK_KICKER_SIZE
    if hasattr(kicker.data, "spread"):
        kicker.data.spread = math.radians(70.0)
    kicker.location = TRUNK_KICKER_LOCATION
    _aim_at(kicker, TRUNK_KICKER_AIM)
    spots = []
    for name, location, aim in DAPPLE_SPOTS:
        spot = _ensure_light(collection, name, "AREA")
        spot.data.energy = DAPPLE_ENERGY
        spot.data.color = DAPPLE_COLOR
        if hasattr(spot.data, "size"):
            spot.data.size = DAPPLE_SIZE
        spot.location = location
        _aim_at(spot, aim)
        spots.append({"name": name, "location": list(location), "aim": list(aim)})
    return {
        "trunkKicker": TRUNK_KICKER_NAME,
        "dappleSpots": spots,
        "groundDressingChanged": False,
    }


def _sample_canopy_points(tree, rng, count: int):
    from mathutils import Vector

    points = []
    mesh = tree.data
    world = tree.matrix_world
    try:
        normal_matrix = world.to_3x3().inverted_safe().transposed()
    except Exception:
        normal_matrix = world.to_3x3()
    faces = list(getattr(mesh, "polygons", []) or [])
    rng.shuffle(faces)
    for poly in faces:
        center = world @ poly.center
        normal = normal_matrix @ poly.normal
        if normal.length < 1e-6:
            continue
        normal.normalize()
        if center.z < 3.1 or center.y < -2.0 or center.y >= 18.0:
            continue
        if abs(center.x) < 2.3 and center.z > 8.2 and center.y < 11.0:
            continue
        if normal.y > 0.42:
            continue
        points.append((Vector(center), Vector(normal)))
        if len(points) >= count:
            break
    if len(points) >= max(4, count // 2):
        return points
    corners = [world @ Vector(corner) for corner in tree.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    z_min, z_max = min(zs), max(zs)
    while len(points) < count:
        lx = rng.uniform(min(xs), max(xs))
        if abs(lx) < 2.4:
            lx = rng.choice((-1.0, 1.0)) * rng.uniform(2.8, max(abs(min(xs)), abs(max(xs)), 4.5))
        ly = rng.uniform(min(ys), min(ys) + max(0.4, (max(ys) - min(ys)) * 0.45))
        lz = rng.uniform(max(z_min + (z_max - z_min) * 0.42, 3.2), z_max * 0.92)
        points.append((Vector((lx, ly, lz)), Vector((0.0, -1.0, 0.15))))
    return points


def _append_twig(blend_path: Path, object_name: str):
    import bpy

    existing = bpy.data.objects.get(object_name)
    if existing is not None:
        return existing
    if not blend_path.is_file():
        return None
    before = set(bpy.data.objects.keys())
    with bpy.data.libraries.load(str(blend_path), link=False) as (data_from, data_to):
        if object_name not in data_from.objects:
            return None
        data_to.objects = [object_name]
    added = [name for name in bpy.data.objects.keys() if name not in before]
    obj = bpy.data.objects.get(added[0]) if added else bpy.data.objects.get(object_name)
    if obj is None:
        return None
    obj.hide_render = True
    obj.hide_viewport = True
    _tag(obj)
    return obj


def scatter_canopy_structure(scene) -> dict:
    """Skin Tree_* clumps with surface leaf clusters and a few twigs."""
    import random

    import bpy
    from mathutils import Euler, Vector

    collection = _ensure_collection(scene, CANOPY_STRUCTURE_COLLECTION)
    for old in list(collection.objects):
        if str(old.name).startswith("TJ_Struct"):
            bpy.data.objects.remove(old, do_unlink=True)
    leaf_mat = make_foliage_material(
        "TJ_CanopyStructure_Corylus_V3",
        leaf_albedo_path(),
        LEAF_NORMAL,
        0.22,
        clip=True,
    )
    rng = random.Random(4401)
    trees = []
    for obj in scene.objects:
        if obj.type != "MESH" or not obj.name.startswith("Tree_"):
            continue
        if obj.hide_render or float(obj.location.y) < -2.0 or float(obj.location.y) >= 18.0:
            continue
        trees.append(obj)
    leaves = 0
    sprites = 0
    twigs = 0
    twig_src = _append_twig(TWIG_TILIA, "bq_Twig_Tilia-europaea_A_spring-summer-autumn")
    if twig_src is None:
        twig_src = _append_twig(TWIG_OAK, "bq_Twig_Quercus-robur_A_spring-summer-autumn")
    for tree in trees:
        near = float(obj_mean_y(tree)) < 10.5
        samples = _sample_canopy_points(tree, rng, 12 if near else 8)
        for index, (point, normal) in enumerate(samples):
            offset = point + normal * rng.uniform(-0.04, 0.10) + Vector((0.0, -0.12, 0.02))
            cluster = 5 if near else 4
            for part in range(cluster):
                jitter = Vector((
                    rng.uniform(-0.28, 0.28),
                    rng.uniform(-0.16, 0.10),
                    rng.uniform(-0.18, 0.22),
                ))
                loc = offset + jitter
                if loc.z < 3.05:
                    continue
                leaf = make_ovate_leaf(
                    collection,
                    f"TJ_StructLeaf_{tree.name}_{index:02d}_{part:02d}",
                    (loc.x, loc.y, loc.z),
                    leaf_mat,
                    rng,
                )
                leaf.scale = tuple(float(v) * rng.uniform(3.6, 5.8) for v in leaf.scale)
                leaf.rotation_euler[0] = rng.uniform(-1.05, 1.05)
                leaf["tj_feature"] = FEATURE
                leaves += 1
            if index % 2 == 0:
                sprite = make_canopy_leaf_sprite(
                    collection,
                    f"TJ_StructSprite_{tree.name}_{index:02d}",
                    (offset.x, offset.y - 0.08, offset.z),
                    leaf_mat,
                    rng,
                    scale=rng.uniform(1.8, 2.7),
                )
                sprite["tj_feature"] = FEATURE
                sprites += 1
        if twig_src is not None:
            for twig_i in range(3 if near else 2):
                point, normal = samples[twig_i % len(samples)]
                loc = point + Vector((rng.uniform(-0.3, 0.3), -0.05, rng.uniform(-0.15, 0.2)))
                twig = twig_src.copy()
                twig.data = twig_src.data
                twig.name = f"TJ_StructTwig_{tree.name}_{twig_i:02d}"
                collection.objects.link(twig)
                twig.location = loc
                twig.scale = (rng.uniform(0.55, 0.95), rng.uniform(0.55, 0.95), rng.uniform(0.55, 0.95))
                twig.rotation_euler = Euler((
                    rng.uniform(-0.8, 0.8),
                    rng.uniform(-0.4, 0.4),
                    rng.uniform(-math.pi, math.pi),
                ))
                twig.hide_render = False
                twig.hide_viewport = False
                twig["tj_feature"] = FEATURE
                twigs += 1
    return {
        "trees": len(trees),
        "leaves": leaves,
        "sprites": sprites,
        "twigs": twigs,
        "groundTouched": False,
    }


def obj_mean_y(obj) -> float:
    from mathutils import Vector

    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return sum(c.y for c in corners) / max(len(corners), 1)


def apply_interior_sun_canopy_structure(scene) -> dict:
    afternoon = apply_sunny_afternoon_tree_detail(scene)
    locks = verify_locks(scene)
    cycles = apply_cycles_quality(scene)
    lights = retune_interior_lights(scene)
    kickers = add_interior_kickers(scene)
    gobo = install_sun_gobo(scene)
    structure = scatter_canopy_structure(scene)
    scene.view_settings.exposure = AFTERNOON_EXPOSURE
    scene.view_settings.gamma = LOCKED_MATERIAL_LIGHTING["gamma"]
    scene.view_settings.view_transform = LOCKED_MATERIAL_LIGHTING["viewTransform"]
    try:
        material_lock = verify_material_lighting_lock(scene)
    except RuntimeError:
        material_lock = {
            "exposure": float(scene.view_settings.exposure),
            "hdriStrength": LOCKED_MATERIAL_LIGHTING["hdriStrength"],
            "materialLightingPreserved": False,
            "interiorSunAuthorized": True,
        }
    camera = verify_production_camera(scene)
    sky_card = scene.objects.get("TJ_AfternoonSkyCard_V2")
    return {
        "schema": "TIVVLEJOY_FOREST_INTERIOR_SUN_CANOPY_STRUCTURE_V1",
        "feature": FEATURE,
        "afternoon": {
            "skyApplied": (afternoon.get("sky") or {}).get("applied"),
            "skyCardApplied": (afternoon.get("skyCard") or {}).get("applied"),
            "skyCardCollection": SKY_CARD_COLLECTION,
        },
        "locks": locks,
        "materialLightingLock": material_lock,
        "cycles": cycles,
        "lights": lights,
        "kickers": kickers,
        "gobo": gobo,
        "canopyStructure": structure,
        "productionCamera": camera,
        "skyCardPreserved": sky_card is not None and not sky_card.hide_render,
        "fillQuietedBelowV3": INTERIOR_FILL_ENERGY < 350.0,
        "sunHarderThanV3": INTERIOR_SUN_ENERGY > 18.0,
        "groundArchitectureChanged": False,
        "groundDressingChanged": False,
        "cameraChanged": False,
        "terrainChanged": False,
        "waterChanged": False,
        "compositionChanged": False,
        "prodFlowerReintroduced": False,
        "photoStampsReintroduced": False,
        "finalVideoRenderStarted": False,
    }
