"""
Visual approval package for Pip + Goat v1.1 hero art polish.

Renders turnarounds, expression sheets, and lightweight motion previews.
Does NOT run FINAL_1080P.
Uses production v1.1 blends (falls back to v1 if missing).
"""

from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import time
from pathlib import Path

ROOT = Path(os.environ.get("REPO_ROOT", "/agent"))
PIP = ROOT / "assets/characters/pip/pip_v1_1.blend"
GOAT = ROOT / "assets/characters/goat/goat_v1_1.blend"
if not PIP.exists():
    PIP = ROOT / "assets/characters/pip/pip_v1.blend"
if not GOAT.exists():
    GOAT = ROOT / "assets/characters/goat/goat_v1.blend"

OUT = ROOT / "artifacts/performance/visual-approval"
STILLS = OUT / "stills"
EXPR = OUT / "expressions"
MOTION = OUT / "motion"
REF = OUT / "reference"

# Inexpensive EEVEE settings for review
RES = (540, 960)
SAMPLES = 8
MOTION_FRAMES = 24


def setup_world(scene, color=(0.55, 0.72, 0.92)):
    import bpy

    world = bpy.data.worlds.new("VAWorld") if not scene.world else scene.world
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (*color, 1.0)
        bg.inputs[1].default_value = 0.9


def setup_lights():
    import bpy

    bpy.ops.object.light_add(type="SUN", location=(2.5, -2.0, 5.0))
    bpy.context.object.data.energy = 3.5
    bpy.ops.object.light_add(type="AREA", location=(-1.2, -1.5, 1.2))
    bpy.context.object.data.energy = 55
    bpy.context.object.data.size = 2.0
    bpy.ops.object.light_add(type="AREA", location=(1.5, 1.0, 0.8))
    bpy.context.object.data.energy = 28
    bpy.context.object.data.size = 1.5


def append_character(path: Path, prefix: str):
    import bpy

    with bpy.data.libraries.load(str(path), link=False) as (data_from, data_to):
        data_to.objects = list(data_from.objects)
        data_to.actions = list(data_from.actions)
    imported = []
    for obj in data_to.objects:
        if obj is None:
            continue
        bpy.context.collection.objects.link(obj)
        imported.append(obj)
    arm = next((o for o in imported if o.type == "ARMATURE"), None)
    mesh = next((o for o in imported if o.type == "MESH" and f"{prefix}_Character" in o.name), None)
    return imported, arm, mesh


def clear_scene():
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)


def look_at(cam, target):
    import mathutils

    direction = mathutils.Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def place_camera(mode: str, subject="pip"):
    import bpy

    # Subject heights
    focus = (0.0, 0.0, 0.28) if subject == "pip" else (0.0, 0.0, 0.55)
    dist = 1.15 if subject == "pip" else 2.2
    elev = 0.32 if subject == "pip" else 0.65
    cams = {
        "front": (0.0, -dist, elev),
        "left": (-dist, 0.0, elev),
        "right": (dist, 0.0, elev),
        "rear": (0.0, dist, elev),
        "three_quarter": (dist * 0.55, -dist * 0.85, elev),
        "closeup": (0.08, -0.55 if subject == "pip" else -1.0, 0.42 if subject == "pip" else 0.82),
        "full_body": (0.35, -dist * 1.15, elev * 0.9),
        "backpack": (0.55, 0.85, elev),
        "collar_tag": (0.0, -0.85, 0.62),
        "two_shot": (0.9, -3.2, 0.7),
        "adventure": (1.6, -2.8, 0.85),
    }
    loc = cams.get(mode, cams["front"])
    if mode == "closeup":
        focus = (0.0, -0.05, 0.42) if subject == "pip" else (0.0, -0.25, 0.82)
    if mode == "collar_tag":
        focus = (0.0, -0.3, 0.62)
    if mode in ("two_shot", "adventure"):
        focus = (0.35, 0.0, 0.45)
    cam_data = bpy.data.cameras.new("VACam")
    cam = bpy.data.objects.new("VACam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = loc
    look_at(cam, focus)
    bpy.context.scene.camera = cam
    if mode == "closeup":
        cam.data.lens = 50
    elif mode == "collar_tag":
        cam.data.lens = 70
    else:
        cam.data.lens = 35
    return cam


def render_still(path: Path, samples=SAMPLES, res=RES):
    import bpy

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = samples
    scene.render.resolution_x = res[0]
    scene.render.resolution_y = res[1]
    scene.render.filepath = str(path)
    scene.render.image_settings.file_format = "PNG"
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)


def set_expr(mesh, name: str, value=1.0):
    if not mesh or not mesh.data.shape_keys:
        return
    # reset expression-ish keys
    for kb in mesh.data.shape_keys.key_blocks:
        if kb.name.startswith("expr_") or kb.name in (
            "jaw_open",
            "mouth_smile",
            "mouth_frown",
            "brow_up",
            "brow_down",
            "blink_left",
            "blink_right",
        ):
            kb.value = 0.0
    mapping = {
        "neutral": [],
        "happy": [("expr_happy", 1.0), ("mouth_smile", 0.8)],
        "excited": [("expr_excited", 1.0), ("mouth_smile", 1.0), ("brow_up", 0.6)],
        "surprised": [("expr_surprised", 1.0), ("jaw_open", 0.85), ("brow_up", 0.9)],
        "worried": [("expr_worried", 1.0), ("mouth_frown", 0.7), ("brow_down", 0.5)],
        "sad": [("expr_sad", 1.0), ("mouth_frown", 0.9), ("brow_down", 0.4)],
        "thinking": [("expr_thinking", 1.0), ("brow_up", 0.5)],
        "shy": [("expr_shy", 1.0), ("mouth_frown", 0.3)],
        "determined": [("expr_determined", 1.0), ("brow_down", 0.7)],
        "confused": [("expr_confused", 1.0), ("brow_down", 0.35), ("brow_up", 0.35)],
        "laughing": [("expr_laughing", 1.0), ("mouth_smile", 1.0), ("jaw_open", 0.4)],
        "scared": [("expr_scared", 1.0), ("jaw_open", 0.7), ("brow_up", 0.8)],
        "proud": [("expr_proud", 1.0), ("mouth_smile", 0.7)],
    }
    for key, val in mapping.get(name, []):
        kb = mesh.data.shape_keys.key_blocks.get(key)
        if kb:
            kb.value = val


def apply_action(arm, name: str):
    import bpy

    if not arm:
        return False
    action = None
    for a in bpy.data.actions:
        if a.name == name or a.name.endswith(name):
            action = a
            break
    if not action:
        return False
    if not arm.animation_data:
        arm.animation_data_create()
    arm.animation_data.action = action
    return True


def ffmpeg_mp4(frame_pattern: Path, out_mp4: Path, fps=12):
    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-framerate",
        str(fps),
        "-i",
        str(frame_pattern),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "28",
        str(out_mp4),
    ]
    subprocess.run(cmd, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def render_character_stills(who: str, blend: Path):
    import bpy

    prefix = "Pip" if who == "pip" else "Goat"
    views = ["front", "left", "right", "rear", "three_quarter", "closeup", "full_body"]
    if who == "pip":
        views.append("backpack")
    else:
        views.append("collar_tag")

    paths = {}
    for view in views:
        clear_scene()
        setup_world(bpy.context.scene)
        setup_lights()
        _, arm, mesh = append_character(blend, prefix)
        place_camera(view, subject=who)
        if who == "goat" and view == "collar_tag" and mesh:
            mesh.hide_render = True
        out = STILLS / who / f"{view}.png"
        render_still(out)
        paths[view] = str(out)
    return paths


def render_expression_sheet(who: str, blend: Path):
    import bpy

    prefix = "Pip" if who == "pip" else "Goat"
    exprs = [
        "neutral",
        "happy",
        "excited",
        "surprised",
        "worried",
        "sad",
        "thinking",
        "shy",
        "determined",
        "confused",
        "laughing",
        "scared",
        "proud",
    ]
    paths = {}
    for ex in exprs:
        clear_scene()
        setup_world(bpy.context.scene)
        setup_lights()
        _, arm, mesh = append_character(blend, prefix)
        set_expr(mesh, ex)
        place_camera("closeup", subject=who)
        out = EXPR / who / f"{ex}.png"
        render_still(out, samples=6)
        paths[ex] = str(out)
    return paths


def render_motion(who: str, blend: Path, actions: list[str]):
    import bpy

    prefix = "Pip" if who == "pip" else "Goat"
    paths = {}
    for act in actions:
        clear_scene()
        setup_world(bpy.context.scene)
        setup_lights()
        _, arm, mesh = append_character(blend, prefix)
        apply_action(arm, act)
        place_camera("three_quarter", subject=who)
        scene = bpy.context.scene
        scene.frame_start = 1
        scene.frame_end = MOTION_FRAMES
        scene.render.fps = 12
        frame_dir = MOTION / who / act.lower()
        if frame_dir.exists():
            shutil.rmtree(frame_dir)
        frame_dir.mkdir(parents=True, exist_ok=True)
        scene.render.filepath = str(frame_dir / "frame_")
        scene.render.image_settings.file_format = "PNG"
        scene.render.engine = "BLENDER_EEVEE"
        scene.eevee.taa_render_samples = 4
        scene.render.resolution_x = RES[0]
        scene.render.resolution_y = RES[1]
        bpy.ops.render.render(animation=True)
        mp4 = MOTION / who / f"{act.lower()}.mp4"
        ffmpeg_mp4(frame_dir / "frame_%04d.png", mp4, fps=12)
        paths[act] = str(mp4)
    return paths


def render_together():
    import bpy

    paths = {}
    for mode, name in (("two_shot", "front_two_shot"), ("adventure", "three_quarter_adventure")):
        clear_scene()
        setup_world(bpy.context.scene)
        setup_lights()
        pip_objs, pip_arm, pip_mesh = append_character(PIP, "Pip")
        goat_objs, goat_arm, goat_mesh = append_character(GOAT, "Goat")
        # Offset characters side by side
        if pip_arm:
            pip_arm.location = (-0.35, 0.0, 0.0)
        if goat_arm:
            goat_arm.location = (0.55, 0.0, 0.0)
        if mode == "adventure":
            apply_action(pip_arm, "PIP_WAVE")
            apply_action(goat_arm, "GOAT_HEAD_NOD")
            set_expr(pip_mesh, "happy")
            set_expr(goat_mesh, "happy")
        place_camera(mode, subject="goat")
        out = STILLS / "together" / f"{name}.png"
        render_still(out)
        paths[name] = str(out)

    # Interaction clip
    clear_scene()
    setup_world(bpy.context.scene)
    setup_lights()
    _, pip_arm, pip_mesh = append_character(PIP, "Pip")
    _, goat_arm, goat_mesh = append_character(GOAT, "Goat")
    if pip_arm:
        pip_arm.location = (-0.35, 0.0, 0.0)
    if goat_arm:
        goat_arm.location = (0.55, 0.0, 0.0)
    apply_action(pip_arm, "PIP_TALK")
    apply_action(goat_arm, "GOAT_EAR_REACT")
    set_expr(pip_mesh, "happy")
    set_expr(goat_mesh, "thinking")
    place_camera("adventure", subject="goat")
    frame_dir = MOTION / "together" / "interaction"
    if frame_dir.exists():
        shutil.rmtree(frame_dir)
    frame_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = MOTION_FRAMES
    scene.render.fps = 12
    scene.render.filepath = str(frame_dir / "frame_")
    scene.render.image_settings.file_format = "PNG"
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 4
    scene.render.resolution_x = RES[0]
    scene.render.resolution_y = RES[1]
    bpy.ops.render.render(animation=True)
    mp4 = MOTION / "together" / "interaction.mp4"
    ffmpeg_mp4(frame_dir / "frame_%04d.png", mp4, fps=12)
    paths["interaction"] = str(mp4)
    return paths


def copy_references():
    REF.mkdir(parents=True, exist_ok=True)
    notes = {
        "pip_dna": ROOT.joinpath("docs/CHARACTERS/PIP.md").read_text() if ROOT.joinpath("docs/CHARACTERS/PIP.md").exists() else "",
        "goat_dna": ROOT.joinpath("docs/CHARACTERS/GOAT.md").read_text() if ROOT.joinpath("docs/CHARACTERS/GOAT.md").exists() else "",
        "note": "PRIMARY_CANONICAL_REFERENCE JPEGs in this environment are stub/test bytes; comparison uses locked DNA docs + production preview stills.",
    }
    (REF / "comparison_notes.json").write_text(json.dumps(notes, indent=2) + "\n")
    # Copy DNA docs for reviewers
    for src, dst in (
        (ROOT / "docs/CHARACTERS/PIP.md", REF / "PIP_DNA.md"),
        (ROOT / "docs/CHARACTERS/GOAT.md", REF / "GOAT_DNA.md"),
        (ROOT / "assets/characters/pip/preview.png", REF / "pip_v1_1_preview.png"),
        (ROOT / "assets/characters/goat/preview.png", REF / "goat_v1_1_preview.png"),
        (ROOT / "assets/characters/goat/collar_closeup.png", REF / "goat_collar_closeup.png"),
    ):
        if src.exists():
            shutil.copy2(src, dst)


def main():
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    copy_references()

    pip_stills = render_character_stills("pip", PIP)
    goat_stills = render_character_stills("goat", GOAT)
    together = render_together()
    pip_expr = render_expression_sheet("pip", PIP)
    goat_expr = render_expression_sheet("goat", GOAT)

    pip_motion = render_motion(
        "pip",
        PIP,
        ["PIP_IDLE", "PIP_WALK", "PIP_RUN", "PIP_WAVE", "PIP_JUMP", "PIP_TALK", "PIP_FLAP_EXCITED"],
    )
    goat_motion = render_motion(
        "goat",
        GOAT,
        ["GOAT_IDLE", "GOAT_WALK", "GOAT_RUN", "GOAT_HEAD_NOD", "GOAT_EAR_REACT", "GOAT_TALK", "GOAT_HAPPY_REACTION"],
    )

    report = {
        "package": "visual-approval-v1.1",
        "elapsedSeconds": round(time.time() - t0, 2),
        "pipBlend": str(PIP),
        "goatBlend": str(GOAT),
        "stills": {"pip": pip_stills, "goat": goat_stills, "together": together},
        "expressions": {"pip": pip_expr, "goat": goat_expr},
        "motion": {"pip": pip_motion, "goat": goat_motion, "together": together.get("interaction")},
        "resolution": {"x": RES[0], "y": RES[1]},
        "samples": SAMPLES,
        "motionFrames": MOTION_FRAMES,
    }
    (OUT / "visual-approval-manifest.json").write_text(json.dumps(report, indent=2) + "\n")
    print("VISUAL_APPROVAL_OK " + json.dumps({"out": str(OUT), "elapsed": report["elapsedSeconds"]}))


if __name__ == "__main__":
    main()
