"""Upgrade the set-dressing assets in place, without touching the characters.

Two defects reached the FINAL_1080P acceptance render:

  * ``Meadow_Path`` was saved as a 1 m cube standing at the origin (its intended
    scale never survived the save), so the shot contained an untextured tan slab
    clipping through a tree;
  * ``AdventureMap`` was a zero-thickness plane with a small cube on it, lying
    nearly edge-on to the camera, so the prop the whole shot is about was
    effectively invisible.

Character blends are deliberately untouched here: their rigs were repaired in
place by ``repair_rigs.py`` and regenerating them would throw that away.

Run:
  blender -b -noaudio --python scripts/assets/upgrade_props.py -- \
      --library production-library --report artifacts/rig-audit/prop_upgrade.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_founding_library as L  # noqa: E402


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Rebuild the map prop and fix the meadow path.")
    parser.add_argument("--library", default=str(REPO_ROOT / "production-library"))
    parser.add_argument("--report", default="")
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    return parser.parse_args(argv)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def describe_objects() -> list[dict]:
    import bpy
    from mathutils import Vector

    rows = []
    for obj in sorted(bpy.data.objects, key=lambda o: o.name):
        if obj.type != "MESH":
            continue
        corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        rows.append(
            {
                "name": obj.name,
                "parent": obj.parent.name if obj.parent else None,
                "min": [round(min(c[i] for c in corners), 4) for i in range(3)],
                "max": [round(max(c[i] for c in corners), 4) for i in range(3)],
            }
        )
    return rows


def upgrade_map(blend: Path) -> dict:
    result = L.build_map(blend)
    return {"blend": str(blend), "objects": result.get("objects", []), "sha256": sha256(blend)}


def upgrade_meadow(blend: Path) -> dict:
    import bpy

    bpy.ops.wm.open_mainfile(filepath=str(blend))
    before = next((o for o in describe_objects() if o["name"] == "Meadow_Path"), None)
    material = bpy.data.materials.get("MeadowPath") or L.mat("MeadowPath", L.MEADOW_PATH_COLOR, 0.7)
    L.build_meadow_path(material)
    retinted = L.retint_ground()
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    after = next((o for o in describe_objects() if o["name"] == "Meadow_Path"), None)
    return {
        "blend": str(blend),
        "pathBefore": before,
        "pathAfter": after,
        "groundAlbedo": retinted,
        "sha256": sha256(blend),
    }


def main() -> int:
    args = parse_args(sys.argv)
    library = Path(args.library)
    map_blend = library / "props" / "adventure_map.blend"
    meadow_blend = library / "environments" / "meadow_production.blend"
    for blend in (map_blend, meadow_blend):
        if not blend.exists():
            print(f"DDP_PROP_UPGRADE_FAIL: missing {blend}")
            return 2

    report = {"map": upgrade_map(map_blend), "meadow": upgrade_meadow(meadow_blend)}

    # Fail closed on the exact defects this script exists to remove.
    failures = []
    after = report["meadow"]["pathAfter"]
    if after is None:
        failures.append("Meadow_Path missing after upgrade")
    else:
        height = after["max"][2] - after["min"][2]
        if height > 0.05:
            failures.append(f"Meadow_Path is still {height:.3f} m tall; it must lie on the ground")
    if "MapMark" not in report["map"]["objects"]:
        failures.append("MapMark missing from the rebuilt map prop")
    if len(report["map"]["objects"]) < 10:
        failures.append("rebuilt map prop has no drawn detail")

    report["ok"] = not failures
    report["failures"] = failures
    if args.report:
        out = Path(args.report)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(report, indent=2))
    print("DDP_PROP_UPGRADE:" + json.dumps({"ok": report["ok"], "failures": failures}))
    return 0 if report["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
