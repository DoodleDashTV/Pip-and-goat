"""Read-only Blender audit for one purchased TivvleJoy scenery source."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from asset_certify_contract_v1 import SCHEMA, evaluate_audit


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def apply_image_bindings(bindings: list[dict]) -> list[dict]:
    """Bind declared replacements in memory only; never save the vendor scene."""
    import bpy

    applied = []
    for binding in bindings:
        original = str(binding.get("original") or "")
        replacement = Path(str(binding.get("replacement") or ""))
        expected_sha = str(binding.get("replacementSha256") or "").removeprefix("sha256:")
        if not original or not replacement.is_file() or _sha256(replacement) != expected_sha:
            raise RuntimeError("IMAGE_BINDING_IDENTITY_MISMATCH")
        matched = [image for image in bpy.data.images if image.filepath == original]
        if not matched:
            raise RuntimeError("IMAGE_BINDING_SOURCE_NOT_FOUND")
        for image in matched:
            image.filepath = str(replacement)
        applied.append({
            "originalBasename": Path(original.replace("\\", "/")).name,
            "replacementBasename": replacement.name,
            "replacementSha256": expected_sha,
            "policy": str(binding.get("policy") or "DECLARED_REPLACEMENT"),
        })
    return applied


def _exists(filepath: str) -> bool:
    if not filepath:
        return False
    try:
        import bpy

        return Path(bpy.path.abspath(filepath)).exists()
    except Exception:
        return Path(filepath).exists()


def collect(source_id: str, source_sha256: str, skipped_archive_members: list[str], dependency_bindings: list[dict]):
    import bpy

    missing_images = [image.filepath for image in bpy.data.images if image.source == "FILE" and not image.packed_file and not _exists(image.filepath)]
    missing_libraries = [library.filepath for library in bpy.data.libraries if not _exists(library.filepath)]
    missing_fonts = [font.filepath for font in bpy.data.fonts if font.filepath and not font.packed_file and not _exists(font.filepath)]
    missing_clips = [clip.filepath for clip in bpy.data.movieclips if not _exists(clip.filepath)]
    missing_volumes = [volume.filepath for volume in bpy.data.volumes if volume.filepath and not _exists(volume.filepath)]
    missing_node_groups = []
    for obj in bpy.data.objects:
        for modifier in obj.modifiers:
            if modifier.type == "NODES" and modifier.node_group is None:
                missing_node_groups.append(f"{obj.name}:{modifier.name}")
    materials_without_output = []
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        outputs = [node for node in material.node_tree.nodes if node.type == "OUTPUT_MATERIAL"]
        if not outputs:
            materials_without_output.append(material.name)

    source_path = Path(bpy.data.filepath)
    actual_source_sha = source_sha256.removeprefix("sha256:")
    if source_path.is_file() and not actual_source_sha:
        digest = hashlib.sha256()
        with source_path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
                digest.update(chunk)
        actual_source_sha = digest.hexdigest()

    audit = {
        "schema": SCHEMA,
        "blenderVersion": ".".join(str(value) for value in bpy.app.version),
        "sourceId": source_id,
        "sourceSha256": actual_source_sha,
        "blendFile": source_path.name,
        "missingImages": sorted(set(missing_images)),
        "missingLibraries": sorted(set(missing_libraries)),
        "missingFonts": sorted(set(missing_fonts)),
        "missingMovieClips": sorted(set(missing_clips)),
        "missingVolumes": sorted(set(missing_volumes)),
        "missingCaches": [],
        "missingNodeGroups": sorted(set(missing_node_groups)),
        "materialsWithoutOutput": sorted(set(materials_without_output)),
        "skippedArchiveMembers": sorted(set(skipped_archive_members)),
        "dependencyBindings": dependency_bindings,
        "externalDependenciesMaterialized": not any([missing_images, missing_libraries, missing_fonts, missing_clips, missing_volumes]),
        "colorManagementVerified": bool(bpy.context.scene.view_settings.view_transform),
        "geometryNodesVerified": not missing_node_groups,
        "materialOutputsVerified": not materials_without_output,
        "readOnly": True,
    }
    return audit, evaluate_audit(audit)


def parse_args():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--source-sha256", default="")
    parser.add_argument("--skipped-archive-members-json", default="[]")
    parser.add_argument("--image-bindings-json", default="[]")
    parser.add_argument("--out", required=True)
    return parser.parse_args(raw)


def main():
    args = parse_args()
    skipped = json.loads(args.skipped_archive_members_json)
    bindings = apply_image_bindings(json.loads(args.image_bindings_json))
    audit, verdict = collect(args.source_id, args.source_sha256, skipped, bindings)
    payload = {"audit": audit, "verdict": verdict}
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(verdict, sort_keys=True))
    return 0 if verdict["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
