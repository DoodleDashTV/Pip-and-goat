"""Live 26-stage character department. Requires bpy and an explicit --execute flag."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

from animation_tests import DEFORMATION_POSES, VALIDATION_CLIPS
from common.bpy_guard import detect_bpy, require_bpy
from common.stages import BUILD_STAGES, blocked_stage, executed_stage, failed_stage
from controls import plan_controls
from correctives import CANDIDATES as CORRECTIVE_CANDIDATES
from face import EXPRESSIONS, FACE_CONTROLS
from quality_gate import evaluate_master_gate
from rig_contract import evaluate_rig_contract, qa_subject_names, select_body_candidate
from semantic_map import map_object_name

STUDIO_BLENDER = (4, 2, 2)
LOCKED_SOURCE_PREFIX = Path("tivvlejoy-assets") / "characters" / "CHAR_GOAT_001" / "source"
LOCKED_SOURCE_SHA256 = "f5e85122f5af476e07df58c884b16a9663e05aaeef668f4d218fb7a410162ea5"
LOCKED_SOURCE_SIZE = 269512136


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def _refuse_locked_write(path: Path) -> None:
    resolved = path.resolve()
    if LOCKED_SOURCE_PREFIX.as_posix() in resolved.as_posix():
        raise RuntimeError("LOCKED_SOURCE_WRITE_FORBIDDEN")


def _body_selection(bpy: Any) -> dict[str, Any]:
    candidates = [
        {
            "name": obj.name,
            "role": map_object_name(obj.name),
            "vertices": len(obj.data.vertices),
        }
        for obj in bpy.data.objects
        if obj.type == "MESH" and obj.data and len(obj.data.vertices) > 0
    ]
    return select_body_candidate(candidates)


def _armature_for_body(bpy: Any, body: Any | None) -> Any | None:
    if body is None:
        return None
    driven = [
        modifier.object
        for modifier in body.modifiers
        if modifier.type == "ARMATURE" and getattr(modifier, "object", None) is not None
    ]
    unique = {item.name: item for item in driven}
    if len(unique) == 1:
        return next(iter(unique.values()))
    if getattr(body, "parent", None) is not None and body.parent.type == "ARMATURE":
        return body.parent
    armatures = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    return armatures[0] if len(armatures) == 1 else None


def _is_descendant_of(obj: Any, parents: set[str]) -> bool:
    current = getattr(obj, "parent", None)
    seen: set[str] = set()
    while current is not None and current.name not in seen:
        if current.name in parents:
            return True
        seen.add(current.name)
        current = getattr(current, "parent", None)
    return False


def _is_rig_bound(obj: Any, body: Any | None, armature: Any | None) -> bool:
    parent_names = {item.name for item in (body, armature) if item is not None}
    if getattr(obj, "parent", None) is not None and (
        obj.parent.name in parent_names or _is_descendant_of(obj, parent_names)
    ):
        return True
    return any(
        modifier.type == "ARMATURE"
        and getattr(modifier, "object", None) is not None
        and modifier.object.name in parent_names
        for modifier in getattr(obj, "modifiers", [])
    )


def _shape_key_names(obj: Any) -> list[str]:
    keys = getattr(getattr(obj, "data", None), "shape_keys", None)
    return [key.name for key in keys.key_blocks] if keys is not None else []


def _rig_snapshot(bpy: Any, body_selection: dict[str, Any]) -> tuple[Any | None, Any | None, dict[str, Any]]:
    selected = body_selection.get("selected") if body_selection.get("ok") else None
    body = bpy.data.objects.get(selected["name"]) if selected else None
    armature = _armature_for_body(bpy, body)
    bones = list(armature.data.bones) if armature is not None else []
    deform_bone_names = {bone.name for bone in bones if bone.use_deform}
    body_modifiers = []
    weighted = 0
    max_influences = 0
    vertex_group_count = 0
    if body is not None:
        body_modifiers = [
            modifier.object.name
            for modifier in body.modifiers
            if modifier.type == "ARMATURE" and getattr(modifier, "object", None) is not None
        ]
        deform_group_indexes = {
            group.index for group in body.vertex_groups if group.name in deform_bone_names
        }
        vertex_group_count = len(deform_group_indexes)
        for vertex in body.data.vertices:
            influences = [
                group
                for group in vertex.groups
                if group.group in deform_group_indexes and float(group.weight) > 1e-6
            ]
            if influences:
                weighted += 1
            max_influences = max(max_influences, len(influences))

    character_meshes = [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH"
        and (
            obj is body
            or map_object_name(obj.name) in {"BODY", "EYES", "MOUTH", "FUR"}
            or _is_rig_bound(obj, body, armature)
        )
    ]
    shape_names = [name for obj in character_meshes for name in _shape_key_names(obj)]
    lowered_shapes = [name.lower() for name in shape_names if name.lower() != "basis"]
    face_shape_count = sum(
        1
        for name in lowered_shapes
        if any(token in name for token in ("face", "blink", "smile", "frown", "brow", "mouth", "jaw", "eye"))
    )
    viseme_count = sum(
        1
        for name in lowered_shapes
        if "viseme" in name or name.upper() in {"AI", "E", "O", "U", "MBP", "FV", "L", "TH", "WQ", "CHSH", "KG", "R"}
    )

    pose_bones = list(armature.pose.bones) if armature is not None else []
    face_bones = [
        bone
        for bone in bones
        if any(token in bone.name.lower() for token in ("face", "jaw", "mouth", "lip", "eye", "lid", "brow"))
    ]
    control_bones = [
        bone
        for bone in bones
        if not bone.use_deform or any(token in bone.name.lower() for token in ("ctrl", "control", "ik", "fk", "master", "root"))
    ]
    constraint_count = sum(len(bone.constraints) for bone in pose_bones)
    actions = []
    for action in bpy.data.actions:
        fcurves = list(getattr(action, "fcurves", []))
        character_curves = [
            curve
            for curve in fcurves
            if "pose.bones" in str(getattr(curve, "data_path", ""))
            or "key_blocks" in str(getattr(curve, "data_path", ""))
        ]
        actions.append({"name": action.name, "fcurveCount": len(character_curves)})

    accessories = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        role = map_object_name(obj.name)
        if role not in {"COLLAR", "TAG", "SCARF", "HORNS", "ACCESSORY"}:
            continue
        accessories.append({"name": obj.name, "role": role, "bound": _is_rig_bound(obj, body, armature)})

    snapshot = {
        "bodyCandidates": body_selection.get("candidates", []),
        "body": {
            "name": getattr(body, "name", None),
            "vertexCount": len(body.data.vertices) if body is not None else 0,
            "armatureModifiers": body_modifiers,
            "vertexGroupCount": vertex_group_count,
            "weightedVertexFraction": weighted / max(len(body.data.vertices), 1) if body is not None else 0.0,
            "maxInfluences": max_influences,
            "faceShapeKeyCount": face_shape_count,
            "visemeCount": viseme_count,
            "shapeKeys": shape_names,
        },
        "armature": {
            "name": getattr(armature, "name", None),
            "boneCount": len(bones),
            "deformBoneCount": sum(1 for bone in bones if bone.use_deform),
            "controlBoneCount": len(control_bones),
            "constraintCount": constraint_count,
            "faceBoneCount": len(face_bones),
        }
        if armature is not None
        else {},
        "actions": actions,
        "accessories": accessories,
    }
    return body, armature, snapshot


def _ensure_object_mode(bpy: Any, obj: Any | None = None) -> None:
    if obj is not None:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
    active = bpy.context.view_layer.objects.active
    if active is None:
        return
    if active.mode == "OBJECT":
        return
    if bpy.ops.object.mode_set.poll():
        bpy.ops.object.mode_set(mode="OBJECT")


def _select_only(bpy: Any, obj: Any) -> None:
    for item in bpy.data.objects:
        item.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    _ensure_object_mode(bpy, obj)


def _window(bpy: Any):
    windows = bpy.context.window_manager.windows
    return windows[0] if windows else bpy.context.window


def _with_object(bpy: Any, obj: Any):
    kwargs = {
        "active_object": obj,
        "selected_objects": [obj],
        "object": obj,
        "view_layer": bpy.context.view_layer,
        "scene": bpy.context.scene,
    }
    window = _window(bpy)
    if window is not None:
        kwargs["window"] = window
        if getattr(window, "screen", None) is not None:
            kwargs["screen"] = window.screen
    return bpy.context.temp_override(**kwargs)


def _set_mode(bpy: Any, obj: Any, mode: str) -> None:
    _select_only(bpy, obj)
    with _with_object(bpy, obj):
        bpy.ops.object.mode_set(mode=mode)


def _bbox(obj: Any) -> tuple[float, ...]:
    coords = [obj.matrix_world @ vert.co for vert in obj.data.vertices]
    xs = [item.x for item in coords]
    ys = [item.y for item in coords]
    zs = [item.z for item in coords]
    return (min(xs), min(ys), min(zs), max(xs), max(ys), max(zs))


def _stage_evidence(artifact_dir: Path, stage: str, payload: dict[str, Any]) -> Path:
    _refuse_locked_write(artifact_dir)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    path = artifact_dir / f"{stage.lower()}.evidence.json"
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def execute_department(args: Any, artifact_dir: Path) -> dict[str, Any]:
    bpy = detect_bpy()
    if bpy is None:
        raise RuntimeError("BLOCKED_REAL_EXECUTION_REQUIRED: --execute requires bpy / Blender.")
    working = Path(args.working_blend) if args.working_blend else None
    if working is None or not working.is_file():
        raise RuntimeError("WORKING_BLEND_REQUIRED: live mode needs a validated WORKING .blend.")
    _refuse_locked_write(working)
    bpy.ops.wm.open_mainfile(filepath=str(working), load_ui=False)

    stages: list[dict[str, Any]] = []
    reports: dict[str, Any] = {}
    failed: list[str] = []
    inject = str(getattr(args, "inject_stage_failure", "") or "")
    source_zip = Path(args.source_zip) if args.source_zip else None
    real_asset_verified = bool(getattr(args, "real_asset_verified", False))
    before_objects = {obj.name for obj in bpy.data.objects}
    before_keys = {obj.name: [key.name for key in (obj.data.shape_keys.key_blocks if obj.type == "MESH" and obj.data.shape_keys else [])] for obj in bpy.data.objects}

    def record(item: dict[str, Any], evidence: dict[str, Any] | None = None) -> None:
        if inject and item["stage"] == inject and item.get("status") != "FAILED":
            item = failed_stage(item["stage"], f"Injected failure at {inject}.")
        stages.append(item)
        if item.get("status") == "FAILED":
            failed.append(item["stage"])
        if evidence is not None:
            reports[item["stage"]] = evidence
            _stage_evidence(artifact_dir, item["stage"], {**evidence, "simulated": False, "stage": item["stage"]})

    def prior_blocked(stage: str) -> bool:
        if not failed:
            return False
        record(blocked_stage(stage, f"Prior stage failure: {failed[-1]}"), {"priorFailure": failed[-1], "simulated": True})
        return True

    # 1 SOURCE_INTAKE
    if source_zip and source_zip.is_file():
        intake = {
            "present": True,
            "sha256": _sha256(source_zip),
            "byteSize": source_zip.stat().st_size,
            "path": str(source_zip),
            "lockedSourceUntouched": True,
            "realAssetVerified": real_asset_verified,
        }
        identity_mismatch = real_asset_verified and (
            intake["sha256"] != LOCKED_SOURCE_SHA256 or intake["byteSize"] != LOCKED_SOURCE_SIZE
        )
        if identity_mismatch:
            record(
                failed_stage(
                    "SOURCE_INTAKE",
                    "Launcher claimed a real asset, but the local source hash or size was not the locked Goat identity.",
                    expectedSha256=LOCKED_SOURCE_SHA256,
                    expectedSize=LOCKED_SOURCE_SIZE,
                ),
                {**intake, "identityMismatch": True},
            )
        else:
            record(executed_stage("SOURCE_INTAKE", "Hashed supplied source bytes.", **intake), intake)
    else:
        intake = {"present": True, "sha256": _sha256(working), "byteSize": working.stat().st_size, "workingOnly": True}
        record(executed_stage("SOURCE_INTAKE", "Hashed WORKING blend bytes; no locked archive was read.", **intake), intake)

    # 2 SOURCE_HASH_LOCK
    if not prior_blocked("SOURCE_HASH_LOCK"):
        lock = {"sha256": intake["sha256"], "byteSize": intake["byteSize"], "locked": True}
        record(executed_stage("SOURCE_HASH_LOCK", "Source hash locked.", **lock), lock)

    # 3 BLENDER_VERSION_CHECK
    if not prior_blocked("BLENDER_VERSION_CHECK"):
        version = tuple(bpy.app.version[:3])
        evidence = {"blenderVersion": bpy.app.version_string, "tuple": list(version), "required": list(STUDIO_BLENDER)}
        if version != STUDIO_BLENDER:
            record(failed_stage("BLENDER_VERSION_CHECK", f"Blender {bpy.app.version_string} is not 4.2.2 LTS.", **evidence), evidence)
        else:
            record(executed_stage("BLENDER_VERSION_CHECK", "Studio Blender 4.2.2 LTS confirmed.", **evidence), evidence)

    body_selection = _body_selection(bpy)
    mesh, arm_obj, rig_snapshot = _rig_snapshot(bpy, body_selection)
    rig_contract = evaluate_rig_contract(rig_snapshot)

    # 4 OBJECT_INVENTORY
    if not prior_blocked("OBJECT_INVENTORY"):
        objects = sorted(obj.name for obj in bpy.data.objects)
        evidence = {"objects": objects, "count": len(objects), "bodySelection": body_selection}
        if not objects:
            record(failed_stage("OBJECT_INVENTORY", "Opened blend has no objects."), evidence)
        elif not body_selection["ok"]:
            record(
                failed_stage(
                    "OBJECT_INVENTORY",
                    "A unique Goat body mesh could not be identified; first-mesh fallback is forbidden.",
                    code=body_selection["code"],
                ),
                evidence,
            )
        else:
            record(
                executed_stage(
                    "OBJECT_INVENTORY",
                    "Inventoried scene objects and selected the semantic Goat body mesh.",
                    **evidence,
                ),
                evidence,
            )

    # 5 MATERIAL_INVENTORY
    if not prior_blocked("MATERIAL_INVENTORY"):
        materials = sorted(mat.name for mat in bpy.data.materials)
        evidence = {"materials": materials, "count": len(materials)}
        if mesh is None or not mesh.data.materials:
            record(failed_stage("MATERIAL_INVENTORY", "Goat body has no assigned material; synthetic material creation is forbidden.", **evidence), evidence)
        else:
            record(executed_stage("MATERIAL_INVENTORY", "Inventoried artist-authored materials without mutation.", **evidence), evidence)

    # 6 TEXTURE_INVENTORY
    if not prior_blocked("TEXTURE_INVENTORY"):
        images = sorted(img.name for img in bpy.data.images)
        evidence = {"images": images, "count": len(images)}
        if not images:
            record(failed_stage("TEXTURE_INVENTORY", "No artist-authored texture datablocks were found.", **evidence), evidence)
        else:
            record(executed_stage("TEXTURE_INVENTORY", "Inventoried artist-authored texture datablocks.", **evidence), evidence)

    # 7 UV_VALIDATION
    if not prior_blocked("UV_VALIDATION"):
        if mesh is None:
            record(failed_stage("UV_VALIDATION", "No mesh exists for UV validation."), {"uvLayers": []})
        else:
            uv_names = [layer.name for layer in mesh.data.uv_layers]
            evidence = {"uvLayers": uv_names, "mesh": mesh.name}
            if not uv_names:
                record(failed_stage("UV_VALIDATION", "Goat body has no artist-authored UV layers; automatic UV creation is forbidden.", **evidence), evidence)
            else:
                record(executed_stage("UV_VALIDATION", "UV layers present.", **evidence), evidence)

    # 8 TOPOLOGY_AUDIT
    if not prior_blocked("TOPOLOGY_AUDIT"):
        if mesh is None:
            record(failed_stage("TOPOLOGY_AUDIT", "No mesh exists for topology audit."), {})
        else:
            verts = len(mesh.data.vertices)
            faces = len(mesh.data.polygons)
            edges = len(mesh.data.edges)
            evidence = {"mesh": mesh.name, "vertices": verts, "faces": faces, "edges": edges, "blindDecimateForbidden": True}
            if faces <= 0:
                record(failed_stage("TOPOLOGY_AUDIT", "Mesh has no faces.", **evidence), evidence)
            else:
                record(executed_stage("TOPOLOGY_AUDIT", "Recorded live mesh topology.", **evidence), evidence)

    # 9 SCALE_ORIENTATION_NORMALIZATION
    if not prior_blocked("SCALE_ORIENTATION_NORMALIZATION"):
        non_normalized = []
        for obj in bpy.data.objects:
            if obj.type != "MESH":
                continue
            if tuple(round(v, 6) for v in obj.scale) != (1.0, 1.0, 1.0) or tuple(round(v, 6) for v in obj.rotation_euler) != (0.0, 0.0, 0.0):
                non_normalized.append(obj.name)
        evidence = {
            "nonNormalized": non_normalized,
            "sourceMutated": False,
            "normalized": not non_normalized,
            "artistReviewRequired": bool(non_normalized),
        }
        record(
            executed_stage(
                "SCALE_ORIENTATION_NORMALIZATION",
                "Inspected transforms without automatically applying artist-authored placement.",
                **evidence,
            ),
            evidence,
        )

    # 10 CHARACTER_SEMANTIC_MAPPING
    if not prior_blocked("CHARACTER_SEMANTIC_MAPPING"):
        mapping = {obj.name: map_object_name(obj.name) for obj in bpy.data.objects}
        evidence = {"mapping": mapping, "body": getattr(mesh, "name", None), "sourceMutated": False}
        record(executed_stage("CHARACTER_SEMANTIC_MAPPING", "Mapped object names to semantic roles without mutation.", **evidence), evidence)

    # 11 RIG_GUIDE_GENERATION — admission only; never synthesize a replacement rig.
    if not prior_blocked("RIG_GUIDE_GENERATION"):
        evidence = {
            "armature": rig_snapshot.get("armature", {}).get("name"),
            "artistAuthoredRequired": True,
            "automaticPlaceholderRigAllowed": False,
            "sourceMutated": False,
        }
        if arm_obj is None:
            record(failed_stage("RIG_GUIDE_GENERATION", "Artist-authored armature is missing; placeholder generation is forbidden.", **evidence), evidence)
        else:
            record(executed_stage("RIG_GUIDE_GENERATION", "Confirmed artist-authored rig source without mutation.", **evidence), evidence)

    # 12 SKELETON_BUILD — validate the delivered skeleton; do not replace it.
    if not prior_blocked("SKELETON_BUILD"):
        armature_evidence = rig_snapshot["armature"]
        evidence = {**armature_evidence, "sourceMutated": False}
        if armature_evidence["boneCount"] < 16 or armature_evidence["deformBoneCount"] < 10:
            record(failed_stage("SKELETON_BUILD", "Delivered skeleton does not meet the minimum production structure.", **evidence), evidence)
        else:
            record(executed_stage("SKELETON_BUILD", "Validated the delivered artist-authored skeleton.", **evidence), evidence)

    # 13 CONTROL_RIG_BUILD
    if not prior_blocked("CONTROL_RIG_BUILD"):
        controls = rig_snapshot["armature"]["controlBoneCount"] + rig_snapshot["armature"]["constraintCount"]
        evidence = {
            "controlBoneCount": rig_snapshot["armature"]["controlBoneCount"],
            "constraintCount": rig_snapshot["armature"]["constraintCount"],
            "controlSignals": controls,
            "sourceMutated": False,
        }
        if controls < 4:
            record(failed_stage("CONTROL_RIG_BUILD", "Delivered rig has insufficient animation controls.", **evidence), evidence)
        else:
            record(executed_stage("CONTROL_RIG_BUILD", "Validated delivered animation controls.", **evidence), evidence)

    # 14 INITIAL_SKIN_BIND
    if not prior_blocked("INITIAL_SKIN_BIND"):
        modifiers = rig_snapshot["body"]["armatureModifiers"]
        evidence = {
            "mesh": getattr(mesh, "name", None),
            "armature": getattr(arm_obj, "name", None),
            "armatureModifiers": modifiers,
            "vertexGroupCount": rig_snapshot["body"]["vertexGroupCount"],
            "sourceMutated": False,
        }
        if arm_obj is None or modifiers != [arm_obj.name]:
            record(failed_stage("INITIAL_SKIN_BIND", "Goat body is not uniquely bound to the delivered armature.", **evidence), evidence)
        else:
            record(executed_stage("INITIAL_SKIN_BIND", "Validated artist-authored skin binding.", **evidence), evidence)

    # 15 WEIGHT_REFINEMENT
    if not prior_blocked("WEIGHT_REFINEMENT"):
        evidence = {
            "weightedVertexFraction": rig_snapshot["body"]["weightedVertexFraction"],
            "maxInfluences": rig_snapshot["body"]["maxInfluences"],
            "vertexGroupCount": rig_snapshot["body"]["vertexGroupCount"],
            "automaticWeightsAreFinal": False,
            "sourceMutated": False,
        }
        if evidence["weightedVertexFraction"] < 0.95 or evidence["maxInfluences"] > 4 or evidence["vertexGroupCount"] < 10:
            record(failed_stage("WEIGHT_REFINEMENT", "Delivered body weights do not meet coverage or influence limits.", **evidence), evidence)
        else:
            record(executed_stage("WEIGHT_REFINEMENT", "Audited artist-authored weights without rewriting them.", **evidence), evidence)

    # 16 FACIAL_SYSTEM_BUILD
    if not prior_blocked("FACIAL_SYSTEM_BUILD"):
        face_signals = rig_snapshot["body"]["faceShapeKeyCount"] + rig_snapshot["armature"]["faceBoneCount"]
        evidence = {
            "faceShapeKeyCount": rig_snapshot["body"]["faceShapeKeyCount"],
            "faceBoneCount": rig_snapshot["armature"]["faceBoneCount"],
            "faceSignals": face_signals,
            "sourceMutated": False,
        }
        if face_signals < 5:
            record(failed_stage("FACIAL_SYSTEM_BUILD", "Delivered facial controls are insufficient.", **evidence), evidence)
        else:
            record(executed_stage("FACIAL_SYSTEM_BUILD", "Validated delivered facial controls.", **evidence), evidence)

    # 17 VISEME_SYSTEM_BUILD
    if not prior_blocked("VISEME_SYSTEM_BUILD"):
        evidence = {"visemeCount": rig_snapshot["body"]["visemeCount"], "sourceMutated": False}
        if evidence["visemeCount"] < 5:
            record(failed_stage("VISEME_SYSTEM_BUILD", "Delivered rig lacks enough lip-sync controls.", **evidence), evidence)
        else:
            record(executed_stage("VISEME_SYSTEM_BUILD", "Validated delivered lip-sync controls.", **evidence), evidence)

    # 18 SECONDARY_CONTROLS
    if not prior_blocked("SECONDARY_CONTROLS"):
        evidence = {"accessories": rig_snapshot["accessories"], "artistAuthored": True, "sourceMutated": False}
        record(executed_stage("SECONDARY_CONTROLS", "Inspected delivered secondary controls and attachments.", **evidence), evidence)

    # 19 CORRECTIVE_DEFORMATION_BUILD
    if not prior_blocked("CORRECTIVE_DEFORMATION_BUILD"):
        correctives = [
            name
            for name in rig_snapshot["body"]["shapeKeys"]
            if "corr" in name.lower() or "corrective" in name.lower()
        ]
        evidence = {"correctives": correctives, "requiredByTechnique": False, "sourceMutated": False}
        record(executed_stage("CORRECTIVE_DEFORMATION_BUILD", "Recorded artist-authored corrective strategy without inventing shapes.", **evidence), evidence)

    # 20 ACCESSORY_BINDING
    if not prior_blocked("ACCESSORY_BINDING"):
        bound_roles = {item["role"] for item in rig_snapshot["accessories"] if item["bound"]}
        missing_roles = sorted({"COLLAR", "TAG"} - bound_roles)
        evidence = {"accessories": rig_snapshot["accessories"], "missingRequiredRoles": missing_roles, "sourceMutated": False}
        if missing_roles:
            record(failed_stage("ACCESSORY_BINDING", "Goat collar or tag is missing or not rig-bound.", **evidence), evidence)
        else:
            record(executed_stage("ACCESSORY_BINDING", "Validated collar and tag binding.", **evidence), evidence)

    # 21 DEFORMATION_TESTS — temporarily pose, measure, and fully restore.
    if not prior_blocked("DEFORMATION_TESTS"):
        from mathutils import Matrix

        pose_bone = None
        vertex_indexes: list[int] = []
        if mesh is not None and arm_obj is not None:
            for candidate in arm_obj.pose.bones:
                group = mesh.vertex_groups.get(candidate.name)
                if not candidate.bone.use_deform or group is None:
                    continue
                vertex_indexes = [
                    vertex.index
                    for vertex in mesh.data.vertices
                    if any(membership.group == group.index and membership.weight > 0.05 for membership in vertex.groups)
                ][:64]
                if vertex_indexes:
                    pose_bone = candidate
                    break
        changed = False
        evidence: dict[str, Any] = {
            "bone": getattr(pose_bone, "name", None),
            "sampleCount": len(vertex_indexes),
            "deformed": False,
            "poseRestored": True,
            "sourceWeightsMutated": False,
            "poses": list(DEFORMATION_POSES)[:6],
        }
        if pose_bone is not None:
            original_basis = pose_bone.matrix_basis.copy()
            deps = bpy.context.evaluated_depsgraph_get()
            rest_eval = mesh.evaluated_get(deps)
            rest = [rest_eval.data.vertices[index].co.copy() for index in vertex_indexes]
            try:
                pose_bone.matrix_basis = original_basis @ Matrix.Rotation(math.radians(8.0), 4, "X")
                bpy.context.view_layer.update()
                deps = bpy.context.evaluated_depsgraph_get()
                posed_eval = mesh.evaluated_get(deps)
                posed = [posed_eval.data.vertices[index].co.copy() for index in vertex_indexes]
                changed = any((before - after).length > 1e-6 for before, after in zip(rest, posed))
            finally:
                pose_bone.matrix_basis = original_basis
                bpy.context.view_layer.update()
            evidence["deformed"] = changed
        if not changed:
            record(failed_stage("DEFORMATION_TESTS", "A reversible pose did not produce measurable body deformation.", **evidence), evidence)
        else:
            record(executed_stage("DEFORMATION_TESTS", "Verified measurable deformation and restored the source pose.", **evidence), evidence)

    # 22 ANIMATION_TESTS
    if not prior_blocked("ANIMATION_TESTS"):
        actions = rig_snapshot["actions"]
        evidence = {"actions": actions, "clips": list(VALIDATION_CLIPS)[:8], "sourceMutated": False}
        if not any(action["fcurveCount"] > 0 for action in actions):
            record(failed_stage("ANIMATION_TESTS", "No delivered character test animation was found.", **evidence), evidence)
        else:
            record(executed_stage("ANIMATION_TESTS", "Validated delivered character animation curves.", **evidence), evidence)

    # 23 PERFORMANCE_PROFILE
    if not prior_blocked("PERFORMANCE_PROFILE"):
        deps = bpy.context.evaluated_depsgraph_get()
        verts = sum(len(obj.data.vertices) for obj in bpy.data.objects if obj.type == "MESH")
        faces = sum(len(obj.data.polygons) for obj in bpy.data.objects if obj.type == "MESH")
        evidence = {"evaluatedObjects": len(deps.objects), "vertices": verts, "faces": faces}
        record(executed_stage("PERFORMANCE_PROFILE", "Profiled live evaluated scene.", **evidence), evidence)

    # 24 RENDER_QA
    if not prior_blocked("RENDER_QA"):
        from mathutils import Vector

        scene = bpy.context.scene
        camera = bpy.data.objects.get("CHAR_GOAT_001_QA_Camera")
        if camera is None or camera.type != "CAMERA":
            cam_data = bpy.data.cameras.new("CHAR_GOAT_001_QA_Camera")
            camera = bpy.data.objects.new("CHAR_GOAT_001_QA_Camera", cam_data)
            camera.location = (0.0, -3.5, 1.2)
            camera.rotation_euler = (1.2, 0.0, 0.0)
            bpy.context.collection.objects.link(camera)
        scene.camera = camera
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.render.resolution_x = 512
        scene.render.resolution_y = 512
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = "PNG"
        scene.display.shading.light = "STUDIO"
        scene.display.shading.color_type = "TEXTURE"
        mesh_objects = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj.visible_get()]
        body_points = [mesh.matrix_world @ Vector(corner) for corner in mesh.bound_box]
        body_extent = max(
            max(point.x for point in body_points) - min(point.x for point in body_points),
            max(point.y for point in body_points) - min(point.y for point in body_points),
            max(point.z for point in body_points) - min(point.z for point in body_points),
            0.001,
        )
        subject_input = []
        for obj in mesh_objects:
            points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
            obj_extent = max(
                max(point.x for point in points) - min(point.x for point in points),
                max(point.y for point in points) - min(point.y for point in points),
                max(point.z for point in points) - min(point.z for point in points),
                0.001,
            )
            subject_input.append(
                {
                    "name": obj.name,
                    "role": map_object_name(obj.name),
                    "extentRatio": obj_extent / body_extent,
                    "parent": getattr(getattr(obj, "parent", None), "name", None),
                    "rigRelated": _is_rig_bound(obj, mesh, arm_obj),
                }
            )
        subjects = qa_subject_names(subject_input, mesh.name, getattr(arm_obj, "name", None))
        subject_objects = [bpy.data.objects.get(name) for name in subjects["included"]]
        subject_objects = [obj for obj in subject_objects if obj is not None and obj.type == "MESH"]
        world_points = [obj.matrix_world @ Vector(corner) for obj in subject_objects for corner in obj.bound_box]
        if world_points:
            center = sum(world_points, world_points[0] * 0.0) / len(world_points)
            extent = max(
                max(point.x for point in world_points) - min(point.x for point in world_points),
                max(point.y for point in world_points) - min(point.y for point in world_points),
                max(point.z for point in world_points) - min(point.z for point in world_points),
                0.5,
            )
        else:
            center = Vector((0.0, 0.0, 1.0))
            extent = 2.0
        hidden_state = {obj.name: obj.hide_render for obj in mesh_objects}
        for name in subjects["excluded"]:
            obj = bpy.data.objects.get(name)
            if obj is not None:
                obj.hide_render = True
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = extent * 1.25
        views = {
            "render_qa.png": (center.x, center.y - extent * 3.0, center.z),
            "render_qa_three_quarter.png": (
                center.x + extent * 2.2,
                center.y - extent * 2.2,
                center.z + extent * 0.1,
            ),
            "render_qa_side.png": (center.x + extent * 3.0, center.y, center.z),
        }
        rendered = []
        try:
            for filename, location in views.items():
                camera.location = location
                camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
                render_path = artifact_dir / filename
                _refuse_locked_write(render_path)
                scene.render.filepath = str(render_path)
                with _with_object(bpy, camera):
                    bpy.ops.render.render(write_still=True)
                rendered.append(
                    {
                        "path": str(render_path),
                        "wrote": render_path.is_file(),
                        "bytes": render_path.stat().st_size if render_path.is_file() else 0,
                    }
                )
        finally:
            for name, hide_render in hidden_state.items():
                obj = bpy.data.objects.get(name)
                if obj is not None:
                    obj.hide_render = hide_render
        evidence = {
            "engine": scene.render.engine,
            "resolution": [512, 512],
            "frameBasis": "SEMANTIC_CHARACTER_BOUNDS",
            "cameraType": camera.data.type,
            "subjectNames": subjects["included"],
            "excludedSceneMeshes": subjects["excluded"],
            "targetFrameCoverage": [0.65, 0.85],
            "renders": rendered,
            "wrote": all(item["wrote"] for item in rendered),
            "bytes": sum(item["bytes"] for item in rendered),
        }
        if not evidence["wrote"]:
            record(failed_stage("RENDER_QA", "Workbench still was not written.", **evidence), evidence)
        else:
            record(executed_stage("RENDER_QA", "Rendered close character-only QA stills.", **evidence), evidence)

    # 25 EXPORT_QA
    if not prior_blocked("EXPORT_QA"):
        export_path = artifact_dir / "export_qa.fbx"
        _refuse_locked_write(export_path)
        _ensure_object_mode(bpy)
        for obj in bpy.data.objects:
            obj.select_set(False)
        export_names = set(subjects["included"] if "subjects" in locals() else [getattr(mesh, "name", "")])
        if arm_obj is not None:
            export_names.add(arm_obj.name)
        for name in export_names:
            obj = bpy.data.objects.get(name)
            if obj is not None:
                obj.select_set(True)
        if arm_obj is not None:
            bpy.context.view_layer.objects.active = arm_obj
        bpy.ops.export_scene.fbx(filepath=str(export_path), use_selection=True, add_leaf_bones=False)
        evidence = {
            "export": str(export_path),
            "wrote": export_path.is_file(),
            "bytes": export_path.stat().st_size if export_path.is_file() else 0,
            "objects": sorted(export_names),
            "productionMasterAllowed": False,
        }
        if not export_path.is_file():
            record(failed_stage("EXPORT_QA", "FBX export was not written.", **evidence), evidence)
        else:
            record(executed_stage("EXPORT_QA", "Exported live QA FBX outside SOURCE/PRODUCTION.", **evidence), evidence)

    # Persist a QA copy only after every machine gate passes. A rejected source
    # keeps compact JSON evidence and is never rewritten.
    _ensure_object_mode(bpy)
    after_hash = _sha256(working)
    if not failed:
        working_after = artifact_dir / "CHAR_GOAT_001_working_executed.blend"
        _refuse_locked_write(working_after)
        bpy.ops.wm.save_as_mainfile(filepath=str(working_after), check_existing=False, copy=True)
    after_objects = {obj.name for obj in bpy.data.objects}
    after_keys = []
    if mesh is not None and mesh.data.shape_keys:
        after_keys = [key.name for key in mesh.data.shape_keys.key_blocks]
    shape_keys_changed = after_keys != before_keys.get(getattr(mesh, "name", ""), [])

    # 26 CHARACTER_MASTER_GATE
    gate = evaluate_master_gate(
        real_asset_present=real_asset_verified,
        bpy_available=True,
        executed=not failed,
        failed_stages=failed,
        visual_approval=False,
    )
    record(
        executed_stage(
            "CHARACTER_MASTER_GATE",
            "Live department evaluated. Visual approval is still required.",
            disposition="UPDATED",
            goatProductionReady=False,
        )
        if "CHARACTER_MASTER_GATE" not in failed
        else failed_stage("CHARACTER_MASTER_GATE", "Gate recorded prior failures."),
        gate,
    )

    missing = [stage for stage in BUILD_STAGES if stage not in {item["stage"] for item in stages}]
    if missing:
        raise RuntimeError(f"LIVE_CHARACTER_DEPARTMENT_IMPLEMENTATION_INCOMPLETE: missing {missing}")

    return {
        "status": "LIVE_DEPARTMENT_EXECUTED" if not failed else "LIVE_DEPARTMENT_FAILED",
        "stages": stages,
        "gate": gate,
        "reports": reports,
        "failedStages": failed,
        "workingBlend": str(working),
        "workingSha256": after_hash,
        "objectDelta": sorted(after_objects - before_objects),
        "shapeKeys": after_keys,
        "datablocksChanged": bool(after_objects - before_objects) or shape_keys_changed,
        "rigContract": rig_contract,
        "sourceRigPreserved": True,
        "automaticPlaceholderRigCreated": False,
        "simulated": False,
        "dryRun": False,
        "blenderExecuted": True,
        "goatProductionReady": False,
        "realGoatSourceTested": real_asset_verified,
    }


require_bpy  # imported for fail-closed callers
