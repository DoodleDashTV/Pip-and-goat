"""Build the proposed materials .blend outside production-library/.

  blender -b -noaudio --python scripts/assets/build_proposed_materials.py -- \\
      --out theatrical-foundation/proposed/materials_v0.blend
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "assets"))

import bpy  # noqa: E402

from theatrical_shaders import (  # noqa: E402
    assert_not_production_library,
    build_proposed_material_datablocks,
    load_recipes,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Write proposed theatrical materials.")
    parser.add_argument(
        "--out",
        default=str(REPO_ROOT / "theatrical-foundation/proposed/materials_v0.blend"),
    )
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def main() -> int:
    args = parse_args()
    out = Path(args.out)
    if not out.is_absolute():
        out = (REPO_ROOT / out).resolve()
    assert_not_production_library(out)
    recipes = load_recipes()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    created = build_proposed_material_datablocks(bpy, recipes)
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    sidecar = out.with_suffix(".json")
    sidecar.write_text(
        json.dumps(
            {
                "label": "proposed upgrade",
                "approved": False,
                "path": str(out.relative_to(REPO_ROOT)),
                "materials": created,
                "recipeVersion": recipes["version"],
            },
            indent=2,
        )
        + "\n"
    )
    print(json.dumps({"status": "OK", "out": str(out), "materials": len(created)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
