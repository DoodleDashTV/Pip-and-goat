#!/usr/bin/env python3
"""Promote the approved backpack Pip into a protected working copy.

Imports the Justin-approved source, keeps the native mesh, applies object-level
scale/orientation only, inspects accessory intersections, extracts texture
hashes, writes five verification views, and stops. Never writes
production-library/, never overwrites the superseded high-res candidate,
never remeshes, and never claims production-ready.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "assets"))

from pip_replacement_intake import (  # noqa: E402
    add_camera,
    apply_lookdev,
    import_model,
    render_still,
    reset_scene,
)
from pip_replacement_intake_lib import (  # noqa: E402
    BLENDER_BIN,
    CHAR_LEFT,
    CHAR_RIGHT,
    CURRENT_PIP,
    FACING,
    PIP_TARGET_HEIGHT,
    REQUIRED_BLENDER,
    suggested_scale,
)
from pip_visual_foundation_lib import (  # noqa: E402
    APPROVED_SOURCE_SHA256,
    ARCHIVE_ROOT,
    ARTIFACTS,
    REPORTS,
    WORKING_BLEND,
    archive_approved_source,
    assert_foundation_destination,
    evaluate_promotion_gate,
    verify_approved_source,
    write_foundation_json,
    write_identity_catalogs,
)

try:
    import bpy  # type: ignore
except ImportError:
    bpy = None


def _meshes():
    return [obj for obj in bpy.data.objects if obj.type == "MESH"]


def _bounds(objects=None):
    from mathutils import Vector

    objects = objects or _meshes()
    coords = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    xs, ys, zs = zip(*[(c.x, c.y, c.z) for c in coords])
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def normalize_working_copy() -> dict:
    """Object-level scale and feet-on-ground. Mesh datablock stays native."""
    from mathutils import Vector

    objects = _meshes()
    if not objects:
        raise RuntimeError("no mesh to normalize")
    working = objects[0]
    working.name = "pip_backpack_working"
    # Do not duplicate the 1.9M mesh. The approved inbox parts + SHA-256
    # are the immutable native source. A second datablock overflows GitHub.

    mn, mx = _bounds([working])
    height = max(mx.z - mn.z, 1e-6)
    scale_info = suggested_scale(height, PIP_TARGET_HEIGHT)
    factor = float(scale_info["suggestedFactor"])
    working.scale = Vector((factor, factor, factor))
    bpy.context.view_layer.update()
    mn, mx = _bounds([working])
    working.location.z -= mn.z
    bpy.context.view_layer.update()
    mn, mx = _bounds([working])
    return {
        "workingObject": working.name,
        "nativeObject": "approved inbox split parts + SHA-256",
        "nativeMeshDatablockPreserved": True,
        "appliedToMeshDatablock": False,
        "objectScale": factor,
        "feetOnGround": abs(mn.z) < 1e-4,
        "facing": "+X",
        "autoRotated": False,
        "heightAfter": mx.z - mn.z,
        "scaleCheck": scale_info,
    }


def extract_texture_hashes(dest: Path) -> list[dict]:
    import hashlib

    dest.mkdir(parents=True, exist_ok=True)
    records = []
    for image in bpy.data.images:
        if image.size[0] <= 4:
            continue
        out = dest / f"{image.name}.png"
        image.filepath_raw = str(out)
        image.file_format = "PNG"
        image.save()
        digest = hashlib.sha256(out.read_bytes()).hexdigest()
        records.append(
            {
                "name": image.name,
                "size": [int(image.size[0]), int(image.size[1])],
                "bytes": out.stat().st_size,
                "sha256": digest,
                "relative": str(out.relative_to(ARCHIVE_ROOT)) if out.is_relative_to(ARCHIVE_ROOT) else out.name,
            }
        )
    return records


def inspect_intersections() -> dict:
    """Region probe only. Does not remesh. Correction is refused unless isolated."""
    from mathutils import Vector
    from mathutils.kdtree import KDTree

    working = bpy.data.objects.get("pip_backpack_working") or _meshes()[0]
    mesh = working.data
    mw = working.matrix_world
    coords = [mw @ vert.co for vert in mesh.vertices]
    tree = KDTree(len(coords))
    for index, co in enumerate(coords):
        tree.insert(co, index)
    tree.balance()

    mn, mx = _bounds([working])
    height = max(mx.z - mn.z, 1e-6)
    center = (mn + mx) * 0.5
    # Rear backpack band vs body/wing band, sampled.
    backpack = []
    body = []
    for index, co in enumerate(coords):
        rel_z = (co.z - mn.z) / height
        rearward = co.x < center.x - height * 0.02
        if rearward and 0.45 < rel_z < 0.82:
            backpack.append((index, co))
        elif (not rearward) and 0.35 < rel_z < 0.85:
            body.append((index, co))
    close = 0
    min_gap = 999.0
    sample = body[:: max(len(body) // 4000, 1)]
    for _, bco in sample:
        _co, _idx, dist = tree.find(bco)
        # find nearest rearward backpack-ish point by scanning a few neighbors
        for _nco, nidx, ndist in tree.find_n(bco, 8):
            nworld = coords[nidx]
            if nworld.x < center.x - height * 0.02 and 0.45 < ((nworld.z - mn.z) / height) < 0.82:
                min_gap = min(min_gap, ndist)
                if ndist < height * 0.004:
                    close += 1
                break
    return {
        "checked": True,
        "method": "spatial_region_kdtree",
        "destructiveCleanup": False,
        "meshEdited": False,
        "reason": "Fused Tripo source. Isolated backpack/body pairs were probed only. Destructive cleanup is refused until Justin authorizes it.",
        "backpackRegionVerts": len(backpack),
        "bodyRegionSample": len(sample),
        "closePairsUnderFourMmScaled": close,
        "minObservedGap": None if min_gap > 100 else min_gap,
        "correctionApplied": False,
        "requiresLaterSeparationOrWeighting": True,
    }


def evaluate_retopo() -> dict:
    working = bpy.data.objects.get("pip_backpack_working") or _meshes()[0]
    mesh = working.data
    return {
        "productionReady": False,
        "objectSeparation": "single_or_fused",
        "vertices": len(mesh.vertices),
        "faces": len(mesh.polygons),
        "rigPresent": False,
        "shapeKeys": False,
        "recommendation": "Do not retopo this fused source by voxel remesh or primitive rebuild. Build a later animation retopo using this likeness as the target.",
        "deformationRisks": [
            "fused backpack and straps will collapse or tear without separate objects or controlled weights",
            "no eyelid, mouth, or wing-fold loops",
            "non-manifold generated surface is not animation topology",
        ],
        "accessoryPlan": {
            "preferred": "separate backpack, two straps, and scarf after a clean retopo",
            "fallback": "controlled vertex-group weighting on a later rig, never on this fused source as-is",
            "doNotBindNow": True,
        },
    }


def render_verification(dest: Path) -> list[str]:
    from mathutils import Vector

    apply_lookdev()
    mn, mx = _bounds()
    center = (mn + mx) * 0.5
    height = max(mx.z - mn.z, 0.001)
    radius = max(mx.x - mn.x, mx.y - mn.y, height) * 1.45
    facing = Vector(FACING)
    left = Vector(CHAR_LEFT)
    right = Vector(CHAR_RIGHT)
    focus = center + Vector((0, 0, height * 0.02))
    views = {
        "front": (center + facing * radius, height * 1.28, focus),
        "rear": (center - facing * radius, height * 1.28, focus),
        "left": (center + left * radius, height * 1.28, focus),
        "right": (center + right * radius, height * 1.28, focus),
        "three_quarter": (center + (facing * 0.72 + left * 0.72) * radius, height * 1.32, focus),
    }
    written = []
    dest.mkdir(parents=True, exist_ok=True)
    for name, (loc, ortho, look) in views.items():
        cam = add_camera(f"verify_{name}", loc, look, ortho)
        bpy.context.scene.camera = cam
        path = dest / f"{name}.png"
        render_still(path, samples=16)
        written.append(str(path))
    return written


def save_working_blend() -> None:
    assert_foundation_destination(WORKING_BLEND)
    if WORKING_BLEND.exists():
        raise FileExistsError(f"refusing to overwrite existing working blend: {WORKING_BLEND}")
    if WORKING_BLEND.resolve() == CURRENT_PIP.resolve():
        raise PermissionError("refusing to overwrite superseded high-res Pip")
    WORKING_BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(WORKING_BLEND), compress=True)


def run_blender_promotion(source: Path) -> dict:
    version = bpy.app.version_string
    if REQUIRED_BLENDER not in version:
        raise RuntimeError(f"expected Blender {REQUIRED_BLENDER} LTS, got {version}")
    import_model(source)
    normalize = normalize_working_copy()
    intersections = inspect_intersections()
    retopo = evaluate_retopo()
    textures = extract_texture_hashes(ARCHIVE_ROOT / "textures")
    previews = ARTIFACTS / "previews"
    renders = render_verification(previews)
    save_working_blend()
    report = {
        "schema": "tivvlejoy.pip_visual_identity.prep.v1",
        "blender": version,
        "sourceSha256": APPROVED_SOURCE_SHA256,
        "normalize": normalize,
        "intersections": intersections,
        "retopo": retopo,
        "textures": textures,
        "renders": [str(Path(path).relative_to(REPO_ROOT)) if Path(path).is_relative_to(REPO_ROOT) else path for path in renders],
        "workingBlend": str(WORKING_BLEND.relative_to(REPO_ROOT)),
        "nativeHighresPreserved": True,
        "productionReady": False,
        "productionLibraryTouched": False,
        "theatricalBound": False,
    }
    write_foundation_json(REPORTS / "PRODUCTION_PREP.json", report)
    return report


def run_host(source: Path) -> int:
    verify_approved_source(source)
    archive_approved_source(source)
    write_identity_catalogs()
    if not BLENDER_BIN.is_file():
        print(json.dumps({"ok": True, "blender": "missing"}))
        return 0
    env = os.environ.copy()
    env.setdefault("LIBGL_ALWAYS_SOFTWARE", "1")
    env.setdefault("GALLIUM_DRIVER", "llvmpipe")
    env["CLOUD_RENDER_ENABLED"] = "false"
    env["ALLOW_PAID_GPU_LAUNCH"] = "false"
    command = [
        str(BLENDER_BIN),
        "-b",
        "-noaudio",
        "-P",
        str(Path(__file__).resolve()),
        "--",
        "blender-promote",
        str(source),
    ]
    completed = subprocess.run(command, env=env, check=False)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)
    print(json.dumps({
        "ok": True,
        "packageId": "20260816T025617Z_pip_backpack_replacement.glb_dca239475c78",
        "workingBlend": str(WORKING_BLEND),
        "gate": evaluate_promotion_gate(),
    }))
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    if bpy is not None and "--" in sys.argv:
        argv = sys.argv[sys.argv.index("--") + 1 :]
    if not argv:
        raise SystemExit("usage: pip_visual_foundation.py promote /path/to/approved.glb")
    command = argv[0]
    source = Path(argv[1] if len(argv) > 1 else "/tmp/pip_backpack_replacement.glb")
    if command == "blender-promote":
        if bpy is None:
            raise SystemExit("blender-promote must run inside Blender 4.2.3 LTS")
        run_blender_promotion(source)
        return 0
    if command == "promote":
        return run_host(source)
    raise SystemExit(f"unknown command {command}")


if __name__ == "__main__":
    raise SystemExit(main())
