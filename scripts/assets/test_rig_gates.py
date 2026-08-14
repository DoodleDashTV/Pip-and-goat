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
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

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


def make_thin_slab(name: str, thickness: float, location=(0.0, 0.0, 0.0)):
    """A closed box thinner than the shadow shrink wants to travel."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (0.12, 0.12, thickness / 2.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def make_ball(name: str, radius: float, location=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=location, segments=20, ring_count=14)
    obj = bpy.context.object
    obj.name = name
    return obj


#: A light running eight degrees off the slab's face, so a nub sitting on that face
#: throws its shadow the length of it. Pip's chest is the same situation: the sun
#: leaves the body sphere within six degrees of tangent along the line from the beak.
RAKING_LIGHT = Vector((0.0, 0.9903, -0.1392))


#: Half-extents of the fixture slab, and the ball nub that sits on its top face.
#: A slab 300 mm across and 300 mm thick has room for the whole shrink, so the
#: planner reads it as a mass; a 30 mm ball does not, so it is a part sitting on
#: that mass. The ball sinks 5 mm in, the way every part of these characters
#: meets the mass it is mounted on.
SLAB_HALF = (0.3, 0.3, 0.15)
NUB_RADIUS = 0.015
NUB_SINK = 0.005


def make_slab_with_nub(nub_y: float):
    """A thick slab with a ball nub sitting on it, joined into one mesh.

    Which edge of the top face the nub sits on decides whether the raking light
    drags its shadow the length of the slab or carries it straight off the end.
    """
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.0))
    slab = bpy.context.object
    slab.name = "Mass"
    slab.scale = tuple(h * 2.0 for h in SLAB_HALF)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=NUB_RADIUS,
        location=(0.0, nub_y, SLAB_HALF[2] + NUB_RADIUS - NUB_SINK),
        segments=20,
        ring_count=14,
    )
    nub = bpy.context.object
    nub.name = "Nub"

    nub_vertices = len(nub.data.vertices)
    bpy.ops.object.select_all(action="DESELECT")
    slab.select_set(True)
    nub.select_set(True)
    bpy.context.view_layer.objects.active = slab
    bpy.ops.object.join()
    joined = bpy.context.object
    assert len(A.mesh_islands(joined.data)) == 2
    return slab, nub_vertices, joined


def _nub_index(mesh) -> int:
    """Which island is the nub, by extent rather than by vertex count."""
    islands = A.mesh_islands(mesh)

    def extent(comp) -> float:
        coords = [mesh.vertices[i].co for i in comp]
        return max(max(c[a] for c in coords) - min(c[a] for c in coords) for a in range(3))

    return min(range(len(islands)), key=lambda n: extent(islands[n]))


def nub_island(joined) -> list[int]:
    """The nub's vertex indices, sorted, so a list comparison can be made."""
    islands = A.mesh_islands(joined.data)
    return sorted(islands[_nub_index(joined.data)])


def measure_nub(joined, light):
    """Run the self-shadow measurement on the nub island alone."""
    from mathutils.bvhtree import BVHTree

    mesh = joined.data
    islands = A.mesh_islands(mesh)
    index = _nub_index(mesh)
    island_of_vertex = {i: n for n, comp in enumerate(islands) for i in comp}
    faces = [list(p.vertices) for p in mesh.polygons]
    coords = [v.co.copy() for v in mesh.vertices]
    tree = BVHTree.FromPolygons(coords, faces, all_triangles=False, epsilon=0.0)
    island_of_face = [island_of_vertex[f[0]] for f in faces]
    weights, _collapse = A.plan_shadow_shrink(mesh)
    return A.island_self_shadow(
        mesh, islands[index], weights, tree, island_of_face, index, light
    )


def displaced_points(obj):
    """Every vertex of the caster after its modifier stack runs, in world space."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    points = [evaluated.matrix_world @ v.co for v in mesh.vertices]
    evaluated.to_mesh_clear()
    return points


class ShadowCasterTests(unittest.TestCase):
    """The shadow caster must stay inside the surface it hides beneath.

    Pip's chest carried a hard vertical band below the beak for exactly this
    reason: the caster displaced every part 22 mm inward, the beak tip is 15 mm
    thick, and the inside-out beak threw a shadow of a shape that was not on
    screen.
    """

    def setUp(self) -> None:
        fresh_scene()

    def test_thick_part_still_receives_the_full_shrink(self) -> None:
        # The acne this proxy exists to kill is on the large surfaces, so they must
        # not lose any of their shrink to the thin-part rule.
        ball = make_ball("Thick", 0.16)
        weights, collapse = A.plan_shadow_shrink(ball.data)
        self.assertEqual(collapse, [])
        self.assertAlmostEqual(max(weights), 1.0, places=6)

    def test_part_thinner_than_the_shrink_is_not_turned_inside_out(self) -> None:
        slab = make_thin_slab("Thin", thickness=0.015)
        self.assertLess(0.015 / 2.0, A.SHADOW_PROXY_SHRINK, "fixture must be thinner than the shrink")
        weights, _ = A.plan_shadow_shrink(slab.data)
        travel = max(weights) * A.SHADOW_PROXY_SHRINK
        self.assertGreater(travel, 0.0, "a solid part should still cast")
        self.assertLess(travel, 0.015 / 2.0, "travel past the middle of a part turns it inside out")

    def test_flat_part_is_collapsed_rather_than_displaced(self) -> None:
        bpy.ops.mesh.primitive_plane_add(size=0.1)
        plane = bpy.context.object
        plane.name = "Decal"
        weights, collapse = A.plan_shadow_shrink(plane.data)
        self.assertEqual(len(collapse), 1, "a single-sided sheet has no inside to hide a caster in")
        self.assertEqual(max(weights), 0.0)

    def test_each_island_is_measured_on_its_own(self) -> None:
        ball = make_ball("Mixed", 0.16)
        slab = make_thin_slab("MixedThin", thickness=0.015, location=(0.4, 0.0, 0.0))
        bpy.ops.object.select_all(action="DESELECT")
        ball.select_set(True)
        slab.select_set(True)
        bpy.context.view_layer.objects.active = ball
        bpy.ops.object.join()
        joined = bpy.context.object
        self.assertEqual(len(A.mesh_islands(joined.data)), 2)
        weights, _ = A.plan_shadow_shrink(joined.data)
        self.assertEqual(len(set(round(w, 6) for w in weights)), 2, "one shrink per part, not one per mesh")

    def test_caster_of_a_thin_part_stays_inside_the_visible_surface(self) -> None:
        slab = make_thin_slab("ThinReal", thickness=0.015)
        created = A.install_shadow_proxy([slab])
        self.assertEqual(len(created), 1)
        proxy = bpy.data.objects[created[0]]
        half = 0.015 / 2.0
        for point in displaced_points(proxy):
            self.assertLess(
                abs(point.z),
                half,
                "the caster left the surface it is supposed to sit inside",
            )

    def test_caster_carries_its_own_mesh_and_leaves_the_asset_alone(self) -> None:
        ball = make_ball("Asset", 0.16)
        groups_before = [g.name for g in ball.vertex_groups]
        created = A.install_shadow_proxy([ball])
        proxy = bpy.data.objects[created[0]]
        self.assertIsNot(proxy.data, ball.data, "weighting the caster must not touch the rendered asset")
        self.assertEqual([g.name for g in ball.vertex_groups], groups_before)
        self.assertIn(A.SHADOW_PROXY_VERTEX_GROUP, [g.name for g in proxy.vertex_groups])
        self.assertFalse(ball.visible_shadow, "the visible mesh stops casting")
        self.assertTrue(proxy.visible_shadow)
        self.assertFalse(proxy.visible_camera)

    def test_part_sealed_inside_another_part_is_not_a_caster(self) -> None:
        # Pip's beak has a second sphere authored inside it. The camera never sees
        # it, so whatever it blocks is a mark with nothing on screen behind it, and
        # that mark was the faint line left down the chest.
        outer = make_ball("Outer", 0.16)
        inner = make_ball("Inner", 0.05)
        bpy.ops.object.select_all(action="DESELECT")
        outer.select_set(True)
        inner.select_set(True)
        bpy.context.view_layer.objects.active = outer
        bpy.ops.object.join()
        joined = bpy.context.object
        islands = A.mesh_islands(joined.data)
        self.assertEqual(len(islands), 2)
        sealed = _nub_index(joined.data)
        weights, collapse = A.plan_shadow_shrink(joined.data)
        self.assertEqual([sorted(c) for c in collapse], [sorted(islands[sealed])])
        self.assertTrue(all(weights[i] == 0.0 for i in islands[sealed]))
        self.assertTrue(
            all(weights[i] > 0.0 for i in islands[1 - sealed]), "the shell still casts"
        )

    def test_the_inner_wall_of_a_hollow_part_keeps_casting(self) -> None:
        # The Goat's tag letters are extruded rings: the inner wall is its own
        # island, inside the outer wall's surface, and seen through the letter. It
        # reaches the same two faces the outer wall does, which is what tells it
        # apart from a sealed part.
        bpy.ops.mesh.primitive_cube_add(size=0.2)
        outer = bpy.context.object
        bpy.ops.mesh.primitive_cube_add(size=0.2)
        inner = bpy.context.object
        inner.scale = (0.3, 1.0, 0.3)  # spans the outer part end to end in y
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        bpy.ops.object.select_all(action="DESELECT")
        outer.select_set(True)
        inner.select_set(True)
        bpy.context.view_layer.objects.active = outer
        bpy.ops.object.join()
        joined = bpy.context.object
        mesh = joined.data
        islands = A.mesh_islands(mesh)
        coords = [v.co.copy() for v in mesh.vertices]
        trees = []
        for comp in islands:
            member = set(comp)
            polys = [list(p.vertices) for p in mesh.polygons if all(v in member for v in p.vertices)]
            trees.append(
                BVHTree.FromPolygons(coords, polys, all_triangles=False, epsilon=0.0)
                if polys
                else None
            )
        self.assertEqual(A.buried_islands(islands, trees, coords), set())

    def test_pips_buried_parts_are_the_beak_tip_and_the_pupils(self) -> None:
        blend = REPO_ROOT / "production-library/characters/pip_production.blend"
        if not blend.exists():
            self.skipTest("Pip's production blend is not available")
        bpy.ops.wm.open_mainfile(filepath=str(blend))
        mesh = bpy.data.objects["Pip_Character"].data
        materials = [m.name if m else "" for m in mesh.materials]
        islands = A.mesh_islands(mesh)
        coords = [v.co.copy() for v in mesh.vertices]
        trees = []
        for comp in islands:
            member = set(comp)
            polys = [list(p.vertices) for p in mesh.polygons if all(v in member for v in p.vertices)]
            trees.append(
                BVHTree.FromPolygons(coords, polys, all_triangles=False, epsilon=0.0)
                if polys
                else None
            )
        buried = A.buried_islands(islands, trees, coords)
        named = sorted(
            (
                materials[
                    min(
                        p.material_index
                        for p in mesh.polygons
                        if all(v in set(islands[i]) for v in p.vertices)
                    )
                ],
                len(islands[i]),
            )
            for i in buried
        )
        self.assertEqual(named, [("PipBeak", 86), ("PipPupil", 86), ("PipPupil", 86)])
        weights, _collapse = A.plan_shadow_shrink(mesh, light=A.key_light_direction("DAY_KEY"))
        for island in buried:
            self.assertTrue(all(weights[i] == 0.0 for i in islands[island]))

    def test_unlit_planning_is_thickness_only(self) -> None:
        # Without a light the planner has no opinion about where shadows land, and
        # must behave exactly as it did before that measurement existed.
        _slab, _nub, joined = make_slab_with_nub(nub_y=-0.25)
        weights, collapse = A.plan_shadow_shrink(joined.data)
        self.assertEqual(collapse, [], "thickness alone collapses neither part here")
        nub = nub_island(joined)
        slab = [i for i in range(len(joined.data.vertices)) if i not in set(nub)]
        self.assertTrue(all(weights[i] >= 1.0 for i in slab), "the slab is a mass")
        self.assertTrue(all(0.0 < weights[i] < 1.0 for i in nub), "the nub is a part on it")

    def test_part_whose_shadow_lands_far_across_the_character_stops_casting(self) -> None:
        # The nub sits on the slab at the edge the light comes from, and the light
        # runs nearly along the slab's face, so the nub's shadow is drawn out across
        # the whole face: this is Pip's beak and Pip's chest.
        _slab, _nub, joined = make_slab_with_nub(nub_y=-0.25)
        light = RAKING_LIGHT
        weights, collapse = A.plan_shadow_shrink(joined.data, light=light)
        nub = nub_island(joined)
        self.assertIn(nub, [sorted(c) for c in collapse])
        self.assertTrue(all(weights[i] == 0.0 for i in nub), "a dropped part must not displace either")

    def test_that_part_measures_as_a_far_landing_self_shadow(self) -> None:
        _slab, _nub, joined = make_slab_with_nub(nub_y=-0.25)
        share, reach = measure_nub(joined, RAKING_LIGHT)
        self.assertGreaterEqual(share, A.SHADOW_PROXY_SELF_SHARE, "its shadow lands on the character")
        self.assertGreater(reach, A.SHADOW_PROXY_SELF_REACH, "and further away than the part is wide")

    def test_part_whose_shadow_reaches_the_set_keeps_casting(self) -> None:
        # Same nub, moved to the far edge, so the light carries its shadow off the
        # character instead of along it. That shadow is the character's own and has
        # to survive: Pip's wings and the Goat's horns are this case.
        _slab, _nub, joined = make_slab_with_nub(nub_y=0.25)
        weights, collapse = A.plan_shadow_shrink(joined.data, light=RAKING_LIGHT)
        nub = nub_island(joined)
        self.assertNotIn(nub, [sorted(c) for c in collapse])
        self.assertTrue(all(weights[i] > 0.0 for i in nub))
        share, reach = measure_nub(joined, RAKING_LIGHT)
        self.assertLess(share, A.SHADOW_PROXY_SELF_SHARE, "most of what it blocks reaches the set")
        self.assertGreater(reach, A.SHADOW_PROXY_SELF_REACH, "and distance alone did not keep it")

    def test_a_mass_keeps_casting_however_far_its_shadow_reaches(self) -> None:
        # A body necessarily shadows the parts of itself that face away from the
        # sun, and over a distance larger than its own width. Dropping it would
        # take the character's shadow with it, so room for the whole shrink is
        # enough on its own to keep a part in the caster.
        _slab, _nub, joined = make_slab_with_nub(nub_y=-0.25)
        weights, _collapse = A.plan_shadow_shrink(joined.data, light=RAKING_LIGHT)
        slab = [i for i in range(len(joined.data.vertices)) if i not in set(nub_island(joined))]
        self.assertTrue(all(weights[i] >= 1.0 for i in slab), "the mass keeps the full shrink")

    def test_key_light_direction_comes_from_the_lighting_state(self) -> None:
        for state in A.LIGHTING_STATES:
            direction = A.key_light_direction(state)
            self.assertAlmostEqual(direction.length, 1.0, places=6)
            self.assertLess(direction.z, 0.0, f"{state}: a key light shines downward")
        # The state the acceptance shot is graded on, as the assembled scene reports it.
        day_key = A.key_light_direction("DAY_KEY")
        for value, expected in zip(day_key, (-0.322, 0.5277, -0.786)):
            self.assertAlmostEqual(value, expected, places=3)
        self.assertEqual(
            tuple(round(c, 6) for c in A.key_light_direction("NOT_A_STATE")),
            tuple(round(c, 6) for c in A.key_light_direction(A.DEFAULT_LIGHTING_STATE)),
        )

    def test_facial_detail_leaves_the_caster_and_the_feet_stay_in_it(self) -> None:
        # The rule has to hold on the asset it was written for, not only on
        # fixtures: Pip's beak stops casting, and the feet - which is where the
        # ground contact comes from - do not.
        blend = REPO_ROOT / "production-library/characters/pip_production.blend"
        if not blend.exists():
            self.skipTest("Pip's production blend is not available")
        bpy.ops.wm.open_mainfile(filepath=str(blend))
        mesh = bpy.data.objects["Pip_Character"]
        materials = [s.material.name if s.material else "" for s in mesh.material_slots]
        weights, _collapse = A.plan_shadow_shrink(mesh.data, light=A.key_light_direction("DAY_KEY"))

        # Per island, not per material: the beak is two islands and only the large
        # one throws the band, so a per-material answer would hide the result.
        parts: list[tuple[str, int, bool]] = []
        for comp in A.mesh_islands(mesh.data):
            member = set(comp)
            used = sorted(
                {
                    materials[p.material_index]
                    for p in mesh.data.polygons
                    if all(v in member for v in p.vertices)
                }
            )
            parts.append((used[0] if used else "", len(comp), weights[comp[0]] > 0.0))

        def casting(name: str, verts: int) -> bool:
            matches = [casts for part, count, casts in parts if part == name and count == verts]
            self.assertTrue(matches, f"no {name} island with {verts} vertices")
            return any(matches)

        self.assertFalse(casting("PipBeak", 200), "the beak still casts the band down the chest")
        self.assertTrue(casting("PipBody", 392), "the masses carry the character's shadow")
        self.assertTrue(casting("PipBody", 262), "the wings shadow the meadow beside Pip")
        for verts in (48, 86, 52):
            self.assertTrue(casting("PipFeet", verts), "the feet carry the ground contact")
        for detail, verts in (("PipEyeWhite", 200), ("PipIris", 200), ("PipComb", 178), ("PipCatchlight", 52)):
            self.assertFalse(casting(detail, verts), f"{detail} still casts across the character")

    def test_collapsed_part_holds_its_collapse_in_every_shape_key(self) -> None:
        bpy.ops.mesh.primitive_plane_add(size=0.1)
        plane = bpy.context.object
        plane.shape_key_add(name="Basis", from_mix=False)
        key = plane.shape_key_add(name="expr", from_mix=False)
        for point in key.data:
            point.co.z += 0.05
        created = A.install_shadow_proxy([plane])
        proxy = bpy.data.objects[created[0]]
        for block in proxy.data.shape_keys.key_blocks:
            spread = max((p.co - block.data[0].co).length for p in block.data)
            self.assertLess(spread, 1e-6, f"{block.name} springs the collapsed part back into the caster")


class DirectionConsumerTests(unittest.TestCase):
    """Milestone 3 consumers are opt-in and must not change a shot without direction."""

    def setUp(self) -> None:
        fresh_scene()

    def test_every_direction_consumer_noops_without_a_direction_block(self) -> None:
        scene = bpy.context.scene
        empty_roles: dict = {}
        self.assertFalse(A.apply_direction_camera(scene, None)["applied"])
        self.assertFalse(A.apply_direction_lighting(scene, None)["applied"])
        self.assertFalse(A.apply_direction_acting(empty_roles, None, 1, 30, 30)["applied"])
        self.assertFalse(A.apply_direction_emotion(empty_roles, None, 1, 30, 30)["applied"])
        self.assertFalse(A.apply_direction_face(empty_roles, None, 30)["applied"])
        self.assertFalse(A.apply_direction_vfx(empty_roles, None, 1, 30, 30)["applied"])

    def test_direction_lighting_does_not_retune_key_fill_rim(self) -> None:
        scene = bpy.context.scene
        before = {name: dict(A.LIGHTING_STATES[name]["key"]) for name in A.LIGHTING_STATES}
        A.apply_direction_lighting(
            scene,
            {
                "lighting": {
                    "recipe": "MEADOW_DAY_KEY",
                    "exposure": 0,
                    "viewTransform": "Khronos PBR Neutral",
                    "look": "None",
                    "practicals": [],
                }
            },
        )
        for name, key in before.items():
            self.assertEqual(A.LIGHTING_STATES[name]["key"], key)

    def test_direction_vfx_is_seeded_and_casts_no_shadow(self) -> None:
        first = A.apply_direction_vfx(
            {},
            {
                "vfx": [
                    {
                        "instanceId": "spark_a",
                        "presetId": "vfx_magic_sparkles_v1",
                        "seed": 42,
                        "startMs": 0,
                        "durationMs": 400,
                        "intensity": 0.4,
                        "particleCount": 8,
                        "anchor": {"kind": "WORLD", "ref": "origin"},
                        "boundsMeters": {"x": 0.4, "y": 0.4, "z": 0.4},
                        "palette": ["#FFE9A8"],
                        "layer": "AROUND_SUBJECT",
                    }
                ]
            },
            1,
            30,
            30,
        )
        names = [obj.name for obj in bpy.data.objects if obj.name.startswith(A.DDP_VFX_PREFIX)]
        self.assertTrue(first["applied"])
        self.assertGreater(len(names), 0)
        for name in names:
            obj = bpy.data.objects[name]
            self.assertFalse(obj.visible_shadow)
        # Same seed, same instance id: the consumer refuses to duplicate.
        second = A.apply_direction_vfx(
            {},
            {
                "vfx": [
                    {
                        "instanceId": "spark_a",
                        "presetId": "vfx_magic_sparkles_v1",
                        "seed": 42,
                        "startMs": 0,
                        "durationMs": 400,
                        "intensity": 0.4,
                        "particleCount": 8,
                        "anchor": {"kind": "WORLD", "ref": "origin"},
                        "boundsMeters": {"x": 0.4, "y": 0.4, "z": 0.4},
                        "palette": ["#FFE9A8"],
                        "layer": "AROUND_SUBJECT",
                    }
                ]
            },
            1,
            30,
            30,
        )
        self.assertEqual(len(second["instances"]), 0)

    def test_facial_cues_drive_shape_keys_not_geometry(self) -> None:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.3)
        mesh = bpy.context.object
        mesh.name = "Pip_Character"
        mesh.shape_key_add(name="Basis", from_mix=False)
        blink = mesh.shape_key_add(name="blink", from_mix=False)
        blink.data[0].co.z += 0.01
        applied = A.apply_facial_cues(
            mesh,
            [{"channel": "blink", "startMs": 0, "endMs": 120, "weight": 0.8, "source": "BLINK"}],
            30,
        )
        self.assertEqual(applied, 1)
        self.assertIsNotNone(mesh.data.shape_keys.animation_data)


def main() -> int:
    loader = unittest.TestLoader()
    suite = unittest.TestSuite(
        loader.loadTestsFromTestCase(case)
        for case in (
            SkinningTests,
            AnimationTests,
            LightingTests,
            HierarchyTests,
            ActionBindingTests,
            ShadowCasterTests,
            DirectionConsumerTests,
        )
    )
    result = unittest.TextTestRunner(verbosity=2, stream=sys.stdout).run(suite)
    print(
        f"DDP_RIG_TESTS:{{\"tests\": {result.testsRun}, "
        f"\"failures\": {len(result.failures)}, \"errors\": {len(result.errors)}}}"
    )
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
