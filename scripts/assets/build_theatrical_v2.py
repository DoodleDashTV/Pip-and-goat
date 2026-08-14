"""Build proposed theatrical v2 Pip and Goat sculpts from scratch.

First visual gate only: new meshes + basic color. No retopo, groom cards,
rigging, or production binding. Never writes production-library/.
Never imports v1 / v1.1 character blends or rejected GLB blockouts.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "assets"))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from theatrical_v2_common import (  # noqa: E402
    GOAT_CINNAMON,
    GOAT_CREAM,
    GOAT_EAR_IN,
    GOAT_HAZEL,
    GOAT_HORN,
    GOAT_OAT,
    GOAT_ORANGE,
    GOAT_PLUM,
    GOAT_TEAL,
    PIP_BEAK,
    PIP_BELLY,
    PIP_CINNAMON,
    PIP_COPPER,
    PIP_CORAL,
    PIP_LIME,
    PIP_MOUTH,
    PIP_TAIL,
    PIP_TEAL,
    PIP_TEAL_DEEP,
    PROPOSED_V2,
    REFS_V2,
    apply_all,
    assert_not_production_library,
    assign,
    bounds,
    cloth_mat,
    fuzz_mat,
    lathe,
    leaf_feather,
    lid_crescent,
    limb,
    metal_mat,
    new_mesh,
    place,
    pretty_eye,
    principled_mat,
    reset_scene,
    split_hoof,
    subdiv,
)


def save_blend(path: Path):
    assert_not_production_library(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))


def paint_faces(obj, mat, predicate):
    if mat.name not in [m.name for m in obj.data.materials]:
        obj.data.materials.append(mat)
    idx = list(obj.data.materials).index(mat)
    obj.data.update()
    for poly in obj.data.polygons:
        center = Vector((0, 0, 0))
        for vi in poly.vertices:
            center += obj.data.vertices[vi].co
        center /= max(1, len(poly.vertices))
        if predicate(center, poly.normal):
            poly.material_index = idx


def bird_foot(prefix, loc, side=1.0):
    ankle = bpy.ops.mesh.primitive_cylinder_add(
        vertices=12, radius=0.016, depth=0.11, location=(loc[0], loc[1], loc[2] + 0.06)
    )
    ankle = bpy.context.object
    ankle.name = f"{prefix}_leg"
    apply_all(ankle)
    assign(ankle, fuzz_mat(f"{prefix}_leg_mat", PIP_CINNAMON, roughness=0.58, subsurface=0.08, sheen=0.1))

    toes = []
    # three forward, one back
    dirs = [(0.034, -0.046), (0.0, -0.052), (-0.034, -0.046), (0.0, 0.028)]
    for i, (dx, dy) in enumerate(dirs):
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=10,
            ring_count=6,
            radius=0.013,
            location=(loc[0] + dx * side, loc[1] + dy, loc[2] + 0.012),
        )
        toe = bpy.context.object
        toe.name = f"{prefix}_toe_{i}"
        toe.scale = (0.7, 1.6, 0.45)
        apply_all(toe)
        assign(toe, principled_mat(f"{prefix}_toe_{i}_mat", PIP_CINNAMON, roughness=0.5))
        toes.append(toe)
    return [ankle, *toes]


def spiral_badge(name, loc):
    verts = []
    faces = []
    turns = 2.4
    steps = 36
    for i in range(steps):
        t = i / (steps - 1)
        ang = t * turns * math.tau
        r = 0.006 + 0.018 * t
        x = r * math.cos(ang)
        y = r * math.sin(ang)
        z = 0.004
        verts.append((x, y, z))
        verts.append((x, y, -z))
        if i:
            a = (i - 1) * 2
            b = i * 2
            faces.append((a, b, b + 1, a + 1))
    obj = new_mesh(name, verts, faces)
    place(obj, loc=loc, rot=(math.radians(90), 0, 0))
    assign(obj, metal_mat(f"{name}_mat", PIP_COPPER))
    return obj


def build_pip():
    reset_scene()
    objs = []

    # Continuous pear / teardrop: body through neck into a large head.
    body = lathe(
        "Pip_Body",
        [
            (0.055, 0.20),
            (0.125, 0.25),
            (0.180, 0.34),
            (0.215, 0.42),
            (0.200, 0.52),
            (0.158, 0.60),
            (0.102, 0.65),
            (0.060, 0.695),
            (0.080, 0.735),
            (0.138, 0.79),
            (0.162, 0.87),
            (0.152, 0.95),
            (0.112, 1.01),
            (0.052, 1.045),
            (0.012, 1.06),
        ],
        segments=56,
        flatten_y=0.88,
        scallop=0.022,
        scallop_freq=8,
    )
    subdiv(body, 2)
    assign(body, fuzz_mat("Pip_Lime", PIP_LIME, roughness=0.50, subsurface=0.20, sheen=0.42))
    belly = fuzz_mat("Pip_Belly", PIP_BELLY, roughness=0.48, subsurface=0.22, sheen=0.36)
    paint_faces(
        body,
        belly,
        lambda c, n: c.y < -0.01 and ((0.26 < c.z < 0.64) or (0.76 < c.z < 0.98 and abs(c.x) < 0.10)),
    )
    objs.append(body)

    # Explicit curved beak pointing toward camera (-Y). Upper and lower are separate.
    beak_u = new_mesh(
        "Pip_BeakUpper",
        [
            (0.042, -0.08, 0.890),
            (-0.042, -0.08, 0.890),
            (0.036, -0.08, 0.848),
            (-0.036, -0.08, 0.848),
            (0.028, -0.16, 0.872),
            (-0.028, -0.16, 0.872),
            (0.018, -0.16, 0.838),
            (-0.018, -0.16, 0.838),
            (0.000, -0.24, 0.848),
        ],
        [
            (0, 1, 5, 4),
            (2, 6, 7, 3),
            (0, 4, 6, 2),
            (1, 3, 7, 5),
            (4, 5, 8),
            (6, 8, 7),
            (4, 8, 6),
            (5, 7, 8),
        ],
    )
    subdiv(beak_u, 1)
    assign(beak_u, principled_mat("Pip_BeakU", PIP_BEAK, roughness=0.36, specular=0.30, coat=0.10))
    beak_l = new_mesh(
        "Pip_BeakLower",
        [
            (0.032, -0.08, 0.842),
            (-0.032, -0.08, 0.842),
            (0.026, -0.08, 0.812),
            (-0.026, -0.08, 0.812),
            (0.000, -0.21, 0.818),
        ],
        [(0, 1, 4), (2, 4, 3), (0, 4, 2), (1, 3, 4)],
    )
    subdiv(beak_l, 1)
    assign(beak_l, principled_mat("Pip_BeakL", PIP_BEAK, roughness=0.40, specular=0.24))
    mouth = new_mesh(
        "Pip_Mouth",
        [
            (0.018, -0.10, 0.844),
            (-0.018, -0.10, 0.844),
            (0.010, -0.19, 0.828),
            (-0.010, -0.19, 0.828),
        ],
        [(0, 1, 3, 2)],
    )
    assign(mouth, principled_mat("Pip_MouthMat", PIP_MOUTH, roughness=0.55))
    objs.extend([beak_u, beak_l, mouth])

    eyes = []
    for side, x in (("L", 0.062), ("R", -0.062)):
        stack = pretty_eye(f"Pip_Eye_{side}", (x, -0.125, 0.878), 0.052, PIP_TEAL_DEEP)
        lid_u = lid_crescent(f"Pip_LidU_{side}", (x, -0.125, 0.878), 0.052, True)
        lid_d = lid_crescent(f"Pip_LidD_{side}", (x, -0.125, 0.878), 0.052, False)
        subdiv(lid_u, 1)
        subdiv(lid_d, 1)
        assign(lid_u, fuzz_mat(f"Pip_LidU_{side}_mat", PIP_LIME, roughness=0.5, sheen=0.3))
        assign(lid_d, fuzz_mat(f"Pip_LidD_{side}_mat", PIP_BELLY, roughness=0.5, sheen=0.3))
        for j, ox in enumerate((-0.016, 0.0, 0.016)):
            lash = leaf_feather(f"Pip_Lash_{side}_{j}", length=0.026, width=0.0035, thick=0.002, segs=6)
            place(
                lash,
                loc=(x + ox, -0.168, 0.922),
                rot=(math.radians(-28), 0, math.radians(12 * (1 if x > 0 else -1))),
            )
            assign(lash, principled_mat(f"Pip_Lash_{side}_{j}_mat", (0.05, 0.06, 0.07), roughness=0.35))
            eyes.append(lash)
        eyes.extend(stack + [lid_u, lid_d])
    objs.extend(eyes)

    # Three large coral crown feathers, fan, sweeping back.
    for i, (x, yaw, roll, length) in enumerate(
        ((-0.06, 28, -16, 0.24), (0.0, 0, 0, 0.26), (0.06, -28, 16, 0.24))
    ):
        feather = leaf_feather(f"Pip_Crown_{i}", length=length, width=0.062, thick=0.016, segs=12)
        place(
            feather,
            loc=(x, 0.00, 1.03),
            rot=(math.radians(-28), math.radians(roll), math.radians(yaw)),
        )
        assign(feather, fuzz_mat(f"Pip_Crown_{i}_mat", PIP_CORAL, roughness=0.42, subsurface=0.14, sheen=0.28))
        objs.append(feather)

    # Layered leaf wings, hanging relaxed — not a T-pose.
    for side, sx in (("L", 1.0), ("R", -1.0)):
        for k, (drop, back, flare, length, width) in enumerate(
            (
                (0.02, 0.00, 8, 0.24, 0.07),
                (0.00, 0.025, 0, 0.26, 0.075),
                (-0.035, 0.04, -10, 0.23, 0.065),
                (-0.07, 0.05, -16, 0.19, 0.055),
            )
        ):
            wing = leaf_feather(f"Pip_Wing_{side}_{k}", length=length, width=width, thick=0.013, segs=12)
            place(
                wing,
                loc=(0.175 * sx, 0.04 + back, 0.54 + drop),
                rot=(math.radians(95), math.radians(18 * sx), math.radians(8 * sx + flare * sx)),
            )
            assign(wing, fuzz_mat(f"Pip_Wing_{side}_{k}_mat", PIP_LIME, roughness=0.48, sheen=0.4))
            objs.append(wing)

    # Tail fan
    for i, x in enumerate((-0.03, 0.0, 0.03)):
        tail = leaf_feather(f"Pip_Tail_{i}", length=0.10, width=0.028, thick=0.01, segs=8)
        place(tail, loc=(x, 0.14, 0.30), rot=(math.radians(55), 0, math.radians(x * 80)))
        assign(tail, fuzz_mat(f"Pip_Tail_{i}_mat", PIP_TAIL, roughness=0.45, sheen=0.3))
        objs.append(tail)

    objs.extend(bird_foot("Pip_L", (0.055, 0.01, 0.0), 1.0))
    objs.extend(bird_foot("Pip_R", (-0.055, 0.01, 0.0), -1.0))

    # Teal neckerchief
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.078, minor_radius=0.018, major_segments=28, minor_segments=10, location=(0, -0.01, 0.685)
    )
    kerchief = bpy.context.object
    kerchief.name = "Pip_Neckerchief"
    kerchief.scale = (1.05, 0.85, 0.72)
    apply_all(kerchief)
    assign(kerchief, cloth_mat("Pip_NeckerchiefMat", PIP_TEAL))
    knot = bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.022, location=(0, -0.085, 0.668))
    knot = bpy.context.object
    knot.name = "Pip_NeckerchiefKnot"
    knot.scale = (1.1, 0.7, 0.7)
    apply_all(knot)
    assign(knot, cloth_mat("Pip_NeckerchiefKnotMat", PIP_TEAL))
    objs.extend([kerchief, knot])

    # Teal cross-body satchel: left shoulder to right hip.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=0.09, location=(0.10, -0.08, 0.38))
    bag = bpy.context.object
    bag.name = "Pip_Satchel"
    bag.scale = (1.05, 0.72, 0.85)
    apply_all(bag)
    subdiv(bag, 1)
    assign(bag, cloth_mat("Pip_SatchelMat", PIP_TEAL))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.07, location=(0.11, -0.12, 0.43))
    flap = bpy.context.object
    flap.name = "Pip_SatchelFlap"
    flap.scale = (1.05, 0.35, 0.70)
    apply_all(flap)
    assign(flap, cloth_mat("Pip_SatchelFlapMat", (0.08, 0.40, 0.40)))
    strap = limb("Pip_SatchelStrap", (0.12, 0.04, 0.66), (-0.02, -0.06, 0.34), 0.014, 0.012, segs=10)
    assign(strap, cloth_mat("Pip_SatchelStrapMat", PIP_TEAL))
    badge = spiral_badge("Pip_SpiralBadge", (0.12, -0.14, 0.42))
    objs.extend([bag, flap, strap, badge])

    for obj in objs:
        obj["ddp_label"] = "PROPOSED_UNAPPROVED_V2"
        obj["ddp_character"] = "CHAR_PIP_001"
    bpy.context.scene["ddp_proposal"] = "theatrical_v2_pip"
    bpy.context.scene["ddp_approved"] = False

    path = PROPOSED_V2 / "pip_theatrical_v2.blend"
    save_blend(path)
    return path, list(bpy.data.objects)


def ridged_horn(name, loc, sweep=-0.55, side=1.0):
    profile = []
    ridges = 7
    for i in range(18):
        t = i / 17
        z = t * 0.16
        r = 0.030 * (1 - t) + 0.008 * t
        r *= 1.0 + 0.20 * math.sin(t * ridges * math.tau) * (1 - t * 0.35)
        profile.append((r, z))
    horn = lathe(name, profile, segments=24, flatten_y=1.0, scallop=0.0)
    horn.location = loc
    horn.rotation_euler = (sweep, 0.12 * side, 0.18 * side)
    apply_all(horn)
    subdiv(horn, 1)
    assign(horn, principled_mat(f"{name}_mat", GOAT_HORN, roughness=0.48, specular=0.18))
    return horn


def floppy_ear(name, loc, side=1.0):
    ear = lathe(
        name,
        [
            (0.016, 0.00),
            (0.048, 0.03),
            (0.058, 0.08),
            (0.052, 0.16),
            (0.038, 0.24),
            (0.022, 0.30),
            (0.008, 0.34),
        ],
        segments=20,
        flatten_y=0.38,
    )
    ear.location = loc
    ear.rotation_euler = (math.radians(118), math.radians(6 * side), math.radians(12 * side))
    apply_all(ear)
    subdiv(ear, 1)
    assign(ear, fuzz_mat(f"{name}_mat", GOAT_OAT, roughness=0.55, sheen=0.4))
    inner = fuzz_mat(f"{name}_inner", GOAT_EAR_IN, roughness=0.5, sheen=0.2)
    paint_faces(ear, inner, lambda c, n: n.y < -0.1)
    return ear


def build_goat():
    reset_scene()
    objs = []

    # Continuous bean torso into a large childlike head. Not two spheres.
    body = lathe(
        "Goat_Body",
        [
            (0.080, 0.38),
            (0.160, 0.48),
            (0.210, 0.62),
            (0.228, 0.76),
            (0.210, 0.90),
            (0.160, 1.00),
            (0.098, 1.07),
            (0.080, 1.13),
            (0.132, 1.20),
            (0.175, 1.30),
            (0.178, 1.40),
            (0.148, 1.50),
            (0.082, 1.56),
            (0.018, 1.60),
        ],
        segments=56,
        flatten_y=0.78,
        scallop=0.018,
        scallop_freq=6,
    )
    subdiv(body, 2)
    assign(body, fuzz_mat("Goat_Oat", GOAT_OAT, roughness=0.54, subsurface=0.18, sheen=0.44))
    cream = fuzz_mat("Goat_Cream", GOAT_CREAM, roughness=0.52, subsurface=0.20, sheen=0.36)
    paint_faces(body, cream, lambda c, n: c.y < -0.02 and 0.50 < c.z < 1.08)
    objs.append(body)

    # Soft cinnamon blobs instead of a rectangular face cut.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=0.075, location=(0.08, -0.12, 1.36))
    patch = bpy.context.object
    patch.name = "Goat_EyePatch"
    patch.scale = (1.15, 0.55, 1.05)
    apply_all(patch)
    subdiv(patch, 1)
    assign(patch, fuzz_mat("Goat_Cinnamon", GOAT_CINNAMON, roughness=0.55, sheen=0.3))
    for i, sx in enumerate((1.0, -1.0)):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.06, location=(0.14 * sx, 0.04, 0.96))
        sh = bpy.context.object
        sh.name = f"Goat_ShoulderPatch_{i}"
        sh.scale = (1.2, 0.7, 0.8)
        apply_all(sh)
        assign(sh, fuzz_mat(f"Goat_ShoulderPatch_{i}_mat", GOAT_CINNAMON, roughness=0.55, sheen=0.3))
        objs.append(sh)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.035, location=(0.0, 0.14, 0.54))
    back_p = bpy.context.object
    back_p.name = "Goat_BackPatch"
    back_p.scale = (0.7, 0.9, 1.2)
    apply_all(back_p)
    assign(back_p, fuzz_mat("Goat_BackPatchMat", GOAT_CINNAMON, roughness=0.55, sheen=0.3))
    objs.extend([patch, back_p])

    muzzle = lathe(
        "Goat_Muzzle",
        [
            (0.062, 0.00),
            (0.070, 0.035),
            (0.055, 0.08),
            (0.030, 0.12),
            (0.010, 0.14),
        ],
        segments=28,
        flatten_y=0.70,
    )
    place(muzzle, loc=(0.0, -0.16, 1.25), rot=(math.radians(80), 0, 0))
    subdiv(muzzle, 1)
    assign(muzzle, fuzz_mat("Goat_MuzzleMat", GOAT_CREAM, roughness=0.5, sheen=0.25))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=0.036, location=(0.0, -0.255, 1.265))
    nose = bpy.context.object
    nose.name = "Goat_Nose"
    nose.scale = (1.20, 0.72, 0.68)
    apply_all(nose)
    subdiv(nose, 1)
    assign(nose, principled_mat("Goat_NoseMat", GOAT_PLUM, roughness=0.36, specular=0.30, subsurface=0.14))
    objs.extend([muzzle, nose])

    eyes = []
    for side, x in (("L", 0.068), ("R", -0.068)):
        stack = pretty_eye(f"Goat_Eye_{side}", (x, -0.150, 1.37), 0.056, GOAT_HAZEL)
        lid_u = lid_crescent(f"Goat_LidU_{side}", (x, -0.150, 1.37), 0.056, True)
        lid_d = lid_crescent(f"Goat_LidD_{side}", (x, -0.150, 1.37), 0.056, False)
        subdiv(lid_u, 1)
        subdiv(lid_d, 1)
        assign(lid_u, fuzz_mat(f"Goat_LidU_{side}_mat", GOAT_OAT, sheen=0.3))
        assign(lid_d, fuzz_mat(f"Goat_LidD_{side}_mat", GOAT_CREAM, sheen=0.3))
        for j, ox in enumerate((-0.018, 0.0, 0.018)):
            lash = leaf_feather(f"Goat_Lash_{side}_{j}", length=0.028, width=0.0035, thick=0.002, segs=6)
            place(lash, loc=(x + ox, -0.198, 1.418), rot=(math.radians(-26), 0, 0))
            assign(lash, principled_mat(f"Goat_Lash_{side}_{j}_mat", (0.08, 0.05, 0.04), roughness=0.35))
            eyes.append(lash)
        eyes.extend(stack + [lid_u, lid_d])
    objs.extend(eyes)

    # Exactly two horns, centered and rooted, ridged, sweeping back.
    objs.append(ridged_horn("Goat_Horn_L", (0.038, 0.02, 1.50), sweep=-0.62, side=1.0))
    objs.append(ridged_horn("Goat_Horn_R", (-0.038, 0.02, 1.50), sweep=-0.62, side=-1.0))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.03, location=(0.0, 0.01, 1.52))
    tuft = bpy.context.object
    tuft.name = "Goat_HeadTuft"
    tuft.scale = (0.9, 0.7, 0.55)
    apply_all(tuft)
    assign(tuft, fuzz_mat("Goat_TuftMat", GOAT_OAT, sheen=0.45))
    objs.append(tuft)

    objs.append(floppy_ear("Goat_Ear_L", (0.14, 0.02, 1.34), 1.0))
    objs.append(floppy_ear("Goat_Ear_R", (-0.14, 0.02, 1.34), -1.0))

    for side, sx in (("L", 1.0), ("R", -1.0)):
        arm = limb(f"Goat_Arm_{side}", (0.16 * sx, 0.02, 0.92), (0.26 * sx, -0.04, 0.62), 0.042, 0.030)
        subdiv(arm, 1)
        assign(arm, fuzz_mat(f"Goat_Arm_{side}_mat", GOAT_OAT, sheen=0.4))
        hoof = split_hoof(f"Goat_Hand_{side}", (0.26 * sx, -0.04, 0.58), 0.036)
        objs.extend([arm, hoof])

    for side, sx in (("L", 1.0), ("R", -1.0)):
        leg = limb(f"Goat_Leg_{side}", (0.09 * sx, 0.02, 0.40), (0.09 * sx, 0.02, 0.06), 0.052, 0.038)
        subdiv(leg, 1)
        assign(leg, fuzz_mat(f"Goat_Leg_{side}_mat", GOAT_OAT, sheen=0.35))
        hoof = split_hoof(f"Goat_Foot_{side}", (0.09 * sx, 0.02, 0.035), 0.048)
        objs.extend([leg, hoof])

    tail = lathe(
        "Goat_Tail",
        [(0.018, 0.0), (0.028, 0.02), (0.022, 0.05), (0.010, 0.07)],
        segments=12,
    )
    place(tail, loc=(0.0, 0.16, 0.50), rot=(math.radians(-40), 0, 0))
    assign(tail, fuzz_mat("Goat_TailMat", GOAT_OAT, sheen=0.4))
    objs.append(tail)

    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.095, minor_radius=0.022, major_segments=28, minor_segments=10, location=(0, -0.02, 1.08)
    )
    kerchief = bpy.context.object
    kerchief.name = "Goat_Neckerchief"
    kerchief.scale = (1.05, 0.82, 0.70)
    apply_all(kerchief)
    assign(kerchief, cloth_mat("Goat_NeckerchiefMat", GOAT_ORANGE))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.02, location=(0, 0.08, 1.06))
    knot = bpy.context.object
    knot.name = "Goat_NeckerchiefKnot"
    apply_all(knot)
    assign(knot, cloth_mat("Goat_NeckerchiefKnotMat", GOAT_ORANGE))
    objs.extend([kerchief, knot])

    # Teal compass charm
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.028, depth=0.008, location=(0.0, -0.12, 1.00))
    compass = bpy.context.object
    compass.name = "Goat_Compass"
    compass.rotation_euler = (math.radians(90), 0, 0)
    apply_all(compass)
    assign(compass, metal_mat("Goat_CompassMat", GOAT_TEAL, metallic=0.35, roughness=0.28))
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.030, minor_radius=0.004, major_segments=20, minor_segments=8, location=(0.0, -0.12, 1.00)
    )
    rim = bpy.context.object
    rim.name = "Goat_CompassRim"
    rim.rotation_euler = (math.radians(90), 0, 0)
    apply_all(rim)
    assign(rim, metal_mat("Goat_CompassRimMat", PIP_COPPER, metallic=0.7))
    star = new_mesh(
        "Goat_CompassStar",
        [
            (0.0, 0.0, 0.0),
            (0.0, 0.016, 0.0),
            (0.006, 0.004, 0.0),
            (0.016, 0.0, 0.0),
            (0.006, -0.004, 0.0),
            (0.0, -0.016, 0.0),
            (-0.006, -0.004, 0.0),
            (-0.016, 0.0, 0.0),
            (-0.006, 0.004, 0.0),
        ],
        [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 5), (0, 5, 6), (0, 6, 7), (0, 7, 8), (0, 8, 1)],
    )
    place(star, loc=(0.0, -0.125, 1.00), rot=(math.radians(90), 0, 0))
    assign(star, metal_mat("Goat_StarMat", (0.90, 0.72, 0.22), metallic=0.75, roughness=0.28))
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.003, depth=0.06, location=(0.0, -0.10, 1.04))
    cord = bpy.context.object
    cord.name = "Goat_CompassCord"
    apply_all(cord)
    assign(cord, principled_mat("Goat_CordMat", (0.08, 0.06, 0.05), roughness=0.7))
    objs.extend([compass, rim, star, cord])

    for obj in objs:
        obj["ddp_label"] = "PROPOSED_UNAPPROVED_V2"
        obj["ddp_character"] = "CHAR_GOAT_001"
    bpy.context.scene["ddp_proposal"] = "theatrical_v2_goat"
    bpy.context.scene["ddp_approved"] = False

    path = PROPOSED_V2 / "goat_theatrical_v2.blend"
    save_blend(path)
    return path, list(bpy.data.objects)


def measure(who, objs):
    mesh_objs = [o for o in objs if o.type == "MESH"]
    mins, maxs = bounds(mesh_objs)
    height = float(maxs.z - mins.z)
    names = [o.name for o in mesh_objs]
    verts = sum(len(o.data.vertices) for o in mesh_objs)
    polys = sum(len(o.data.polygons) for o in mesh_objs)
    eye_r = 0.052 if who == "pip" else 0.056
    return {
        "height": round(height, 4),
        "verts": verts,
        "polys": polys,
        "objectCount": len(mesh_objs),
        "eyeWhiteRadius": eye_r,
        "hasOldPurpleBackpack": any("backpack" in n.lower() and "satchel" not in n.lower() for n in names),
        "hasGoldStarBackpack": any("gold" in n.lower() and "star" in n.lower() and "compass" not in n.lower() for n in names),
        "hasBlueCollar": any("collar" in n.lower() for n in names),
        "hasGoatTag": any(n.lower() == "goat_tag" or n.endswith("_Tag") for n in names),
        "hornCount": sum(1 for n in names if "Horn" in n),
        "satchel": any("Satchel" in n for n in names),
        "neckerchief": any("Neckerchief" in n for n in names),
        "compass": any("Compass" in n for n in names),
        "voxelRemesh": False,
        "groomCards": False,
        "objects": names,
    }


def main():
    PROPOSED_V2.mkdir(parents=True, exist_ok=True)
    REFS_V2.mkdir(parents=True, exist_ok=True)
    TEXTURES = PROPOSED_V2 / "textures"
    TEXTURES.mkdir(parents=True, exist_ok=True)

    pip_path, pip_objs = build_pip()
    pip_m = measure("pip", pip_objs)
    goat_path, goat_objs = build_goat()
    goat_m = measure("goat", goat_objs)
    scale = goat_m["height"] / max(1e-6, pip_m["height"])

    manifest = {
        "label": "proposed theatrical v2",
        "approved": False,
        "productionLibraryMutated": False,
        "voxelRemesh": False,
        "groomCards": False,
        "importedRejectedGlb": False,
        "importedV11Meshes": False,
        "retopo": False,
        "rigged": False,
        "characterIds": {"pip": "CHAR_PIP_001", "goat": "CHAR_GOAT_001"},
        "bindingsUnchanged": True,
        "pip": {
            "path": str(pip_path.relative_to(REPO_ROOT)),
            **pip_m,
            "approved": False,
            "label": "PROPOSED UNAPPROVED V2",
        },
        "goat": {
            "path": str(goat_path.relative_to(REPO_ROOT)),
            **goat_m,
            "approved": False,
            "label": "PROPOSED UNAPPROVED V2",
        },
        "characterToCharacterScale": round(scale, 4),
        "notes": "First visual gate sculpt. Stopped before retopo, groom, and rig.",
    }
    out = PROPOSED_V2 / "BUILD_MANIFEST.json"
    assert_not_production_library(out)
    out.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
