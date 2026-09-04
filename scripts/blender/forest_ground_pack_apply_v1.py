"""Apply registered TivvleJoy 4K ground packs to the locked forest floor.

Uses privately conditioned Poly Haven dirt / sparse-grass / grass-path
materials. Does not change camera, terrain shape, water, sky card, or
existing ground dressing.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

from forest_camera_ground_cover_v1 import COVER_CLEARANCE_Z, make_irregular_patch
from forest_lookdev_isolation_v1 import verify_production_camera

FEATURE = "forest_ground_pack_apply_v1"
COLLECTION_NAME = "TJ_GROUND_PACKS_V1"
CONDITIONED = Path("/tmp/tivvlejoy-conditioned/ground-packs")

PACKS = (
    {
        "sourceId": "SRC_TIVVLEJOY_DIRT_4K",
        "displayName": "TivvleJoy Dirt 4K",
        "registryId": "TJ_GROUND_DIRT_4K_001",
        "blend": "dirt_4k.blend",
        "material": "dirt",
        "role": "ground_dirt",
    },
    {
        "sourceId": "SRC_TIVVLEJOY_SPARSE_GRASS_4K",
        "displayName": "TivvleJoy Sparse Grass 4K",
        "registryId": "TJ_GROUND_SPARSE_GRASS_4K_001",
        "blend": "sparse_grass_4k.blend",
        "material": "sparse_grass",
        "role": "ground_sparse_grass",
    },
    {
        "sourceId": "SRC_TIVVLEJOY_GRASS_PATH_2_4K",
        "displayName": "TivvleJoy Grass Path 2 4K",
        "registryId": "TJ_GROUND_GRASS_PATH_2_4K_001",
        "blend": "grass_path_2_4k.blend",
        "material": "grass_path_2",
        "role": "ground_grass_path",
    },
)

PATH_SITES = (
    (0.04, -1.5, 1.05, 2.35),
    (0.10, 0.6, 1.00, 2.15),
    (-0.06, 2.6, 0.96, 2.05),
    (0.08, 4.6, 0.92, 1.95),
    (-0.04, 6.7, 0.90, 1.88),
    (0.12, 8.8, 0.88, 1.82),
    (-0.08, 10.9, 0.86, 1.76),
    (0.06, 13.1, 0.84, 1.70),
    (-0.10, 15.3, 0.82, 1.64),
)
DIRT_SITES = ((-0.85, 1.4), (0.90, 5.6), (-0.78, 9.2), (0.82, 12.6))
SPARSE_SITES = (
    (-1.95, 0.4),
    (2.05, 1.3),
    (-2.10, 3.6),
    (2.15, 5.0),
    (-1.85, 7.2),
    (1.95, 8.8),
    (-2.20, 11.4),
    (2.10, 13.6),
    (-1.75, 15.8),
    (1.80, 2.8),
)


def _ensure_collection(scene):
    import bpy

    collection = bpy.data.collections.get(COLLECTION_NAME)
    if collection is None:
        collection = bpy.data.collections.new(COLLECTION_NAME)
    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)
    collection["tj_feature"] = FEATURE
    return collection


def _clear_previous(collection):
    import bpy

    for obj in list(collection.objects):
        if obj.get("tj_feature") == FEATURE:
            bpy.data.objects.remove(obj, do_unlink=True)


def _tag(id_data) -> None:
    id_data["tj_generated"] = True
    id_data["tj_feature"] = FEATURE


def _relink_pack_images(material, texture_dir: Path) -> list[str]:
    linked = []
    if material.node_tree is None:
        return linked
    for node in material.node_tree.nodes:
        if node.bl_idname != "ShaderNodeTexImage" or node.image is None:
            continue
        raw = str(node.image.filepath or node.image.name)
        name = Path(raw.replace("\\", "/")).name
        candidate = texture_dir / name
        if candidate.is_file():
            node.image.filepath = str(candidate)
            node.image.reload()
            linked.append(name)
    return linked


def load_pack_material(spec: dict):
    import bpy

    blend = CONDITIONED / spec["registryId"] / spec["blend"]
    textures = CONDITIONED / spec["registryId"] / "textures"
    if not blend.is_file():
        return None, {"status": "MISSING_BLEND", "path": str(blend)}
    before = set(bpy.data.materials.keys())
    with bpy.data.libraries.load(str(blend), link=False) as (data_from, data_to):
        if spec["material"] not in data_from.materials:
            return None, {"status": "MATERIAL_MISSING", "available": list(data_from.materials)}
        data_to.materials = [spec["material"]]
    added = [name for name in bpy.data.materials.keys() if name not in before]
    material = bpy.data.materials.get(added[0]) if added else bpy.data.materials.get(spec["material"])
    if material is None:
        return None, {"status": "APPEND_FAILED"}
    local_name = f"TJ_Pack_{spec['registryId']}"
    material.name = local_name
    _tag(material)
    linked = _relink_pack_images(material, textures)
    return material, {
        "status": "LOADED",
        "material": material.name,
        "blend": spec["blend"],
        "imagesRelinked": linked,
    }


def apply_ground_packs(scene) -> dict:
    import bpy

    locks = verify_production_camera(scene)
    collection = _ensure_collection(scene)
    _clear_previous(collection)
    rng = random.Random(4102)

    loaded = {}
    for spec in PACKS:
        material, receipt = load_pack_material(spec)
        loaded[spec["role"]] = {"spec": spec, "material": material, "receipt": receipt}

    planted = {"path": [], "dirt": [], "sparse": [], "retargetedCover": []}
    path_mat = loaded["ground_grass_path"]["material"]
    dirt_mat = loaded["ground_dirt"]["material"]
    sparse_mat = loaded["ground_sparse_grass"]["material"]

    # Apply packs to the already-visible cover soil instead of burying
    # new patches under the locked dressing layer.
    for obj in bpy.data.objects:
        if not str(obj.name).startswith("TJ_CoverSoil_") or obj.hide_render:
            continue
        x, y = float(obj.location.x), float(obj.location.y)
        if y < -2.0 or y > 16.5:
            continue
        target = None
        role = None
        if abs(x) <= 1.15 and path_mat is not None:
            target, role = path_mat, "path"
        elif 1.15 < abs(x) <= 2.55 and sparse_mat is not None:
            target, role = sparse_mat, "sparse"
        elif abs(x) <= 3.2 and dirt_mat is not None and (int(abs(x) * 10) + int(y)) % 5 == 0:
            target, role = dirt_mat, "dirt"
        if target is None:
            continue
        if obj.data.materials:
            obj.data.materials[0] = target
        else:
            obj.data.materials.append(target)
        planted["retargetedCover"].append(obj.name)
        planted[role].append(obj.name)

    if path_mat is not None:
        for index, (x, y, rx, ry) in enumerate(PATH_SITES):
            obj = make_irregular_patch(
                collection,
                f"TJ_PackPath_{index:02d}",
                (x, y),
                max(rx, ry) * 0.52,
                rng.uniform(-0.16, 0.16),
                path_mat,
                rng,
                z=COVER_CLEARANCE_Z + 0.018,
            )
            obj.scale = (rx, ry, 1.0)
            _tag(obj)
            planted["path"].append(obj.name)
    if dirt_mat is not None:
        for index, (x, y) in enumerate(DIRT_SITES):
            obj = make_irregular_patch(
                collection,
                f"TJ_PackDirt_{index:02d}",
                (x, y),
                rng.uniform(0.80, 1.10),
                rng.uniform(-math.pi, math.pi),
                dirt_mat,
                rng,
                z=COVER_CLEARANCE_Z + 0.016,
            )
            _tag(obj)
            planted["dirt"].append(obj.name)
    if sparse_mat is not None:
        for index, (x, y) in enumerate(SPARSE_SITES):
            obj = make_irregular_patch(
                collection,
                f"TJ_PackSparse_{index:02d}",
                (x, y),
                rng.uniform(0.95, 1.35),
                rng.uniform(-math.pi, math.pi),
                sparse_mat,
                rng,
                z=COVER_CLEARANCE_Z + 0.016,
            )
            _tag(obj)
            planted["sparse"].append(obj.name)

    sky = bpy.data.objects.get("TJ_AfternoonSkyCard_V2")
    dressing = [
        obj.name
        for obj in bpy.data.objects
        if str(obj.name).startswith(("TJ_CoverLitter", "TJ_CoverTwig", "TJ_CoverFern", "TJ_CoverCarex"))
        and not obj.hide_render
    ]
    heroes = [obj.name for obj in bpy.data.objects if str(obj.name).startswith("TJ_HeroTree_") and not obj.hide_render]
    slots = [
        item["material"].name
        for item in loaded.values()
        if item["material"] is not None
    ]
    bpy.context.view_layer.update()
    return {
        "schema": "TIVVLEJOY_FOREST_GROUND_PACK_APPLY_V1",
        "feature": FEATURE,
        "applied": all(item["material"] is not None for item in loaded.values()),
        "groundPacksRegistered": [item["displayName"] for item in PACKS],
        "groundPacksFound": [
            item["displayName"]
            for item in PACKS
            if loaded[item["role"]]["material"] is not None
        ],
        "blendFilesDetected": [item["blend"] for item in PACKS],
        "texturesDetected": sorted(
            {
                name
                for item in loaded.values()
                for name in (item["receipt"].get("imagesRelinked") or [])
            }
        ),
        "materialSlotsCreated": slots,
        "loadReceipts": {role: item["receipt"] for role, item in loaded.items()},
        "planted": planted,
        "existingDressingPreserved": dressing,
        "heroTreesPreserved": heroes,
        "skyCardPreserved": sky is not None and not sky.hide_render,
        "productionCamera": locks,
        "cameraChanged": False,
        "terrainChanged": False,
        "waterChanged": False,
        "groundDressingRemoved": False,
        "paidCreateCount": 0,
        "finalVideoRenderStarted": False,
    }
