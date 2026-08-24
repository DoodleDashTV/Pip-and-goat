"""Create a small Goat-like Blender fixture. Never uses the real Goat archive."""

from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def build_fixture(out_dir: Path) -> dict:
    import bpy  # type: ignore

    out_dir.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1.0)
    body = bpy.context.active_object
    body.name = "GoatBody"
    mat = bpy.data.materials.new("GoatFur")
    mat.use_nodes = True
    body.data.materials.append(mat)
    if not body.data.uv_layers:
        body.data.uv_layers.new(name="UVMap")
    img = bpy.data.images.new("GoatFurTex", 8, 8)
    img.pixels = [0.62, 0.44, 0.26, 1.0] * 64
    bpy.ops.mesh.primitive_torus_add(major_radius=0.4, minor_radius=0.05, location=(0.0, 0.0, 1.1))
    collar = bpy.context.active_object
    collar.name = "GoatCollar"
    blend = out_dir / "Goat_FINN.blend"
    fbx = out_dir / "Goat_FINN.fbx"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.export_scene.fbx(filepath=str(fbx), use_selection=False, add_leaf_bones=False)
    archive = out_dir / "Goat_FINN.synthetic.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED) as zipped:
        zipped.write(blend, "Goat_FINN.blend")
        zipped.write(fbx, "Goat_FINN.fbx")
    receipt = {
        "kind": "synthetic-goat-like",
        "realGoat": False,
        "blend": str(blend),
        "fbx": str(fbx),
        "zip": str(archive),
        "blendSha256": sha256(blend),
        "zipSha256": sha256(archive),
        "zipBytes": archive.stat().st_size,
        "lockedArchiveSize": 269512136,
        "matchesLockedArchive": False,
    }
    (out_dir / "fixture.receipt.json").write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    print(json.dumps(receipt, sort_keys=True))
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    raw = list(__import__("sys").argv[1:])
    if "--" in raw:
        raw = raw[raw.index("--") + 1 :]
    args = parser.parse_args(raw)
    build_fixture(Path(args.out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
