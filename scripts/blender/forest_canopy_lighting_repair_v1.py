"""Targeted, idempotent forest-canopy lighting repair. Never saves the vendor .blend."""

from __future__ import annotations

import math

FEATURE = "forest_canopy_lighting_repair_v1"
COLLECTION_NAME = "TJ_FOREST_LIGHTING_REPAIR_V1"
RECEIVER_COLLECTION_NAME = "TJ_FOREST_FILL_RECEIVERS_V1"
FILL_NAME = "TJ_ForestCanopyFill_V1"
RIM_NAME = "TJ_ForestCanopyRim_V1"
TRANSLUCENT_NODE = "TJ_CanopyTranslucent_V1"
MIX_NODE = "TJ_CanopyTranslucentMix_V1"
COLOR_NODE = "TJ_CanopyTranslucentColor_V1"
TRANSLUCENCY_FACTOR = 0.16

LEAF_HINTS = ("leaf", "leaves", "vine", "canopy", "foliage", "fern")
SKIP_MATERIAL = ("trunk", "bark", "wood", "ground", "rock", "soil", "stone", "water", "atmosphere")
CANOPY_OBJECT_HINTS = ("tree", "fern", "bush", "vine", "floral", "leaf")
GROUND_OBJECT_HINTS = ("ground", "atmosphere", "fallen", "grass")


def _tag(id_data) -> None:
    id_data["tj_generated"] = True
    id_data["tj_feature"] = FEATURE


def _is_ours(id_data) -> bool:
    try:
        return id_data.get("tj_feature") == FEATURE
    except Exception:
        return False


def _euler_xyz_neg_z(rx_deg: float, ry_deg: float, rz_deg: float) -> tuple[float, float, float]:
    rx, ry, rz = (math.radians(rx_deg), math.radians(ry_deg), math.radians(rz_deg))
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    x1, y1, z1 = 0.0, sx, -cx
    x2 = x1 * cy + z1 * sy
    y2 = y1
    z2 = -x1 * sy + z1 * cy
    return (x2 * cz - y2 * sz, x2 * sz + y2 * cz, z2)


def _aim_at(obj, target) -> None:
    from mathutils import Vector

    direction = Vector(target) - obj.location
    if direction.length < 1e-6:
        return
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def _vec(values) -> tuple[float, float, float]:
    return (float(values[0]), float(values[1]), float(values[2]))


def _dot(a, b) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _normalize(vec):
    length = math.sqrt(_dot(vec, vec)) or 1.0
    return (vec[0] / length, vec[1] / length, vec[2] / length)


def _is_thin_leaf_material(name: str) -> bool:
    low = str(name or "").lower()
    if any(word in low for word in SKIP_MATERIAL):
        return False
    if "grass" in low:
        return False
    return any(word in low for word in LEAF_HINTS)


def _is_canopy_receiver(obj) -> bool:
    low = str(getattr(obj, "name", "") or "").lower()
    if any(word in low for word in GROUND_OBJECT_HINTS):
        return False
    return any(word in low for word in CANOPY_OBJECT_HINTS)


def _light_travel(obj) -> tuple[float, float, float]:
    rx, ry, rz = [math.degrees(value) for value in obj.rotation_euler]
    return _euler_xyz_neg_z(rx, ry, rz)


def _mean_image_luma(image) -> float | None:
    size = getattr(image, "size", (0, 0))
    width, height = int(size[0] or 0), int(size[1] or 0)
    if width * height > 512 * 512:
        return None
    pixels = getattr(image, "pixels", None)
    channels = int(getattr(image, "channels", 0) or 0)
    if pixels is None or channels < 3:
        return None
    try:
        data = list(pixels)
    except Exception:
        return None
    if len(data) < channels * 32:
        return None
    step = max(channels * 64, (len(data) // 4000) * channels)
    acc = 0.0
    count = 0
    for index in range(0, len(data) - 2, step):
        red, green, blue = data[index], data[index + 1], data[index + 2]
        acc += 0.2126 * red + 0.7152 * green + 0.0722 * blue
        count += 1
    return round(acc / count, 4) if count else None


def find_foliage_materials(scene=None) -> list:
    import bpy

    found = []
    seen = set()
    objects = []
    if scene is not None:
        objects = [obj for obj in scene.objects if getattr(obj, "type", "") == "MESH"]
    else:
        objects = [obj for obj in bpy.data.objects if getattr(obj, "type", "") == "MESH"]
    for obj in objects:
        for slot in getattr(obj, "material_slots", []) or []:
            material = getattr(slot, "material", None)
            if material is None or material.name in seen:
                continue
            if not _is_thin_leaf_material(material.name):
                continue
            seen.add(material.name)
            found.append(material)
    return found


def diagnose_forest_lighting(scene) -> dict:
    import bpy

    camera = scene.camera
    world = scene.world
    hdri_strength = None
    hdri_rotation = None
    if world and world.use_nodes and world.node_tree:
        for node in world.node_tree.nodes:
            if node.type == "BACKGROUND" and "Strength" in node.inputs:
                hdri_strength = float(node.inputs["Strength"].default_value)
            if node.type == "TEX_ENVIRONMENT":
                mapping = None
                for link in world.node_tree.links:
                    if link.to_node == node and link.from_node.type == "MAPPING":
                        mapping = link.from_node
                if mapping and "Rotation" in mapping.inputs:
                    hdri_rotation = [round(float(v), 4) for v in mapping.inputs["Rotation"].default_value]
    lights = []
    for obj in scene.objects:
        if obj.type != "LIGHT":
            continue
        data = obj.data
        travel = _light_travel(obj)
        lights.append({
            "name": obj.name,
            "type": data.type,
            "energy": float(getattr(data, "energy", 0) or 0),
            "color": [round(float(c), 4) for c in getattr(data, "color", (1, 1, 1))],
            "location": [round(float(v), 4) for v in obj.location],
            "rotationDeg": [round(math.degrees(float(v)), 3) for v in obj.rotation_euler],
            "travel": [round(v, 4) for v in travel],
            "size": float(getattr(data, "size", 0) or 0),
            "ours": _is_ours(obj),
        })
    camera_look = (0.0, 1.0, 0.0)
    camera_location = [0.0, 0.0, 0.0]
    if camera is not None:
        camera_location = [round(float(v), 4) for v in camera.location]
        from mathutils import Vector

        camera_look = _normalize(tuple(camera.matrix_world.to_quaternion() @ Vector((0.0, 0.0, -1.0))))
    key = next((row for row in lights if row["name"] == "TJ_GoldenSun"), lights[0] if lights else None)
    camera_light_dot = round(_dot(camera_look, tuple(key["travel"])), 4) if key else None
    foliage = []
    translucency_present = 0
    for material in find_foliage_materials(scene):
        nodes = list(material.node_tree.nodes) if material.use_nodes and material.node_tree else []
        types = sorted({node.type for node in nodes})
        has_translucent = any(node.type == "BSDF_TRANSLUCENT" for node in nodes)
        has_principled = any(node.type == "BSDF_PRINCIPLED" for node in nodes)
        transmission = None
        if has_principled:
            principled = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
            socket = principled.inputs.get("Transmission Weight") or principled.inputs.get("Transmission")
            if socket is not None:
                transmission = float(socket.default_value)
        luma = None
        for node in nodes:
            if node.type == "TEX_IMAGE" and getattr(node, "image", None):
                luma = _mean_image_luma(node.image)
                if luma is not None:
                    break
        if has_translucent:
            translucency_present += 1
        foliage.append({
            "name": material.name,
            "nodeTypes": types,
            "hasTranslucent": has_translucent,
            "hasPrincipled": has_principled,
            "transmission": transmission,
            "blendMethod": getattr(material, "blend_method", None),
            "shadowMethod": getattr(material, "shadow_method", None),
            "meanTextureLuma": luma,
        })
    ao = None
    if hasattr(scene, "world") and scene.world and hasattr(scene.world, "light_settings"):
        ao = {
            "useAmbientOcclusion": bool(getattr(scene.world.light_settings, "use_ambient_occlusion", False)),
            "aoFactor": getattr(scene.world.light_settings, "ao_factor", None),
        }
    bounds = _scene_bounds(scene)
    return {
        "schema": "TIVVLEJOY_FOREST_CANOPY_LIGHTING_DIAGNOSE_V1",
        "scene": scene.name,
        "camera": {
            "name": getattr(camera, "name", None),
            "location": camera_location,
            "lensMm": float(camera.data.lens) if camera is not None else None,
            "look": [round(v, 4) for v in camera_look],
        },
        "world": {
            "hdriStrength": hdri_strength,
            "hdriRotation": hdri_rotation,
        },
        "lights": lights,
        "cameraLightDot": camera_light_dot,
        "cameraFacingIsBacklit": bool(camera_light_dot is not None and camera_light_dot > 0.25),
        "foliageMaterialCount": len(foliage),
        "foliageWithTranslucency": translucency_present,
        "foliage": foliage,
        "colorManagement": {
            "viewTransform": scene.view_settings.view_transform,
            "look": scene.view_settings.look,
            "exposure": float(scene.view_settings.exposure),
            "gamma": float(scene.view_settings.gamma),
        },
        "ao": ao,
        "cycles": {
            "samples": int(getattr(scene.cycles, "samples", 0) or 0) if hasattr(scene, "cycles") else None,
            "diffuseBounces": int(getattr(scene.cycles, "diffuse_bounces", 0) or 0) if hasattr(scene, "cycles") else None,
            "aoBounces": int(getattr(scene.cycles, "ao_bounces", 0) or 0) if hasattr(scene, "cycles") and hasattr(scene.cycles, "ao_bounces") else None,
        },
        "bounds": bounds,
        "rootCauseCandidates": _root_cause_candidates(camera_light_dot, hdri_strength, lights, foliage, translucency_present),
    }


def _root_cause_candidates(camera_light_dot, hdri_strength, lights, foliage, translucency_present) -> list[str]:
    reasons = []
    if camera_light_dot is not None and camera_light_dot > 0.25:
        reasons.append("CAMERA_FACING_FOREST_IS_BACKLIT_BY_KEY_SUN")
    bounce = next((row for row in lights if row["name"] == "TJ_ClearingBounce"), None)
    if bounce and bounce["location"][2] < 2.5:
        reasons.append("EXISTING_BOUNCE_SITS_NEAR_GROUND_AND_PREFERS_TERRAIN")
    if hdri_strength is not None and hdri_strength < 0.8:
        reasons.append("HDRI_AMBIENT_FILL_IS_TOO_WEAK_FOR_CANOPY_SHADOW_SIDE")
    if translucency_present == 0 and foliage:
        reasons.append("LEAF_CARDS_HAVE_NO_TRANSLUCENCY_SO_BACKLIGHT_READS_OPAQUE_BLACK")
    dark_maps = [row for row in foliage if row.get("meanTextureLuma") is not None and row["meanTextureLuma"] < 0.08]
    if dark_maps:
        reasons.append("SOME_LEAF_TEXTURES_ARE_VERY_DARK")
    if not reasons:
        reasons.append("INSUFFICIENT_CAMERA_SIDE_CANOPY_FILL")
    return reasons


def _scene_bounds(scene) -> dict:
    xs, ys, zs = [], [], []
    canopy_z = []
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ __vec3(corner)
            xs.append(world[0])
            ys.append(world[1])
            zs.append(world[2])
            if _is_canopy_receiver(obj):
                canopy_z.append(world[2])
    if not xs:
        return {"empty": True}
    return {
        "min": [round(min(xs), 3), round(min(ys), 3), round(min(zs), 3)],
        "max": [round(max(xs), 3), round(max(ys), 3), round(max(zs), 3)],
        "canopyZMax": round(max(canopy_z), 3) if canopy_z else None,
        "canopyZMedian": round(sorted(canopy_z)[len(canopy_z) // 2], 3) if canopy_z else None,
    }


def __vec3(values):
    from mathutils import Vector

    return Vector((float(values[0]), float(values[1]), float(values[2])))


def _ensure_collection(scene, name: str):
    import bpy

    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        _tag(collection)
    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)
    _tag(collection)
    return collection


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


def _ensure_receiver_collection(scene):
    import bpy

    collection = _ensure_collection(scene, RECEIVER_COLLECTION_NAME)
    for obj in list(collection.objects):
        collection.objects.unlink(obj)
    for obj in scene.objects:
        if obj.type == "MESH" and _is_canopy_receiver(obj):
            if obj.name not in collection.objects:
                collection.objects.link(obj)
    return collection


def _apply_light_linking(light_obj, receiver_collection) -> bool:
    linking = getattr(light_obj, "light_linking", None)
    if linking is None:
        return False
    try:
        linking.receiver_collection = receiver_collection
        return True
    except Exception:
        return False


def create_or_update_forest_fill_rig(scene, camera) -> dict:
    from mathutils import Vector

    lighting = _ensure_collection(scene, COLLECTION_NAME)
    receivers = _ensure_receiver_collection(scene)
    bounds = _scene_bounds(scene)
    cam = Vector(camera.location) if camera is not None else Vector((0.0, -12.5, 2.15))
    canopy_z = float((bounds or {}).get("canopyZMax") or 11.0)
    canopy_mid_z = float((bounds or {}).get("canopyZMedian") or 6.5)
    y_min = float((bounds or {}).get("min", [0, -1, 0])[1])
    y_max = float((bounds or {}).get("max", [0, 24, 0])[1])
    canopy_aim = (0.0, (max(y_min, 2.0) + min(y_max, 22.0)) * 0.5, max(canopy_mid_z, 6.0))
    fill_location = (float(cam.x), float(cam.y) + 3.2, max(canopy_z * 0.92, float(cam.z) + 10.5))
    fill = _ensure_light(lighting, FILL_NAME, "AREA")
    fill.data.type = "AREA"
    fill.data.shape = "DISK"
    fill.data.size = 22.0
    fill.data.energy = 780.0
    fill.data.color = (0.70, 0.82, 1.0)
    if hasattr(fill.data, "spread"):
        try:
            fill.data.spread = math.radians(150.0)
        except Exception:
            pass
    fill.location = fill_location
    _aim_at(fill, canopy_aim)
    fill_linked = _apply_light_linking(fill, receivers)

    rim = _ensure_light(lighting, RIM_NAME, "AREA")
    rim.data.type = "AREA"
    rim.data.shape = "DISK"
    rim.data.size = 10.0
    rim.data.energy = 210.0
    rim.data.color = (0.74, 0.86, 1.0)
    rim.location = (8.5, 6.0, max(canopy_z * 0.78, 9.0))
    _aim_at(rim, (0.0, 14.0, max(canopy_mid_z, 7.0)))
    rim_linked = _apply_light_linking(rim, receivers)

    extras = [obj for obj in lighting.objects if obj.name not in {FILL_NAME, RIM_NAME} and _is_ours(obj)]
    return {
        "collection": lighting.name,
        "fill": {
            "name": fill.name,
            "location": [round(float(v), 4) for v in fill.location],
            "aim": [round(v, 4) for v in canopy_aim],
            "energy": float(fill.data.energy),
            "size": float(fill.data.size),
            "color": list(fill.data.color),
            "lightLinking": fill_linked,
        },
        "rim": {
            "name": rim.name,
            "location": [round(float(v), 4) for v in rim.location],
            "energy": float(rim.data.energy),
            "lightLinking": rim_linked,
        },
        "receiverCount": len(receivers.objects),
        "duplicateGeneratedLights": len(extras),
        "exposureChanged": False,
    }


def _is_cycles_output(output_node, links) -> bool:
    incoming = [link.from_socket.name for link in links if link.to_node == output_node]
    return any(name in {"Cycles", "Shader_Cycles"} for name in incoming)


def _cycles_output(material):
    if not material.use_nodes or material.node_tree is None:
        return None
    links = list(material.node_tree.links)
    outputs = [node for node in material.node_tree.nodes if node.type == "OUTPUT_MATERIAL"]
    cycles = [node for node in outputs if _is_cycles_output(node, links)]
    if cycles:
        return cycles[0]
    return next((node for node in outputs if getattr(node, "is_active_output", False)), outputs[0] if outputs else None)


def _surface_source(material, output):
    if output is None or "Surface" not in output.inputs:
        return None
    for link in material.node_tree.links:
        if link.to_socket == output.inputs["Surface"]:
            return link
    return None


def repair_foliage_light_response(materials) -> dict:
    changed = []
    skipped = []
    for material in materials:
        if not _is_thin_leaf_material(material.name):
            skipped.append({"name": material.name, "reason": "NOT_THIN_LEAF"})
            continue
        if not material.use_nodes or material.node_tree is None:
            skipped.append({"name": material.name, "reason": "NO_NODES"})
            continue
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        output = _cycles_output(material)
        incoming = _surface_source(material, output)
        if output is None or incoming is None:
            skipped.append({"name": material.name, "reason": "NO_SURFACE_SOURCE"})
            continue
        if incoming.from_node.name == MIX_NODE and incoming.from_node.type == "MIX_SHADER":
            incoming.from_node.inputs["Fac"].default_value = TRANSLUCENCY_FACTOR
            _tag(incoming.from_node)
            changed.append({"name": material.name, "action": "UPDATED_EXISTING_MIX", "factor": TRANSLUCENCY_FACTOR})
            continue
        mix = nodes.get(MIX_NODE)
        translucent = nodes.get(TRANSLUCENT_NODE)
        color = nodes.get(COLOR_NODE)
        if mix is None:
            mix = nodes.new("ShaderNodeMixShader")
            mix.name = MIX_NODE
            mix.label = MIX_NODE
        if translucent is None:
            translucent = nodes.new("ShaderNodeBsdfTranslucent")
            translucent.name = TRANSLUCENT_NODE
            translucent.label = TRANSLUCENT_NODE
        if color is None:
            color = nodes.new("ShaderNodeRGB")
            color.name = COLOR_NODE
            color.label = COLOR_NODE
            color.outputs["Color"].default_value = (0.18, 0.28, 0.11, 1.0)
        mix.location = (output.location.x - 180, output.location.y)
        translucent.location = (mix.location.x - 180, mix.location.y - 120)
        color.location = (translucent.location.x - 180, translucent.location.y)
        mix.inputs["Fac"].default_value = TRANSLUCENCY_FACTOR
        if not any(link.from_node == color and link.to_node == translucent for link in links):
            links.new(color.outputs["Color"], translucent.inputs["Color"])
        source_socket = incoming.from_socket
        links.remove(incoming)
        links.new(source_socket, mix.inputs[1])
        links.new(translucent.outputs["BSDF"], mix.inputs[2])
        links.new(mix.outputs["Shader"], output.inputs["Surface"])
        _tag(mix)
        _tag(translucent)
        _tag(color)
        changed.append({"name": material.name, "action": "ADDED_TRANSLUCENT_MIX", "factor": TRANSLUCENCY_FACTOR})
    return {
        "materialsVisited": len(materials),
        "materialsChanged": len(changed),
        "changes": changed,
        "skipped": skipped,
        "texturesOverwritten": False,
        "vendorBlendSaved": False,
    }


def verify_repair(scene) -> dict:
    lighting = scene.collection.children.get(COLLECTION_NAME)
    fill = scene.objects.get(FILL_NAME)
    rim = scene.objects.get(RIM_NAME)
    foliage = find_foliage_materials(scene)
    mix_count = 0
    for material in foliage:
        if material.use_nodes and material.node_tree and material.node_tree.nodes.get(MIX_NODE):
            mix_count += 1
    generated_lights = []
    if lighting is not None:
        generated_lights = [obj.name for obj in lighting.objects if _is_ours(obj)]
    return {
        "collectionPresent": lighting is not None,
        "fillPresent": fill is not None,
        "rimPresent": rim is not None,
        "generatedLightNames": generated_lights,
        "duplicateFill": generated_lights.count(FILL_NAME) > 1,
        "foliageMixCount": mix_count,
        "exposure": float(scene.view_settings.exposure),
        "cameraLocation": [round(float(v), 4) for v in scene.camera.location] if scene.camera else None,
        "cameraLensMm": float(scene.camera.data.lens) if scene.camera else None,
        "ok": bool(
            lighting is not None
            and fill is not None
            and rim is not None
            and generated_lights.count(FILL_NAME) == 1
            and generated_lights.count(RIM_NAME) == 1
        ),
    }


def apply_forest_canopy_lighting_repair(scene) -> dict:
    diagnose = diagnose_forest_lighting(scene)
    foliage = find_foliage_materials(scene)
    lights = create_or_update_forest_fill_rig(scene, scene.camera)
    materials = repair_foliage_light_response(foliage)
    create_or_update_forest_fill_rig(scene, scene.camera)
    repair_foliage_light_response(foliage)
    verify = verify_repair(scene)
    return {
        "schema": "TIVVLEJOY_FOREST_CANOPY_LIGHTING_REPAIR_V1",
        "feature": FEATURE,
        "diagnose": diagnose,
        "lighting": lights,
        "materials": materials,
        "verify": verify,
        "colorManagementChanged": False,
        "globalExposureDelta": 0.0,
        "vendorBlendSaved": False,
        "compositionLocked": True,
    }


diagnose_forest_lighting = diagnose_forest_lighting
find_foliage_materials = find_foliage_materials
create_or_update_forest_fill_rig = create_or_update_forest_fill_rig
repair_foliage_light_response = repair_foliage_light_response
verify_repair = verify_repair
apply_forest_canopy_lighting_repair = apply_forest_canopy_lighting_repair
