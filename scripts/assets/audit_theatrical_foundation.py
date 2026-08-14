"""Read-only audit of the approved production library for theatrical foundation.

Does not write to production-library/. Emits a JSON inventory the review package
consumes. Run:

  blender -b -noaudio --python scripts/assets/audit_theatrical_foundation.py -- \\
      --out artifacts/theatrical-foundation/audit.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "blender"))

import bpy  # noqa: E402

LIB = REPO_ROOT / "production-library"
ASSETS = [
    {"id": "pip", "kind": "character", "role": "pip", "path": LIB / "characters/pip_production.blend"},
    {"id": "goat", "kind": "character", "role": "goat", "path": LIB / "characters/goat_production.blend"},
    {"id": "meadow", "kind": "environment", "role": "meadow", "path": LIB / "environments/meadow_production.blend"},
    {"id": "map", "kind": "prop", "role": "map", "path": LIB / "props/adventure_map.blend"},
]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit approved production blends.")
    parser.add_argument("--out", required=True)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def material_summary(obj) -> list[dict]:
    rows = []
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None:
            continue
        row = {"name": mat.name, "useNodes": bool(mat.use_nodes), "blendMethod": getattr(mat, "blend_method", None)}
        if mat.use_nodes:
            principled = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if principled:
                def val(name, default=None):
                    sock = principled.inputs.get(name)
                    if sock is None:
                        return default
                    return list(sock.default_value) if hasattr(sock.default_value, "__iter__") and not isinstance(sock.default_value, str) else sock.default_value

                row["principled"] = {
                    "baseColor": val("Base Color"),
                    "roughness": val("Roughness"),
                    "metallic": val("Metallic"),
                    "specular": val("Specular IOR Level") or val("Specular"),
                    "ior": val("IOR"),
                    "subsurfaceWeight": val("Subsurface Weight") or val("Subsurface"),
                    "sheenWeight": val("Sheen Weight") or val("Sheen"),
                    "emissionStrength": val("Emission Strength"),
                }
            row["hasImageTexture"] = any(n.type == "TEX_IMAGE" for n in mat.node_tree.nodes)
            row["hasNormalMap"] = any(n.type == "NORMAL_MAP" for n in mat.node_tree.nodes)
        rows.append(row)
    return rows


def inspect_blend(spec: dict) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    path = spec["path"]
    with bpy.data.libraries.load(str(path), link=False) as (src, dst):
        dst.objects = list(src.objects)
        dst.actions = list(src.actions)
        dst.materials = list(src.materials)
        dst.armatures = list(src.armatures)
    for obj in bpy.data.objects:
        if obj.name not in bpy.context.scene.collection.objects:
            try:
                bpy.context.scene.collection.objects.link(obj)
            except RuntimeError:
                pass

    meshes = []
    armatures = []
    lights = []
    cameras = []
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            mesh = obj.data
            keys = []
            if mesh.shape_keys:
                keys = [kb.name for kb in mesh.shape_keys.key_blocks]
            meshes.append(
                {
                    "name": obj.name,
                    "vertices": len(mesh.vertices),
                    "polygons": len(mesh.polygons),
                    "parent": obj.parent.name if obj.parent else None,
                    "parentType": obj.parent_type,
                    "vertexGroups": [g.name for g in obj.vertex_groups],
                    "shapeKeys": keys,
                    "shapeKeyCount": len(keys),
                    "uvLayers": [uv.name for uv in mesh.uv_layers],
                    "materials": material_summary(obj),
                    "modifiers": [m.type for m in obj.modifiers],
                }
            )
        elif obj.type == "ARMATURE":
            bones = []
            for bone in obj.data.bones:
                bones.append(
                    {
                        "name": bone.name,
                        "parent": bone.parent.name if bone.parent else None,
                        "useDeform": bool(bone.use_deform),
                    }
                )
            pose_modes = {pb.name: pb.rotation_mode for pb in obj.pose.bones}
            armatures.append(
                {
                    "name": obj.name,
                    "boneCount": len(bones),
                    "bones": bones,
                    "poseBoneRotationModes": pose_modes,
                }
            )
        elif obj.type == "LIGHT":
            lights.append({"name": obj.name, "lightType": obj.data.type, "energy": obj.data.energy})
        elif obj.type == "CAMERA":
            cameras.append({"name": obj.name})

    actions = []
    for action in bpy.data.actions:
        varying = 0
        for fcurve in action.fcurves:
            ys = [kp.co.y for kp in fcurve.keyframe_points]
            if ys and max(ys) - min(ys) > 1e-6:
                varying += 1
        actions.append(
            {
                "name": action.name,
                "fcurves": len(action.fcurves),
                "varyingFcurves": varying,
                "constantFcurves": len(action.fcurves) - varying,
                "frameRange": [float(action.frame_range[0]), float(action.frame_range[1])],
            }
        )

    return {
        "id": spec["id"],
        "kind": spec["kind"],
        "role": spec["role"],
        "path": str(path.relative_to(REPO_ROOT)),
        "exists": path.exists(),
        "bytes": path.stat().st_size if path.exists() else 0,
        "sha256": sha256_file(path) if path.exists() else None,
        "blenderVersion": bpy.app.version_string,
        "meshes": sorted(meshes, key=lambda m: m["name"]),
        "armatures": armatures,
        "actions": sorted(actions, key=lambda a: a["name"]),
        "lights": lights,
        "cameras": cameras,
        "materialCount": len(bpy.data.materials),
        "imageCount": len(bpy.data.images),
        "packedImages": [img.name for img in bpy.data.images if img.packed_file],
    }


def classify(asset: dict) -> dict:
    """Honest classification against theatrical requirements. Not an approval."""
    issues = []
    if asset["kind"] == "character":
        verts = sum(m["vertices"] for m in asset["meshes"])
        if verts < 8000:
            issues.append(f"low mesh density ({verts} verts across meshes) — prototype kitbash, not theatrical sculpt")
        keys = {k for m in asset["meshes"] for k in m["shapeKeys"]}
        if not any("viseme_" in k for k in keys):
            issues.append("no viseme_ shape keys found on any mesh")
        if not any(m["uvLayers"] for m in asset["meshes"]):
            issues.append("no UV layers — vertex-color / flat shader pipeline")
        if not any(any(mat.get("hasImageTexture") for mat in m["materials"]) for m in asset["meshes"]):
            issues.append("no image textures — no PBR texture set")
        if not any(any(mat.get("hasNormalMap") for mat in m["materials"]) for m in asset["meshes"]):
            issues.append("no normal maps")
        sss = [
            (mat.get("principled") or {}).get("subsurfaceWeight") or 0
            for m in asset["meshes"]
            for mat in m["materials"]
        ]
        if sss and max(float(v or 0) for v in sss) < 0.05:
            issues.append("subsurface weight near zero — plastic/toy shading")
        if not asset["armatures"]:
            issues.append("no armature")
        else:
            bone_names = {b["name"].lower() for a in asset["armatures"] for b in a["bones"]}
            if not any("eye" in n for n in bone_names):
                issues.append("no eye-aim bones (independentEyeAim false)")
        varying = [a for a in asset["actions"] if a["varyingFcurves"] > 0]
        if len(varying) < 4:
            issues.append(f"few varying actions ({len(varying)})")
    elif asset["kind"] == "environment":
        if not any(m["uvLayers"] for m in asset["meshes"]):
            issues.append("environment has no UVs")
        if len(asset["meshes"]) < 3:
            issues.append("sparse set dressing")
    elif asset["kind"] == "prop":
        if sum(m["vertices"] for m in asset["meshes"]) < 200:
            issues.append("prop mesh is extremely light")

    production_ready = asset["kind"] in {"character", "environment", "prop"} and not any(
        "no armature" in i or "no viseme" in i for i in issues
    )
    return {
        "productionReadyForPipeline": production_ready,
        "reusable": True,
        "needsUpgrade": True,
        "theatricalReady": False,
        "issues": issues,
        "label": "existing approved asset" if production_ready else "existing asset — incomplete",
    }


def main() -> int:
    args = parse_args()
    assets = [inspect_blend(spec) for spec in ASSETS]
    for asset in assets:
        asset["classification"] = classify(asset)

    missing = [
        {"id": "LOC_CREEK_001", "kind": "environment", "reason": "validation scene beat B4 names a creek; no creek blend exists"},
        {"id": "pip_theatrical", "kind": "character", "reason": "no THEATRICAL binding; resolveCharacterBinding(THEATRICAL) fails closed"},
        {"id": "goat_theatrical", "kind": "character", "reason": "no THEATRICAL binding; resolveCharacterBinding(THEATRICAL) fails closed"},
        {"id": "groom_caches", "kind": "simulation", "reason": "prototype bindings have no groomVersion"},
        {"id": "pbr_texture_sets", "kind": "material", "reason": "no 2K/4K texture sets on founding assets"},
        {"id": "eye_aim_rigs", "kind": "rig", "reason": "prototype rigs have independentEyeAim=false"},
        {"id": "feature_animation_library", "kind": "animation", "reason": "authored actions are prototype clips, not a theatrical library"},
    ]
    prohibited = [
        {
            "id": "third_party_marketplace_assets",
            "reason": "paid/unlicensed placeholders are forbidden; studio provenance is in-house only",
        }
    ]

    report = {
        "audit": "theatrical-cgi-asset-foundation",
        "label": "existing approved asset inventory — not a visual approval",
        "productionLibraryMutated": False,
        "assets": assets,
        "missing": missing,
        "prohibitedOrUnlicensed": prohibited,
        "approvedFingerprintPin": "7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7",
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"status": "OK", "assets": [a["id"] for a in assets], "out": str(out)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
