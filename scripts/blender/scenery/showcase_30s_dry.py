"""TivvleJoy 30-second purchased-scenery dry showcase wrapper.

This wrapper is baked into the scenery worker image so the dry proof render no
longer depends on RunPod dockerArgs rewriting the main Blender script at
startup. It imports the canonical showcase script, disables only the river
creation step, and executes the otherwise unchanged real purchased-scenery
showcase.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path


BASE_SCRIPT = Path(__file__).with_name("showcase_30s.py")


def load_base_module():
    spec = importlib.util.spec_from_file_location("tivvlejoy_showcase_30s_base", BASE_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load base showcase script: {BASE_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    module = load_base_module()

    def dry_create_river(_water_material) -> None:
        # Intentionally render no river in the first proof. This avoids creating
        # synthetic water while preserving all other purchased-scenery content.
        print(json.dumps({
            "event": "dry_showcase_river_omitted",
            "reason": "no verified purchased water material required for proof pass",
            "syntheticWaterCreated": False,
        }))

    module.create_river = dry_create_river
    return int(module.main())


if __name__ == "__main__":
    raise SystemExit(main())
