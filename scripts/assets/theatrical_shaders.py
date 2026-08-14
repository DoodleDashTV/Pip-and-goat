"""Identity-preserving proposed shader look-dev for theatrical review.

Applies Principled BSDF socket tweaks in memory. Never writes Base Color or
Metallic. Never writes into production-library/. Not an approval.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
RECIPES_PATH = REPO_ROOT / "theatrical-foundation/proposed/shader_recipes_v0.json"
PRODUCTION_LIBRARY = REPO_ROOT / "production-library"

SOCKET_MAP = {
    "subsurfaceWeight": ("Subsurface Weight", "Subsurface"),
    "sheenWeight": ("Sheen Weight", "Sheen"),
    "sheenRoughness": ("Sheen Roughness",),
    "roughness": ("Roughness",),
    "coatWeight": ("Coat Weight", "Clearcoat"),
    "coatRoughness": ("Coat Roughness", "Clearcoat Roughness"),
    "specularIorLevel": ("Specular IOR Level", "Specular"),
    "emissionStrength": ("Emission Strength",),
}

SKIP_KEYS = {"role"}


def load_recipes(path: Path = RECIPES_PATH) -> dict[str, Any]:
    data = json.loads(path.read_text())
    if data.get("approved") is True:
        raise ValueError("shader recipes must not self-approve")
    if data.get("rules", {}).get("neverWriteProductionLibrary") is not True:
        raise ValueError("recipes must forbid production-library writes")
    return data


def assert_not_production_library(path: Path) -> None:
    resolved = path.resolve()
    lib = PRODUCTION_LIBRARY.resolve()
    if resolved == lib or lib in resolved.parents:
        raise PermissionError(f"refusing to write inside production-library/: {path}")


def _set_socket(principled, names: tuple[str, ...], value: float) -> bool:
    for name in names:
        sock = principled.inputs.get(name)
        if sock is None:
            continue
        sock.default_value = float(value)
        return True
    return False


def _principled(mat):
    if mat is None or not mat.use_nodes:
        return None
    return next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)


def apply_proposed_shaders(materials, recipes: dict[str, Any] | None = None) -> dict[str, Any]:
    """Tweak matching materials. Returns a per-material before/after report."""
    recipes = recipes or load_recipes()
    table = recipes["materials"]
    report: dict[str, Any] = {"label": "proposed upgrade", "approved": False, "applied": [], "skipped": []}

    for mat in materials:
        name = getattr(mat, "name", "")
        recipe = table.get(name)
        if recipe is None:
            report["skipped"].append(name)
            continue
        principled = _principled(mat)
        if principled is None:
            report["skipped"].append(name)
            continue

        base_sock = principled.inputs.get("Base Color")
        metal_sock = principled.inputs.get("Metallic")
        before_color = list(base_sock.default_value) if base_sock is not None else None
        before_metal = float(metal_sock.default_value) if metal_sock is not None else None

        changed = []
        for key, value in recipe.items():
            if key in SKIP_KEYS:
                continue
            names = SOCKET_MAP.get(key)
            if not names:
                continue
            if _set_socket(principled, names, value):
                changed.append(key)

        after_color = list(base_sock.default_value) if base_sock is not None else None
        after_metal = float(metal_sock.default_value) if metal_sock is not None else None
        if before_color is not None and after_color != before_color:
            raise RuntimeError(f"{name}: Base Color drifted — identity lock violated")
        if before_metal is not None and after_metal != before_metal:
            raise RuntimeError(f"{name}: Metallic drifted — identity lock violated")

        report["applied"].append({"name": name, "changed": changed, "baseColor": before_color, "metallic": before_metal})

    return report


def apply_to_objects(objects, recipes: dict[str, Any] | None = None) -> dict[str, Any]:
    seen = []
    mats = []
    for obj in objects:
        for slot in getattr(obj, "material_slots", []):
            mat = slot.material
            if mat is None or mat.name in seen:
                continue
            seen.append(mat.name)
            mats.append(mat)
    return apply_proposed_shaders(mats, recipes)


def build_proposed_material_datablocks(bpy_module, recipes: dict[str, Any] | None = None) -> list[str]:
    """Create THEATRICAL_* material datablocks documenting the recipes."""
    recipes = recipes or load_recipes()
    created = []
    for name, recipe in recipes["materials"].items():
        mat_name = f"THEATRICAL_{name}"
        mat = bpy_module.data.materials.new(mat_name)
        mat.use_nodes = True
        principled = _principled(mat)
        if principled is None:
            continue
        for key, value in recipe.items():
            if key in SKIP_KEYS:
                continue
            names = SOCKET_MAP.get(key)
            if names:
                _set_socket(principled, names, value)
        created.append(mat_name)
    return created
