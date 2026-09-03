"""Technical visual-QA checks. These cannot certify artistic PASS."""

from __future__ import annotations

from pathlib import Path

FEATURE = "forest_visual_qa_v1"
LOCKED_CAMERA = {
    "name": "TJ_VendorReference_Camera",
    "location": (0.0, -12.5, 2.15),
    "lookAt": (0.0, 9.5, 2.6),
    "lensMm": 42.0,
}


def check_color_space(image) -> list[str]:
    faults = []
    name = (image.name if image is not None else "").lower()
    colorspace = ""
    try:
        colorspace = image.colorspace_settings.name
    except Exception:
        return ["COLORSPACE_UNREADABLE:" + name]
    data_like = any(token in name for token in ("normal", "rough", "opacity", "alpha", "height", "ao"))
    if data_like and colorspace not in {"Non-Color", "Linear", "Raw"}:
        faults.append("DATA_MAP_NOT_NONCOLOR:" + image.name + ":" + colorspace)
    if (not data_like) and "diffuse" in name and colorspace not in {"sRGB", "Filmic sRGB"}:
        faults.append("ALBEDO_NOT_SRGB:" + image.name + ":" + colorspace)
    return faults


def check_material_graph(material) -> list[str]:
    faults = []
    if material is None or not getattr(material, "use_nodes", False) or material.node_tree is None:
        return ["MATERIAL_HAS_NO_NODES:" + (material.name if material else "None")]
    nodes = material.node_tree.nodes
    if any(node.bl_idname == "ShaderNodeEmission" for node in nodes):
        faults.append("UNEXPECTED_EMISSION:" + material.name)
    images = [node.image for node in nodes if node.bl_idname == "ShaderNodeTexImage"]
    for image in images:
        if image is None:
            faults.append("IMAGE_NODE_UNLINKED:" + material.name)
            continue
        faults.extend(check_color_space(image))
        filepath = getattr(image, "filepath", "") or ""
        if filepath.startswith("//..") is False and filepath and not Path(filepath).is_file():
            if not filepath.startswith("//"):
                faults.append("MISSING_TEXTURE:" + material.name + ":" + Path(filepath).name)
    return faults


def check_camera_lock(scene) -> list[str]:
    camera = scene.objects.get(LOCKED_CAMERA["name"])
    if camera is None:
        return ["CAMERA_MISSING"]
    location = tuple(round(float(v), 4) for v in camera.location)
    lens = float(camera.data.lens)
    faults = []
    if location != LOCKED_CAMERA["location"]:
        faults.append("CAMERA_LOCATION_CHANGED:" + str(location))
    if abs(lens - LOCKED_CAMERA["lensMm"]) > 0.001:
        faults.append("CAMERA_LENS_CHANGED:" + str(lens))
    return faults


def inspect_scene(scene) -> dict:
    import bpy

    faults = []
    faults.extend(check_camera_lock(scene))
    for material in bpy.data.materials:
        if material.name.startswith("TJ_Prod") or material.name.startswith("TJ_Lookdev"):
            faults.extend(check_material_graph(material))
    floor = bpy.data.objects.get("TJ_ProdForestFloor")
    vendor = bpy.data.objects.get("TJ_VendorGround")
    vendor_slots = []
    if vendor is not None:
        vendor_slots = [slot.material.name if slot.material else None for slot in vendor.material_slots]
    production_on_vendor = "TJ_ProdGround_SoilLitterMoss_V1" in vendor_slots
    if vendor is not None and not vendor.hide_render and not production_on_vendor:
        faults.append("VENDOR_GROUND_STILL_SOLID_COLOR")
    if vendor is not None and production_on_vendor and len(vendor.data.vertices) < 16:
        faults.append("VENDOR_GROUND_NOT_SUBDIVIDED")
    atmosphere = bpy.data.objects.get("TJ_Atmosphere")
    atmosphere_bottom = None
    if atmosphere is not None and atmosphere.type == "MESH" and atmosphere.data.vertices:
        atmosphere_bottom = min(float(v.co.z) for v in atmosphere.data.vertices)
        if atmosphere_bottom < 0.05:
            faults.append("ATMOSPHERE_SHARES_GROUND_PLANE")
    return {
        "schema": "TIVVLEJOY_FOREST_VISUAL_QA_V1",
        "feature": FEATURE,
        "faults": faults,
        "productionFloorPresent": (vendor is not None and production_on_vendor and not vendor.hide_render)
        or (floor is not None and not floor.hide_render),
        "vendorGroundHidden": vendor is None or bool(vendor.hide_render),
        "productionMaterialOnVendor": production_on_vendor,
        "atmosphereBottomZ": atmosphere_bottom,
        "artisticPassForbidden": True,
        "paidCreateCount": 0,
    }
