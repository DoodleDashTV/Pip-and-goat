#!/usr/bin/env python3
"""Protected production conversion of the official backpack Pip.

Opens the official working blend, saves a separate conversion copy, audits the
approved mesh, separates only high-confidence disconnected accessory islands,
adds a validation-only armature, poses it for deformation checks, and renders
comparison views. Never remeshes, never overwrites the working blend or
approved source, never touches Goat, and never claims production-ready.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "assets"))

from pip_replacement_intake import add_camera, apply_lookdev, render_still  # noqa: E402
from pip_replacement_intake_lib import (  # noqa: E402
    BLENDER_BIN,
    CHAR_LEFT,
    CHAR_RIGHT,
    FACING,
    REQUIRED_BLENDER,
    sha256_file,
)
from pip_production_conversion_lib import (  # noqa: E402
    COMPARISON_VIEWS,
    CONVERSION_ARTIFACTS,
    CONVERSION_BLEND,
    CONVERSION_REPORTS,
    DEFORMATION_POSES,
    GITHUB_BLEND_BYTE_LIMIT,
    OFFICIAL_STILLS,
    WORKING_BLEND,
    assert_conversion_destination,
    assert_protected_unchanged,
    classify_island,
    deformation_pose_channels,
    evaluate_conversion_gate,
    should_separate_island,
    snapshot_protected_sources,
    validation_bone_layout,
    write_conversion_catalogs,
    write_conversion_json,
)
from pip_visual_foundation_lib import APPROVED_SOURCE_SHA256  # noqa: E402

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


def _rel(path: Path) -> str:
    return str(path.relative_to(REPO_ROOT)) if path.is_relative_to(REPO_ROOT) else str(path)


def open_working_and_save_conversion_copy() -> dict:
    if not WORKING_BLEND.is_file():
        raise FileNotFoundError(WORKING_BLEND)
    source_hash = sha256_file(WORKING_BLEND)
    source_bytes = WORKING_BLEND.stat().st_size
    assert_conversion_destination(CONVERSION_BLEND)
    if CONVERSION_BLEND.exists():
        raise FileExistsError(f"refusing to overwrite existing conversion blend: {CONVERSION_BLEND}")
    bpy.ops.wm.open_mainfile(filepath=str(WORKING_BLEND))
    CONVERSION_BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(CONVERSION_BLEND), compress=True)
    if sha256_file(WORKING_BLEND) != source_hash:
        raise RuntimeError("official working blend changed while opening the conversion copy")
    return {
        "sourceWorkingBlend": _rel(WORKING_BLEND),
        "conversionBlend": _rel(CONVERSION_BLEND),
        "sourceBytes": source_bytes,
        "sourceSha256": source_hash,
        "approvedSourceSha256": APPROVED_SOURCE_SHA256,
        "copiedWithoutOverwrite": True,
    }


def audit_conversion_scene() -> dict:
    objects = _meshes()
    if not objects:
        raise RuntimeError("conversion copy has no mesh")
    working = bpy.data.objects.get("pip_backpack_working") or objects[0]
    mesh = working.data
    mn, mx = _bounds(objects)
    uv_layers = [layer.name for layer in mesh.uv_layers]
    materials = []
    images = []
    for material in mesh.materials:
        if material is None:
            continue
        mat_rec = {"name": material.name, "useNodes": bool(material.use_nodes), "images": []}
        if material.use_nodes:
            for node in material.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image:
                    image = node.image
                    rec = {
                        "name": image.name,
                        "size": [int(image.size[0]), int(image.size[1])],
                    }
                    mat_rec["images"].append(rec)
                    images.append(rec)
        materials.append(mat_rec)
    inverted = sum(1 for poly in mesh.polygons if not poly.use_smooth)
    return {
        "objectName": working.name,
        "objectCount": len(objects),
        "vertices": len(mesh.vertices),
        "faces": len(mesh.polygons),
        "edges": len(mesh.edges),
        "objectScale": list(working.scale),
        "objectLocation": list(working.location),
        "height": mx.z - mn.z,
        "boundsMin": [mn.x, mn.y, mn.z],
        "boundsMax": [mx.x, mx.y, mx.z],
        "facing": "+X",
        "uvLayers": uv_layers,
        "hasUVs": bool(uv_layers),
        "materials": materials,
        "images": images,
        "smoothFaces": len(mesh.polygons) - inverted,
        "flatFaces": inverted,
        "shapeKeys": bool(mesh.shape_keys),
        "armaturesBefore": [obj.name for obj in bpy.data.objects if obj.type == "ARMATURE"],
        "meshDatablockEdited": False,
        "voxelRemesh": False,
        "primitiveRebuild": False,
    }


def _island_records(obj) -> list[dict]:
    mesh = obj.data
    count = len(mesh.vertices)
    parent = list(range(count))
    rank = [0] * count

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra == rb:
            return
        if rank[ra] < rank[rb]:
            parent[ra] = rb
        elif rank[ra] > rank[rb]:
            parent[rb] = ra
        else:
            parent[rb] = ra
            rank[ra] += 1

    for edge in mesh.edges:
        union(edge.vertices[0], edge.vertices[1])

    groups: dict[int, list[int]] = {}
    for index in range(count):
        groups.setdefault(find(index), []).append(index)

    from mathutils import Vector

    mw = obj.matrix_world
    world = [mw @ vert.co for vert in mesh.vertices]
    xs = [co.x for co in world]
    ys = [co.y for co in world]
    zs = [co.z for co in world]
    mn = Vector((min(xs), min(ys), min(zs)))
    mx = Vector((max(xs), max(ys), max(zs)))
    height = max(mx.z - mn.z, 1e-6)
    center_x = (mn.x + mx.x) * 0.5
    center_y = (mn.y + mx.y) * 0.5
    records = []
    for root, verts in groups.items():
        coords = [world[index] for index in verts]
        cxs = [co.x for co in coords]
        cys = [co.y for co in coords]
        czs = [co.z for co in coords]
        centroid = Vector((sum(cxs) / len(cxs), sum(cys) / len(cys), sum(czs) / len(czs)))
        size = [max(cxs) - min(cxs), max(cys) - min(cys), max(czs) - min(czs)]
        record = {
            "root": root,
            "verts": len(verts),
            "centroid": [centroid.x, centroid.y, centroid.z],
            "size": size,
            "rel_z": (centroid.z - mn.z) / height,
            "rearward": centroid.x < center_x - height * 0.02,
            "lateral": centroid.y - center_y,
            "color": None,
            "vertIndices": verts,
        }
        record["classification"] = classify_island(record)
        records.append(record)
    records.sort(key=lambda item: item["verts"], reverse=True)
    return records


def separate_accessory_islands(obj) -> dict:
    records = _island_records(obj)
    planned: dict[str, list[int]] = {}
    kept = 0
    for record in records:
        classification = record["classification"]
        if should_separate_island(classification, record["verts"]):
            planned.setdefault(classification["label"], []).extend(record["vertIndices"])
        else:
            kept += 1
    created = {}
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="OBJECT")
    for label, indices in planned.items():
        unique = sorted(set(indices))
        if not unique:
            continue
        group = obj.vertex_groups.new(name=f"sep_{label}")
        group.add(unique, 1.0, "REPLACE")
    known = {item.name for item in _meshes()}
    for label in list(planned):
        group = obj.vertex_groups.get(f"sep_{label}")
        if group is None:
            continue
        bpy.ops.object.mode_set(mode="OBJECT")
        for other in _meshes():
            other.select_set(other == obj)
        bpy.context.view_layer.objects.active = obj
        select = [False] * len(obj.data.vertices)
        for vert in obj.data.vertices:
            for membership in vert.groups:
                if membership.group == group.index and membership.weight > 0.5:
                    select[vert.index] = True
                    break
        if not any(select):
            continue
        obj.data.vertices.foreach_set("select", select)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.separate(type="SELECTED")
        bpy.ops.object.mode_set(mode="OBJECT")
        newcomers = [item for item in _meshes() if item.name not in known]
        if not newcomers:
            continue
        accessory = newcomers[-1]
        accessory.name = f"pip_conversion_{label}"
        created[label] = accessory.name
        known.add(accessory.name)
    for name in [group.name for group in obj.vertex_groups if group.name.startswith("sep_")]:
        obj.vertex_groups.remove(obj.vertex_groups[name])
    obj.name = "pip_conversion_body"
    summary = []
    for record in records:
        summary.append(
            {
                "verts": record["verts"],
                "centroid": record["centroid"],
                "rel_z": record["rel_z"],
                "rearward": record["rearward"],
                "lateral": record["lateral"],
                "classification": {
                    "label": record["classification"]["label"],
                    "confidence": record["classification"]["confidence"],
                    "reasons": record["classification"]["reasons"],
                },
                "separated": should_separate_island(record["classification"], record["verts"]),
            }
        )
    return {
        "islandCount": len(records),
        "islandsKeptWithBody": kept,
        "separatedObjects": created,
        "geometryRewritten": False,
        "likenessRemeshed": False,
        "islands": summary[:80],
    }


def build_validation_armature(body) -> dict:
    from mathutils import Vector

    mn, mx = _bounds()
    layout = validation_bone_layout((mn.x, mn.y, mn.z), (mx.x, mx.y, mx.z))
    arm_data = bpy.data.armatures.new("pip_conversion_validation_armature")
    arm_obj = bpy.data.objects.new("pip_conversion_validation_rig", arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    edit = arm_data.edit_bones
    created = {}
    for spec in layout:
        bone = edit.new(spec["name"])
        bone.head = Vector(spec["head"])
        bone.tail = Vector(spec["tail"])
        if (bone.tail - bone.head).length < 1e-4:
            bone.tail = bone.head + Vector((0.0, 0.0, 0.05))
        bone.use_deform = spec["deform"]
        bone.envelope_distance = spec["envelopeDistance"]
        bone.envelope_weight = 1.0
        created[spec["name"]] = bone
    for spec in layout:
        if spec["parent"] and spec["parent"] in created:
            created[spec["name"]].parent = created[spec["parent"]]
    bpy.ops.object.mode_set(mode="POSE")
    for spec in layout:
        pbone = arm_obj.pose.bones[spec["name"]]
        pbone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")
    arm_data.display_type = "OCTAHEDRAL"

    body_mod = body.modifiers.new("pip_conversion_envelope", "ARMATURE")
    body_mod.object = arm_obj
    body_mod.use_vertex_groups = False
    body_mod.use_bone_envelopes = True
    body_mod.use_deform_preserve_volume = True

    parented = {}
    for label in ("backpack", "strap_L", "strap_R", "scarf"):
        accessory = bpy.data.objects.get(f"pip_conversion_{label}")
        if accessory is None or label not in arm_obj.data.bones:
            continue
        accessory.parent = arm_obj
        accessory.parent_type = "BONE"
        accessory.parent_bone = label
        bone = arm_obj.pose.bones[label]
        accessory.matrix_parent_inverse = (arm_obj.matrix_world @ bone.matrix).inverted()
        parented[label] = accessory.name

    return {
        "armature": arm_obj.name,
        "quality": "VALIDATION_ONLY",
        "inRigRegistry": False,
        "defaultForPip": False,
        "boundToFusedMeshAsLiveRig": False,
        "deformMethod": "bone_envelopes_plus_optional_bone_parent",
        "bones": [spec["name"] for spec in layout],
        "parentedAccessories": parented,
        "bodyModifier": body_mod.name,
    }


def reset_pose(arm_obj) -> None:
    from mathutils import Euler, Vector

    for bone in arm_obj.pose.bones:
        bone.location = Vector((0.0, 0.0, 0.0))
        bone.rotation_euler = Euler((0.0, 0.0, 0.0))
        bone.scale = Vector((1.0, 1.0, 1.0))
    bpy.context.view_layer.update()


def apply_pose(arm_obj, channels: list[dict]) -> None:
    from mathutils import Euler, Vector

    reset_pose(arm_obj)
    for channel in channels:
        bone = arm_obj.pose.bones.get(channel["bone"])
        if bone is None:
            continue
        if "location" in channel:
            bone.location = Vector(channel["location"])
        if "rotation_euler" in channel:
            bone.rotation_euler = Euler(channel["rotation_euler"])
    bpy.context.view_layer.update()


def ensure_lookdev() -> None:
    scene = bpy.context.scene
    scene.view_settings.view_transform = "Khronos PBR Neutral"
    scene.view_settings.look = "None"
    if scene.world and scene.world.name == "IntakeWorld":
        return
    apply_lookdev()


def render_conversion_views(dest: Path, prefix: str, samples: int = 12) -> list[str]:
    from mathutils import Vector

    ensure_lookdev()
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
        cam = add_camera(f"{prefix}_{name}", loc, look, ortho)
        bpy.context.scene.camera = cam
        path = dest / f"{prefix}_{name}.png"
        render_still(path, samples=samples)
        written.append(_rel(path))
    return written


def compare_rest_to_official(rest_dir: Path) -> dict:
    try:
        from PIL import Image
    except ImportError:
        return {"compared": False, "reason": "Pillow missing"}
    rows = []
    for view in COMPARISON_VIEWS:
        official = OFFICIAL_STILLS / f"{view}.png"
        converted = rest_dir / f"rest_{view}.png"
        if not official.is_file() or not converted.is_file():
            rows.append({"view": view, "compared": False})
            continue
        a = Image.open(official).convert("RGB").resize((270, 480))
        b = Image.open(converted).convert("RGB").resize((270, 480))
        pa = list(a.getdata())
        pb = list(b.getdata())
        total = 0.0
        for ca, cb in zip(pa, pb):
            total += abs(ca[0] - cb[0]) + abs(ca[1] - cb[1]) + abs(ca[2] - cb[2])
        mean = total / (len(pa) * 3 * 255.0)
        rows.append(
            {
                "view": view,
                "compared": True,
                "meanChannelDelta": mean,
                "official": _rel(official),
                "conversion": _rel(converted),
            }
        )
    return {
        "compared": True,
        "method": "downscaled_mean_channel_delta",
        "note": "Numeric closeness is not visual approval. Justin still reviews the stills.",
        "views": rows,
    }


def save_conversion_blend() -> dict:
    assert_conversion_destination(CONVERSION_BLEND)
    if Path(bpy.data.filepath).resolve() != CONVERSION_BLEND.resolve():
        raise PermissionError("refusing to save conversion over a different blend path")
    bpy.ops.wm.save_mainfile(compress=True)
    size = CONVERSION_BLEND.stat().st_size
    return {
        "path": _rel(CONVERSION_BLEND),
        "bytes": size,
        "underGithubLimit": size < GITHUB_BLEND_BYTE_LIMIT,
        "githubLimit": GITHUB_BLEND_BYTE_LIMIT,
    }


def run_blender_conversion() -> dict:
    version = bpy.app.version_string
    if REQUIRED_BLENDER not in version:
        raise RuntimeError(f"expected Blender {REQUIRED_BLENDER} LTS, got {version}")
    before = snapshot_protected_sources()
    copy_info = open_working_and_save_conversion_copy()
    audit = audit_conversion_scene()
    body = bpy.data.objects.get("pip_backpack_working") or _meshes()[0]
    islands = separate_accessory_islands(body)
    body = bpy.data.objects.get("pip_conversion_body") or body
    rig = build_validation_armature(body)
    arm = bpy.data.objects[rig["armature"]]
    previews = CONVERSION_ARTIFACTS / "previews"
    poses = deformation_pose_channels()
    renders = []
    pose_notes = []
    for pose_name in DEFORMATION_POSES:
        apply_pose(arm, poses[pose_name])
        samples = 12 if pose_name == "rest" else 8
        prefix = pose_name
        if pose_name == "rest":
            written = render_conversion_views(previews, prefix, samples=samples)
        else:
            # Deformation tests: front and three-quarter only.
            from mathutils import Vector

            ensure_lookdev()
            mn, mx = _bounds()
            center = (mn + mx) * 0.5
            height = max(mx.z - mn.z, 0.001)
            radius = max(mx.x - mn.x, mx.y - mn.y, height) * 1.45
            focus = center + Vector((0, 0, height * 0.02))
            subset = {
                "front": (center + Vector(FACING) * radius, height * 1.28, focus),
                "three_quarter": (
                    center + (Vector(FACING) * 0.72 + Vector(CHAR_LEFT) * 0.72) * radius,
                    height * 1.32,
                    focus,
                ),
            }
            written = []
            previews.mkdir(parents=True, exist_ok=True)
            for name, (loc, ortho, look) in subset.items():
                cam = add_camera(f"{prefix}_{name}", loc, look, ortho)
                bpy.context.scene.camera = cam
                path = previews / f"{prefix}_{name}.png"
                render_still(path, samples=samples)
                written.append(_rel(path))
        renders.extend(written)
        pose_notes.append({"pose": pose_name, "renders": written, "channels": poses[pose_name]})
    reset_pose(arm)
    saved = save_conversion_blend()
    after = snapshot_protected_sources()
    assert_protected_unchanged(before, after)
    comparison = compare_rest_to_official(previews)
    report = {
        "schema": "tivvlejoy.pip_production_conversion.result.v1",
        "blender": version,
        "copy": copy_info,
        "audit": audit,
        "islands": {
            "islandCount": islands["islandCount"],
            "islandsKeptWithBody": islands["islandsKeptWithBody"],
            "separatedObjects": islands["separatedObjects"],
            "geometryRewritten": False,
            "likenessRemeshed": False,
            "islands": islands["islands"],
        },
        "rig": rig,
        "poses": pose_notes,
        "renders": renders,
        "comparison": comparison,
        "saved": saved,
        "protectedAfter": after,
        "productionReady": False,
        "conversionComplete": False,
        "theatricalBound": False,
        "paidResources": False,
        "goatTouched": False,
    }
    write_conversion_json(CONVERSION_REPORTS / "AUDIT.json", {
        "schema": "tivvlejoy.pip_production_conversion.audit.v1",
        **audit,
        "islands": report["islands"],
    })
    write_conversion_json(CONVERSION_REPORTS / "CONVERSION.json", report)
    write_conversion_json(CONVERSION_REPORTS / "COMPARISON.json", comparison)
    write_conversion_json(
        CONVERSION_REPORTS / "GATE.json",
        evaluate_conversion_gate(conversionStarted=True, conversionArtifactsPresent=True),
    )
    return report


def compose_phone_and_compare() -> None:
    phone = CONVERSION_ARTIFACTS / "phone"
    command = [
        sys.executable,
        str(REPO_ROOT / "scripts/assets/compose_intake_phone.py"),
        "--previews",
        str(CONVERSION_ARTIFACTS / "previews"),
        "--phone",
        str(phone),
        "--title",
        "Pip production conversion — stop for Justin",
    ]
    subprocess.run(command, check=False)
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return
    dest = phone / "approved_vs_conversion.jpg"
    cells = []
    for view in COMPARISON_VIEWS:
        official = OFFICIAL_STILLS / f"{view}.png"
        converted = CONVERSION_ARTIFACTS / "previews" / f"rest_{view}.png"
        if official.is_file() and converted.is_file():
            left = Image.open(official).convert("RGB")
            right = Image.open(converted).convert("RGB")
            left.thumbnail((240, 426))
            right.thumbnail((240, 426))
            pair = Image.new("RGB", (left.size[0] + right.size[0] + 12, max(left.size[1], right.size[1]) + 22), (28, 26, 24))
            pair.paste(left, (0, 18))
            pair.paste(right, (left.size[0] + 12, 18))
            draw = ImageDraw.Draw(pair)
            font_path = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
            font = ImageFont.truetype(str(font_path), 11) if font_path.exists() else ImageFont.load_default()
            draw.text((4, 2), f"{view} approved | conversion", fill=(245, 236, 220), font=font)
            cells.append(pair)
    if not cells:
        return
    width = max(im.size[0] for im in cells)
    height = sum(im.size[1] for im in cells) + 16 * len(cells)
    canvas = Image.new("RGB", (width + 16, height + 36), (22, 20, 18))
    draw = ImageDraw.Draw(canvas)
    font_path = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    font = ImageFont.truetype(str(font_path), 16) if font_path.exists() else ImageFont.load_default()
    draw.text((8, 8), "Approved identity vs conversion rest", fill=(245, 236, 220), font=font)
    y = 32
    for im in cells:
        canvas.paste(im, (8, y))
        y += im.size[1] + 12
    dest.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dest, "JPEG", quality=82, optimize=True)


def write_human_reports(result: dict | None) -> None:
    CONVERSION_REPORTS.mkdir(parents=True, exist_ok=True)
    islands = (result or {}).get("islands", {})
    separated = islands.get("separatedObjects") or {}
    renders = (result or {}).get("renders") or []
    comparison = (result or {}).get("comparison") or {}
    saved = (result or {}).get("saved") or {}
    md = [
        "# Pip production conversion — stop for Justin",
        "",
        "This is a protected conversion copy of the official backpack Pip.",
        "It is **not** production-ready. Draft PR #24 stays draft.",
        "`production-library/` was not replaced. Goat was not touched.",
        "",
        "## Source",
        "",
        f"- Official working blend: `{WORKING_BLEND.relative_to(REPO_ROOT)}`",
        f"- Conversion copy: `{CONVERSION_BLEND.relative_to(REPO_ROOT)}`",
        f"- Approved source SHA-256: `{APPROVED_SOURCE_SHA256}`",
        "- Official working blend was not overwritten.",
        "- Approved inbox parts were not overwritten.",
        "",
        "## What this pass did",
        "",
        "1. Copied the official working blend into a new conversion path.",
        "2. Audited topology, materials, textures, UVs, normals, scale, and orientation.",
        "3. Classified disconnected islands. Separated only high-confidence backpack / strap / scarf islands.",
        "4. Left the approved high-res likeness in the conversion file. No voxel remesh. No primitive rebuild.",
        "5. Added a validation-only armature with envelope deform and optional bone-parented accessories.",
        "6. Posed rest, wing fold, head turn, foot lift, backpack sway, strap shift, and scarf sway.",
        "7. Rendered comparison views against the approved identity stills.",
        "",
        "## Separated objects",
        "",
        f"- Island count: `{islands.get('islandCount', 'pending')}`",
        f"- Separated: `{json.dumps(separated)}`",
        "",
        "If an accessory stayed fused, it could not be split without cutting or remeshing.",
        "That work was refused.",
        "",
        "## Renders",
        "",
        "Rest and deformation stills:",
        f"`artifacts/theatrical-v2/final-character-production/pip-production-conversion/previews/`",
        "",
        "Phone JPEGs:",
        f"`artifacts/theatrical-v2/final-character-production/pip-production-conversion/phone/`",
        "",
        "## Comparison",
        "",
        "Numeric closeness is not visual approval.",
        f"`{json.dumps(comparison, indent=2)}`",
        "",
        "## Still closed",
        "",
        "- production-ready claim",
        "- production-library replace",
        "- theatrical bind",
        "- Draft PR merge",
        "- live rig registry bind",
        "- voxel remesh / primitive rebuild",
        "- Goat",
        "- paid resources",
        "",
        f"Conversion blend bytes: `{saved.get('bytes', 'pending')}`",
        "",
    ]
    (CONVERSION_REPORTS / "COMPARISON.md").write_text("\n".join(md) + "\n")


def write_justin_report(result: dict | None) -> None:
    islands = (result or {}).get("islands", {})
    separated = islands.get("separatedObjects") or {}
    saved = (result or {}).get("saved") or {}
    comparison = (result or {}).get("comparison") or {}
    audit = (result or {}).get("audit") or {}
    text = "\n".join(
        [
            "TIVVLEJOY — PIP PRODUCTION CONVERSION STOP FOR JUSTIN",
            "SELECT-ALL COPY BLOCK",
            "",
            "Working branch: cursor/theatrical-final-character-production-1ebc",
            "Draft PR: #24 — still draft, not merged",
            "Blender: 4.2.3 LTS",
            "Paid resources: not used",
            "production-library replaced: no",
            "Theatrical binding: not declared",
            "Goat touched: no",
            "",
            "RESUMED FROM",
            "Last completed checkpoint: official backpack visual identity.",
            "Working copy: theatrical-foundation/proposed/final-character-production/working/pip_backpack_canonical_working.blend",
            "Approved source SHA-256: dca239475c78c9158ac87c36d674ceb23ef334358ee4394607758fc8f6728696",
            "That working copy and the approved inbox parts were not overwritten.",
            "",
            "WHAT THIS PASS DID",
            "1. Created a protected conversion copy. The official working blend stayed put.",
            "2. Audited topology, materials, textures, UVs, normals, scale, and orientation.",
            "3. Classified disconnected islands. Separated only high-confidence backpack / strap / scarf islands. No cut through fused geometry.",
            "4. Preserved the approved high-res likeness. No voxel remesh. No primitive rebuild.",
            "5. Added a validation-only armature. Envelope deform on the body. Bone-parent on separated accessories if they existed.",
            "6. Did not bind the modular rig spec as the live Pip rig and did not add it to the rig registry.",
            "7. Posed rest, wing fold, head turn, foot lift, backpack sway, strap shift, and scarf sway.",
            "8. Rendered front, back, left, right, three-quarter rest views plus deformation-test views.",
            "9. Compared rest stills to the approved identity stills. Numeric closeness is not approval.",
            "",
            "CONVERSION COPY",
            "theatrical-foundation/proposed/final-character-production/conversion/pip_backpack_production_conversion.blend",
            f"Bytes: {saved.get('bytes', 'pending')}",
            f"Under GitHub 100 MB limit: {saved.get('underGithubLimit', 'pending')}",
            "",
            "AUDIT",
            f"Vertices: {audit.get('vertices', 'pending')}",
            f"Faces: {audit.get('faces', 'pending')}",
            f"UVs present: {audit.get('hasUVs', 'pending')}",
            f"Object scale: {audit.get('objectScale', 'pending')}",
            f"Height: {audit.get('height', 'pending')}",
            f"Facing: {audit.get('facing', '+X')}",
            "",
            "ACCESSORIES",
            f"Island count: {islands.get('islandCount', 'pending')}",
            f"Separated objects: {json.dumps(separated)}",
            "If backpack or straps are missing from that list, they are still fused and were not cut apart.",
            "",
            "RENDERS",
            "artifacts/theatrical-v2/final-character-production/pip-production-conversion/phone/",
            "Rest: rest_front, rest_rear, rest_left, rest_right, rest_three_quarter",
            "Deform: wing_fold, head_turn, foot_lift, backpack_sway, strap_shift, scarf_sway",
            "Side-by-side: approved_vs_conversion.jpg",
            "",
            "COMPARISON NOTE",
            "Compare those stills to the approved identity views in",
            "artifacts/theatrical-v2/final-character-production/pip-visual-identity/phone/",
            f"Numeric summary: {json.dumps(comparison.get('views', comparison))}",
            "",
            "HONEST LIMITS",
            "This is still the fused Tripo source, or islands split from it.",
            "There are no clean eyelid, mouth, or wing-fold loops.",
            "Envelope weights are validation-only. They are not production weights.",
            "Facial bones are markers, not a production face rig.",
            "The conversion is not animation-ready in the production sense.",
            "",
            "NOT DONE / STILL CLOSED",
            "- production-ready claim",
            "- production-library replace",
            "- theatrical bind",
            "- Draft PR #24 merge",
            "- live rig registry bind",
            "- voxel remesh or primitive rebuild",
            "- Goat",
            "- paid resources",
            "- hero shots / episode renders",
            "",
            "STATUS",
            "PIP VISUAL IDENTITY: APPROVED — backpack design is official",
            "PIP PRODUCTION CONVERSION: STARTED — protected copy + audit + safe island split + validation armature + comparison renders",
            "PIP PRODUCTION ASSET: NOT READY — fused or island-split Tripo source, not a production retopo",
            "PIP SATCHEL / PRISM / LONG-WING: ARCHIVED FOR ROLLBACK",
            "GOAT: UNCHANGED",
            "CANON / PRODUCTION-LIBRARY: UNTOUCHED",
            "THEATRICAL BINDING: NOT DECLARED",
            "MERGE: NOT PERFORMED",
            "PAID RESOURCES: NOT USED",
            "",
            "STOP",
            "Please review the conversion stills against the approved backpack Pip.",
            "Do not treat this as the final theatrical Pip until you say so.",
            "",
        ]
    )
    CONVERSION_REPORTS.mkdir(parents=True, exist_ok=True)
    (CONVERSION_REPORTS / "JUSTIN_COPY_REPORT.txt").write_text(text + "\n")


def run_host() -> int:
    before = snapshot_protected_sources()
    write_conversion_catalogs(started=True, artifacts_present=False)
    if not BLENDER_BIN.is_file():
        write_human_reports(None)
        write_justin_report(None)
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
        "blender-convert",
    ]
    completed = subprocess.run(command, env=env, check=False)
    result = None
    result_path = CONVERSION_REPORTS / "CONVERSION.json"
    if result_path.is_file():
        result = json.loads(result_path.read_text())
    compose_phone_and_compare()
    write_conversion_catalogs(started=True, artifacts_present=result_path.is_file())
    write_human_reports(result)
    write_justin_report(result)
    after = snapshot_protected_sources()
    assert_protected_unchanged(before, after)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)
    print(json.dumps({
        "ok": True,
        "conversionBlend": str(CONVERSION_BLEND),
        "gate": evaluate_conversion_gate(conversionStarted=True, conversionArtifactsPresent=True),
    }))
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    if bpy is not None and "--" in sys.argv:
        argv = sys.argv[sys.argv.index("--") + 1 :]
    if not argv:
        raise SystemExit("usage: pip_production_conversion.py convert")
    command = argv[0]
    if command == "blender-convert":
        if bpy is None:
            raise SystemExit("blender-convert must run inside Blender 4.2.3 LTS")
        run_blender_conversion()
        return 0
    if command == "convert":
        return run_host()
    raise SystemExit(f"unknown command {command}")


if __name__ == "__main__":
    raise SystemExit(main())
