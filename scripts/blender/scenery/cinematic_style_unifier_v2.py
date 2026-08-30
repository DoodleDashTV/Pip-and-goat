"""TJ_ENVIRONMENT_STYLE_UNIFIER_V2 — grade the assembled vignette.

V1 found Botaniq by image/filepath. V2 also grades EcoKit rock copies and
restrains Louis value on scene copies. Does not flatten maps. Does not make
Louis photoreal. Does not restyle LP_GrassyMountain2 permanently.
"""
from __future__ import annotations

from cinematic_style_unifier_v1 import material_is_botaniq

SPEC = {
    "system": "TJ_ENVIRONMENT_STYLE_UNIFIER_V2",
    "botaniqSaturation": 0.80,
    "botaniqValue": 1.00,
    "botaniqRoughnessLift": 0.08,
    "botaniqSpecMax": 0.28,
    "botaniqNormalScale": 0.68,
    "grassValueScale": 0.93,
    "rockRoughness": 0.76,
    "rockSpecMax": 0.16,
    "louisValue": 0.96,
    "doNotFlattenMaps": True,
    "doNotMakeLouisPhotoreal": True,
    "doNotRestyleShot05Peak": True,
}


def _is_louis(mat) -> bool:
    name = (getattr(mat, "name", "") or "").lower()
    if "grassy" in name or "meadowrange" in name or "louis" in name:
        return True
    users = getattr(mat, "users", 0)
    return users > 0 and ("lp_" in name or "louis" in name)


def _is_rock(mat) -> bool:
    name = (getattr(mat, "name", "") or "").lower()
    return "rock" in name or "tj_v6_stone" in name or "tj_v7_stone" in name


def _grade_botaniq(mat, spec: dict) -> bool:
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    if any(node.get("tj_v7_unify") for node in nodes if hasattr(node, "get")):
        return False
    bsdf = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return False
    hsv = nodes.new("ShaderNodeHueSaturation")
    hsv["tj_v7_unify"] = 1
    hsv.inputs["Saturation"].default_value = spec["botaniqSaturation"]
    hsv.inputs["Value"].default_value = spec["botaniqValue"]
    base = bsdf.inputs.get("Base Color")
    if base is not None and base.links:
        src = base.links[0].from_socket
        links.new(src, hsv.inputs["Color"])
        links.new(hsv.outputs["Color"], base)
    if "Roughness" in bsdf.inputs and not bsdf.inputs["Roughness"].links:
        bsdf.inputs["Roughness"].default_value = min(
            0.92, max(0.40, bsdf.inputs["Roughness"].default_value + spec["botaniqRoughnessLift"])
        )
    if "Specular IOR Level" in bsdf.inputs and not bsdf.inputs["Specular IOR Level"].links:
        bsdf.inputs["Specular IOR Level"].default_value = min(
            spec["botaniqSpecMax"], bsdf.inputs["Specular IOR Level"].default_value
        )
    for node in nodes:
        if node.type == "NORMAL_MAP" and "Strength" in node.inputs:
            node.inputs["Strength"].default_value = min(
                node.inputs["Strength"].default_value, spec["botaniqNormalScale"]
            )
    return True


def apply_style_unifier_v2() -> dict:
    import bpy

    touched = {"botaniq": 0, "rock": 0, "louis": 0, "skippedShot05": 0}
    for mat in bpy.data.materials:
        if mat is None or not mat.use_nodes:
            continue
        name = (mat.name or "")
        if "GrassyMountain2" in name or "LP_GrassyMountain2" in name:
            touched["skippedShot05"] += 1
            continue
        if material_is_botaniq(mat):
            if _grade_botaniq(mat, SPEC):
                touched["botaniq"] += 1
            continue
        bsdf = next((node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        if _is_rock(mat):
            if "Roughness" in bsdf.inputs and not bsdf.inputs["Roughness"].links:
                bsdf.inputs["Roughness"].default_value = SPEC["rockRoughness"]
            if "Specular IOR Level" in bsdf.inputs and not bsdf.inputs["Specular IOR Level"].links:
                bsdf.inputs["Specular IOR Level"].default_value = min(
                    SPEC["rockSpecMax"], bsdf.inputs["Specular IOR Level"].default_value
                )
            touched["rock"] += 1
        elif _is_louis(mat):
            if "Roughness" in bsdf.inputs and not bsdf.inputs["Roughness"].links:
                bsdf.inputs["Roughness"].default_value = max(0.72, bsdf.inputs["Roughness"].default_value)
            touched["louis"] += 1
    return {"system": SPEC["system"], **touched, "spec": {k: SPEC[k] for k in SPEC if k != "system"}}
