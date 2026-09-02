"""Zero-paid Cycles-safe EcoKit foliage alpha. Never saves the vendor .blend."""

from __future__ import annotations

SKIP_ALPHA_CONNECT = ("trunk", "bark", "wood", "rock", "stone", "soil", "ground")
FOLIAGE_HINTS = (
    "leaf", "leaves", "flora", "grass", "fern", "bush", "plant", "vine",
    "floral", "petal", "flower", "canopy", "foliage", "fallen", "branch",
)
OPAQUE_BLEND = {"OPAQUE", "SOLID", "", None}
BLEND_ALPHA = {"BLEND", "HASHED", "CLIP", "BLENDED", "DITHERED"}
CYCLES_TRANSPARENT_BOUNCES = 24
CYCLES_MAX_BOUNCES = 12


def normalize_blender_path(filepath: str) -> str:
    return str(filepath or "").replace("\\", "/").strip()


def material_name_skips_alpha(name: str) -> bool:
    low = str(name or "").lower()
    return any(word in low for word in SKIP_ALPHA_CONNECT)


def material_name_looks_like_foliage(name: str) -> bool:
    low = str(name or "").lower()
    return any(word in low for word in FOLIAGE_HINTS)


def incoming_socket_names(output_node, links) -> list[str]:
    return [link.from_socket.name for link in links if link.to_node == output_node]


def is_cycles_output(output_node, links) -> bool:
    return any(name in {"Cycles", "Shader_Cycles"} for name in incoming_socket_names(output_node, links))


def is_eevee_output(output_node, links) -> bool:
    return any(name in {"EEVEE", "Shader_EEVEE"} for name in incoming_socket_names(output_node, links))


def classify_material(info: dict) -> str:
    name = str(info.get("name") or "")
    blend = str(info.get("blendMethod") or info.get("surfaceRenderMethod") or "")
    has_transparent = bool(info.get("hasTransparentBsdf"))
    alpha_linked = bool(info.get("principledAlphaLinked"))
    unused_image_alpha = bool(info.get("unusedImageAlpha"))
    if material_name_skips_alpha(name) and not unused_image_alpha and not has_transparent:
        return "OPAQUE_SUPPORT"
    if unused_image_alpha or has_transparent or blend in BLEND_ALPHA or (material_name_looks_like_foliage(name) and not alpha_linked):
        return "FOLIAGE_CUTOUT"
    return "OTHER"


def inspect_material(material) -> dict:
    nodes = []
    links = []
    if getattr(material, "use_nodes", False) and getattr(material, "node_tree", None):
        nodes = list(material.node_tree.nodes)
        links = list(material.node_tree.links)
    bsdf = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
    images = [node for node in nodes if node.type == "TEX_IMAGE" and getattr(node, "image", None)]
    principled_alpha_linked = False
    unused_image_alpha = False
    if bsdf is not None and "Alpha" in getattr(bsdf, "inputs", {}):
        principled_alpha_linked = any(link.to_socket == bsdf.inputs["Alpha"] for link in links)
        if not principled_alpha_linked:
            for node in images:
                outputs = getattr(node, "outputs", {})
                if "Alpha" in outputs:
                    unused_image_alpha = True
                    break
    return {
        "name": getattr(material, "name", ""),
        "blendMethod": getattr(material, "blend_method", None),
        "shadowMethod": getattr(material, "shadow_method", None),
        "surfaceRenderMethod": getattr(material, "surface_render_method", None),
        "useBackfaceCulling": getattr(material, "use_backface_culling", None),
        "hasTransparentBsdf": any(node.type == "BSDF_TRANSPARENT" for node in nodes),
        "principledAlphaLinked": principled_alpha_linked,
        "unusedImageAlpha": unused_image_alpha,
        "imageCount": len(images),
        "classification": "",
    }


def activate_cycles_material_output(material) -> bool:
    """Use the purchased Cycles shader output instead of the unconverted EEVEE output."""
    if not getattr(material, "use_nodes", False) or material.node_tree is None:
        return False
    links = list(material.node_tree.links)
    outputs = [node for node in material.node_tree.nodes if node.type == "OUTPUT_MATERIAL"]
    cycles = [node for node in outputs if is_cycles_output(node, links)]
    if not cycles:
        return False
    target = cycles[0]
    if getattr(target, "is_active_output", False) and not any(
        getattr(node, "is_active_output", False) and node != target for node in outputs
    ):
        return False
    for node in outputs:
        node.is_active_output = node == target
    return True


def apply_cycles_cutout(material) -> dict:
    """Mutate one material in memory for Cycles hashed/dithered cutout."""
    changed = {
        "name": material.name,
        "blendHashed": False,
        "alphaLinked": 0,
        "backfaceCullingDisabled": False,
        "cyclesOutputActivated": activate_cycles_material_output(material),
    }
    if getattr(material, "use_nodes", False) and material.node_tree:
        bsdf = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if bsdf is not None and "Alpha" in bsdf.inputs:
            for node in material.node_tree.nodes:
                if node.type != "TEX_IMAGE" or not node.image or "Alpha" not in node.outputs:
                    continue
                already = any(
                    link.from_node == node and link.to_socket == bsdf.inputs["Alpha"]
                    for link in material.node_tree.links
                )
                if already:
                    continue
                material.node_tree.links.new(node.outputs["Alpha"], bsdf.inputs["Alpha"])
                changed["alphaLinked"] += 1
    if hasattr(material, "blend_method"):
        try:
            material.blend_method = "HASHED"
            changed["blendHashed"] = True
        except Exception:
            pass
    if hasattr(material, "shadow_method"):
        try:
            material.shadow_method = "HASHED"
        except Exception:
            pass
    if hasattr(material, "surface_render_method"):
        try:
            material.surface_render_method = "DITHERED"
            changed["blendHashed"] = True
        except Exception:
            pass
    if hasattr(material, "alpha_threshold"):
        try:
            material.alpha_threshold = 0.28
        except Exception:
            pass
    if getattr(material, "use_backface_culling", False):
        material.use_backface_culling = False
        changed["backfaceCullingDisabled"] = True
    return changed


def configure_cycles_transparency(scene) -> dict:
    if not hasattr(scene, "cycles"):
        raise RuntimeError("CYCLES_UNAVAILABLE")
    scene.cycles.transparent_max_bounces = CYCLES_TRANSPARENT_BOUNCES
    scene.cycles.max_bounces = max(int(getattr(scene.cycles, "max_bounces", 0) or 0), CYCLES_MAX_BOUNCES)
    return {
        "transparentMaxBounces": int(scene.cycles.transparent_max_bounces),
        "maxBounces": int(scene.cycles.max_bounces),
    }


def count_dual_material_outputs() -> dict:
    import bpy

    dual = {"count": 0, "eeveeActive": 0, "cyclesActive": 0}
    for material in bpy.data.materials:
        if not getattr(material, "use_nodes", False) or material.node_tree is None:
            continue
        outputs = [node for node in material.node_tree.nodes if node.type == "OUTPUT_MATERIAL"]
        if len(outputs) < 2:
            continue
        dual["count"] += 1
        links = list(material.node_tree.links)
        for node in outputs:
            if not getattr(node, "is_active_output", False):
                continue
            if is_eevee_output(node, links):
                dual["eeveeActive"] += 1
            if is_cycles_output(node, links):
                dual["cyclesActive"] += 1
    return dual


def activate_all_ecokit_cycles_outputs() -> int:
    import bpy

    return sum(1 for material in bpy.data.materials if activate_cycles_material_output(material))


def remap_backslash_image_paths() -> list[dict]:
    import bpy

    remapped = []
    for image in bpy.data.images:
        raw = str(getattr(image, "filepath", "") or "")
        if "\\" not in raw:
            continue
        normalized = normalize_blender_path(raw)
        if normalized == raw:
            continue
        image.filepath = normalized
        remapped.append({"name": image.name, "from": raw, "to": normalized})
    return remapped


def prepare_ecokit_cycles_alpha(objects) -> dict:
    """Apply Cycles-safe cutout to EcoKit foliage materials used by placed objects."""
    seen = set()
    changed = []
    warnings = []
    for obj in objects:
        if getattr(obj, "type", "") != "MESH":
            continue
        for slot in getattr(obj, "material_slots", []) or []:
            material = getattr(slot, "material", None)
            if material is None or material.name in seen:
                continue
            seen.add(material.name)
            info = inspect_material(material)
            info["classification"] = classify_material(info)
            if info["classification"] == "FOLIAGE_CUTOUT":
                changed.append(apply_cycles_cutout(material))
            else:
                activated = activate_cycles_material_output(material)
                if activated:
                    changed.append({
                        "name": material.name,
                        "blendHashed": False,
                        "alphaLinked": 0,
                        "backfaceCullingDisabled": False,
                        "cyclesOutputActivated": True,
                    })
            after = inspect_material(material)
            if after.get("blendMethod") in {"BLEND", "BLENDED"} or after.get("surfaceRenderMethod") == "BLENDED":
                warnings.append("NON_TRIVIAL_ALPHA_BLENDING_WARNINGS_PRESENT_FOR_FOLIAGE_MATERIALS")
    unique_warnings = []
    for item in warnings:
        if item not in unique_warnings:
            unique_warnings.append(item)
    return {
        "schema": "TIVVLEJOY_STAGEGRAPH_ECOKIT_CYCLES_ALPHA_V1",
        "materialsRepaired": len(changed),
        "alphaLinksAdded": sum(int(row.get("alphaLinked") or 0) for row in changed),
        "blendHashed": sum(1 for row in changed if row.get("blendHashed")),
        "cyclesOutputsActivated": sum(1 for row in changed if row.get("cyclesOutputActivated")),
        "backfaceCullingDisabled": sum(1 for row in changed if row.get("backfaceCullingDisabled")),
        "materials": changed,
        "warnings": unique_warnings,
        "savedVendorBlend": False,
    }
