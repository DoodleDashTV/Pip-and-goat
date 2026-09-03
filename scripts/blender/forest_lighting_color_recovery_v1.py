"""Tightly scoped lighting/color-management recovery for material readability.

Does not rebuild cinematic lighting, camera, water, terrain, or the working
Botaniq ground-cover architecture. Diagnoses which locked-lookdev variable
crushes owned earth tones, then applies the smallest proven correction.
"""

from __future__ import annotations

from forest_lookdev_isolation_v1 import verify_production_camera

FEATURE = "forest_lighting_color_recovery_v1"

LIGHT_SUN = "TJ_GoldenSun"
LIGHT_FILL = "TJ_SoftFill"
LIGHT_RIM = "TJ_CanopyRim"
LIGHT_BOUNCE = "TJ_ClearingBounce"

NOISE_NAME_TOKENS = ("firefly", "butterfly", "swarm")
NOISE_IMAGE_TOKENS = ("firefly", "butterfly")

# One variable class per diagnostic. Production recipe is chosen after stills.
DIAGNOSTIC_VARIANTS = {
    "baseline": {
        "proof": "FOREST_LIGHTING_DIAG_BASELINE_V1.png",
        "class": "baseline",
        "exposure": 0.65,
        "gamma": 1.06,
        "viewTransform": "AgX",
        "hdriStrength": 0.58,
        "neutralWorld": False,
        "sunEnergy": 5.4,
        "sunColor": (1.0, 0.76, 0.55),
        "fillEnergy": 520.0,
        "fillColor": (0.62, 0.74, 0.92),
        "rimEnergy": 1.85,
        "bounceEnergy": 210.0,
        "bounceColor": (0.78, 0.82, 0.70),
        "hideBounce": False,
        "hideRim": False,
    },
    "exposure": {
        "proof": "FOREST_LIGHTING_DIAG_EXPOSURE_V1.png",
        "class": "exposure",
        "exposure": 1.40,
        "gamma": 1.00,
        "viewTransform": "AgX",
        "hdriStrength": 0.58,
        "neutralWorld": False,
        "sunEnergy": 5.4,
        "sunColor": (1.0, 0.76, 0.55),
        "fillEnergy": 520.0,
        "fillColor": (0.62, 0.74, 0.92),
        "rimEnergy": 1.85,
        "bounceEnergy": 210.0,
        "bounceColor": (0.78, 0.82, 0.70),
        "hideBounce": False,
        "hideRim": False,
    },
    "world": {
        "proof": "FOREST_LIGHTING_DIAG_WORLD_V1.png",
        "class": "world",
        "exposure": 0.65,
        "gamma": 1.06,
        "viewTransform": "AgX",
        "hdriStrength": 0.08,
        "neutralWorld": False,
        "sunEnergy": 5.4,
        "sunColor": (1.0, 0.76, 0.55),
        "fillEnergy": 520.0,
        "fillColor": (0.62, 0.74, 0.92),
        "rimEnergy": 1.85,
        "bounceEnergy": 210.0,
        "bounceColor": (0.78, 0.82, 0.70),
        "hideBounce": False,
        "hideRim": False,
    },
    "keyfill": {
        "proof": "FOREST_LIGHTING_DIAG_KEYFILL_V1.png",
        "class": "keyfill",
        "exposure": 0.65,
        "gamma": 1.06,
        "viewTransform": "AgX",
        "hdriStrength": 0.58,
        "neutralWorld": False,
        "sunEnergy": 5.4,
        "sunColor": (1.0, 0.76, 0.55),
        "fillEnergy": 140.0,
        "fillColor": (0.62, 0.74, 0.92),
        "rimEnergy": 1.85,
        "bounceEnergy": 50.0,
        "bounceColor": (0.78, 0.82, 0.70),
        "hideBounce": False,
        "hideRim": False,
    },
    "neutral": {
        "proof": "FOREST_LIGHTING_DIAG_NEUTRAL_REFERENCE_V1.png",
        "class": "neutral_reference",
        "exposure": 0.0,
        "gamma": 1.0,
        "viewTransform": "AgX",
        "hdriStrength": 0.14,
        "neutralWorld": True,
        "sunEnergy": 4.2,
        "sunColor": (1.0, 1.0, 1.0),
        "fillEnergy": 70.0,
        "fillColor": (0.85, 0.85, 0.85),
        "rimEnergy": 0.0,
        "bounceEnergy": 0.0,
        "bounceColor": (0.78, 0.82, 0.70),
        "hideBounce": True,
        "hideRim": True,
    },
}


def baseline_values() -> dict:
    return {
        "lookdevId": "VENDOR_REFERENCE_LOOKDEV_EXPOSURE_REPAIR_V2",
        "exposure": 0.65,
        "gamma": 1.06,
        "viewTransform": "AgX",
        "look": "None",
        "hdriStrength": 0.58,
        "sunEnergy": 5.4,
        "sunColor": [1.0, 0.76, 0.55],
        "fillEnergy": 520.0,
        "fillColor": [0.62, 0.74, 0.92],
        "rimEnergy": 1.85,
        "bounceEnergy": 210.0,
        "bounceColor": [0.78, 0.82, 0.70],
    }


def _world_background(scene):
    world = scene.world
    if world is None or not world.use_nodes or world.node_tree is None:
        return None
    for node in world.node_tree.nodes:
        if node.bl_idname == "ShaderNodeBackground":
            return node
    return None


def _set_light(name: str, energy=None, color=None, hide=None) -> dict:
    import bpy

    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "LIGHT":
        return {"name": name, "found": False}
    if energy is not None:
        obj.data.energy = float(energy)
    if color is not None:
        obj.data.color = tuple(color)
    if hide is not None:
        obj.hide_render = bool(hide)
    return {
        "name": name,
        "found": True,
        "energy": float(obj.data.energy),
        "color": [float(v) for v in obj.data.color],
        "hide_render": bool(obj.hide_render),
    }


def _restore_hdri_link(scene) -> None:
    world = scene.world
    if world is None or not world.use_nodes or world.node_tree is None:
        return
    env = next((node for node in world.node_tree.nodes if node.bl_idname == "ShaderNodeTexEnvironment"), None)
    background = _world_background(scene)
    if env is None or background is None:
        return
    already = any(link.to_socket == background.inputs["Color"] for link in world.node_tree.links)
    if not already:
        world.node_tree.links.new(env.outputs["Color"], background.inputs["Color"])


def apply_lighting_variant(scene, variant: dict) -> dict:
    """Mutate existing lights/world/CM. Does not create a new cinematic rig."""
    if not variant.get("neutralWorld"):
        _restore_hdri_link(scene)
    scene.view_settings.view_transform = variant["viewTransform"]
    scene.view_settings.exposure = float(variant["exposure"])
    scene.view_settings.gamma = float(variant["gamma"])
    if hasattr(scene.view_settings, "look"):
        scene.view_settings.look = variant.get("look") or "None"

    background = _world_background(scene)
    world_report = {"found": background is not None}
    if background is not None:
        if variant.get("neutralWorld"):
            background.inputs["Color"].default_value = (0.22, 0.22, 0.22, 1.0)
            # Disconnect HDRI so the gray background is what illuminates.
            world = scene.world
            for link in list(world.node_tree.links):
                if link.to_node == background and link.to_socket == background.inputs["Color"]:
                    world.node_tree.links.remove(link)
        background.inputs["Strength"].default_value = float(variant["hdriStrength"])
        world_report["strength"] = float(background.inputs["Strength"].default_value)
        world_report["neutralWorld"] = bool(variant.get("neutralWorld"))

    lights = {
        "sun": _set_light(LIGHT_SUN, variant["sunEnergy"], variant["sunColor"]),
        "fill": _set_light(LIGHT_FILL, variant["fillEnergy"], variant["fillColor"]),
        "rim": _set_light(LIGHT_RIM, variant["rimEnergy"], hide=variant.get("hideRim")),
        "bounce": _set_light(
            LIGHT_BOUNCE,
            variant["bounceEnergy"],
            variant["bounceColor"],
            hide=variant.get("hideBounce"),
        ),
    }
    locks = verify_production_camera(scene)
    return {
        "schema": "TIVVLEJOY_FOREST_LIGHTING_VARIANT_APPLY_V1",
        "feature": FEATURE,
        "class": variant.get("class"),
        "exposure": float(scene.view_settings.exposure),
        "gamma": float(scene.view_settings.gamma),
        "viewTransform": scene.view_settings.view_transform,
        "look": getattr(scene.view_settings, "look", None),
        "world": world_report,
        "lights": lights,
        "productionCamera": locks,
        "cameraChanged": False,
        "terrainChanged": False,
        "waterChanged": False,
        "compositionChanged": False,
        "groundCoverArchitectureChanged": False,
        "vegetationArchitectureChanged": False,
    }


def _material_uses_noise_image(material) -> bool:
    if material is None or not material.use_nodes or material.node_tree is None:
        return False
    stack = [material.node_tree]
    while stack:
        tree = stack.pop()
        for node in tree.nodes:
            image = getattr(node, "image", None)
            name = (getattr(image, "name", "") or "").lower()
            if image is not None and any(token in name for token in NOISE_IMAGE_TOKENS):
                return True
            if node.type == "GROUP" and node.node_tree is not None:
                stack.append(node.node_tree)
    return False


def _uses_noise_image(obj) -> bool:
    return any(_material_uses_noise_image(slot.material) for slot in obj.material_slots)


def suppress_ecokit_visual_noise(scene) -> list[dict]:
    """Hide decorative EcoKit firefly/butterfly leftovers visible in frame.

    Preserves background EcoKit vegetation at y >= 18, including floral cards.
    Does not touch Botaniq substitutions or the ground-cover collection.
    """
    hidden = []
    for obj in scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        feature = str(obj.get("tj_feature") or "")
        if feature in {
            "forest_camera_ground_cover_v1",
            "forest_botaniq_production_recovery_v1",
            "forest_lookdev_isolation_v1",
        }:
            continue
        if obj.name.startswith("TJ_"):
            continue
        low = obj.name.lower()
        if low.startswith("tree_") or "tree_" in low:
            continue
        name_hit = any(token in low for token in NOISE_NAME_TOKENS)
        leftover_floral = (
            low.startswith("floral_")
            and float(obj.location.y) < 18.0
            and feature != "forest_botaniq_hidden"
        )
        # Firefly textures live on shared EcoKit library graphs. Only hide an
        # object when every slot is a particle image, or the mesh is a flat card.
        image_hit = False
        if not name_hit and not leftover_floral and _uses_noise_image(obj):
            slots = [slot.material for slot in obj.material_slots if slot.material]
            noise_slots = sum(1 for material in slots if _material_uses_noise_image(material))
            flat_card = max(obj.dimensions) > 0.01 and min(obj.dimensions) < 0.08
            image_hit = bool(slots) and (noise_slots == len(slots) or (noise_slots and flat_card))
        if not (name_hit or image_hit or leftover_floral):
            continue
        obj.hide_render = True
        obj["tj_feature"] = "forest_ecokit_noise_hidden"
        hidden.append({
            "name": obj.name,
            "reason": "name" if name_hit else ("image" if image_hit else "leftover_floral_y<18"),
            "y": round(float(obj.location.y), 4),
        })
    return hidden


def snapshot_color_management(scene) -> dict:
    view = scene.view_settings
    return {
        "viewTransform": view.view_transform,
        "look": getattr(view, "look", None),
        "exposure": float(view.exposure),
        "gamma": float(view.gamma),
    }
