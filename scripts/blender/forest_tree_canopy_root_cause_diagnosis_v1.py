"""Root-cause diagnosis for soft/clumped camera-visible EcoKit trees.

Does not repair. Does not start final video. Does not change locked camera,
terrain, water, composition, ground dressing, or sky.
"""

from __future__ import annotations

from pathlib import Path

from forest_interior_sun_canopy_structure_v1 import INTERIOR_SUN_TRAVEL
from forest_lookdev_isolation_v1 import verify_production_camera

FEATURE = "forest_tree_canopy_root_cause_diagnosis_v1"
BACKGROUND_Y = 18.0
CAMERA_NAME = "TJ_VendorReference_Camera"

BOTANIQ_SEARCH_DIRS = (
    Path("/tmp/tivvlejoy-owned-recovery/botaniq/botaniq_full/blends/models/deciduous"),
    Path("/tmp/o14-v4-source/SRC_BOTANIQ_FULL_7_2_0/quality/botaniq_full/blends/models/deciduous"),
    Path("/tmp/tivvlejoy-owned-recovery/botaniq/botaniq_full/blends/models"),
)
BOTANIQ_HERO_TREES = (
    "bq_Tree_Fagus-sylvatica_A_summer.blend",
    "bq_Tree_Fagus-sylvatica_B_summer.blend",
    "bq_Tree_Fagus-sylvatica_C_summer.blend",
    "bq_Tree_Salix-babylonica_A_summer.blend",
    "bq_Tree_Salix-babylonica_B_summer.blend",
    "bq_Tree_Salix-babylonica_C_summer.blend",
)
ECOKIT_TREE_COLLECTIONS = ("Tree_1", "Tree_2", "Tree_3", "Tree_4", "Tree_5")
OVERLAY_PREFIXES = (
    "TJ_CanopyLeaf_",
    "TJ_CanopySprite_",
    "TJ_StructLeaf_",
    "TJ_StructSprite_",
    "TJ_StructTwig_",
    "TJ_StructRim_",
)
VENDOR_PREVIEWS = Path("/tmp/tivvlejoy-ecokit/Stylised EcoKit/assets library")

ID_LEGEND = {
    "foregroundTree": "unique saturated Object Color per Tree_* with y < 8",
    "midgroundTree": "unique saturated Object Color per Tree_* with 8 <= y < 18",
    "backgroundTree": "dark blue Tree_* y >= 18",
    "leafOverlay": "cyan overlay cards/twigs",
    "other": "near-black",
}


def _round(values) -> list[float]:
    return [round(float(v), 4) for v in values]


def _is_trunk_material_name(name: str | None) -> bool:
    low = (name or "").lower()
    return any(token in low for token in ("trunk", "bark", "wood", "tilia", "corylus"))


def _is_canopy_material_name(name: str | None) -> bool:
    low = (name or "").lower()
    if _is_trunk_material_name(name) and "leaf" not in low:
        return False
    return any(token in low for token in ("leaf", "treeleaf", "canopy", "vine", "flora"))


def _walk_nodes(node_tree, visited=None):
    if node_tree is None:
        return
    visited = visited if visited is not None else set()
    if node_tree.name in visited:
        return
    visited.add(node_tree.name)
    for node in node_tree.nodes:
        yield node_tree.name, node
        if node.type == "GROUP" and node.node_tree is not None:
            yield from _walk_nodes(node.node_tree, visited)


def _mesh_stats_from_mesh(obj, mesh, canopy_slots=None) -> dict:
    verts = len(mesh.vertices)
    polys = list(mesh.polygons)
    scale = max(obj.matrix_world.to_scale())
    areas = []
    canopy_areas = []
    for poly in polys:
        area = float(poly.area) * (scale ** 2)
        areas.append(area)
        if canopy_slots is None or poly.material_index in canopy_slots:
            canopy_areas.append(area)
    use = canopy_areas or areas
    use_sorted = sorted(use)
    median_area = use_sorted[len(use_sorted) // 2] if use_sorted else 0.0
    large = sum(1 for area in use if area > 0.08)
    very_large = sum(1 for area in use if area > 0.45)
    count = len(use)
    if count == 0:
        geo = "empty"
    elif verts < 80 and len(polys) < 40:
        geo = "billboard_or_proxy"
    elif median_area > 0.35:
        geo = "blob_or_large_card"
    elif large / max(count, 1) > 0.35:
        geo = "large_alpha_cards"
    elif median_area < 0.012 and count > 400:
        geo = "dense_small_stamp_cards"
    else:
        geo = "mixed_card_cluster"
    gn = [mod.name for mod in obj.modifiers if mod.type == "NODES"]
    return {
        "meshName": getattr(mesh, "name", obj.data.name if obj.type == "MESH" else obj.name),
        "vertices": verts,
        "polygons": len(polys),
        "canopyPolygons": count if canopy_slots is not None else len(polys),
        "medianFaceArea": round(median_area, 5),
        "largeFaceRatio": round(large / max(count, 1), 4),
        "veryLargeFaces": very_large,
        "geometryType": geo,
        "geometryNodesModifiers": gn,
        "users": int(getattr(getattr(obj, "data", None), "users", 0) or 0),
    }


def _mesh_stats(obj, canopy_slots=None) -> dict:
    return _mesh_stats_from_mesh(obj, obj.data, canopy_slots=canopy_slots)


def _evaluated_mesh_stats(obj, canopy_slots=None) -> dict:
    import bpy

    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    try:
        mesh = evaluated.to_mesh()
    except Exception:
        return _mesh_stats(obj, canopy_slots=canopy_slots)
    try:
        stats = _mesh_stats_from_mesh(obj, mesh, canopy_slots=canopy_slots)
        stats["evaluated"] = True
        return stats
    finally:
        evaluated.to_mesh_clear()


def _material_report(material) -> dict:
    images = []
    problems = []
    has_principled = False
    has_translucent = False
    has_diffuse = False
    alpha_linked = False
    normal_linked = False
    roughness = None
    group_names = []
    if material is None:
        return {"name": None, "problems": ["MISSING_MATERIAL"]}
    if not material.use_nodes or material.node_tree is None:
        return {"name": material.name, "problems": ["NO_NODES"]}
    for tree_name, node in _walk_nodes(material.node_tree):
        if node.type == "BSDF_PRINCIPLED":
            has_principled = True
            if "Alpha" in node.inputs and node.inputs["Alpha"].is_linked:
                alpha_linked = True
            if "Normal" in node.inputs and node.inputs["Normal"].is_linked:
                normal_linked = True
            if "Roughness" in node.inputs:
                roughness = float(node.inputs["Roughness"].default_value)
        if node.type == "BSDF_TRANSLUCENT":
            has_translucent = True
        if node.type == "BSDF_DIFFUSE":
            has_diffuse = True
        if node.type == "GROUP" and node.node_tree is not None:
            group_names.append(node.node_tree.name)
        if node.type == "NORMAL_MAP":
            normal_linked = True
        if node.type == "TEX_IMAGE" and node.image is not None:
            image = node.image
            size = list(getattr(image, "size", (0, 0)))
            colorspace = getattr(getattr(image, "colorspace_settings", None), "name", None)
            packed = bool(getattr(image, "packed_file", None))
            filepath = str(getattr(image, "filepath", "") or "")
            images.append({
                "name": image.name,
                "size": size,
                "colorspace": colorspace,
                "packed": packed,
                "filepath": filepath,
                "sourceTree": tree_name,
                "hasAlpha": bool(
                    getattr(image, "channels", 0) >= 4
                    or getattr(image, "alpha_mode", None) not in {None, "NONE"}
                ),
            })
            if size and max(size) > 0 and max(size) < 256:
                problems.append("LOW_RES_TEXTURE:" + image.name)
            if colorspace and colorspace not in {"sRGB", "Non-Color", "Raw"}:
                problems.append("UNEXPECTED_COLORSPACE:" + image.name + ":" + str(colorspace))
            if packed and not filepath:
                problems.append("PACKED_TEXTURE_NO_EXTERNAL_PATH:" + image.name)
    if not has_principled and group_names:
        problems.append("STYLIZED_GROUP_SHADER_NO_PRINCIPLED")
    if not has_principled and has_diffuse and not group_names:
        problems.append("DIFFUSE_ONLY_NO_PRINCIPLED")
    if not has_translucent:
        problems.append("NO_TRANSLUCENCY")
    if has_principled and images and not alpha_linked:
        problems.append("PRINCIPLED_ALPHA_NOT_LINKED")
    if has_principled and not normal_linked:
        problems.append("NO_NORMAL_MAP")
    if not images:
        problems.append("NO_IMAGE_TEXTURES")
    return {
        "name": material.name,
        "blendMethod": getattr(material, "blend_method", None),
        "shadowMethod": getattr(material, "shadow_method", None),
        "hasPrincipled": has_principled,
        "hasTranslucent": has_translucent,
        "alphaLinked": alpha_linked,
        "normalLinked": normal_linked,
        "roughness": roughness,
        "groupShaders": group_names,
        "images": images,
        "problems": problems,
        "role": (
            "trunk" if _is_trunk_material_name(material.name)
            else "canopy" if _is_canopy_material_name(material.name)
            else "other"
        ),
    }


def inspect_source_tree_collections() -> list[dict]:
    import bpy

    rows = []
    for name in ECOKIT_TREE_COLLECTIONS:
        collection = bpy.data.collections.get(name)
        if collection is None:
            rows.append({"collection": name, "found": False})
            continue
        objects = []
        for obj in collection.objects:
            row = {
                "name": obj.name,
                "type": obj.type,
                "hideRender": bool(obj.hide_render),
                "materials": [
                    slot.material.name if slot.material else None
                    for slot in getattr(obj, "material_slots", [])
                ],
                "geometryNodesModifiers": [mod.name for mod in obj.modifiers if mod.type == "NODES"],
            }
            if obj.type == "MESH":
                row.update(_mesh_stats(obj))
            objects.append(row)
        rows.append({
            "collection": name,
            "found": True,
            "objectCount": len(objects),
            "objects": objects,
        })
    return rows


def catalog_hero_tree_assets() -> dict:
    present = []
    missing = []
    searched = [str(path) for path in BOTANIQ_SEARCH_DIRS]
    for name in BOTANIQ_HERO_TREES:
        found_path = None
        for directory in BOTANIQ_SEARCH_DIRS:
            candidate = directory / name
            if candidate.is_file():
                found_path = candidate
                break
            nested = directory / "deciduous" / name
            if nested.is_file():
                found_path = nested
                break
        if found_path is not None:
            present.append({"name": name, "path": str(found_path), "bytes": found_path.stat().st_size})
        else:
            missing.append({
                "name": name,
                "expectedPath": str(BOTANIQ_SEARCH_DIRS[0] / name),
            })
    local_models = Path("/tmp/tivvlejoy-owned-recovery/botaniq/botaniq_full/blends/models")
    present_model_kinds = []
    if local_models.is_dir():
        present_model_kinds = sorted(path.name for path in local_models.iterdir() if path.is_dir())
    return {
        "pack": "Botaniq Full 7.2 deciduous (already purchased / lookdev-intake listed)",
        "searchedDirectories": searched,
        "directoryExists": any(path.is_dir() for path in BOTANIQ_SEARCH_DIRS),
        "present": present,
        "missing": missing,
        "localModelKindsOnDisk": present_model_kinds,
        "heroQualityTreesPresent": bool(present),
        "heroQualityTreesCatalogued": True,
        "note": (
            "Lookdev intake lists Fagus/Salix summer hero .blends, but the unpaid "
            "Botaniq extract on this host has grass/misc/mosses/plants/rocks/shrubs only. "
            "Production recovery only rebinds EcoKit Tree_* bark. It never replaces "
            "EcoKit canopies with Botaniq trees."
        ),
    }


def catalog_vendor_previews() -> list[dict]:
    rows = []
    if not VENDOR_PREVIEWS.is_dir():
        return rows
    for name in (
        "Tree_1_001.png", "Tree_2_001.png", "Tree_3_001.png",
        "Tree_4_001.png", "Tree_5_001.png", "Tree_GN_001.png",
    ):
        path = VENDOR_PREVIEWS / name
        rows.append({
            "name": name,
            "path": str(path),
            "exists": path.is_file(),
            "bytes": path.stat().st_size if path.is_file() else 0,
            "readsAs": "stylized dense stamp-clump canopy, not hero leaf cards",
        })
    return rows


def _camera_ndc(scene, camera, world_point):
    from bpy_extras.object_utils import world_to_camera_view

    ndc = world_to_camera_view(scene, camera, world_point)
    return [round(float(ndc.x), 4), round(float(ndc.y), 4), round(float(ndc.z), 4)]


def _bbox_world(obj):
    from mathutils import Vector

    return [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]


def classify_distance(y: float) -> str:
    if y < 8.0:
        return "foreground"
    if y < BACKGROUND_Y:
        return "midground"
    return "background"


def _source_collection_guess(obj) -> str:
    name = obj.name.split(".")[0]
    data_name = obj.data.name.split(".")[0] if obj.type == "MESH" else ""
    for candidate in (name, data_name):
        if candidate in ECOKIT_TREE_COLLECTIONS:
            return candidate
    return name


def catalog_placed_trees(scene) -> list[dict]:
    from mathutils import Vector

    camera = scene.objects.get(CAMERA_NAME) or scene.camera
    rows = []
    for obj in scene.objects:
        if obj.type != "MESH" or not obj.name.startswith("Tree_"):
            continue
        if obj.hide_render:
            continue
        y = float(obj.location.y)
        corners = _bbox_world(obj)
        ndcs = [_camera_ndc(scene, camera, corner) for corner in corners] if camera else []
        in_frame = any(0.0 <= n[0] <= 1.0 and 0.0 <= n[1] <= 1.0 and n[2] > 0.0 for n in ndcs)
        zs = [c.z for c in corners]
        cam_dist = float((Vector(camera.location) - obj.location).length) if camera else None
        mats = [_material_report(slot.material) for slot in obj.material_slots]
        canopy_slots = {
            index for index, slot in enumerate(obj.material_slots)
            if slot.material and _is_canopy_material_name(slot.material.name)
        } or None
        stats = _evaluated_mesh_stats(obj, canopy_slots=canopy_slots)
        hero_ok = (
            stats["geometryType"] not in {"blob_or_large_card", "dense_small_stamp_cards", "billboard_or_proxy"}
            and stats["polygons"] > 8000
        )
        too_close = bool(cam_dist is not None and cam_dist < 22.0 and not hero_ok)
        distance_class = classify_distance(y)
        source = _source_collection_guess(obj)
        rows.append({
            "name": obj.name,
            "sourceCollection": source,
            "sourceCollectionGuess": source,
            "assetSource": "Stylised EcoKit Flora_Mat&GN&Models.blend / collections Tree_1..Tree_5",
            "location": _round(obj.location),
            "class": distance_class,
            "distanceClass": distance_class,
            "cameraDistanceM": None if cam_dist is None else round(cam_dist, 3),
            "distanceFromCameraM": None if cam_dist is None else round(cam_dist, 3),
            "zMin": round(min(zs), 3),
            "zMax": round(max(zs), 3),
            "inFrustum": in_frame,
            "inCameraFrustumBbox": in_frame,
            "tooCloseForAssetQuality": too_close,
            "heroQuality": hero_ok,
            "heroMidgroundSuitable": False,
            "heroMidgroundSuitableReason": (
                "EcoKit Tree_* are stylized stamp-clump / background LOD assets. "
                "Vendor previews show two-to-three soft green masses, not readable leaf cards. "
                "Unsuitable as hero or midground at 42 mm."
            ),
            "materials": mats,
            "canopyMeshes": [stats],
            **stats,
        })
    rows.sort(key=lambda row: (row["location"][1], row["name"]))
    return rows


def catalog_overlays(scene) -> dict:
    count = 0
    verts = 0
    names = []
    materials = {}
    for obj in scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        if not obj.name.startswith(OVERLAY_PREFIXES):
            continue
        count += 1
        verts += len(obj.data.vertices)
        if len(names) < 16:
            names.append(obj.name)
        for slot in obj.material_slots:
            if slot.material is None:
                continue
            materials[slot.material.name] = _material_report(slot.material)
    return {
        "count": count,
        "vertices": verts,
        "sampleNames": names,
        "prefixes": list(OVERLAY_PREFIXES),
        "materials": list(materials.values()),
    }


def camera_ray_hits(scene, camera, width: int = 48, height: int = 27) -> dict:
    import bpy
    from mathutils import Vector

    depsgraph = bpy.context.evaluated_depsgraph_get()
    hits = {}
    tree_hits = 0
    overlay_hits = 0
    other_hits = 0
    sky_hits = 0
    for iy in range(height):
        v = (iy + 0.5) / height
        for ix in range(width):
            u = (ix + 0.5) / width
            bl, br, tr, tl = [
                camera.matrix_world @ Vector(corner)
                for corner in camera.data.view_frame(scene=scene)
            ]
            origin = camera.matrix_world.translation
            point = bl + (br - bl) * u + (tl - bl) * v
            direction = (point - origin).normalized()
            result, loc, nrm, index, obj, matrix = scene.ray_cast(depsgraph, origin, direction)
            if not result or obj is None:
                sky_hits += 1
                continue
            name = obj.name
            hits[name] = hits.get(name, 0) + 1
            if name.startswith("Tree_"):
                tree_hits += 1
            elif name.startswith(OVERLAY_PREFIXES):
                overlay_hits += 1
            else:
                other_hits += 1
    ranked = sorted(hits.items(), key=lambda item: item[1], reverse=True)
    return {
        "grid": [width, height],
        "treeHits": tree_hits,
        "overlayHits": overlay_hits,
        "otherHits": other_hits,
        "skyOrMissHits": sky_hits,
        "topHits": [{"name": name, "rays": count} for name, count in ranked[:24]],
        "overlayHitShareOfTreePlusOverlay": round(
            overlay_hits / max(tree_hits + overlay_hits, 1), 4
        ),
    }


def sun_occlusion_to_trunks(scene, trees: list[dict]) -> list[dict]:
    import bpy
    from mathutils import Vector

    depsgraph = bpy.context.evaluated_depsgraph_get()
    sun = scene.objects.get("TJ_GoldenSun")
    travel = Vector(INTERIOR_SUN_TRAVEL)
    if sun is not None:
        travel = sun.matrix_world.to_quaternion() @ Vector((0.0, 0.0, -1.0))
    toward_sun = (-travel).normalized()
    rows = []
    for tree in trees:
        if tree["distanceClass"] == "background":
            continue
        obj = scene.objects.get(tree["name"])
        if obj is None:
            continue
        origin = Vector(obj.location) + Vector((0.0, 0.0, 2.6))
        result, loc, nrm, index, hit, matrix = scene.ray_cast(
            depsgraph, origin, toward_sun, distance=80.0
        )
        blocked = bool(result and hit is not None)
        rows.append({
            "tree": tree["name"],
            "probe": _round(origin),
            "towardSun": _round(toward_sun),
            "blocked": blocked,
            "blocker": None if not blocked else hit.name,
            "blockerKind": None if not blocked else (
                "self_or_canopy" if hit.name.startswith("Tree_")
                else "overlay" if hit.name.startswith(OVERLAY_PREFIXES)
                else "other"
            ),
            "hitDistance": None if not blocked else round(float((Vector(loc) - origin).length), 3),
        })
    return rows


def _object_color_material(name: str):
    import bpy

    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    info = nodes.new("ShaderNodeObjectInfo")
    emission.inputs["Strength"].default_value = 1.0
    links.new(info.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def _assign_object_color(obj, material, rgb) -> None:
    obj.color = (float(rgb[0]), float(rgb[1]), float(rgb[2]), 1.0)
    if not obj.material_slots:
        obj.data.materials.append(material)
    for slot in obj.material_slots:
        slot.link = "OBJECT"
        slot.material = material


def paint_tree_object_ids(scene, trees: list[dict] | None = None) -> dict:
    material = _object_color_material("TJ_TreeId_ObjectColor")
    painted = {"foreground": 0, "midground": 0, "background": 0, "overlay": 0, "other": 0}
    legend = {}
    hues = {}
    if trees is None:
        trees = catalog_placed_trees(scene)
    for index, tree in enumerate(trees):
        obj = scene.objects.get(tree["name"])
        if obj is None:
            continue
        if tree["distanceClass"] == "background":
            rgb = (0.05, 0.10, 0.35)
            painted["background"] += 1
        else:
            rgb = (
                (0.15 + 0.85 * ((index * 3) % 5) / 4.0),
                (0.10 + 0.80 * ((index * 5) % 4) / 3.0),
                (0.08 + 0.85 * ((index * 7) % 6) / 5.0),
            )
            painted[tree["distanceClass"]] += 1
            legend[tree["name"]] = {
                "rgb": [round(c, 3) for c in rgb],
                "class": tree["distanceClass"],
                "sourceCollection": tree.get("sourceCollection"),
            }
        hues[obj.name] = rgb
        _assign_object_color(obj, material, rgb)
    for obj in scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        if obj.name.startswith("Tree_"):
            continue
        if obj.name.startswith(OVERLAY_PREFIXES):
            _assign_object_color(obj, material, (0.05, 0.95, 0.95))
            painted["overlay"] += 1
            continue
        _assign_object_color(obj, material, (0.02, 0.02, 0.03))
        painted["other"] += 1
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    if scene.world is not None and scene.world.use_nodes:
        bg = next((node for node in scene.world.node_tree.nodes if node.type == "BACKGROUND"), None)
        if bg is not None:
            bg.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1.0)
            bg.inputs["Strength"].default_value = 0.0
    return {
        "painted": painted,
        "legend": legend,
        "legendMeaning": ID_LEGEND,
        "overlayColor": [0.05, 0.95, 0.95],
        "idMaterial": material.name,
    }


def denoise_risk(scene) -> dict:
    cycles = getattr(scene, "cycles", None)
    samples = int(getattr(cycles, "samples", 0) or 0) if cycles else None
    denoise = bool(getattr(cycles, "use_denoising", False)) if cycles else None
    return {
        "samples": samples,
        "denoising": denoise,
        "risk": bool(denoise and samples is not None and samples <= 32),
        "note": (
            "Hashed EcoKit alpha + dense stamp cards + 24-sample OIDN smears "
            "canopy edges into clumps. This is a secondary blur, not the primary "
            "missing-leaf-card cause."
        ),
    }


def lighting_blockers(trees, sun_rows, ray_hits) -> list[str]:
    reasons = []
    blocked = [row for row in sun_rows if row.get("blocked")]
    if len(blocked) >= max(1, len(sun_rows) // 2):
        reasons.append("SUN_RAYS_TO_TRUNK_MIDPOINTS_HIT_CANOPY_OR_SELF")
    stamp = [
        tree for tree in trees
        if tree["distanceClass"] != "background"
        and tree["geometryType"] in {"dense_small_stamp_cards", "blob_or_large_card", "mixed_card_cluster"}
    ]
    if stamp:
        reasons.append("DENSE_STAMP_CANOPIES_FORM_OPAQUE_GREEN_WALL")
    if ray_hits.get("overlayHitShareOfTreePlusOverlay", 0) < 0.08:
        reasons.append("OVERLAY_CARDS_OCCUPY_FEW_CAMERA_RAYS")
    reasons.append("FILL_AND_CANOPY_FILL_FLATTEN_REMAINING_DIRECTIONAL_RESPONSE")
    reasons.append("ECOKIT_TREES_ARE_BACKGROUND_LOD_USED_AS_HERO")
    return reasons


def synthesize(trees, overlays, rays, sun_rows, hero, denoise, source_collections) -> dict:
    visible = [
        tree for tree in trees
        if tree["inCameraFrustumBbox"] and tree["distanceClass"] != "background"
    ]
    geo_types = sorted({tree["geometryType"] for tree in visible})
    materials = []
    problems = []
    textures = []
    resolutions = []
    for tree in visible:
        for material in tree["materials"]:
            if material.get("role") == "trunk":
                continue
            materials.append(material["name"])
            problems.extend(material.get("problems") or [])
            for image in material.get("images") or []:
                textures.append(image.get("filepath") or image.get("name"))
                if image.get("size"):
                    resolutions.append(image["size"])
    lod = any(
        tree["geometryType"] in {"dense_small_stamp_cards", "blob_or_large_card", "billboard_or_proxy"}
        for tree in visible
    )
    too_close = any(tree["tooCloseForAssetQuality"] for tree in visible)
    why_overlays = (
        "Overlays are sparse Corylus cards/twigs ("
        + str(overlays.get("count", 0))
        + " objects) sprinkled on EcoKit stamp-clump canopies. Camera rays still hit "
        "the original Tree_* masses (overlay share "
        + str(rays.get("overlayHitShareOfTreePlusOverlay"))
        + "). Cards were biased off the central sky hole, so they never replace the "
        "soft green volume the 42 mm camera actually sees."
    )
    why_sun = (
        "Foreground/midground EcoKit canopies are dense overlapping stamp volumes. "
        "Rays from trunk midpoints toward the key sun hit the tree's own canopy "
        f"({sum(1 for row in sun_rows if row.get('blocked'))}/{len(sun_rows)} blocked). "
        "A harder key or trunk kicker cannot paint a warm camera-facing bark side "
        "if the clump is an opaque lid. Flood-dapple was already proven to flatten "
        "the key and over-warm the soil without creating a sunlit trunk side."
    )
    return {
        "visibleTreeObjects": [tree["name"] for tree in visible],
        "treeAssetSources": sorted({tree["assetSource"] for tree in visible}),
        "canopyGeometryType": geo_types[0] if len(geo_types) == 1 else geo_types,
        "heroQualityTreesPresent": bool(hero.get("heroQualityTreesPresent")),
        "lodOrProxyDetected": lod,
        "tooCloseForAssetQuality": too_close,
        "leafTexturePaths": sorted(set(textures)),
        "leafTextureResolution": resolutions,
        "materialProblemsFound": sorted(set(problems)),
        "lightingBlockersFound": lighting_blockers(trees, sun_rows, rays),
        "denoiseOrSampleBlurRisk": denoise.get("risk"),
        "whyLeafOverlaysFailed": why_overlays,
        "whySunDidNotReachTrunks": why_sun,
        "bestRepairPath": (
            "Stop overlaying more cards on EcoKit clumps. The camera-visible trees "
            "are the wrong asset class for 42 mm / 14-28 m. Replace Tree_* at y<18 "
            "with already-purchased Botaniq Full deciduous hero trees (Fagus/Salix) "
            "if those .blend files can be recovered unpaid from the owned Botaniq "
            "Full pack. Keep EcoKit Tree_* only at y>=18. After real leaf-card "
            "canopies with gaps exist, retune a camera-side sun so trunk faces and "
            "floor patches receive light. Raise still samples / disable denoise for "
            "the next proof. Do not start final video. Do not buy new assets."
        ),
        "sourceCollections": [row["collection"] for row in source_collections if row.get("found")],
    }


def diagnose_scene(scene=None) -> dict:
    import bpy

    if scene is None:
        scene = bpy.context.scene
    camera = verify_production_camera(scene)
    source_collections = inspect_source_tree_collections()
    trees = catalog_placed_trees(scene)
    overlays = catalog_overlays(scene)
    rays = camera_ray_hits(scene, scene.camera)
    sun_rows = sun_occlusion_to_trunks(scene, trees)
    hero = catalog_hero_tree_assets()
    denoise = denoise_risk(scene)
    summary = synthesize(trees, overlays, rays, sun_rows, hero, denoise, source_collections)
    return {
        "schema": "TIVVLEJOY_TREE_CANOPY_ROOT_CAUSE_DIAGNOSIS_V1",
        "feature": FEATURE,
        "productionCamera": camera,
        "sourceTreeCollections": source_collections,
        "placedTrees": trees,
        "overlays": overlays,
        "cameraRayHits": rays,
        "sunOcclusion": sun_rows,
        "heroTreeAssets": hero,
        "vendorPreviews": catalog_vendor_previews(),
        "denoise": denoise,
        "summary": summary,
        "cameraChanged": False,
        "terrainChanged": False,
        "waterChanged": False,
        "compositionChanged": False,
        "groundDressingChanged": False,
        "skyChanged": False,
        "finalVideoRenderStarted": False,
        "paidCreateCount": 0,
        "paidSpendUsd": 0,
    }
