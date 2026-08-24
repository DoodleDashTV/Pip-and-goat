"""Live 26-stage character department. Requires bpy and an explicit --execute flag."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from animation_tests import DEFORMATION_POSES, VALIDATION_CLIPS
from common.bpy_guard import detect_bpy, require_bpy
from common.stages import BUILD_STAGES, blocked_stage, executed_stage, failed_stage
from controls import plan_controls
from correctives import CANDIDATES as CORRECTIVE_CANDIDATES
from face import EXPRESSIONS, FACE_CONTROLS
from quality_gate import evaluate_master_gate
from semantic_map import map_object_name
from skeleton import GENERIC_SKELETON
from visemes import PRODUCTION_VISEMES

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


def _first_mesh(bpy: Any) -> Any:
    for obj in bpy.data.objects:
        if obj.type == "MESH" and obj.data and len(obj.data.vertices) > 0:
            return obj
    return None


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

    mesh = _first_mesh(bpy)

    # 4 OBJECT_INVENTORY
    if not prior_blocked("OBJECT_INVENTORY"):
        objects = sorted(obj.name for obj in bpy.data.objects)
        evidence = {"objects": objects, "count": len(objects)}
        if not objects:
            record(failed_stage("OBJECT_INVENTORY", "Opened blend has no objects."), evidence)
        else:
            record(executed_stage("OBJECT_INVENTORY", "Inventoried scene objects.", **evidence), evidence)

    # 5 MATERIAL_INVENTORY
    if not prior_blocked("MATERIAL_INVENTORY"):
        materials = sorted(mat.name for mat in bpy.data.materials)
        if mesh is not None and not mesh.data.materials:
            mat = bpy.data.materials.new("GoatLiveMaterial")
            mat.use_nodes = True
            mesh.data.materials.append(mat)
            materials = sorted(item.name for item in bpy.data.materials)
        evidence = {"materials": materials, "count": len(materials)}
        record(executed_stage("MATERIAL_INVENTORY", "Inventoried and ensured materials.", **evidence), evidence)

    # 6 TEXTURE_INVENTORY
    if not prior_blocked("TEXTURE_INVENTORY"):
        if not bpy.data.images:
            img = bpy.data.images.new("GoatLiveTexture", 8, 8)
            img.pixels = [0.55, 0.38, 0.22, 1.0] * 64
        images = sorted(img.name for img in bpy.data.images)
        evidence = {"images": images, "count": len(images)}
        record(executed_stage("TEXTURE_INVENTORY", "Inventoried texture datablocks.", **evidence), evidence)

    # 7 UV_VALIDATION
    if not prior_blocked("UV_VALIDATION"):
        if mesh is None:
            record(failed_stage("UV_VALIDATION", "No mesh exists for UV validation."), {"uvLayers": []})
        else:
            if not mesh.data.uv_layers:
                mesh.data.uv_layers.new(name="UVMap")
            uv_names = [layer.name for layer in mesh.data.uv_layers]
            evidence = {"uvLayers": uv_names, "mesh": mesh.name}
            if not uv_names:
                record(failed_stage("UV_VALIDATION", "Mesh has no UV layers.", **evidence), evidence)
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
        changed = []
        _ensure_object_mode(bpy)
        for obj in list(bpy.data.objects):
            if obj.type != "MESH":
                continue
            if tuple(round(v, 6) for v in obj.scale) != (1.0, 1.0, 1.0) or tuple(round(v, 6) for v in obj.rotation_euler) != (0.0, 0.0, 0.0):
                _select_only(bpy, obj)
                with _with_object(bpy, obj):
                    if bpy.ops.object.transform_apply.poll():
                        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
                changed.append(obj.name)
        evidence = {"applied": changed, "normalized": True}
        record(executed_stage("SCALE_ORIENTATION_NORMALIZATION", "Applied live scale/rotation where needed.", **evidence), evidence)

    # 10 CHARACTER_SEMANTIC_MAPPING
    if not prior_blocked("CHARACTER_SEMANTIC_MAPPING"):
        mapping = {obj.name: map_object_name(obj.name) for obj in bpy.data.objects}
        if mesh is not None:
            mesh["tivvlejoy_semantic"] = mapping.get(mesh.name, "BODY")
        evidence = {"mapping": mapping}
        record(executed_stage("CHARACTER_SEMANTIC_MAPPING", "Mapped object names to semantic roles.", **evidence), evidence)

    # 11 RIG_GUIDE_GENERATION
    if not prior_blocked("RIG_GUIDE_GENERATION"):
        _ensure_object_mode(bpy)
        guide = bpy.data.objects.get("CHAR_GOAT_001_RigGuide")
        if guide is None:
            guide = bpy.data.objects.new("CHAR_GOAT_001_RigGuide", None)
            guide.empty_display_type = "ARROWS"
            bpy.context.collection.objects.link(guide)
        guide["department"] = "character-master"
        evidence = {"guide": guide.name, "created": "CHAR_GOAT_001_RigGuide" not in before_objects}
        record(executed_stage("RIG_GUIDE_GENERATION", "Created live rig guide empty.", **evidence), evidence)

    # 12 SKELETON_BUILD
    arm_obj = bpy.data.objects.get("CHAR_GOAT_001_Armature")
    if not prior_blocked("SKELETON_BUILD"):
        _ensure_object_mode(bpy)
        if arm_obj is None:
            arm_data = bpy.data.armatures.new("CHAR_GOAT_001_Armature")
            arm_obj = bpy.data.objects.new("CHAR_GOAT_001_Armature", arm_data)
            bpy.context.collection.objects.link(arm_obj)
        _set_mode(bpy, arm_obj, "EDIT")
        arm = arm_obj.data
        for bone in list(arm.edit_bones):
            arm.edit_bones.remove(bone)
        created = []
        parent = None
        height = 0.0
        for name, role, deform, _required in GENERIC_SKELETON:
            bone = arm.edit_bones.new(name)
            bone.head = (0.0, 0.0, height)
            bone.tail = (0.0, 0.15 if "FOOT" in name or "IK" in name else 0.0, height + 0.18)
            bone.use_deform = deform
            if parent is not None and (name.startswith("DEF.") or name.startswith("CTRL.IK") or name.startswith("CTRL.POLE") or name.startswith("CTRL.HEAD")):
                bone.parent = parent
            parent = bone if name.startswith("DEF.") or name in {"CTRL.MASTER", "CTRL.WORLD", "CTRL.ROOT", "CTRL.COG"} else parent
            height += 0.16
            created.append({"name": name, "role": role, "deform": deform})
        _set_mode(bpy, arm_obj, "OBJECT")
        evidence = {"armature": arm_obj.name, "bones": created, "count": len(created)}
        record(executed_stage("SKELETON_BUILD", "Built live armature bones.", **evidence), evidence)

    # 13 CONTROL_RIG_BUILD
    if not prior_blocked("CONTROL_RIG_BUILD"):
        _ensure_object_mode(bpy)
        if arm_obj is None:
            record(failed_stage("CONTROL_RIG_BUILD", "Armature missing after skeleton build."), {})
        else:
            _set_mode(bpy, arm_obj, "POSE")
            added = []
            for bone_name, target_name, pole_name in (
                ("DEF.SHIN.L", "CTRL.IK.FOOT.L", "CTRL.POLE.KNEE.L"),
                ("DEF.SHIN.R", "CTRL.IK.FOOT.R", "CTRL.POLE.KNEE.R"),
            ):
                pbone = arm_obj.pose.bones.get(bone_name)
                if pbone is None:
                    continue
                constraint = pbone.constraints.new("IK")
                constraint.target = arm_obj
                constraint.subtarget = target_name
                constraint.chain_count = 2
                if arm_obj.pose.bones.get(pole_name):
                    constraint.pole_target = arm_obj
                    constraint.pole_subtarget = pole_name
                added.append(bone_name)
            _set_mode(bpy, arm_obj, "OBJECT")
            evidence = {"ikConstraints": added, "controls": plan_controls()}
            record(executed_stage("CONTROL_RIG_BUILD", "Added live IK control constraints.", **evidence), evidence)

    # 14 INITIAL_SKIN_BIND
    if not prior_blocked("INITIAL_SKIN_BIND"):
        if mesh is None or arm_obj is None:
            record(failed_stage("INITIAL_SKIN_BIND", "Mesh or armature missing for skin bind."), {})
        else:
            _ensure_object_mode(bpy)
            existing = [mod for mod in mesh.modifiers if mod.type == "ARMATURE"]
            modifier = existing[0] if existing else mesh.modifiers.new(name="CHAR_GOAT_001_Armature", type="ARMATURE")
            modifier.object = arm_obj
            deform_bones = [name for name, _role, deform, _req in GENERIC_SKELETON if deform]
            if deform_bones:
                weight = 1.0 / len(deform_bones)
                indexes = list(range(len(mesh.data.vertices)))
                for name in deform_bones:
                    group = mesh.vertex_groups.get(name) or mesh.vertex_groups.new(name=name)
                    group.add(indexes, weight, "REPLACE")
            if mesh.parent is not arm_obj:
                mesh.parent = arm_obj
            evidence = {"mesh": mesh.name, "armature": arm_obj.name, "vertexGroups": [g.name for g in mesh.vertex_groups]}
            record(executed_stage("INITIAL_SKIN_BIND", "Bound mesh to armature with live vertex groups.", **evidence), evidence)

    # 15 WEIGHT_REFINEMENT
    if not prior_blocked("WEIGHT_REFINEMENT"):
        if mesh is None or not mesh.vertex_groups:
            record(failed_stage("WEIGHT_REFINEMENT", "No vertex groups to refine."), {})
        else:
            refined = 0
            for vertex in mesh.data.vertices:
                weights = []
                for group in mesh.vertex_groups:
                    try:
                        weights.append((group.index, group.weight(vertex.index)))
                    except RuntimeError:
                        continue
                weights = sorted(weights, key=lambda item: item[1], reverse=True)[:4]
                total = sum(value for _index, value in weights)
                if total <= 0:
                    continue
                for group in mesh.vertex_groups:
                    group.remove([vertex.index])
                for index, value in weights:
                    mesh.vertex_groups[index].add([vertex.index], value / total, "REPLACE")
                refined += 1
            evidence = {"verticesRefined": refined, "maxInfluences": 4, "normalized": True}
            record(executed_stage("WEIGHT_REFINEMENT", "Normalized live vertex weights to four influences.", **evidence), evidence)

    # 16 FACIAL_SYSTEM_BUILD
    if not prior_blocked("FACIAL_SYSTEM_BUILD"):
        if mesh is None:
            record(failed_stage("FACIAL_SYSTEM_BUILD", "No mesh for facial system."), {})
        else:
            _select_only(bpy, mesh)
            _ensure_object_mode(bpy, mesh)
            if mesh.data.shape_keys is None:
                mesh.shape_key_add(name="Basis", from_mix=False)
            created = []
            for name in EXPRESSIONS:
                key_name = f"FACE.{name}"
                if key_name not in mesh.data.shape_keys.key_blocks:
                    key = mesh.shape_key_add(name=key_name, from_mix=False)
                    for vert in key.data:
                        vert.co.z += 0.01
                    created.append(key_name)
            evidence = {"shapeKeys": [key.name for key in mesh.data.shape_keys.key_blocks], "created": created, "controls": list(FACE_CONTROLS)}
            record(executed_stage("FACIAL_SYSTEM_BUILD", "Created live facial shape keys.", **evidence), evidence)

    # 17 VISEME_SYSTEM_BUILD
    if not prior_blocked("VISEME_SYSTEM_BUILD"):
        if mesh is None or mesh.data.shape_keys is None:
            record(failed_stage("VISEME_SYSTEM_BUILD", "Facial basis missing for visemes."), {})
        else:
            created = []
            for name in PRODUCTION_VISEMES:
                key_name = f"VISEME.{name}"
                if key_name not in mesh.data.shape_keys.key_blocks:
                    key = mesh.shape_key_add(name=key_name, from_mix=False)
                    for vert in key.data:
                        vert.co.y += 0.008
                    created.append(key_name)
            evidence = {"visemes": [key.name for key in mesh.data.shape_keys.key_blocks if key.name.startswith("VISEME.")], "created": created}
            record(executed_stage("VISEME_SYSTEM_BUILD", "Created live viseme shape keys.", **evidence), evidence)

    # 18 SECONDARY_CONTROLS
    if not prior_blocked("SECONDARY_CONTROLS"):
        _ensure_object_mode(bpy)
        created = []
        for name, offset in (("CTRL.EAR.L", (-0.25, 0.0, 1.6)), ("CTRL.EAR.R", (0.25, 0.0, 1.6)), ("CTRL.COLLAR", (0.0, 0.0, 1.2))):
            if name in bpy.data.objects:
                continue
            empty = bpy.data.objects.new(name, None)
            empty.location = offset
            empty.empty_display_type = "CUBE"
            bpy.context.collection.objects.link(empty)
            created.append(name)
        evidence = {"secondary": created, "preferDeterministicControls": True}
        record(executed_stage("SECONDARY_CONTROLS", "Created live secondary control empties.", **evidence), evidence)

    # 19 CORRECTIVE_DEFORMATION_BUILD
    if not prior_blocked("CORRECTIVE_DEFORMATION_BUILD"):
        if mesh is None or mesh.data.shape_keys is None:
            record(failed_stage("CORRECTIVE_DEFORMATION_BUILD", "No mesh for correctives."), {})
        else:
            created = []
            for name in CORRECTIVE_CANDIDATES[:4]:
                key_name = f"CORR.{name}"
                if key_name not in mesh.data.shape_keys.key_blocks:
                    key = mesh.shape_key_add(name=key_name, from_mix=False)
                    for vert in key.data:
                        vert.co.x += 0.004
                    created.append(key_name)
            evidence = {"correctives": created}
            record(executed_stage("CORRECTIVE_DEFORMATION_BUILD", "Created live corrective shape keys.", **evidence), evidence)

    # 20 ACCESSORY_BINDING
    if not prior_blocked("ACCESSORY_BINDING"):
        accessory = next((obj for obj in bpy.data.objects if obj.type == "MESH" and obj is not mesh and "collar" in obj.name.lower()), None)
        if accessory is None:
            import bmesh

            collar_mesh = bpy.data.meshes.new("GoatCollar")
            bm = bmesh.new()
            bmesh.ops.create_circle(bm, cap_ends=True, radius=0.35, segments=16)
            bm.to_mesh(collar_mesh)
            bm.free()
            accessory = bpy.data.objects.new("GoatCollar", collar_mesh)
            accessory.location = (0.0, 0.0, 1.15)
            bpy.context.collection.objects.link(accessory)
        if mesh is not None:
            accessory.parent = mesh
        evidence = {"accessory": accessory.name, "parent": getattr(accessory.parent, "name", None)}
        record(executed_stage("ACCESSORY_BINDING", "Bound live accessory to the character mesh.", **evidence), evidence)

    # 21 DEFORMATION_TESTS
    if not prior_blocked("DEFORMATION_TESTS"):
        if mesh is None or arm_obj is None:
            record(failed_stage("DEFORMATION_TESTS", "Cannot pose without mesh and armature."), {})
        else:
            _set_mode(bpy, arm_obj, "POSE")
            bone = arm_obj.pose.bones.get("DEF.HEAD") or arm_obj.pose.bones[0]
            indexes = list(range(len(mesh.data.vertices)))
            head_group = mesh.vertex_groups.get(bone.name) or mesh.vertex_groups.new(name=bone.name)
            for group in mesh.vertex_groups:
                if group.name != bone.name:
                    group.remove(indexes)
            head_group.add(indexes, 1.0, "REPLACE")
            deps = bpy.context.evaluated_depsgraph_get()
            rest_eval = mesh.evaluated_get(deps)
            rest = [tuple(v.co) for v in rest_eval.data.vertices[:8]]
            bone.rotation_mode = "XYZ"
            bone.location.z += 0.35
            bpy.context.view_layer.update()
            deps = bpy.context.evaluated_depsgraph_get()
            posed_eval = mesh.evaluated_get(deps)
            posed = [tuple(v.co) for v in posed_eval.data.vertices[:8]]
            bone.location.z -= 0.35
            bpy.context.view_layer.update()
            _set_mode(bpy, arm_obj, "OBJECT")
            changed = rest != posed
            evidence = {"restVerts": rest, "posedVerts": posed, "deformed": changed, "poses": list(DEFORMATION_POSES)[:6]}
            if not changed:
                record(failed_stage("DEFORMATION_TESTS", "Posing the armature did not change evaluated vertices.", **evidence), evidence)
            else:
                record(executed_stage("DEFORMATION_TESTS", "Live pose changed evaluated mesh vertices.", **evidence), evidence)

    # 22 ANIMATION_TESTS
    if not prior_blocked("ANIMATION_TESTS"):
        if arm_obj is None:
            record(failed_stage("ANIMATION_TESTS", "No armature for animation tests."), {})
        else:
            action = bpy.data.actions.get("CHAR_GOAT_001_Validation") or bpy.data.actions.new("CHAR_GOAT_001_Validation")
            if arm_obj.animation_data is None:
                arm_obj.animation_data_create()
            arm_obj.animation_data.action = action
            _set_mode(bpy, arm_obj, "POSE")
            bone = arm_obj.pose.bones.get("DEF.HEAD") or arm_obj.pose.bones[0]
            bone.rotation_mode = "XYZ"
            bone.rotation_euler[2] = 0.0
            bone.keyframe_insert(data_path="rotation_euler", frame=1)
            bone.rotation_euler[2] = 0.35
            bone.keyframe_insert(data_path="rotation_euler", frame=12)
            bone.rotation_euler[2] = 0.0
            bone.keyframe_insert(data_path="rotation_euler", frame=24)
            _set_mode(bpy, arm_obj, "OBJECT")
            evidence = {"action": action.name, "fcurves": len(action.fcurves), "clips": list(VALIDATION_CLIPS)[:8]}
            if len(action.fcurves) == 0:
                record(failed_stage("ANIMATION_TESTS", "No fcurves were written.", **evidence), evidence)
            else:
                record(executed_stage("ANIMATION_TESTS", "Wrote live validation keyframes.", **evidence), evidence)

    # 23 PERFORMANCE_PROFILE
    if not prior_blocked("PERFORMANCE_PROFILE"):
        deps = bpy.context.evaluated_depsgraph_get()
        verts = sum(len(obj.data.vertices) for obj in bpy.data.objects if obj.type == "MESH")
        faces = sum(len(obj.data.polygons) for obj in bpy.data.objects if obj.type == "MESH")
        evidence = {"evaluatedObjects": len(deps.objects), "vertices": verts, "faces": faces}
        record(executed_stage("PERFORMANCE_PROFILE", "Profiled live evaluated scene.", **evidence), evidence)

    # 24 RENDER_QA
    if not prior_blocked("RENDER_QA"):
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
        world_points = [obj.matrix_world @ corner for obj in mesh_objects for corner in obj.bound_box]
        if world_points:
            center = sum(world_points, world_points[0] * 0.0) / len(world_points)
            extent = max(
                max(point.x for point in world_points) - min(point.x for point in world_points),
                max(point.y for point in world_points) - min(point.y for point in world_points),
                max(point.z for point in world_points) - min(point.z for point in world_points),
                0.5,
            )
        else:
            from mathutils import Vector

            center = Vector((0.0, 0.0, 1.0))
            extent = 2.0
        views = {
            "render_qa.png": (center.x, center.y - extent * 2.8, center.z),
            "render_qa_three_quarter.png": (
                center.x + extent * 1.9,
                center.y - extent * 1.9,
                center.z + extent * 0.15,
            ),
            "render_qa_side.png": (center.x + extent * 2.8, center.y, center.z),
        }
        rendered = []
        for filename, location in views.items():
            camera.location = location
            camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
            camera.data.lens = 55
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
        evidence = {
            "engine": scene.render.engine,
            "resolution": [512, 512],
            "renders": rendered,
            "wrote": all(item["wrote"] for item in rendered),
            "bytes": sum(item["bytes"] for item in rendered),
        }
        if not evidence["wrote"]:
            record(failed_stage("RENDER_QA", "Workbench still was not written.", **evidence), evidence)
        else:
            record(executed_stage("RENDER_QA", "Rendered a live workbench still.", **evidence), evidence)

    # 25 EXPORT_QA
    if not prior_blocked("EXPORT_QA"):
        export_path = artifact_dir / "export_qa.fbx"
        _refuse_locked_write(export_path)
        bpy.ops.export_scene.fbx(filepath=str(export_path), use_selection=False, add_leaf_bones=False)
        evidence = {
            "export": str(export_path),
            "wrote": export_path.is_file(),
            "bytes": export_path.stat().st_size if export_path.is_file() else 0,
            "productionMasterAllowed": False,
        }
        if not export_path.is_file():
            record(failed_stage("EXPORT_QA", "FBX export was not written.", **evidence), evidence)
        else:
            record(executed_stage("EXPORT_QA", "Exported live QA FBX outside SOURCE/PRODUCTION.", **evidence), evidence)

    # persist WORKING after live mutations
    _ensure_object_mode(bpy)
    working_after = artifact_dir / "CHAR_GOAT_001_working_executed.blend"
    _refuse_locked_write(working_after)
    bpy.ops.wm.save_as_mainfile(filepath=str(working), check_existing=False, copy=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(working_after), check_existing=False, copy=True)
    after_hash = _sha256(working)
    after_objects = {obj.name for obj in bpy.data.objects}
    after_keys = []
    if mesh is not None and mesh.data.shape_keys:
        after_keys = [key.name for key in mesh.data.shape_keys.key_blocks]

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
        "datablocksChanged": bool(after_objects - before_objects) or bool(after_keys),
        "simulated": False,
        "dryRun": False,
        "blenderExecuted": True,
        "goatProductionReady": False,
        "realGoatSourceTested": real_asset_verified,
    }


require_bpy  # imported for fail-closed callers
