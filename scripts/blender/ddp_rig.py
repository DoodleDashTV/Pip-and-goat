"""Shared Doodle Dash rigging, animation-authoring and motion-proof helpers.

This is the single supported rigging strategy for DDP characters:

  * every deforming character mesh is skinned with real vertex groups, one per
    deform bone, weights computed from distance to the bone segment;
  * accessories that are meant to travel rigidly with one bone get a single
    full-weight vertex group for that bone (declared, not accidental);
  * pose bones are switched to ``XYZ`` euler mode before any euler channel is
    authored, so an action can never animate a channel the evaluator ignores.

Everything here is importable inside Blender (``bpy`` is imported lazily so the
module can be inspected without a Blender runtime).
"""

from __future__ import annotations

from dataclasses import dataclass, field

# A vertex must end up with at least this much total weight or it can never be
# deformed by the armature.
MIN_TOTAL_WEIGHT = 1e-4
# Weight falloff: how much of the blend the second-nearest bone may claim.
SECOND_BONE_BLEND = 0.35


def _bpy():
    import bpy

    return bpy


def _mathutils():
    import mathutils

    return mathutils


def deform_bone_names(arm) -> list[str]:
    """Bones that are allowed to own vertex weights, in a stable order."""
    return [b.name for b in arm.data.bones if b.use_deform]


def _closest_point_on_segment(p, a, b):
    ab = b - a
    denom = ab.dot(ab)
    if denom <= 1e-12:
        return a, 0.0
    t = max(0.0, min(1.0, (p - a).dot(ab) / denom))
    return a + ab * t, t


def _bone_segments(arm):
    """Deform bone segments in armature space."""
    mathutils = _mathutils()
    segs = []
    for bone in arm.data.bones:
        if not bone.use_deform:
            continue
        head = mathutils.Vector(bone.head_local)
        tail = mathutils.Vector(bone.tail_local)
        segs.append((bone.name, head, tail))
    return segs


def compute_skin_weights(mesh_obj, arm) -> dict[str, list[tuple[int, float]]]:
    """Distance-based weights: nearest bone plus a soft blend to the runner-up.

    Returns ``{bone_name: [(vertex_index, weight), ...]}``. Every vertex is
    guaranteed to receive weight from at least one bone, so no part of the mesh
    can silently refuse to deform.
    """
    mathutils = _mathutils()
    segs = _bone_segments(arm)
    if not segs:
        raise ValueError(f"armature {arm.name} exposes no deform bones")

    # Mesh and armature are authored at the same origin in DDP asset blends, but
    # respect their object matrices anyway so this stays correct if that changes.
    to_arm = arm.matrix_world.inverted() @ mesh_obj.matrix_world

    out: dict[str, list[tuple[int, float]]] = {name: [] for name, _, _ in segs}
    for vert in mesh_obj.data.vertices:
        p = to_arm @ mathutils.Vector(vert.co)
        ranked = []
        for name, head, tail in segs:
            closest, _ = _closest_point_on_segment(p, head, tail)
            ranked.append(((p - closest).length, name))
        ranked.sort(key=lambda item: item[0])

        best_d, best = ranked[0]
        if len(ranked) > 1:
            second_d, second = ranked[1]
            # Blend only when the runner-up is genuinely competitive, so limbs
            # stay crisp instead of smearing weight across the whole rig.
            total = best_d + second_d
            share = 0.0 if total <= 1e-9 else SECOND_BONE_BLEND * (1.0 - best_d / total) * 2.0
            share = max(0.0, min(SECOND_BONE_BLEND, share))
            if share > 1e-4:
                out[best].append((vert.index, 1.0 - share))
                out[second].append((vert.index, share))
                continue
        out[best].append((vert.index, 1.0))
    return out


def bind_skin(mesh_obj, arm) -> dict:
    """Skin ``mesh_obj`` to ``arm`` with real vertex groups + Armature modifier."""
    weights = compute_skin_weights(mesh_obj, arm)

    # Drop stale groups so re-binding is idempotent and leaves no orphans.
    for vg in list(mesh_obj.vertex_groups):
        mesh_obj.vertex_groups.remove(vg)

    created = 0
    for bone_name, entries in weights.items():
        if not entries:
            continue
        vg = mesh_obj.vertex_groups.new(name=bone_name)
        for idx, weight in entries:
            vg.add([idx], weight, "REPLACE")
        created += 1

    mesh_obj.parent = arm
    mod = None
    for m in mesh_obj.modifiers:
        if m.type == "ARMATURE":
            mod = m
            break
    if mod is None:
        mod = mesh_obj.modifiers.new(name="Armature", type="ARMATURE")
    mod.object = arm

    unweighted = count_unweighted_vertices(mesh_obj)
    if unweighted:
        raise ValueError(f"{mesh_obj.name}: {unweighted} vertices received no armature weight")
    return {"mesh": mesh_obj.name, "armature": arm.name, "vertexGroups": created, "unweighted": 0}


def bind_rigid(obj, arm, bone_name: str) -> dict:
    """Bind an accessory rigidly to one bone (declared, intentional rigidity)."""
    if bone_name not in {b.name for b in arm.data.bones}:
        raise ValueError(f"{obj.name}: rigid parent bone {bone_name!r} missing from {arm.name}")
    for vg in list(obj.vertex_groups):
        obj.vertex_groups.remove(vg)
    if obj.type == "MESH" and len(obj.data.vertices):
        vg = obj.vertex_groups.new(name=bone_name)
        vg.add([v.index for v in obj.data.vertices], 1.0, "REPLACE")
    obj.parent = arm
    mod = next((m for m in obj.modifiers if m.type == "ARMATURE"), None)
    if mod is None:
        mod = obj.modifiers.new(name="Armature", type="ARMATURE")
    mod.object = arm
    return {"mesh": obj.name, "armature": arm.name, "rigidBone": bone_name}


def count_unweighted_vertices(mesh_obj) -> int:
    """Vertices whose total armature weight is effectively zero."""
    if mesh_obj.type != "MESH":
        return 0
    bound = {vg.index for vg in mesh_obj.vertex_groups}
    if not bound:
        return len(mesh_obj.data.vertices)
    unweighted = 0
    for vert in mesh_obj.data.vertices:
        total = sum(g.weight for g in vert.groups if g.group in bound)
        if total <= MIN_TOTAL_WEIGHT:
            unweighted += 1
    return unweighted


@dataclass
class Poser:
    """Pose writer that records exactly which channels an action touches.

    Writing an euler rotation forces the pose bone into ``XYZ`` mode first, so a
    euler channel can never be authored against a quaternion bone.
    """

    arm: object
    touched: set = field(default_factory=set)

    def _bone(self, name: str):
        pb = self.arm.pose.bones.get(name)
        if pb is None:
            raise ValueError(f"{self.arm.name}: pose bone {name!r} missing")
        return pb

    def rot(self, name: str, x: float = 0.0, y: float = 0.0, z: float = 0.0) -> None:
        pb = self._bone(name)
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (x, y, z)
        self.touched.add((name, "rotation_euler"))

    def loc(self, name: str, x: float = 0.0, y: float = 0.0, z: float = 0.0) -> None:
        pb = self._bone(name)
        pb.location = (x, y, z)
        self.touched.add((name, "location"))

    def scale(self, name: str, x: float = 1.0, y: float = 1.0, z: float = 1.0) -> None:
        pb = self._bone(name)
        pb.scale = (x, y, z)
        self.touched.add((name, "scale"))


def reset_pose(arm) -> None:
    for pb in arm.pose.bones:
        pb.location = (0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)
        if pb.rotation_mode == "QUATERNION":
            pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        else:
            pb.rotation_euler = (0.0, 0.0, 0.0)


def fcurve_varies(fcurve, epsilon: float = 1e-6) -> bool:
    values = [kp.co[1] for kp in fcurve.keyframe_points]
    if len(values) < 2:
        return False
    return (max(values) - min(values)) > epsilon


def author_action(arm, name: str, frames: int, mutate, require_motion: bool = True) -> dict:
    """Author an action, keyframing only the channels ``mutate`` actually writes.

    Fails closed when the result would be a constant (dead) action, which is the
    defect that made PIP_POINT render as a still pose.
    """
    bpy = _bpy()
    action = bpy.data.actions.new(name=name)
    if not arm.animation_data:
        arm.animation_data_create()
    arm.animation_data.action = action

    poser = Poser(arm)
    for frame in range(1, frames + 1):
        t = (frame - 1) / max(frames - 1, 1)
        reset_pose(arm)
        poser.touched.clear()
        mutate(poser, frame, t)
        for bone_name, data_path in sorted(poser.touched):
            arm.pose.bones[bone_name].keyframe_insert(data_path=data_path, frame=frame)

    varying = [fc for fc in action.fcurves if fcurve_varies(fc)]
    if require_motion and not varying:
        raise ValueError(f"action {name} is constant on every channel — it would render as a still pose")
    reset_pose(arm)
    return {
        "action": name,
        "frames": frames,
        "fcurves": len(action.fcurves),
        "varyingFcurves": len(varying),
    }


def rotation_mode_conflicts(arm, action) -> list[dict]:
    """Channels an action animates that the evaluator would silently ignore."""
    conflicts = []
    for fc in action.fcurves:
        path = fc.data_path
        if 'pose.bones["' not in path:
            continue
        bone_name = path.split('pose.bones["', 1)[1].split('"]', 1)[0]
        pb = arm.pose.bones.get(bone_name)
        if pb is None:
            conflicts.append({"dataPath": path, "reason": "missing pose bone", "boneRotationMode": None})
            continue
        mode = pb.rotation_mode
        if path.endswith("rotation_euler") and mode == "QUATERNION":
            conflicts.append({"dataPath": path, "reason": "euler channel on quaternion bone", "boneRotationMode": mode})
        elif path.endswith("rotation_quaternion") and mode != "QUATERNION":
            conflicts.append({"dataPath": path, "reason": "quaternion channel on euler bone", "boneRotationMode": mode})
    return conflicts


def sample_local_motion(arm, mesh_objs, frames: list[int]) -> dict:
    """Measure pose-driven motion in the character's own local space.

    Deliberately local: object placement and camera movement cannot influence
    these numbers, so a moving camera can never fake character motion.
    """
    bpy = _bpy()
    scene = bpy.context.scene
    depsgraph = bpy.context.evaluated_depsgraph_get()

    bone_samples: dict[int, dict[str, tuple]] = {}
    vert_samples: dict[int, list[tuple]] = {}

    for frame in frames:
        scene.frame_set(frame)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        bone_samples[frame] = {
            pb.name: tuple(round(v, 6) for v in pb.matrix.to_translation())
            + tuple(round(v, 6) for v in pb.matrix.to_euler())
            for pb in arm.pose.bones
        }
        coords: list[tuple] = []
        for mesh_obj in mesh_objs:
            eval_obj = mesh_obj.evaluated_get(depsgraph)
            eval_mesh = eval_obj.to_mesh()
            coords.extend(tuple(v.co) for v in eval_mesh.vertices)
            eval_obj.to_mesh_clear()
        vert_samples[frame] = coords

    base_frame = frames[0]
    max_bone_delta = 0.0
    moving_bones: list[str] = []
    for frame in frames[1:]:
        for name, sample in bone_samples[frame].items():
            base = bone_samples[base_frame].get(name)
            if not base:
                continue
            delta = max(abs(a - b) for a, b in zip(sample, base))
            if delta > 1e-4 and name not in moving_bones:
                moving_bones.append(name)
            max_bone_delta = max(max_bone_delta, delta)

    base_coords = vert_samples[base_frame]

    def vertex_delta(frame_a: int, frame_b: int) -> float:
        a_coords = vert_samples[frame_a]
        b_coords = vert_samples[frame_b]
        if len(a_coords) != len(b_coords):
            return 0.0
        worst = 0.0
        for a, b in zip(a_coords, b_coords):
            delta = max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2]))
            if delta > worst:
                worst = delta
        return worst

    max_vert_delta = 0.0
    for frame in frames[1:]:
        max_vert_delta = max(max_vert_delta, vertex_delta(frame, base_frame))

    # Consecutive-pair deltas catch an action that only moves early and then
    # freezes, and an action whose period aliases with the sampled frames so
    # every sample lands on the identical phase.
    pairwise = {}
    for earlier, later in zip(frames, frames[1:]):
        pairwise[f"{earlier}->{later}"] = round(vertex_delta(later, earlier), 6)

    return {
        "framesSampled": frames,
        "maxBoneDelta": round(max_bone_delta, 6),
        "maxVertexDelta": round(max_vert_delta, 6),
        "pairwiseVertexDeltas": pairwise,
        "minConsecutiveVertexDelta": round(min(pairwise.values()), 6) if pairwise else 0.0,
        "movingBones": sorted(moving_bones),
        "vertexCount": len(base_coords),
    }
