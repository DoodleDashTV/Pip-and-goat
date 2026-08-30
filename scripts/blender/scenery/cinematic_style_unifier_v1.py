"""TJ_ENVIRONMENT_STYLE_UNIFIER_V1 — premium stylized CGI, not photoreal paste.

Applies only after Botaniq is loaded. Does not flatten maps. Does not restyle
the SHOT_05 Louis hero mountain permanently; isolated diagnostics may grade
copies.
"""
from __future__ import annotations

SPEC = {
    "system": "TJ_ENVIRONMENT_STYLE_UNIFIER_V1",
    "botaniqSaturation": 0.82,
    "botaniqValue": 1.01,
    "botaniqRoughnessLift": 0.07,
    "botaniqSpecMax": 0.32,
    "botaniqNormalScale": 0.72,
    "grassValueScale": 0.94,
    "doNotFlattenMaps": True,
    "doNotMakeLouisPhotoreal": True,
}


def material_is_botaniq(mat) -> bool:
    name = (getattr(mat, "name", "") or "").lower()
    if name.startswith("bq_") or "botaniq" in name:
        return True
    tree = getattr(mat, "node_tree", None)
    if tree is None:
        return False
    for node in tree.nodes:
        image = getattr(node, "image", None)
        if image is None:
            continue
        img = (image.name or "").lower()
        path = (getattr(image, "filepath", "") or "").lower()
        if "bq_" in img or "botaniq" in img or "bq_" in path:
            return True
    return False


def apply_style_unifier() -> dict:
    import bpy

    touched = 0
    for mat in bpy.data.materials:
        if mat is None or not mat.use_nodes:
            continue
        if not material_is_botaniq(mat):
            continue
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        if any(node.get("tj_v6_unify") for node in nodes if hasattr(node, "get")):
            continue
        bsdf = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        hsv = nodes.new("ShaderNodeHueSaturation")
        hsv["tj_v6_unify"] = 1
        hsv.inputs["Saturation"].default_value = SPEC["botaniqSaturation"]
        hsv.inputs["Value"].default_value = SPEC["botaniqValue"]
        base = bsdf.inputs.get("Base Color")
        if base is not None and base.links:
            src = base.links[0].from_socket
            links.new(src, hsv.inputs["Color"])
            links.new(hsv.outputs["Color"], base)
        if "Roughness" in bsdf.inputs and not bsdf.inputs["Roughness"].links:
            bsdf.inputs["Roughness"].default_value = min(
                0.92, max(0.40, bsdf.inputs["Roughness"].default_value + SPEC["botaniqRoughnessLift"])
            )
        if "Specular IOR Level" in bsdf.inputs and not bsdf.inputs["Specular IOR Level"].links:
            bsdf.inputs["Specular IOR Level"].default_value = min(
                SPEC["botaniqSpecMax"], bsdf.inputs["Specular IOR Level"].default_value
            )
        for node in nodes:
            if node.type == "NORMAL_MAP" and "Strength" in node.inputs:
                node.inputs["Strength"].default_value = min(
                    node.inputs["Strength"].default_value, SPEC["botaniqNormalScale"]
                )
        touched += 1
    return {"system": SPEC["system"], "materials": touched}
