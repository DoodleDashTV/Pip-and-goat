"""Deterministic lighting ownership + hierarchy-safe scene assembly helpers.

This module is the single lighting/scene-assembly ownership surface for DDP.

Ownership model
---------------
* ``manifest.lightingState`` (or the ``--lighting-state-json`` CLI mirror) is the
  sole controller of active lights and world illumination after assembly.
* Lights and cameras imported from asset ``.blend`` files are never left active.
* Multi-object assets are placed via a role root empty so internal relative
  transforms (e.g. AdventureMap + MapMark) stay intact.
* Repeated assembly of the same shot must not grow lights/cameras/roots.
"""

from __future__ import annotations

from typing import Any

# Deterministic production lighting presets. Energies chosen for EEVEE so a
# single key+fill+optional rim does not wash out founding meadow assets.
LIGHTING_PRESETS: dict[str, dict[str, Any]] = {
    "MEADOW_DAY_SOFT": {
        # Matches the pre-bug single-rig intent in assemble_scene.ensure_lights
        # (SUN 3 + AREA 50) once imported asset lights are stripped.
        "worldColor": (0.45, 0.72, 0.95, 1.0),
        "worldStrength": 0.55,
        "lights": [
            {
                "name": "DDP_KeySun",
                "type": "SUN",
                "location": (4.0, -3.0, 10.0),
                "rotation": (0.7, 0.2, 0.4),
                "energy": 3.0,
            },
            {
                "name": "DDP_FillArea",
                "type": "AREA",
                "location": (-3.0, -5.0, 4.0),
                "energy": 50.0,
                "size": 6.0,
            },
        ],
    },
    "SUNNY_PLAYROOM": {
        "worldColor": (0.95, 0.9, 0.8, 1.0),
        "worldStrength": 0.4,
        "lights": [
            {
                "name": "DDP_KeySun",
                "type": "SUN",
                "location": (3.0, -2.0, 8.0),
                "rotation": (0.85, 0.1, 0.3),
                "energy": 2.0,
            },
            {
                "name": "DDP_FillArea",
                "type": "AREA",
                "location": (-2.5, -4.0, 3.5),
                "energy": 30.0,
                "size": 5.0,
            },
            {
                "name": "DDP_RimArea",
                "type": "AREA",
                "location": (0.0, 3.0, 2.5),
                "energy": 12.0,
                "size": 3.0,
            },
        ],
    },
    "COZY_LESSON": {
        "worldColor": (0.85, 0.7, 0.55, 1.0),
        "worldStrength": 0.28,
        "lights": [
            {
                "name": "DDP_KeySun",
                "type": "SUN",
                "location": (2.0, -2.5, 7.0),
                "rotation": (0.9, 0.15, 0.2),
                "energy": 1.6,
            },
            {
                "name": "DDP_FillArea",
                "type": "AREA",
                "location": (-2.0, -3.5, 2.8),
                "energy": 22.0,
                "size": 5.0,
            },
        ],
    },
}

DEFAULT_LIGHTING_PRESET = "MEADOW_DAY_SOFT"
OWNED_LIGHT_PREFIX = "DDP_"
OWNED_CAMERA_NAME = "ProdCam"
OWNED_ROOT_PREFIX = "DDP_AssetRoot_"


def normalize_lighting_state(raw: Any) -> dict[str, Any]:
    """Resolve lightingState into a concrete preset payload.

    Empty / missing lightingState falls back to DEFAULT_LIGHTING_PRESET so
    assembly remains deterministic; the applied preset is always reported.
    Unknown presets fail closed.
    """
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise ValueError("LIGHTING_STATE_INVALID: lightingState must be an object")

    preset_code = raw.get("preset") or raw.get("code") or DEFAULT_LIGHTING_PRESET
    preset_code = str(preset_code).strip()
    # Accept story-package camelCase aliases.
    aliases = {
        "sunnyPlayroom": "SUNNY_PLAYROOM",
        "cozyLesson": "COZY_LESSON",
        "twilightWonder": "MEADOW_DAY_SOFT",
        "meadow_day_soft": "MEADOW_DAY_SOFT",
    }
    preset_code = aliases.get(preset_code, preset_code)
    preset_code = preset_code.upper() if preset_code != preset_code else preset_code
    # Normalize mixed-case codes like Meadow_Day_Soft
    compact = preset_code.replace("-", "_").replace(" ", "_").upper()
    if compact in LIGHTING_PRESETS:
        preset_code = compact
    elif preset_code not in LIGHTING_PRESETS:
        raise ValueError(f"LIGHTING_STATE_INVALID: unknown lighting preset '{preset_code}'")

    preset = LIGHTING_PRESETS[preset_code]
    return {
        "preset": preset_code,
        "worldColor": list(raw.get("worldColor") or preset["worldColor"]),
        "worldStrength": float(raw.get("worldStrength", preset["worldStrength"])),
        "lights": list(raw.get("lights") or preset["lights"]),
        "source": "manifest.lightingState" if (raw.get("preset") or raw.get("code") or raw.get("lights")) else "default",
    }


def count_active_lights(objects: list[Any]) -> int:
    return sum(1 for o in objects if getattr(o, "type", None) == "LIGHT")


def count_cameras(objects: list[Any]) -> int:
    return sum(1 for o in objects if getattr(o, "type", None) == "CAMERA")


def select_placement_roots(objects: list[Any]) -> list[Any]:
    """Return objects that should receive placement when no armature exists.

    Roots are imported objects whose parent is missing or outside the imported set.
    """
    obj_set = set(objects)
    return [o for o in objects if getattr(o, "parent", None) is None or o.parent not in obj_set]


def validate_lighting_report(report: dict[str, Any]) -> list[str]:
    """Return invariant violation codes (empty list means LIGHTING_STATE_VALID)."""
    errors: list[str] = []
    if not report.get("appliedPreset"):
        errors.append("LIGHTING_STATE_MISSING_PRESET")
    if int(report.get("activeLightCount") or 0) <= 0:
        errors.append("NO_ACTIVE_LIGHTS")
    if int(report.get("importedLightCount") or 0) > 0 and not report.get("importedLightsRemoved"):
        errors.append("IMPORTED_LIGHTS_REMAIN")
    if int(report.get("duplicateOwnedLights") or 0) > 0:
        errors.append("DUPLICATE_OWNED_LIGHTS")
    if int(report.get("activeLightCount") or 0) > 4:
        errors.append("TOO_MANY_ACTIVE_LIGHTS")
    return errors


def apply_lighting_ownership(scene, lighting_state: Any) -> dict[str, Any]:
    """Strip asset lights and install owned lights from lightingState."""
    import bpy

    resolved = normalize_lighting_state(lighting_state)
    imported_lights = [o for o in list(bpy.data.objects) if o.type == "LIGHT"]
    imported_light_count = len(imported_lights)
    for obj in imported_lights:
        bpy.data.objects.remove(obj, do_unlink=True)

    # Clear orphan light data blocks so repeated assembly cannot accumulate them.
    for light in list(bpy.data.lights):
        if light.users == 0:
            bpy.data.lights.remove(light)

    world = scene.world or bpy.data.worlds.new("DDP_World")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    bg = nodes.new(type="ShaderNodeBackground")
    color = resolved["worldColor"]
    if len(color) == 3:
        color = list(color) + [1.0]
    bg.inputs[0].default_value = tuple(color)
    bg.inputs[1].default_value = float(resolved["worldStrength"])
    out = nodes.new(type="ShaderNodeOutputWorld")
    links.new(bg.outputs[0], out.inputs[0])

    created: list[str] = []
    for spec in resolved["lights"]:
        name = str(spec.get("name") or f"{OWNED_LIGHT_PREFIX}Light")
        if not name.startswith(OWNED_LIGHT_PREFIX):
            name = f"{OWNED_LIGHT_PREFIX}{name}"
        light_type = str(spec.get("type") or "SUN").upper()
        data = bpy.data.lights.new(name=name, type=light_type)
        data.energy = float(spec.get("energy") or 1.0)
        if light_type == "AREA" and hasattr(data, "size"):
            data.size = float(spec.get("size") or 5.0)
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        if "location" in spec:
            obj.location = tuple(spec["location"])
        if "rotation" in spec:
            obj.rotation_euler = tuple(spec["rotation"])
        created.append(name)

    active = [o for o in bpy.data.objects if o.type == "LIGHT"]
    owned_names = [o.name for o in active]
    duplicate_owned = len(owned_names) - len(set(owned_names))
    report = {
        "appliedPreset": resolved["preset"],
        "source": resolved["source"],
        "worldStrength": resolved["worldStrength"],
        "importedLightCount": imported_light_count,
        "importedLightsRemoved": True,
        "activeLightCount": len(active),
        "activeLightNames": sorted(owned_names),
        "duplicateOwnedLights": duplicate_owned,
        "createdLights": created,
    }
    report["errors"] = validate_lighting_report(report)
    report["LIGHTING_STATE_VALID"] = len(report["errors"]) == 0
    report["NO_DUPLICATE_LIGHTS"] = report["activeLightCount"] == len(set(owned_names)) and duplicate_owned == 0
    return report


def purge_imported_cameras(keep_name: str = OWNED_CAMERA_NAME) -> dict[str, Any]:
    """Remove all cameras so configure_camera owns a single ProdCam."""
    import bpy

    removed = []
    for obj in list(bpy.data.objects):
        if obj.type == "CAMERA" and obj.name != keep_name:
            removed.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    for cam in list(bpy.data.cameras):
        if cam.users == 0:
            bpy.data.cameras.remove(cam)
    remaining = [o.name for o in bpy.data.objects if o.type == "CAMERA"]
    return {
        "removedCameras": removed,
        "remainingCameras": remaining,
        "NO_DUPLICATE_CAMERAS": len(remaining) <= 1,
    }


def _lineage_contains(obj: Any, ancestor: Any) -> bool:
    walk = obj
    seen: set[int] = set()
    while walk is not None and id(walk) not in seen:
        if walk == ancestor:
            return True
        seen.add(id(walk))
        walk = getattr(walk, "parent", None)
    return False


def place_imported_asset(role: str, objects: list[Any], place: dict[str, Any]) -> dict[str, Any]:
    """Place an imported asset while preserving internal hierarchy.

    Characters with an armature: transform the armature (existing contract).
    Multi-object props/environments: create/reuse a role root empty, parent all
    imported roots under it (preserving world matrices), then transform the root.
    """
    import bpy

    if not objects or not place:
        return {"role": role, "placed": False, "reason": "no_objects_or_place"}

    arm = next((o for o in objects if o.type == "ARMATURE"), None)
    if arm is not None:
        if "location" in place:
            arm.location = tuple(place["location"])
        if "rotation" in place:
            arm.rotation_euler = tuple(place["rotation"])
        return {
            "role": role,
            "placed": True,
            "mode": "armature",
            "target": arm.name,
            "objectCount": len(objects),
            "ASSET_HIERARCHY_VALID": True,
        }

    root_name = f"{OWNED_ROOT_PREFIX}{role}"
    root = bpy.data.objects.get(root_name)
    if root is None:
        root = bpy.data.objects.new(root_name, None)
        bpy.context.collection.objects.link(root)

    roots = [o for o in select_placement_roots(objects) if o != root]
    for child in roots:
        if child.parent == root:
            continue
        mw = child.matrix_world.copy()
        child.parent = root
        child.matrix_world = mw

    if "location" in place:
        root.location = tuple(place["location"])
    if "rotation" in place:
        root.rotation_euler = tuple(place["rotation"])

    meshes = [o for o in objects if o.type == "MESH"]
    detached = [m.name for m in meshes if not _lineage_contains(m, root)]

    return {
        "role": role,
        "placed": True,
        "mode": "asset_root",
        "target": root.name,
        "objectCount": len(objects),
        "rootedChildren": [o.name for o in roots],
        "detachedMeshes": detached,
        "ASSET_HIERARCHY_VALID": len(detached) == 0,
    }


def collect_assembly_invariants(lighting_report: dict[str, Any], camera_report: dict[str, Any], placement_reports: list[dict[str, Any]]) -> dict[str, Any]:
    hierarchy_ok = all(r.get("ASSET_HIERARCHY_VALID", True) for r in placement_reports if r.get("placed"))
    return {
        "LIGHTING_STATE_VALID": bool(lighting_report.get("LIGHTING_STATE_VALID")),
        "NO_DUPLICATE_LIGHTS": bool(lighting_report.get("NO_DUPLICATE_LIGHTS")),
        "ASSET_HIERARCHY_VALID": hierarchy_ok,
        "SCENE_ASSEMBLY_VALID": bool(
            lighting_report.get("LIGHTING_STATE_VALID")
            and lighting_report.get("NO_DUPLICATE_LIGHTS")
            and camera_report.get("NO_DUPLICATE_CAMERAS", True)
            and hierarchy_ok
        ),
        "lighting": lighting_report,
        "cameras": camera_report,
        "placements": placement_reports,
    }
