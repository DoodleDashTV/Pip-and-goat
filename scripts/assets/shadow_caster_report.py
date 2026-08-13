"""What does each part of each character contribute to its shadow, and why?

The characters cast their shadows from a shrunken invisible copy of themselves
(see ``install_shadow_proxy``), and three measurements decide what that copy
contains. This reports all three per part, so a shadow that turns up in the
picture can be traced to a part, and a part that stopped casting can be shown to
have had a reason:

  sealed      the part lies inside another part, so the camera never sees it and
              whatever it blocks is a mark with nothing on screen behind it.
  room        how far the part can move inside its own surface before it comes
              out inside out. Less than a millimetre means it is a sheet with no
              inside, and it is collapsed rather than displaced.
  self-shadow where the part's own shadow lands on the character, as a share of
              what it blocks and a distance in multiples of its own width.

Also re-runs the sealed test on every shape key, because the caster is planned
once on the rest mesh and that is only sound while no expression lifts a sealed
part out into view.

  blender -b -noaudio --python scripts/assets/shadow_caster_report.py -- \
      --out artifacts/local-acceptance-1080p/shadow_caster_report.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "blender"))

import bpy  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

import assemble_scene as A  # noqa: E402

BLENDS = {
    "pip": REPO_ROOT / "production-library/characters/pip_production.blend",
    "goat": REPO_ROOT / "production-library/characters/goat_production.blend",
}


def island_trees(mesh, coords, islands):
    trees = []
    for comp in islands:
        member = set(comp)
        polys = [list(p.vertices) for p in mesh.polygons if all(v in member for v in p.vertices)]
        trees.append(
            BVHTree.FromPolygons(coords, polys, all_triangles=False, epsilon=0.0) if polys else None
        )
    return trees


def part_name(mesh, comp) -> str:
    member = set(comp)
    used = sorted(
        {
            p.material_index
            for p in mesh.polygons
            if all(v in member for v in p.vertices)
        }
    )
    if not used or used[0] >= len(mesh.materials):
        return "?"
    material = mesh.materials[used[0]]
    return material.name if material else "?"


def sealed_in(mesh, islands, trees, coords, inner: int):
    """Which island seals this one, and the closest approach to its surface."""
    for outer, tree in enumerate(trees):
        if outer == inner or tree is None:
            continue
        if not all(A._inside(tree, coords[i]) for i in islands[inner]):
            continue
        clearance = min((coords[i] - tree.find_nearest(coords[i])[0]).length for i in islands[inner])
        if clearance >= A.SHADOW_PROXY_SEALED_CLEARANCE:
            return outer, clearance
    return None, None


def report_object(obj, light):
    mesh = obj.data
    local = (obj.matrix_world.to_3x3().inverted() @ light).normalized()
    coords = [v.co.copy() for v in mesh.vertices]
    islands = A.mesh_islands(mesh)
    trees = island_trees(mesh, coords, islands)
    buried = A.buried_islands(islands, trees, coords)

    thickness_weights, _ = A.plan_shadow_shrink(mesh)
    weights, _ = A.plan_shadow_shrink(mesh, light=local)
    faces = [list(p.vertices) for p in mesh.polygons]
    whole = BVHTree.FromPolygons(coords, faces, all_triangles=False, epsilon=0.0)
    island_of_vertex = {i: n for n, comp in enumerate(islands) for i in comp}
    island_of_face = [island_of_vertex[f[0]] for f in faces]

    rows = []
    for island, comp in enumerate(islands):
        outer, clearance = (None, None)
        if island in buried:
            outer, clearance = sealed_in(mesh, islands, trees, coords, island)
        measured = (
            A.island_self_shadow(mesh, comp, thickness_weights, whole, island_of_face, island, local)
            if thickness_weights[comp[0]] > 0.0 and island not in buried
            else (None, None)
        )
        rows.append(
            {
                "object": obj.name,
                "island": island,
                "part": part_name(mesh, comp),
                "vertices": len(comp),
                "sealedInsideIsland": outer,
                "sealedInsidePart": None if outer is None else part_name(mesh, islands[outer]),
                "sealedClearanceMm": None if clearance is None else round(clearance * 1000.0, 3),
                "roomShareOfShrink": round(thickness_weights[comp[0]], 4),
                "selfShadowShare": None if measured[0] is None else round(measured[0], 3),
                "selfShadowReachOverWidth": None if measured[1] is None else round(measured[1], 3),
                "casts": weights[comp[0]] > 0.0,
                "travelMm": round(weights[comp[0]] * A.SHADOW_PROXY_SHRINK * 1000.0, 3),
            }
        )
    return rows, buried, islands, coords, trees


def shape_key_check(mesh, islands, rest: set[int]) -> dict:
    """Sealed parts, re-tested on every shape key's own coordinates."""
    if not mesh.shape_keys:
        return {"shapeKeys": 0, "keysThatUnsealAPart": {}}
    differs = {}
    for block in mesh.shape_keys.key_blocks:
        coords = [p.co.copy() for p in block.data]
        trees = island_trees(mesh, coords, islands)
        found = A.buried_islands(islands, trees, coords)
        if found != rest:
            differs[block.name] = sorted(rest - found)
    return {"shapeKeys": len(mesh.shape_keys.key_blocks), "keysThatUnsealAPart": differs}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--lighting", default="DAY_KEY")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])

    light = A.key_light_direction(args.lighting)
    out: dict = {
        "lightingState": args.lighting,
        "keyLightDirection": [round(c, 5) for c in light],
        "constants": {
            "shrinkMm": A.SHADOW_PROXY_SHRINK * 1000.0,
            "safeFraction": A.SHADOW_PROXY_SAFE_FRACTION,
            "minRoomMm": A.SHADOW_PROXY_MIN_ROOM * 1000.0,
            "sealedClearanceMm": A.SHADOW_PROXY_SEALED_CLEARANCE * 1000.0,
            "selfShadowReach": A.SHADOW_PROXY_SELF_REACH,
            "selfShadowShare": A.SHADOW_PROXY_SELF_SHARE,
        },
        "characters": {},
    }

    for role, blend in BLENDS.items():
        bpy.ops.wm.open_mainfile(filepath=str(blend))
        parts: list[dict] = []
        keys: dict = {}
        for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
            rows, buried, islands, _coords, _trees = report_object(obj, light)
            parts.extend(rows)
            keys[obj.name] = shape_key_check(obj.data, islands, buried)
        out["characters"][role] = {
            "blend": str(blend.relative_to(REPO_ROOT)),
            "parts": parts,
            "casting": sum(1 for r in parts if r["casts"]),
            "dropped": sum(1 for r in parts if not r["casts"]),
            "sealed": [
                f"{r['object']}#{r['island']} {r['part']} inside {r['sealedInsidePart']} "
                f"(clear by {r['sealedClearanceMm']}mm)"
                for r in parts
                if r["sealedInsideIsland"] is not None
            ],
            "shapeKeyCheck": keys,
        }
        print(
            f"CASTER_{role.upper()}: {out['characters'][role]['casting']} casting, "
            f"{out['characters'][role]['dropped']} dropped, "
            f"{len(out['characters'][role]['sealed'])} sealed"
        )
        for line in out["characters"][role]["sealed"]:
            print(f"  sealed {line}")

    target = Path(args.out)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(out, indent=2) + "\n")
    print("SHADOW_CASTER_REPORT:" + json.dumps({"out": args.out}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
