"""Build proposed theatrical v1.1 assets outside production-library/.

No voxel remesh of characters. No rectangular groom cards.
Canonical appeal is the identity reference.

  blender -b -noaudio --python scripts/assets/build_theatrical_v11.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "assets"))

import bpy  # noqa: E402

from theatrical_v11_common import (  # noqa: E402
    GOAT_APPEAL,
    GOAT_COLLAR,
    GOAT_CREAM,
    GOAT_EAR_IN,
    GOAT_HOOF,
    GOAT_HORN,
    GOAT_IRIS,
    GOAT_NOSE,
    GOAT_TAG,
    PIP_APPEAL,
    PIP_BEAK,
    PIP_COMB,
    PIP_FEET,
    PIP_GOLD,
    PIP_IRIS,
    PIP_PURPLE,
    PIP_STRAP,
    PIP_YELLOW,
    PROPOSED_V11,
    SHAPE_KEYS,
    add_shape_keys,
    append_canonical_actions,
    apply_all,
    assert_not_production_library,
    attach_image_maps,
    ensure_armature,
    ensure_uv,
    fuzz_mat,
    heat_weights,
    join_named,
    link,
    make_cone,
    make_cylinder,
    make_sphere,
    make_star,
    parent_armature,
    pose_action,
    principled_mat,
    reset_scene,
    sculpt_shape_key,
    write_map_graphic,
    write_maps,
)

LIB_PIP = REPO_ROOT / "production-library/characters/pip_production.blend"
LIB_GOAT = REPO_ROOT / "production-library/characters/goat_production.blend"


def _tag(obj, **props):
    for key, value in props.items():
        obj[key] = value


def build_pip():
    reset_scene()
    maps = write_maps("pip_body", PIP_YELLOW, fiber=0.035, contrast=0.05)
    body_mat = fuzz_mat("PipBody", PIP_YELLOW, roughness=0.46, subsurface=0.20, sheen=0.46)
    attach_image_maps(body_mat, maps["basecolor"], maps["roughness"], maps["normal"])
    comb_mat = fuzz_mat("PipComb", PIP_COMB, roughness=0.34, subsurface=0.14, sheen=0.28)
    beak_mat = principled_mat("PipBeak", PIP_BEAK, roughness=0.32, subsurface=0.08, coat=0.08)
    feet_mat = principled_mat("PipFeet", PIP_FEET, roughness=0.36, subsurface=0.08, coat=0.05)
    pack_mat = principled_mat("PipBackpack", PIP_PURPLE, roughness=0.40, sheen=0.20)
    strap_mat = principled_mat("PipStrap", PIP_STRAP, roughness=0.42, sheen=0.16)
    gold_mat = principled_mat("PipStar", PIP_GOLD, roughness=0.22, metallic=0.42, coat=0.12)
    white = principled_mat("PipEyeWhite", (0.99, 0.99, 0.99), roughness=0.06, specular=0.74, coat=0.36, coat_rough=0.04)
    iris = principled_mat("PipIris", PIP_IRIS, roughness=0.20, coat=0.20)
    pupil = principled_mat("PipPupil", (0.04, 0.03, 0.03), roughness=0.16)
    catch = principled_mat("PipCatchlight", (1, 1, 1), roughness=0.04, coat=0.45, emission=0.22)
    brow_mat = principled_mat("PipBrow", (0.10, 0.05, 0.03), roughness=0.55)
    tongue = principled_mat("PipTongue", (0.86, 0.28, 0.32), roughness=0.35, subsurface=0.2)
    mouth = principled_mat("PipMouth", (0.35, 0.08, 0.10), roughness=0.45)

    # Separate volumes. No voxel remesh — that created the v1 center seam.
    make_sphere("Pip_Body", PIP_APPEAL["bodyRadius"], (0.0, 0.01, 0.205), segs=28, rings=18, material=body_mat, scale=(1.05, 0.95, 1.12))
    make_sphere("Pip_Head", PIP_APPEAL["headRadius"], (0.0, -0.015, 0.405), segs=28, rings=18, material=body_mat, scale=(1.02, 0.98, 1.0))
    make_sphere("Pip_CheekL", 0.042, (-0.072, -0.055, 0.368), segs=16, rings=12, material=body_mat)
    make_sphere("Pip_CheekR", 0.042, (0.072, -0.055, 0.368), segs=16, rings=12, material=body_mat)
    make_sphere("Pip_Neck", 0.055, (0.0, 0.0, 0.318), segs=16, rings=12, material=body_mat, scale=(1.12, 0.92, 0.72))

    # Crest: three intentional feather-shaped lobes, clean silhouette.
    for i, (x, z_off, sy) in enumerate(((-0.034, 0.0, 1.35), (0.0, 0.018, 1.85), (0.034, 0.0, 1.35))):
        make_sphere(f"Pip_Comb_{i}", 0.030, (x, -0.018, 0.552 + z_off), segs=18, rings=12, material=comb_mat, scale=(0.58, 0.52, sy))

    # Large friendly eyes — do not shrink.
    for side, x in (("L", -0.058), ("R", 0.058)):
        make_sphere(f"Pip_EyeWhite_{side}", PIP_APPEAL["eyeWhiteRadius"], (x, -0.140, 0.428), segs=20, rings=14, material=white, scale=(1.08, 0.58, 1.12))
        make_sphere(f"Pip_Iris_{side}", 0.030, (x, -0.162, 0.428), segs=16, rings=12, material=iris)
        make_sphere(f"Pip_Pupil_{side}", 0.013, (x, -0.176, 0.428), segs=12, rings=8, material=pupil)
        make_sphere(f"Pip_Catch_{side}", 0.008, (x - 0.014, -0.182, 0.442), segs=10, rings=6, material=catch)
        make_cylinder(f"Pip_Brow_{side}", 0.006, 0.048, (x, -0.132, 0.492), verts=10, material=brow_mat, rot=(0, math.radians(90), math.radians(-14 if side == "L" else 14)))
        # Eyelid sits above the eye; rest pose does not shrink the visible eye.
        make_sphere(f"Pip_Lid_{side}", 0.062, (x, -0.128, 0.468), segs=16, rings=10, material=body_mat, scale=(1.05, 0.22, 0.38))

    # Smooth stylized beak (not a cone wedge, not a nub).
    make_sphere("Pip_Beak", 0.030, (0.0, -0.195, 0.372), segs=18, rings=12, material=beak_mat, scale=(0.75, 1.65, 0.62))
    make_sphere("Pip_BeakTip", 0.014, (0.0, -0.225, 0.368), segs=12, rings=8, material=beak_mat, scale=(0.70, 1.10, 0.55))
    make_sphere("Pip_MouthCavity", 0.016, (0.0, -0.168, 0.355), segs=10, rings=6, material=mouth, scale=(1.05, 0.55, 0.50))
    make_sphere("Pip_Tongue", 0.009, (0.0, -0.176, 0.350), segs=8, rings=6, material=tongue, scale=(0.75, 1.30, 0.42))

    # Relaxed wings hang along the body. Not a T-pose.
    for side, sx in (("L", -1), ("R", 1)):
        wing = make_sphere(
            f"Pip_Wing_{side}",
            0.058,
            (sx * 0.118, 0.028, 0.198),
            segs=20,
            rings=14,
            material=body_mat,
            scale=(0.55, 0.95, 1.25),
        )
        wing.rotation_euler = (math.radians(22), math.radians(sx * 8), math.radians(sx * 58))
        tip = make_sphere(
            f"Pip_WingTip_{side}",
            0.032,
            (sx * 0.132, 0.048, 0.148),
            segs=14,
            rings=10,
            material=body_mat,
            scale=(0.55, 0.85, 0.90),
        )
        tip.rotation_euler = wing.rotation_euler

    for side, x in (("L", -0.048), ("R", 0.048)):
        make_cylinder(f"Pip_Leg_{side}", 0.016, PIP_APPEAL["limbLength"], (x, 0.0, 0.075), verts=12, material=feet_mat)
        make_sphere(f"Pip_Foot_{side}", 0.028, (x, -0.012, 0.016), segs=12, rings=8, material=feet_mat, scale=(1.12, 1.38, 0.45))
        for ti, (tx, ty) in enumerate(((-0.018, -0.035), (0.0, -0.042), (0.018, -0.035))):
            make_sphere(f"Pip_Toe_{side}_{ti}", 0.012, (x + tx, ty, 0.012), segs=10, rings=6, material=feet_mat, scale=(0.90, 1.40, 0.55))

    make_sphere("Pip_Backpack", 0.075, (0.0, 0.128, 0.255), segs=20, rings=14, material=pack_mat, scale=(1.05, 0.70, 1.15))
    make_sphere("Pip_Backpack_Pouch", 0.035, (0.075, 0.122, 0.220), segs=14, rings=10, material=pack_mat, scale=(0.70, 0.65, 0.85))
    for side, x in (("L", -0.06), ("R", 0.06)):
        make_cylinder(f"Pip_Strap_{side}", 0.008, 0.14, (x, 0.04, 0.32), verts=10, material=strap_mat, rot=(math.radians(55), 0, 0))
    make_star("Pip_StarCharm", (0.0, 0.168, 0.312), 0.020, gold_mat)

    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and obj.name.startswith("Pip_"):
            apply_all(obj)
            if obj.name in {"Pip_Body", "Pip_Head"}:
                ensure_uv(obj)
    body = bpy.data.objects["Pip_Body"]
    body.name = "Pip_Character"
    add_shape_keys(body, SHAPE_KEYS)
    add_shape_keys(bpy.data.objects["Pip_Head"], SHAPE_KEYS)

    def mouth_open(co, i, v):
        if co.z > 0.34 and co.y < -0.04:
            co.z -= 0.016
            co.y -= 0.010
        return co

    def smile(co, i, v):
        if co.z > 0.33 and abs(co.x) > 0.02 and co.y < -0.03:
            co.z += 0.010
        return co

    def blink(co, i, v, side):
        if 0.39 < co.z < 0.48 and co.y < -0.04:
            if (side == "L" and co.x < 0) or (side == "R" and co.x > 0):
                co.z -= 0.008
        return co

    sculpt_shape_key(body, "jaw_open", mouth_open)
    sculpt_shape_key(body, "viseme_A", mouth_open)
    sculpt_shape_key(body, "mouth_smile", smile)
    sculpt_shape_key(body, "expr_happy", smile)
    sculpt_shape_key(body, "expr_excited", smile)
    sculpt_shape_key(body, "expr_surprised", mouth_open)
    sculpt_shape_key(body, "blink_left", lambda c, i, v: blink(c, i, v, "L"))
    sculpt_shape_key(body, "blink_right", lambda c, i, v: blink(c, i, v, "R"))

    arm = ensure_armature(
        "Pip_Rig",
        [
            ("root", (0, 0, 0), (0, 0, 0.05), None),
            ("pelvis", (0, 0, 0.12), (0, 0, 0.20), "root"),
            ("spine", (0, 0, 0.20), (0, 0, 0.32), "pelvis"),
            ("chest", (0, 0, 0.32), (0, 0, 0.38), "spine"),
            ("neck", (0, -0.01, 0.38), (0, -0.02, 0.42), "chest"),
            ("head", (0, -0.02, 0.42), (0, -0.04, 0.52), "neck"),
            ("wing_L", (-0.08, 0.02, 0.24), (-0.12, 0.04, 0.16), "chest"),
            ("wing_R", (0.08, 0.02, 0.24), (0.12, 0.04, 0.16), "chest"),
            ("leg_L", (-0.05, 0, 0.14), (-0.05, 0, 0.04), "pelvis"),
            ("leg_R", (0.05, 0, 0.14), (0.05, 0, 0.04), "pelvis"),
            ("foot_L", (-0.05, 0, 0.04), (-0.05, -0.04, 0.02), "leg_L"),
            ("foot_R", (0.05, 0, 0.04), (0.05, -0.04, 0.02), "leg_R"),
            ("backpack", (0, 0.10, 0.26), (0, 0.16, 0.26), "chest"),
            ("comb", (0, -0.02, 0.50), (0, -0.02, 0.56), "head"),
            ("eye_L", (-0.058, -0.14, 0.428), (-0.058, -0.19, 0.428), "head"),
            ("eye_R", (0.058, -0.14, 0.428), (0.058, -0.19, 0.428), "head"),
            ("eyelid_L", (-0.058, -0.13, 0.46), (-0.058, -0.13, 0.50), "head"),
            ("eyelid_R", (0.058, -0.13, 0.46), (0.058, -0.13, 0.50), "head"),
        ],
    )
    heat_weights(body, arm)
    heat_weights(bpy.data.objects["Pip_Head"], arm)
    for extra in ("Pip_Neck", "Pip_CheekL", "Pip_CheekR"):
        if extra in bpy.data.objects:
            parent_armature(bpy.data.objects[extra], arm)
    for name, _bone in (
        ("Pip_Wing_L", "wing_L"),
        ("Pip_WingTip_L", "wing_L"),
        ("Pip_Wing_R", "wing_R"),
        ("Pip_WingTip_R", "wing_R"),
        ("Pip_Beak", "head"),
        ("Pip_BeakTip", "head"),
        ("Pip_MouthCavity", "head"),
        ("Pip_Tongue", "head"),
        ("Pip_Comb_0", "comb"),
        ("Pip_Comb_1", "comb"),
        ("Pip_Comb_2", "comb"),
        ("Pip_Backpack", "backpack"),
        ("Pip_Backpack_Pouch", "backpack"),
        ("Pip_StarCharm", "backpack"),
        ("Pip_Strap_L", "backpack"),
        ("Pip_Strap_R", "backpack"),
        ("Pip_EyeWhite_L", "eye_L"),
        ("Pip_Iris_L", "eye_L"),
        ("Pip_Pupil_L", "eye_L"),
        ("Pip_Catch_L", "eye_L"),
        ("Pip_Lid_L", "eyelid_L"),
        ("Pip_Brow_L", "head"),
        ("Pip_EyeWhite_R", "eye_R"),
        ("Pip_Iris_R", "eye_R"),
        ("Pip_Pupil_R", "eye_R"),
        ("Pip_Catch_R", "eye_R"),
        ("Pip_Lid_R", "eyelid_R"),
        ("Pip_Brow_R", "head"),
        ("Pip_Leg_L", "leg_L"),
        ("Pip_Foot_L", "foot_L"),
        ("Pip_Toe_L_0", "foot_L"),
        ("Pip_Toe_L_1", "foot_L"),
        ("Pip_Toe_L_2", "foot_L"),
        ("Pip_Leg_R", "leg_R"),
        ("Pip_Foot_R", "foot_R"),
        ("Pip_Toe_R_0", "foot_R"),
        ("Pip_Toe_R_1", "foot_R"),
        ("Pip_Toe_R_2", "foot_R"),
    ):
        if name in bpy.data.objects:
            parent_armature(bpy.data.objects[name], arm)

    _tag(
        body,
        ddp_character_code="CHAR_PIP_001",
        ddp_asset_id="char_pip_theatrical_v1_1_proposed",
        ddp_quality="PROPOSED_THEATRICAL_V1_1",
        ddp_approved=False,
        ddp_groom="shader_surface_no_cards",
        ddp_voxel_remesh=False,
    )

    inherited = append_canonical_actions(LIB_PIP, "PIP_") if LIB_PIP.exists() else []
    pose_action(arm, "PIP_POSE_NEUTRAL", {"head": (0.04, 0, 0.08), "wing_L": (0.05, 0.08, 0.12), "wing_R": (0.05, -0.08, -0.12)})
    pose_action(
        arm,
        "PIP_POSE_POINT_CURIOUS",
        {"head": (0.08, 0.05, 0.22), "wing_R": (0.20, -0.85, -0.55), "wing_L": (0.10, 0.15, 0.20), "eye_L": (0.0, 0, 0.10), "eye_R": (0.0, 0, 0.10)},
    )
    pose_action(
        arm,
        "PIP_POSE_DISCOVERY",
        {"head": (-0.12, 0, 0.10), "wing_L": (0.15, 0.35, 0.70), "wing_R": (0.15, -0.35, -0.70), "eye_L": (-0.08, 0, 0), "eye_R": (-0.08, 0, 0)},
    )
    pose_action(
        arm,
        "PIP_POSE_BRAVE",
        {"head": (0.06, 0, -0.08), "wing_L": (0.12, 0.20, 0.35), "wing_R": (0.12, -0.20, -0.35), "chest": (0.04, 0, 0)},
    )
    pose_action(arm, "PIP_POSE_LOOK_GOAT", {"head": (0.05, 0, 0.35), "eye_L": (0.0, 0, 0.18), "eye_R": (0.0, 0, 0.18), "wing_R": (0.08, -0.15, -0.20)})
    pose_action(arm, "PIP_POSE_MAP", {"head": (0.28, 0, 0.05), "eye_L": (0.12, 0, 0), "eye_R": (0.12, 0, 0), "wing_L": (0.10, 0.25, 0.15), "wing_R": (0.10, -0.25, -0.15)})

    out = PROPOSED_V11 / "pip_theatrical_v1_1.blend"
    assert_not_production_library(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    return {
        "path": str(out.relative_to(REPO_ROOT)),
        "verts": len(body.data.vertices),
        "polys": len(body.data.polygons),
        "bones": [b.name for b in arm.data.bones],
        "inheritedActions": inherited,
        "groom": "shader_surface_no_cards",
        "voxelRemesh": False,
        "label": "proposed theatrical v1.1",
        "approved": False,
        "appeal": {
            "eyeWhiteRadius": PIP_APPEAL["eyeWhiteRadius"],
            "headRadius": PIP_APPEAL["headRadius"],
            "eyeToHead": PIP_APPEAL["eyeToHead"],
            "eyeSpacing": PIP_APPEAL["eyeSpacing"],
            "headToBody": PIP_APPEAL["headToBody"],
            "beakLength": PIP_APPEAL["beakLength"],
        },
    }


def build_goat():
    reset_scene()
    maps = write_maps("goat_body", GOAT_CREAM, fiber=0.03, contrast=0.04)
    body_mat = fuzz_mat("GoatBody", GOAT_CREAM, roughness=0.48, subsurface=0.24, sheen=0.50)
    attach_image_maps(body_mat, maps["basecolor"], maps["roughness"], maps["normal"])
    horn_mat = principled_mat("GoatHorn", GOAT_HORN, roughness=0.40, coat=0.10, coat_rough=0.32)
    nose_mat = principled_mat("GoatNose", GOAT_NOSE, roughness=0.34, subsurface=0.16, coat=0.06)
    collar_mat = principled_mat("GoatCollar", GOAT_COLLAR, roughness=0.38, sheen=0.18)
    tag_mat = principled_mat("GoatTag", GOAT_TAG, roughness=0.22, metallic=0.45, coat=0.12)
    ink = principled_mat("GoatTagInk", (0.05, 0.05, 0.07), roughness=0.55)
    hoof_mat = principled_mat("GoatHoof", GOAT_HOOF, roughness=0.40, coat=0.06)
    ear_in = principled_mat("GoatEarInner", GOAT_EAR_IN, roughness=0.40, subsurface=0.16, sheen=0.16)
    white = principled_mat("GoatEyeWhite", (0.99, 0.99, 0.99), roughness=0.06, specular=0.74, coat=0.36, coat_rough=0.04)
    iris = principled_mat("GoatIris", GOAT_IRIS, roughness=0.20, coat=0.20)
    pupil = principled_mat("GoatPupil", (0.04, 0.03, 0.03), roughness=0.16)
    catch = principled_mat("GoatCatchlight", (1, 1, 1), roughness=0.04, coat=0.45, emission=0.22)
    brow_mat = principled_mat("GoatBrow", (0.16, 0.09, 0.05), roughness=0.55)
    tongue = principled_mat("GoatTongue", (0.86, 0.32, 0.34), roughness=0.35, subsurface=0.2)
    mouth = principled_mat("GoatMouth", (0.32, 0.08, 0.10), roughness=0.45)

    make_sphere("Goat_Body", GOAT_APPEAL["bodyRadius"], (0.0, 0.06, 0.44), segs=28, rings=18, material=body_mat, scale=(1.08, 1.22, 0.95))
    make_sphere("Goat_Head", GOAT_APPEAL["headRadius"], (0.0, -0.26, 0.78), segs=28, rings=18, material=body_mat, scale=(1.06, 1.02, 1.0))
    make_sphere("Goat_Muzzle", GOAT_APPEAL["muzzleRadius"], (0.0, -0.42, 0.715), segs=20, rings=14, material=body_mat, scale=(1.05, 1.05, 0.88))
    make_sphere("Goat_CheekL", 0.055, (-0.10, -0.30, 0.74), segs=14, rings=10, material=body_mat)
    make_sphere("Goat_CheekR", 0.055, (0.10, -0.30, 0.74), segs=14, rings=10, material=body_mat)
    make_sphere("Goat_Neck", 0.08, (0.0, -0.10, 0.60), segs=16, rings=12, material=body_mat, scale=(1.05, 1.15, 0.85))

    # Soft rounded horns — not sharp, not threatening.
    for side, x, yaw in (("L", -0.09, -28), ("R", 0.09, 28)):
        horn = make_sphere(f"Goat_Horn_{side}", 0.062, (x, -0.16, 0.98), segs=18, rings=14, material=horn_mat, scale=(0.40, 0.80, 1.55))
        horn.rotation_euler = (math.radians(38), 0, math.radians(yaw))

    for side, x in (("L", -0.22), ("R", 0.22)):
        ear = make_sphere(f"Goat_Ear_{side}", 0.085, (x, -0.20, 0.82), segs=16, rings=12, material=body_mat, scale=(0.40, 1.55, 0.85))
        ear.rotation_euler = (math.radians(25), math.radians(-15 if side == "L" else 15), math.radians(40 if side == "R" else -40))
        inn = make_sphere(f"Goat_EarInner_{side}", 0.055, (x * 0.92, -0.22, 0.82), segs=14, rings=10, material=ear_in, scale=(0.32, 1.30, 0.60))
        inn.rotation_euler = ear.rotation_euler

    # LARGE glossy friendly eyes — identity-critical. Shrinking this is an automatic failure.
    for side, x in (("L", -0.075), ("R", 0.075)):
        make_sphere(f"Goat_EyeWhite_{side}", GOAT_APPEAL["eyeWhiteRadius"], (x, -0.415, 0.835), segs=20, rings=14, material=white, scale=(1.08, 0.52, 1.12))
        make_sphere(f"Goat_Iris_{side}", 0.036, (x, -0.440, 0.835), segs=16, rings=12, material=iris)
        make_sphere(f"Goat_Pupil_{side}", 0.015, (x, -0.455, 0.835), segs=12, rings=8, material=pupil)
        make_sphere(f"Goat_Catch_{side}", 0.009, (x - 0.016, -0.462, 0.850), segs=10, rings=6, material=catch)
        make_cylinder(f"Goat_Brow_{side}", 0.006, 0.052, (x, -0.400, 0.910), verts=8, material=brow_mat, rot=(0, math.radians(90), math.radians(-12 if side == "L" else 12)))
        make_sphere(f"Goat_Lid_{side}", 0.072, (x, -0.400, 0.880), segs=14, rings=8, material=body_mat, scale=(1.05, 0.20, 0.36))

    make_sphere("Goat_Nose", 0.042, (0.0, -0.495, 0.725), segs=16, rings=12, material=nose_mat, scale=(1.20, 0.85, 0.82))
    make_sphere("Goat_Beard", 0.038, (0.0, -0.430, 0.630), segs=14, rings=10, material=body_mat, scale=(0.50, 0.70, 1.40))
    make_sphere("Goat_MouthCavity", 0.018, (0.0, -0.440, 0.690), segs=10, rings=6, material=mouth, scale=(1.0, 0.55, 0.45))
    make_sphere("Goat_Tongue", 0.011, (0.0, -0.450, 0.685), segs=8, rings=6, material=tongue, scale=(0.70, 1.25, 0.40))

    bpy.ops.mesh.primitive_torus_add(major_radius=0.15, minor_radius=0.024, location=(0, -0.20, 0.66), major_segments=48, minor_segments=16)
    collar = bpy.context.object
    collar.name = "Goat_Collar"
    collar.rotation_euler = (math.radians(90), 0, 0)
    collar.data.materials.clear()
    collar.data.materials.append(collar_mat)

    make_cylinder("Goat_Tag", 0.058, 0.010, (0.0, -0.345, 0.600), verts=32, material=tag_mat, rot=(math.radians(90), 0, 0))
    bpy.ops.object.text_add(location=(0.0, -0.358, 0.600))
    tag_text = bpy.context.object
    tag_text.name = "Goat_Tag_Text"
    tag_text.data.body = "GOAT"
    tag_text.data.size = 0.044
    tag_text.data.extrude = 0.006
    tag_text.data.align_x = "CENTER"
    tag_text.data.align_y = "CENTER"
    tag_text.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.convert(target="MESH")
    tag_text = bpy.context.object
    tag_text.name = "Goat_Tag_Text"
    tag_text.data.materials.clear()
    tag_text.data.materials.append(ink)

    for idx, (x, y) in enumerate(((-0.10, -0.12), (0.10, -0.12), (-0.10, 0.22), (0.10, 0.22))):
        names = ("FL", "FR", "BL", "BR")
        make_cylinder(f"Goat_Leg_{names[idx]}", 0.036, GOAT_APPEAL["limbLength"], (x, y, 0.20), verts=14, material=body_mat)
        make_sphere(f"Goat_Hoof_{names[idx]}", 0.032, (x, y, 0.028), segs=12, rings=8, material=hoof_mat, scale=(1.05, 1.15, 0.50))
    make_sphere("Goat_Tail", 0.050, (0.0, 0.40, 0.50), segs=14, rings=10, material=body_mat, scale=(0.70, 1.30, 0.75))

    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and obj.name.startswith("Goat_"):
            apply_all(obj)
            if obj.name in {"Goat_Body", "Goat_Head"}:
                ensure_uv(obj)
    body = bpy.data.objects["Goat_Body"]
    body.name = "Goat_Character"
    add_shape_keys(body, SHAPE_KEYS)
    add_shape_keys(bpy.data.objects["Goat_Head"], SHAPE_KEYS)
    sculpt_shape_key(body, "jaw_open", lambda c, i, v: type(c)((c.x, c.y - 0.010, c.z - 0.008)) if c.z > 0.66 and c.y < -0.20 else c)
    sculpt_shape_key(body, "mouth_smile", lambda c, i, v: type(c)((c.x, c.y, c.z + 0.008)) if c.z > 0.66 and abs(c.x) > 0.03 and c.y < -0.18 else c)
    sculpt_shape_key(body, "expr_happy", lambda c, i, v: type(c)((c.x, c.y, c.z + 0.008)) if c.z > 0.66 and abs(c.x) > 0.03 and c.y < -0.18 else c)
    sculpt_shape_key(body, "expr_surprised", lambda c, i, v: type(c)((c.x, c.y - 0.010, c.z - 0.008)) if c.z > 0.66 and c.y < -0.20 else c)

    arm = ensure_armature(
        "Goat_Rig",
        [
            ("root", (0, 0, 0), (0, 0, 0.08), None),
            ("pelvis", (0, 0.05, 0.35), (0, 0.05, 0.45), "root"),
            ("spine", (0, 0.02, 0.45), (0, -0.05, 0.60), "pelvis"),
            ("chest", (0, -0.05, 0.60), (0, -0.12, 0.68), "spine"),
            ("neck", (0, -0.15, 0.68), (0, -0.25, 0.78), "chest"),
            ("head", (0, -0.28, 0.78), (0, -0.40, 0.92), "neck"),
            ("ear_L", (-0.12, -0.25, 0.86), (-0.20, -0.22, 0.86), "head"),
            ("ear_R", (0.12, -0.25, 0.86), (0.20, -0.22, 0.86), "head"),
            ("leg_FL", (-0.10, -0.12, 0.35), (-0.10, -0.12, 0.05), "root"),
            ("leg_FR", (0.10, -0.12, 0.35), (0.10, -0.12, 0.05), "root"),
            ("leg_BL", (-0.10, 0.22, 0.35), (-0.10, 0.22, 0.05), "root"),
            ("leg_BR", (0.10, 0.22, 0.35), (0.10, 0.22, 0.05), "root"),
            ("hoof_FL", (-0.10, -0.12, 0.05), (-0.10, -0.16, 0.02), "leg_FL"),
            ("hoof_FR", (0.10, -0.12, 0.05), (0.10, -0.16, 0.02), "leg_FR"),
            ("hoof_BL", (-0.10, 0.22, 0.05), (-0.10, 0.26, 0.02), "leg_BL"),
            ("hoof_BR", (0.10, 0.22, 0.05), (0.10, 0.26, 0.02), "leg_BR"),
            ("tail", (0, 0.35, 0.50), (0, 0.48, 0.52), "spine"),
            ("collar", (0, -0.20, 0.66), (0, -0.30, 0.64), "neck"),
            ("eye_L", (-0.075, -0.415, 0.835), (-0.075, -0.48, 0.835), "head"),
            ("eye_R", (0.075, -0.415, 0.835), (0.075, -0.48, 0.835), "head"),
            ("eyelid_L", (-0.075, -0.40, 0.88), (-0.075, -0.40, 0.93), "head"),
            ("eyelid_R", (0.075, -0.40, 0.88), (0.075, -0.40, 0.93), "head"),
        ],
    )
    heat_weights(body, arm)
    heat_weights(bpy.data.objects["Goat_Head"], arm)
    for extra in ("Goat_Muzzle", "Goat_CheekL", "Goat_CheekR", "Goat_Neck"):
        if extra in bpy.data.objects:
            parent_armature(bpy.data.objects[extra], arm)
    for name, _bone in (
        ("Goat_Horn_L", "head"),
        ("Goat_Horn_R", "head"),
        ("Goat_Ear_L", "ear_L"),
        ("Goat_Ear_R", "ear_R"),
        ("Goat_EarInner_L", "ear_L"),
        ("Goat_EarInner_R", "ear_R"),
        ("Goat_Nose", "head"),
        ("Goat_Beard", "head"),
        ("Goat_MouthCavity", "head"),
        ("Goat_Tongue", "head"),
        ("Goat_Collar", "collar"),
        ("Goat_Tag", "collar"),
        ("Goat_Tag_Text", "collar"),
        ("Goat_Tail", "tail"),
        ("Goat_EyeWhite_L", "eye_L"),
        ("Goat_Iris_L", "eye_L"),
        ("Goat_Pupil_L", "eye_L"),
        ("Goat_Catch_L", "eye_L"),
        ("Goat_Lid_L", "eyelid_L"),
        ("Goat_EyeWhite_R", "eye_R"),
        ("Goat_Iris_R", "eye_R"),
        ("Goat_Pupil_R", "eye_R"),
        ("Goat_Catch_R", "eye_R"),
        ("Goat_Lid_R", "eyelid_R"),
        ("Goat_Brow_L", "head"),
        ("Goat_Brow_R", "head"),
        ("Goat_Leg_FL", "leg_FL"),
        ("Goat_Leg_FR", "leg_FR"),
        ("Goat_Leg_BL", "leg_BL"),
        ("Goat_Leg_BR", "leg_BR"),
        ("Goat_Hoof_FL", "hoof_FL"),
        ("Goat_Hoof_FR", "hoof_FR"),
        ("Goat_Hoof_BL", "hoof_BL"),
        ("Goat_Hoof_BR", "hoof_BR"),
    ):
        if name in bpy.data.objects:
            parent_armature(bpy.data.objects[name], arm)

    _tag(
        body,
        ddp_character_code="CHAR_GOAT_001",
        ddp_asset_id="char_goat_theatrical_v1_1_proposed",
        ddp_quality="PROPOSED_THEATRICAL_V1_1",
        ddp_approved=False,
        ddp_groom="shader_surface_no_cards",
        ddp_voxel_remesh=False,
        ddp_tag_text="GOAT",
    )

    inherited = append_canonical_actions(LIB_GOAT, "GOAT_") if LIB_GOAT.exists() else []
    pose_action(arm, "GOAT_POSE_NEUTRAL", {"head": (0.04, 0, -0.06), "tail": (0, 0, 0.12), "ear_L": (0, 0.08, 0), "ear_R": (0, -0.08, 0)})
    pose_action(arm, "GOAT_POSE_NOD", {"head": (0.32, 0, 0), "eye_L": (0.10, 0, 0), "eye_R": (0.10, 0, 0), "ear_L": (0.08, 0, 0), "ear_R": (0.08, 0, 0)})
    pose_action(arm, "GOAT_POSE_PLAYFUL", {"head": (-0.08, 0, 0.18), "tail": (0, 0, 0.45), "ear_L": (0, 0.20, 0), "ear_R": (0, -0.12, 0)})
    pose_action(arm, "GOAT_POSE_SURPRISE", {"head": (-0.18, 0, 0.08), "ear_L": (-0.15, 0.10, 0), "ear_R": (-0.15, -0.10, 0), "eye_L": (-0.08, 0, 0), "eye_R": (-0.08, 0, 0)})
    pose_action(arm, "GOAT_POSE_LOOK_PIP", {"head": (0.05, 0, -0.32), "eye_L": (0.0, 0, -0.16), "eye_R": (0.0, 0, -0.16)})
    pose_action(arm, "GOAT_POSE_MAP", {"head": (0.30, 0, 0.04), "eye_L": (0.14, 0, 0), "eye_R": (0.14, 0, 0)})

    out = PROPOSED_V11 / "goat_theatrical_v1_1.blend"
    assert_not_production_library(out)
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    return {
        "path": str(out.relative_to(REPO_ROOT)),
        "verts": len(body.data.vertices),
        "polys": len(body.data.polygons),
        "bones": [b.name for b in arm.data.bones],
        "inheritedActions": inherited,
        "groom": "shader_surface_no_cards",
        "voxelRemesh": False,
        "label": "proposed theatrical v1.1",
        "approved": False,
        "appeal": {
            "eyeWhiteRadius": GOAT_APPEAL["eyeWhiteRadius"],
            "headRadius": GOAT_APPEAL["headRadius"],
            "eyeToHead": GOAT_APPEAL["eyeToHead"],
            "eyeSpacing": GOAT_APPEAL["eyeSpacing"],
            "headToBody": GOAT_APPEAL["headToBody"],
            "muzzleRadius": GOAT_APPEAL["muzzleRadius"],
        },
    }


def _terrain(name, size, cuts, height_fn):
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=cuts, y_subdivisions=cuts, size=size, location=(0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    for vert in obj.data.vertices:
        vert.co.z = height_fn(vert.co.x, vert.co.y)
    obj.data.update()
    return obj


def _stylized_tree(prefix, x, y, z, scale=1.0, bark=None, leaf=None):
    parts = []
    trunk = make_cone(f"{prefix}_Trunk", 0.18 * scale, 1.7 * scale, (x, y, z + 0.75 * scale), verts=10, material=bark)
    parts.append(trunk.name)
    for i, (dx, dy, dz, r) in enumerate(((-0.15, 0.05, 1.55, 0.72), (0.18, -0.08, 1.70, 0.58), (0.02, 0.16, 1.95, 0.50), (-0.08, -0.14, 1.82, 0.46))):
        can = make_sphere(f"{prefix}_Canopy_{i}", r * scale, (x + dx * scale, y + dy * scale, z + dz * scale), segs=14, rings=10, material=leaf, scale=(1.15, 1.08, 0.82))
        parts.append(can.name)
    return join_named(parts, prefix)


def _flower(prefix, x, y, z, petal, center, stem_mat):
    parts = [make_cylinder(f"{prefix}_Stem", 0.012, 0.16, (x, y, z + 0.08), verts=6, material=stem_mat).name]
    for i in range(5):
        ang = i * (2 * math.pi / 5)
        p = make_sphere(f"{prefix}_P_{i}", 0.028, (x + math.cos(ang) * 0.04, y + math.sin(ang) * 0.04, z + 0.17), segs=8, rings=6, material=petal, scale=(1.1, 0.7, 0.45))
        parts.append(p.name)
    parts.append(make_sphere(f"{prefix}_C", 0.018, (x, y, z + 0.175), segs=8, rings=6, material=center).name)
    return join_named(parts, prefix)


def build_meadow():
    reset_scene()
    maps = write_maps("meadow_grass", (0.30, 0.54, 0.20), fiber=0.04, contrast=0.07)
    grass = fuzz_mat("MeadowGrass", (0.30, 0.54, 0.20), roughness=0.64, sheen=0.14, subsurface=0.04)
    attach_image_maps(grass, maps["basecolor"], maps["roughness"], maps["normal"])
    path_mat = principled_mat("MeadowPath", (0.74, 0.64, 0.44), roughness=0.70)
    bark = principled_mat("TreeBark", (0.36, 0.22, 0.12), roughness=0.72)
    leaf = fuzz_mat("TreeLeaf", (0.24, 0.52, 0.20), roughness=0.52, sheen=0.22, subsurface=0.06)
    flower_a = principled_mat("FlowerA", (0.95, 0.48, 0.72), roughness=0.38, sheen=0.16)
    flower_b = principled_mat("FlowerB", (0.96, 0.86, 0.28), roughness=0.38, sheen=0.16)
    center = principled_mat("FlowerC", (0.95, 0.75, 0.20), roughness=0.35)
    stem = principled_mat("Stem", (0.22, 0.48, 0.16), roughness=0.55)
    rock = principled_mat("MeadowRock", (0.48, 0.44, 0.40), roughness=0.70)
    dest = principled_mat("DestinationGlow", (0.95, 0.82, 0.35), roughness=0.25, emission=0.35)

    def h(x, y):
        r = math.hypot(x, y)
        path = abs(x * 0.22 + y * 0.96)
        mound = 0.22 * math.sin(x * 0.28) * math.cos(y * 0.22)
        hill = 0.55 * math.exp(-((x - 3.4) ** 2 + (y - 6.2) ** 2) / 8.0)
        dip = -0.05 if path < 1.05 else 0.0
        edge = 0.10 * max(0.0, (r - 10) / 6)
        return mound + hill + dip + edge

    ground = _terrain("Meadow_Ground", 24, 72, h)
    ground.data.materials.append(grass)
    ensure_uv(ground)

    # Winding path toward the hill destination.
    path_parts = []
    for i in range(14):
        t = i / 13
        x = -0.15 + 0.35 * math.sin(t * math.pi)
        y = -5.2 + t * 11.2
        cube = make_cylinder(f"Meadow_Path_{i}", 0.55, 0.06, (x, y, h(x, y) + 0.02), verts=10, material=path_mat)
        cube.scale = (1.15, 1.35, 1.0)
        path_parts.append(cube.name)
    join_named(path_parts, "Meadow_Path")

    flowers = []
    for i in range(16):
        ang = i * 0.62
        r = 1.8 + (i % 4) * 0.55
        x, y = math.cos(ang) * r - 1.6, math.sin(ang) * r + 0.4
        if abs(x * 0.22 + y * 0.96) < 0.9:
            continue
        flowers.append(_flower(f"Meadow_Flower_{i}", x, y, h(x, y), flower_a if i % 2 == 0 else flower_b, center, stem).name)
    if flowers:
        join_named(flowers, "Meadow_Flowers")

    trees = []
    for i, (x, y, s) in enumerate(((-4.6, 3.6, 1.15), (5.0, 4.4, 1.0), (-5.4, -2.6, 0.9), (4.8, -3.2, 0.85), (3.4, 6.2, 1.35), (-2.8, 7.0, 0.75))):
        trees.append(_stylized_tree(f"Meadow_Tree_{i}", x, y, h(x, y), scale=s, bark=bark, leaf=leaf).name)
    join_named(trees, "Meadow_Trees")

    rocks = []
    for i, (x, y, s) in enumerate(((-1.6, 1.8, 0.24), (1.9, -1.4, 0.20), (-2.8, -0.8, 0.30), (2.4, 2.2, 0.18))):
        rk = make_sphere(f"Meadow_Rock_{i}", s, (x, y, h(x, y) + s * 0.35), segs=12, rings=8, material=rock, scale=(1.35, 1.15, 0.65))
        rocks.append(rk.name)
    join_named(rocks, "Meadow_Rocks")

    # Foreground framing tufts
    tufts = []
    for i, (x, y) in enumerate(((-1.1, -2.4), (1.2, -2.2), (-0.7, -2.8))):
        tufts.append(make_cone(f"Meadow_Tuft_{i}", 0.08, 0.22, (x, y, h(x, y) + 0.08), verts=7, material=leaf).name)
    join_named(tufts, "Meadow_Foreground")

    glow = make_sphere("Meadow_Destination", 0.12, (3.2, 6.0, h(3.2, 6.0) + 0.35), segs=12, rings=8, material=dest)
    glow["ddp_story_destination"] = True

    for name, loc in (("Meadow_Stage_Pip", (-0.32, 0.15, 0.02)), ("Meadow_Stage_Goat", (0.48, 0.28, 0.02)), ("Meadow_PropClear", (0.0, -1.5, 0.02))):
        empty = bpy.data.objects.new(name, None)
        empty.location = loc
        link(empty)

    out = PROPOSED_V11 / "meadow_theatrical_v1_1.blend"
    assert_not_production_library(out)
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    return {"path": str(out.relative_to(REPO_ROOT)), "groundVerts": len(ground.data.vertices), "approved": False, "label": "proposed theatrical v1.1"}


def build_creek():
    reset_scene()
    bank = fuzz_mat("CreekBank", (0.38, 0.50, 0.24), roughness=0.64, sheen=0.10, subsurface=0.03)
    sand = principled_mat("CreekSand", (0.72, 0.64, 0.44), roughness=0.70)
    water = principled_mat("CreekWater", (0.38, 0.64, 0.74), roughness=0.07, coat=0.40, coat_rough=0.04)
    if water.use_nodes:
        bsdf = water.node_tree.nodes.get("Principled BSDF")
        if bsdf and "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = 0.58
        water.blend_method = "BLEND"
    rock = principled_mat("CreekRock", (0.46, 0.43, 0.38), roughness=0.66)
    leaf = fuzz_mat("CreekLeaf", (0.22, 0.50, 0.20), roughness=0.52, sheen=0.18, subsurface=0.05)
    bark = principled_mat("CreekBark", (0.34, 0.20, 0.12), roughness=0.72)
    mist_mat = principled_mat("CreekMist", (0.78, 0.86, 0.90), roughness=1.0)
    if mist_mat.use_nodes:
        mist_mat.blend_method = "BLEND"
        bsdf = mist_mat.node_tree.nodes.get("Principled BSDF")
        if bsdf and "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = 0.22
    dest = principled_mat("CreekDestination", (0.95, 0.88, 0.45), roughness=0.22, emission=0.40)

    def h(x, y):
        channel = abs(x + 0.15 * math.sin(y * 0.45))
        bed = -0.14 if channel < 1.05 else 0.0
        bank_h = 0.26 * max(0.0, min(1.0, (channel - 1.0) / 1.3))
        return bed + bank_h + 0.04 * math.sin(y * 0.35)

    ground = _terrain("Creek_Ground", 18, 64, h)
    ground.data.materials.append(bank)
    ensure_uv(ground)

    bpy.ops.mesh.primitive_plane_add(size=14, location=(0.05, 0.4, -0.05))
    water_obj = bpy.context.object
    water_obj.name = "Creek_Water"
    water_obj.scale = (0.16, 1.05, 1.0)
    apply_all(water_obj)
    water_obj.data.materials.append(water)

    bed = make_cylinder("Creek_Bed", 1.0, 0.05, (0.05, 0.3, -0.12), verts=8, material=sand)
    bed.scale = (1.05, 7.2, 1.0)
    apply_all(bed)

    stones = []
    for i, (x, y, s) in enumerate(((0.05, -0.8, 0.15), (0.18, 0.15, 0.14), (-0.05, 1.1, 0.15), (0.22, 2.0, 0.13), (-1.5, 0.6, 0.22), (1.6, -0.4, 0.20))):
        stones.append(make_sphere(f"Creek_Stone_{i}", s, (x, y, h(x, y) + s * 0.28), segs=12, rings=8, material=rock, scale=(1.25, 1.15, 0.60)).name)
    join_named(stones, "Creek_Rocks")

    reeds = []
    for i in range(12):
        x = -1.45 if i % 2 == 0 else 1.55
        y = -2.6 + i * 0.55
        reeds.append(make_cylinder(f"Creek_Reed_{i}", 0.016, 0.62, (x, y, 0.28), verts=6, material=leaf).name)
    join_named(reeds, "Creek_Reeds")

    _stylized_tree("Creek_Tree", -3.0, 2.2, h(-3.0, 2.2), scale=1.05, bark=bark, leaf=leaf)
    glow = make_sphere("Creek_Destination", 0.10, (0.15, 2.6, 0.22), segs=12, rings=8, material=dest)
    glow["ddp_story_destination"] = True

    mist_parts = []
    for i in range(8):
        mist_parts.append(make_sphere(f"Creek_Mist_{i}", 0.18, ((-0.3 + 0.1 * i), -0.4 + 0.35 * i, 0.08), segs=8, rings=6, material=mist_mat).name)
    mist = join_named(mist_parts, "Creek_Mist")
    mist.visible_shadow = False

    for name, loc in (("Creek_Stage_Pip", (-0.95, -0.15, 0.12)), ("Creek_Stage_Goat", (1.05, 0.05, 0.12)), ("Creek_Step", (0.05, -0.8, 0.08))):
        empty = bpy.data.objects.new(name, None)
        empty.location = loc
        link(empty)

    out = PROPOSED_V11 / "creek_theatrical_v1_1.blend"
    assert_not_production_library(out)
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    return {"path": str(out.relative_to(REPO_ROOT)), "groundVerts": len(ground.data.vertices), "approved": False, "label": "proposed theatrical v1.1"}


def build_map():
    reset_scene()
    paper_maps = write_map_graphic()
    paper = principled_mat("MapPaper", (0.90, 0.84, 0.70), roughness=0.66, sheen=0.08)
    attach_image_maps(paper, paper_maps["basecolor"], paper_maps["roughness"], paper_maps["normal"])
    gold = principled_mat("MapAccent", (0.92, 0.74, 0.22), roughness=0.28, metallic=0.22)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.010))
    sheet = bpy.context.object
    sheet.name = "Map_Sheet"
    sheet.scale = (0.58, 0.40, 0.014)
    apply_all(sheet)
    for vert in sheet.data.vertices:
        vert.co.z += 0.016 * math.sin(vert.co.x * 7.5) * 0.40 + 0.014 * (vert.co.x**2) + 0.008 * (vert.co.y**2)
    sheet.data.update()
    sheet.data.materials.append(paper)
    ensure_uv(sheet)

    bpy.ops.mesh.primitive_torus_add(major_radius=0.055, minor_radius=0.005, location=(-0.20, 0.13, 0.04), major_segments=20, minor_segments=8)
    compass = bpy.context.object
    compass.name = "Map_CompassRing"
    compass.data.materials.append(gold)

    empty = bpy.data.objects.new("Map_HoldClearance", None)
    empty.location = (0, 0, 0.09)
    link(empty)

    out = PROPOSED_V11 / "map_theatrical_v1_1.blend"
    assert_not_production_library(out)
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    return {"path": str(out.relative_to(REPO_ROOT)), "approved": False, "label": "proposed theatrical v1.1", "hasGraphicTexture": True}


def build_vfx_and_lighting():
    reset_scene()
    spark = principled_mat("VfxSparkle", (1.0, 0.92, 0.55), roughness=0.18, emission=2.2)
    pollen = principled_mat("VfxPollen", (0.96, 0.86, 0.38), roughness=0.38, emission=0.55)
    dust = principled_mat("VfxDust", (0.88, 0.82, 0.70), roughness=0.75, emission=0.12)
    mist = principled_mat("VfxMist", (0.78, 0.86, 0.90), roughness=1.0)
    if mist.use_nodes:
        mist.blend_method = "BLEND"
        bsdf = mist.node_tree.nodes.get("Principled BSDF")
        if bsdf and "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = 0.28
    trail = principled_mat("VfxTrail", (0.70, 0.88, 1.0), roughness=0.25, emission=1.1)

    import random

    groups = [
        ("Vfx_Dust", dust, 22, 0.018, 3, 0.9),
        ("Vfx_Pollen", pollen, 16, 0.014, 5, 0.7),
        ("Vfx_Sparkle", spark, 12, 0.012, 7, 0.55),
        ("Vfx_Mist", mist, 10, 0.08, 11, 0.45),
        ("Vfx_Trail", trail, 14, 0.010, 13, 0.8),
    ]
    for name, mat, count, radius, seed, spread in groups:
        rng = random.Random(seed)
        parts = []
        for i in range(count):
            loc = (rng.uniform(-spread, spread), rng.uniform(-0.5, 0.8), rng.uniform(0.12, 1.05))
            p = make_sphere(f"{name}_{i}", radius, loc, segs=8, rings=4, material=mat)
            parts.append(p.name)
        joined = join_named(parts, name)
        joined["ddp_vfx"] = name
        joined["ddp_seeded"] = True
        joined["ddp_cast_shadow"] = False
        joined.visible_shadow = False

    bpy.ops.object.light_add(type="AREA", location=(0.18, -0.52, 0.58))
    eye = bpy.context.object
    eye.name = "Light_EyeCatch"
    eye.data.energy = 28
    eye.data.size = 0.12
    eye.data.use_shadow = False
    bpy.ops.object.light_add(type="AREA", location=(-1.5, -0.5, 1.5))
    fill = bpy.context.object
    fill.name = "Light_ForestFill"
    fill.data.energy = 16
    fill.data.size = 2.6
    fill.data.use_shadow = False
    bpy.ops.object.light_add(type="AREA", location=(0.2, 1.4, 0.4))
    atmos = bpy.context.object
    atmos.name = "Light_MeadowAtmosphere"
    atmos.data.energy = 10
    atmos.data.size = 3.2
    atmos.data.use_shadow = False

    out = PROPOSED_V11 / "lighting_vfx_theatrical_v1_1.blend"
    assert_not_production_library(out)
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    return {
        "path": str(out.relative_to(REPO_ROOT)),
        "approved": False,
        "label": "proposed theatrical v1.1",
        "retunesLightingStates": False,
    }


def main() -> int:
    PROPOSED_V11.mkdir(parents=True, exist_ok=True)
    report = {
        "label": "proposed theatrical v1.1",
        "approved": False,
        "productionLibraryMutated": False,
        "voxelRemesh": False,
        "groomCards": False,
        "pip": build_pip(),
        "goat": build_goat(),
        "meadow": build_meadow(),
        "creek": build_creek(),
        "map": build_map(),
        "lightingVfx": build_vfx_and_lighting(),
    }
    out = PROPOSED_V11 / "BUILD_MANIFEST.json"
    assert_not_production_library(out)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"status": "OK", "approved": False, "out": str(out)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
