"""Configure DDP scene lighting from manifest.lightingState.

Applies the same deterministic ownership model used by assemble_scene.py:
imported asset lights are removed; owned lights are created from the preset.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import emit, parse_blender_args  # noqa: E402
from scene_assembly_lib import apply_lighting_ownership, normalize_lighting_state  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Configure scene lighting from lightingState.")
    parser.add_argument("--preset", default="", help="Lighting preset code (optional if --lighting-state-json set).")
    parser.add_argument("--energy", type=float, default=None, help="Optional override for primary light energy.")
    parser.add_argument("--world-strength", type=float, default=None, help="Optional world strength override.")
    parser.add_argument("--lighting-state-json", default="{}", help="manifest.lightingState JSON object.")
    args = parse_blender_args(parser)

    try:
        state = json.loads(args.lighting_state_json) if args.lighting_state_json else {}
    except json.JSONDecodeError as exc:
        emit("LIGHTING_STATE_INVALID", f"lighting-state-json is not valid JSON: {exc}")
        raise SystemExit(2) from exc
    if not isinstance(state, dict):
        emit("LIGHTING_STATE_INVALID", "lightingState must be an object")
        raise SystemExit(2)
    if args.preset:
        state = {**state, "preset": args.preset}
    if args.world_strength is not None:
        state = {**state, "worldStrength": args.world_strength}

    try:
        resolved = normalize_lighting_state(state)
    except ValueError as exc:
        emit("LIGHTING_STATE_INVALID", str(exc))
        raise SystemExit(2) from exc

    if args.energy is not None and resolved["lights"]:
        resolved["lights"] = list(resolved["lights"])
        primary = dict(resolved["lights"][0])
        primary["energy"] = float(args.energy)
        resolved["lights"][0] = primary

    try:
        import bpy  # noqa: F401

        scene = bpy.context.scene
        report = apply_lighting_ownership(scene, resolved)
    except ImportError:
        # Allow non-Blender validation of preset resolution.
        emit(
            "OK",
            "Lighting preset resolved (bpy unavailable; ownership not applied).",
            preset=resolved["preset"],
            worldStrength=resolved["worldStrength"],
            lightCount=len(resolved["lights"]),
            LIGHTING_STATE_VALID=True,
        )
        return

    if not report.get("LIGHTING_STATE_VALID"):
        emit("LIGHTING_STATE_INVALID", "Lighting ownership failed invariants.", **report)
        raise SystemExit(3)
    emit(
        "OK",
        "Lighting configuration applied.",
        preset=report.get("appliedPreset"),
        energy=args.energy,
        worldStrength=report.get("worldStrength"),
        activeLightCount=report.get("activeLightCount"),
        NO_DUPLICATE_LIGHTS=report.get("NO_DUPLICATE_LIGHTS"),
        LIGHTING_STATE_VALID=True,
    )


if __name__ == "__main__":
    main()
