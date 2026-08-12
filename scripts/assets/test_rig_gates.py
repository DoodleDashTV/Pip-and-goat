"""Regression tests for DDP rigging, animation and scene-assembly invariants.

Runs inside Blender against synthetic rigs, so it is fast and needs no rendering
and no production assets:

  blender -b -noaudio --python scripts/assets/test_rig_gates.py

Covers the defect classes that shipped a motionless, washed-out acceptance
render: unbound skin, euler channels on quaternion bones, constant actions,
camera-only "motion", stacked lights, and multi-object assets torn apart by a
placement.
"""

from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "blender"))

import bpy  # noqa: E402

import assemble_scene as A  # noqa: E402
from ddp_rig import (  # noqa: E402
    author_action,
    bind_rigid,
    bind_skin,
    count_unweighted_vertices,
    rotation_mode_conflicts,
    sample_local_motion,
)

BONES = [
    ("root", (0, 0, 0), (0, 0, 0.4), None),
    ("spine", (0, 0, 0.4), (0, 0, 0.9), "root"),
    ("head", (0, 0, 0.9), (0, 0, 1.3), "spine"),
]


def fresh_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_armature(name: str = "Test_Rig"):
    arm_data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    created = {}
    for bone_name, head, tail, parent in BONES:
        bone = arm_data.edit_bones.new(bone_name)
        bone.head = head
        bone.tail = tail
        if parent:
            bone.parent = created[parent]
        created[bone_name] = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def make_body(name: str = "Test_Body"):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.25, depth=1.3, location=(0, 0, 0.65), vertices=16)
    obj = bpy.context.object
    obj.name = name
    return obj


def wave(p, frame: int, t: float) -> None:
    p.rot("head", 0.6 * math.sin(math.pi * 2 * t), 0.0, 0.25 * t)


def frozen(p, frame: int, t: float) -> None:
    # Deliberately writes the same pose on every frame (the PIP_POINT defect).
    p.rot("head", 0.2, 0.0, 0.0)


class SkinningTests(unittest.TestCase):
    def setUp(self) -> None:
        fresh_scene()
        self.arm = make_armature()
        self.body = make_body()

    def test_bind_skin_creates_groups_for_deform_bones(self) -> None:
        result = bind_skin(self.body, self.arm)
        self.assertGreater(result["vertexGroups"], 0)
        self.assertEqual(result["unweighted"], 0)
        bone_names = {b.name for b in self.arm.data.bones}
        for vg in self.body.vertex_groups:
            self.assertIn(vg.name, bone_names, "vertex group must map to a real deform bone")
        self.assertTrue(any(m.type == "ARMATURE" and m.object is self.arm for m in self.body.modifiers))

    def test_missing_vertex_groups_are_detected(self) -> None:
        bind_skin(self.body, self.arm)
        self.assertEqual(count_unweighted_vertices(self.body), 0)
        for vg in list(self.body.vertex_groups):
            self.body.vertex_groups.remove(vg)
        self.assertEqual(count_unweighted_vertices(self.body), len(self.body.data.vertices))

    def test_rigid_accessory_binds_to_one_declared_bone(self) -> None:
        result = bind_rigid(self.body, self.arm, "head")
        self.assertEqual(result["rigidBone"], "head")
        self.assertEqual([vg.name for vg in self.body.vertex_groups], ["head"])
        self.assertEqual(count_unweighted_vertices(self.body), 0)

    def test_rigid_bind_rejects_unknown_bone(self) -> None:
        with self.assertRaises(ValueError):
            bind_rigid(self.body, self.arm, "no_such_bone")


class AnimationTests(unittest.TestCase):
    def setUp(self) -> None:
        fresh_scene()
        self.arm = make_armature()
        self.body = make_body()
        bind_skin(self.body, self.arm)

    def test_constant_action_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            author_action(self.arm, "TEST_FROZEN", 30, frozen)

    def test_varying_action_is_accepted(self) -> None:
        result = author_action(self.arm, "TEST_WAVE", 30, wave)
        self.assertGreater(result["varyingFcurves"], 0)

    def test_authored_channels_match_bone_rotation_mode(self) -> None:
        author_action(self.arm, "TEST_WAVE", 30, wave)
        action = bpy.data.actions["TEST_WAVE"]
        self.assertEqual(rotation_mode_conflicts(self.arm, action), [])

    def test_euler_channels_on_quaternion_bones_are_rejected(self) -> None:
        author_action(self.arm, "TEST_WAVE", 30, wave)
        action = bpy.data.actions["TEST_WAVE"]
        for pb in self.arm.pose.bones:
            pb.rotation_mode = "QUATERNION"
        conflicts = rotation_mode_conflicts(self.arm, action)
        self.assertTrue(conflicts)
        self.assertTrue(all(c["reason"] == "euler channel on quaternion bone" for c in conflicts))

    def test_visible_character_motion_is_measured(self) -> None:
        author_action(self.arm, "TEST_WAVE", 90, wave)
        self.arm.animation_data.action = bpy.data.actions["TEST_WAVE"]
        motion = sample_local_motion(self.arm, [self.body], [1, 30, 60, 90])
        self.assertGreater(motion["maxVertexDelta"], 0.01)
        self.assertGreater(motion["minConsecutiveVertexDelta"], 0.002)

    def test_camera_motion_alone_is_not_character_motion(self) -> None:
        # Animate only the camera; the character has no action at all.
        cam_data = bpy.data.cameras.new("Cam")
        cam = bpy.data.objects.new("Cam", cam_data)
        bpy.context.collection.objects.link(cam)
        bpy.context.scene.camera = cam
        cam.location = (0, -6, 1.5)
        cam.keyframe_insert(data_path="location", frame=1)
        cam.location = (0, -2, 1.5)
        cam.keyframe_insert(data_path="location", frame=90)

        motion = sample_local_motion(self.arm, [self.body], [1, 30, 60, 90])
        self.assertEqual(motion["maxVertexDelta"], 0.0)
        self.assertEqual(motion["minConsecutiveVertexDelta"], 0.0)

    def test_object_placement_alone_is_not_character_motion(self) -> None:
        # Moving the whole character does not deform it, so it must not count.
        self.arm.location = (0, 0, 0)
        self.arm.keyframe_insert(data_path="location", frame=1)
        self.arm.location = (2.5, 1.0, 0)
        self.arm.keyframe_insert(data_path="location", frame=90)
        motion = sample_local_motion(self.arm, [self.body], [1, 30, 60, 90])
        self.assertEqual(motion["maxVertexDelta"], 0.0)


class LightingTests(unittest.TestCase):
    def setUp(self) -> None:
        fresh_scene()
        self.scene = bpy.context.scene

    def _light_count(self) -> int:
        return len([o for o in bpy.data.objects if o.type == "LIGHT"])

    def test_lighting_state_installs_exactly_three_lights(self) -> None:
        result = A.apply_lighting_state(self.scene, "DAY_KEY")
        self.assertEqual(result["lightingState"], "DAY_KEY")
        self.assertEqual(self._light_count(), 3)
        self.assertEqual(result["activeLightCount"], 3)

    def test_repeated_assembly_does_not_duplicate_lights(self) -> None:
        for _ in range(4):
            A.apply_lighting_state(self.scene, "DAY_SOFT")
        self.assertEqual(self._light_count(), 3)

    def test_lighting_state_actually_changes_configuration(self) -> None:
        soft = A.apply_lighting_state(self.scene, "DAY_SOFT")
        soft_energies = [o.data.energy for o in bpy.data.objects if o.type == "LIGHT"]
        overcast = A.apply_lighting_state(self.scene, "OVERCAST")
        overcast_energies = [o.data.energy for o in bpy.data.objects if o.type == "LIGHT"]
        self.assertNotEqual(soft["worldStrength"], overcast["worldStrength"])
        self.assertNotEqual(soft_energies, overcast_energies)

    def test_unknown_lighting_state_falls_back_deterministically(self) -> None:
        self.assertEqual(A.resolve_lighting_state("NOT_A_STATE"), A.DEFAULT_LIGHTING_STATE)
        self.assertEqual(A.resolve_lighting_state(None), A.DEFAULT_LIGHTING_STATE)
        self.assertEqual(A.resolve_lighting_state("day-key"), "DAY_KEY")

    def test_imported_lights_and_cameras_are_stripped(self) -> None:
        light_data = bpy.data.lights.new("Imported_Sun", "SUN")
        light = bpy.data.objects.new("Imported_Sun", light_data)
        bpy.context.collection.objects.link(light)
        cam_data = bpy.data.cameras.new("RefCam")
        cam = bpy.data.objects.new("RefCam", cam_data)
        bpy.context.collection.objects.link(cam)
        mesh = make_body("Kept_Mesh")

        removed = A.strip_imported_lights_and_cameras([light, cam, mesh])
        self.assertEqual(removed["lights"], ["Imported_Sun"])
        self.assertEqual(removed["cameras"], ["RefCam"])
        self.assertEqual(removed["survivors"], ["Kept_Mesh"])
        self.assertEqual(self._light_count(), 0)
        self.assertIn("Kept_Mesh", bpy.data.objects)


class HierarchyTests(unittest.TestCase):
    def setUp(self) -> None:
        fresh_scene()

    def _two_piece_prop(self):
        bpy.ops.mesh.primitive_plane_add(size=0.9, location=(0, 0, 0.02))
        paper = bpy.context.object
        paper.name = "AdventureMap"
        bpy.ops.mesh.primitive_cube_add(size=0.08, location=(0.1, -0.05, 0.05))
        mark = bpy.context.object
        mark.name = "MapMark"
        return paper, mark

    def test_multi_object_placement_preserves_hierarchy(self) -> None:
        paper, mark = self._two_piece_prop()
        before = (paper.matrix_world.translation - mark.matrix_world.translation).length

        root, kind = A.placement_root("map", [paper, mark])
        self.assertEqual(kind, "created-root")
        self.assertEqual(root.name, "map_Root")
        root.location = (0.0, -0.8, 0.02)
        bpy.context.view_layer.update()

        after = (paper.matrix_world.translation - mark.matrix_world.translation).length
        self.assertAlmostEqual(before, after, places=5, msg="placement must not separate the map pieces")
        self.assertLess(after, 0.5, "MapMark must remain attached to AdventureMap")

    def test_placing_only_the_first_mesh_detaches_the_prop(self) -> None:
        # The historical bug, kept as a test so the gate keeps catching it.
        paper, mark = self._two_piece_prop()
        before = (paper.matrix_world.translation - mark.matrix_world.translation).length
        paper.location = (0.0, -0.8, 0.02)
        bpy.context.view_layer.update()
        after = (paper.matrix_world.translation - mark.matrix_world.translation).length
        self.assertGreater(after, before)
        self.assertGreater(after, 0.5, "detached prop must be detectable by the hierarchy gate")

    def test_armature_is_preferred_as_placement_root(self) -> None:
        arm = make_armature()
        body = make_body()
        bind_skin(body, arm)
        root, kind = A.placement_root("pip", [arm, body])
        self.assertIs(root, arm)
        self.assertEqual(kind, "armature")

    def test_single_root_asset_uses_its_existing_root(self) -> None:
        parent = make_body("Parent")
        child = make_body("Child")
        child.parent = parent
        root, kind = A.placement_root("thing", [parent, child])
        self.assertIs(root, parent)
        self.assertEqual(kind, "existing-root")


class ActionBindingTests(unittest.TestCase):
    def setUp(self) -> None:
        fresh_scene()
        self.arm = make_armature()
        self.body = make_body()
        bind_skin(self.body, self.arm)

    def test_missing_action_is_reported_not_silently_ignored(self) -> None:
        self.assertFalse(A.apply_action(self.arm, "NO_SUCH_ACTION", 1, 90))

    def test_existing_action_binds(self) -> None:
        author_action(self.arm, "TEST_WAVE", 30, wave)
        self.assertTrue(A.apply_action(self.arm, "TEST_WAVE", 1, 90))
        self.assertEqual(self.arm.animation_data.action.name, "TEST_WAVE")

    def test_short_action_is_looped_to_cover_a_longer_shot(self) -> None:
        author_action(self.arm, "TEST_WAVE", 30, wave)
        A.apply_action(self.arm, "TEST_WAVE", 1, 90)
        action = bpy.data.actions["TEST_WAVE"]
        self.assertTrue(
            all(any(m.type == "CYCLES" for m in fc.modifiers) for fc in action.fcurves),
            "a 30-frame action must repeat rather than freeze for 60 frames",
        )


def main() -> int:
    loader = unittest.TestLoader()
    suite = unittest.TestSuite(
        loader.loadTestsFromTestCase(case)
        for case in (SkinningTests, AnimationTests, LightingTests, HierarchyTests, ActionBindingTests)
    )
    result = unittest.TextTestRunner(verbosity=2, stream=sys.stdout).run(suite)
    print(
        f"DDP_RIG_TESTS:{{\"tests\": {result.testsRun}, "
        f"\"failures\": {len(result.failures)}, \"errors\": {len(result.errors)}}}"
    )
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
