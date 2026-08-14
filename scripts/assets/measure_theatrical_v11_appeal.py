"""Measurable appeal guards for proposed theatrical v1.1.

These are regression guards, not visual approval.

  blender -b -noaudio --python scripts/assets/measure_theatrical_v11_appeal.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "assets"))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from theatrical_v11_common import (  # noqa: E402
    GOAT_APPEAL,
    GOAT_EYE_FLOOR,
    GOAT_EYE_TO_HEAD_FLOOR,
    PIP_APPEAL,
    PIP_EYE_FLOOR,
    PROPOSED_V11,
    assert_not_production_library,
    within_band,
)

FORBIDDEN_GROOM = ("feather_", "_groom", "_card", "fur_card")


def bbox(obj):
    xs, ys, zs = [], [], []
    for corner in obj.bound_box:
        w = obj.matrix_world @ Vector(corner)
        xs.append(w.x)
        ys.append(w.y)
        zs.append(w.z)
    return {
        "sizeX": max(xs) - min(xs),
        "sizeY": max(ys) - min(ys),
        "sizeZ": max(zs) - min(zs),
        "minZ": min(zs),
        "maxZ": max(zs),
        "centerX": (min(xs) + max(xs)) / 2,
        "centerY": (min(ys) + max(ys)) / 2,
        "centerZ": (min(zs) + max(zs)) / 2,
    }


def load(path: Path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with bpy.data.libraries.load(str(path), link=False) as (src, dst):
        dst.objects = list(src.objects)
    imported = []
    for obj in dst.objects:
        if obj is None:
            continue
        if obj.name not in bpy.context.scene.collection.objects:
            bpy.context.scene.collection.objects.link(obj)
        imported.append(obj)
    return imported


def measure_pip():
    imported = load(PROPOSED_V11 / "pip_theatrical_v1_1.blend")
    names = {o.name for o in imported}
    eyes = [o for o in imported if o.name.startswith("Pip_EyeWhite_")]
    head = next((o for o in imported if o.name == "Pip_Head" or o.name == "Pip_Character"), None)
    backpack = next((o for o in imported if "Backpack" in o.name and "Pouch" not in o.name), None)
    star = next((o for o in imported if "Star" in o.name), None)
    beak = next((o for o in imported if o.name == "Pip_Beak"), None)
    comb = [o for o in imported if o.name.startswith("Pip_Comb")]
    toes = [o for o in imported if "Toe" in o.name]
    forbidden = [n for n in names if any(tok in n.lower() for tok in FORBIDDEN_GROOM)]
    eye_r = max((max(bbox(e)["sizeX"], bbox(e)["sizeZ"]) / 2) for e in eyes) if eyes else 0.0
    head_r = max(bbox(head)["sizeX"], bbox(head)["sizeZ"]) / 2 if head else 0.0
    spacing = 0.0
    if len(eyes) >= 2:
        spacing = abs(bbox(eyes[0])["centerX"] - bbox(eyes[1])["centerX"])
    return {
        "eyeWhiteRadius": eye_r,
        "headRadius": head_r,
        "eyeToHead": (eye_r / head_r) if head_r else 0.0,
        "eyeSpacing": spacing,
        "beakPresent": beak is not None,
        "beakLength": bbox(beak)["sizeY"] if beak else 0.0,
        "crestCount": len(comb),
        "crestHeight": max((bbox(c)["sizeZ"] for c in comb), default=0.0),
        "backpackPresent": backpack is not None,
        "starPresent": star is not None,
        "threeToedFeet": len(toes) >= 6,
        "forbiddenGroom": forbidden,
        "groundContact": min((bbox(o)["minZ"] for o in imported if o.type == "MESH"), default=1.0) < 0.05,
    }


def measure_goat():
    imported = load(PROPOSED_V11 / "goat_theatrical_v1_1.blend")
    names = {o.name for o in imported}
    eyes = [o for o in imported if o.name.startswith("Goat_EyeWhite_")]
    head = next((o for o in imported if o.name in {"Goat_Head", "Goat_Character"}), None)
    collar = next((o for o in imported if o.name == "Goat_Collar"), None)
    tag = next((o for o in imported if o.name == "Goat_Tag"), None)
    text = next((o for o in imported if o.name == "Goat_Tag_Text"), None)
    horns = [o for o in imported if o.name.startswith("Goat_Horn_")]
    nose = next((o for o in imported if o.name == "Goat_Nose"), None)
    forbidden = [n for n in names if any(tok in n.lower() for tok in FORBIDDEN_GROOM)]
    eye_r = max((max(bbox(e)["sizeX"], bbox(e)["sizeZ"]) / 2) for e in eyes) if eyes else 0.0
    head_r = max(bbox(head)["sizeX"], bbox(head)["sizeZ"]) / 2 if head else 0.0
    spacing = 0.0
    if len(eyes) >= 2:
        spacing = abs(bbox(eyes[0])["centerX"] - bbox(eyes[1])["centerX"])
    return {
        "eyeWhiteRadius": eye_r,
        "headRadius": head_r,
        "eyeToHead": (eye_r / head_r) if head_r else 0.0,
        "eyeSpacing": spacing,
        "collarPresent": collar is not None,
        "tagPresent": tag is not None,
        "tagText": getattr(text.data, "body", "GOAT") if text and text.type == "FONT" else ("GOAT" if text else ""),
        "hornCount": len(horns),
        "hornLength": max((bbox(h)["sizeZ"] for h in horns), default=0.0),
        "nosePresent": nose is not None,
        "forbiddenGroom": forbidden,
        "groundContact": min((bbox(o)["minZ"] for o in imported if o.type == "MESH"), default=1.0) < 0.08,
    }


def evaluate(pip, goat):
    failures = []
    if pip["eyeWhiteRadius"] < PIP_EYE_FLOOR:
        failures.append("pip_eye_too_small")
    if not within_band(pip["eyeToHead"], PIP_APPEAL["eyeToHead"]):
        failures.append("pip_eye_to_head_out_of_band")
    if not pip["backpackPresent"] or not pip["starPresent"]:
        failures.append("pip_accessory_missing")
    if pip["eyeSpacing"] < 0.08:
        failures.append("pip_eyes_not_separated")
    if not pip["threeToedFeet"]:
        failures.append("pip_toes_missing")
    if pip["forbiddenGroom"]:
        failures.append("pip_forbidden_groom")
    if goat["eyeWhiteRadius"] < GOAT_EYE_FLOOR:
        failures.append("goat_eye_too_small")
    if goat["eyeToHead"] < GOAT_EYE_TO_HEAD_FLOOR:
        failures.append("goat_eye_appeal_regression")
    if goat["eyeSpacing"] < 0.10:
        failures.append("goat_eyes_not_separated")
    if not goat["collarPresent"] or not goat["tagPresent"]:
        failures.append("goat_accessory_missing")
    if goat["tagText"] != "GOAT":
        failures.append("goat_tag_text_missing")
    if goat["forbiddenGroom"]:
        failures.append("goat_forbidden_groom")
    if goat["hornCount"] < 2:
        failures.append("goat_horns_missing")
    return failures


def main() -> int:
    pip = measure_pip()
    goat = measure_goat()
    failures = evaluate(pip, goat)
    report = {
        "approved": False,
        "label": "proposed theatrical v1.1 appeal guards",
        "pip": pip,
        "goat": goat,
        "reference": {"pip": PIP_APPEAL, "goat": GOAT_APPEAL},
        "failures": failures,
        "guardsPassed": len(failures) == 0,
    }
    out = PROPOSED_V11 / "APPEAL_MEASUREMENTS.json"
    assert_not_production_library(out)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"status": "OK" if not failures else "FAIL", "failures": failures, "out": str(out)}, sort_keys=True))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
