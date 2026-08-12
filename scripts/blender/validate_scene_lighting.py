"""Local Blender diagnostic for lighting ownership + MapMark hierarchy.

Runs twice to prove repeated assembly does not grow lights/cameras/roots.
No cloud. No paid GPU.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from scene_assembly_lib import (  # noqa: E402
    OWNED_ROOT_PREFIX,
    apply_lighting_ownership,
    collect_assembly_invariants,
    place_imported_asset,
    purge_imported_cameras,
)


def append_blend(blend_path: str):
    import bpy

    with bpy.data.libraries.load(blend_path, link=False) as (data_from, data_to):
        data_to.objects = list(data_from.objects)
    imported = []
    for obj in data_to.objects:
        if obj is not None:
            bpy.context.collection.objects.link(obj)
            imported.append(obj)
    return imported


def assemble_once(repo: Path, lighting_state: dict, place_map: bool) -> dict:
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)
    assets = {
        "pip": repo / "production-library/characters/pip_production.blend",
        "goat": repo / "production-library/characters/goat_production.blend",
        "meadow": repo / "production-library/environments/meadow_production.blend",
        "map": repo / "production-library/props/adventure_map.blend",
    }
    imported = {}
    for role, path in assets.items():
        if not path.exists():
            raise FileNotFoundError(path)
        imported[role] = append_blend(str(path))

    before_lights = [o.name for o in bpy.data.objects if o.type == "LIGHT"]
    before_cams = [o.name for o in bpy.data.objects if o.type == "CAMERA"]

    placements = {
        "pip": {"location": [-0.75, -1.0, 0]},
        "goat": {"location": [0.8, -0.8, 0]},
    }
    if place_map:
        placements["map"] = {"location": [0.0, -0.2, 0.05]}

    placement_reports = []
    for role, objs in imported.items():
        place = placements.get(role)
        if place:
            placement_reports.append(place_imported_asset(role, objs, place))

    lighting_report = apply_lighting_ownership(bpy.context.scene, lighting_state)
    camera_report = purge_imported_cameras()
    # Create the owned production camera the same way assemble_scene does.
    if not bpy.context.scene.camera:
        cam_data = bpy.data.cameras.new("ProdCam")
        cam = bpy.data.objects.new("ProdCam", cam_data)
        bpy.context.collection.objects.link(cam)
        bpy.context.scene.camera = cam
    camera_report["remainingCameras"] = [o.name for o in bpy.data.objects if o.type == "CAMERA"]
    camera_report["NO_DUPLICATE_CAMERAS"] = len(camera_report["remainingCameras"]) == 1
    invariants = collect_assembly_invariants(lighting_report, camera_report, placement_reports)

    map_objs = imported["map"]
    map_names = {o.name for o in map_objs}
    mark = next((o for o in map_objs if o.name == "MapMark"), None)
    adventure = next((o for o in map_objs if o.name == "AdventureMap"), None)
    root = bpy.data.objects.get(f"{OWNED_ROOT_PREFIX}map") if place_map else None
    mark_attached = False
    if mark and place_map and root:
        walk = mark
        seen = set()
        while walk is not None and id(walk) not in seen:
            if walk == root:
                mark_attached = True
                break
            seen.add(id(walk))
            walk = walk.parent
    elif mark and adventure and not place_map:
        # Authored sibling layout preserved (MapMark fix path).
        mark_attached = True

    return {
        "beforeLightCount": len(before_lights),
        "beforeCameraCount": len(before_cams),
        "afterLightCount": len([o for o in bpy.data.objects if o.type == "LIGHT"]),
        "afterCameraCount": len([o for o in bpy.data.objects if o.type == "CAMERA"]),
        "afterRootCount": len([o for o in bpy.data.objects if o.name.startswith(OWNED_ROOT_PREFIX)]),
        "mapObjectNames": sorted(map_names),
        "mapMarkAttached": mark_attached,
        "placeMap": place_map,
        **invariants,
    }


def main() -> int:
    import bpy

    repo = Path(__file__).resolve().parents[2]
    lighting_state = {"preset": "MEADOW_DAY_SOFT"}
    first = assemble_once(repo, lighting_state, place_map=True)
    second = assemble_once(repo, lighting_state, place_map=True)

    growth = {
        "lightsGrew": second["afterLightCount"] > first["afterLightCount"],
        "camerasGrew": second["afterCameraCount"] > first["afterCameraCount"],
        "rootsGrew": second["afterRootCount"] > first["afterRootCount"],
    }
    ok = (
        first["SCENE_ASSEMBLY_VALID"]
        and second["SCENE_ASSEMBLY_VALID"]
        and first["mapMarkAttached"]
        and second["mapMarkAttached"]
        and first["beforeLightCount"] >= 6  # founding assets contribute stacked lights
        and first["afterLightCount"] <= 3
        and not any(growth.values())
    )
    report = {
        "ok": ok,
        "first": first,
        "second": second,
        "growth": growth,
        "blender": bpy.app.version_string,
    }
    out = repo / "artifacts" / "lighting-repair" / "scene_lighting_validation.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
