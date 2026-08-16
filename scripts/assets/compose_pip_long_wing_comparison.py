#!/usr/bin/env python3
"""Comparison sheets: long-wing candidate vs current Pip vs binding sheets."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path("/workspace")
CAND = ROOT / "artifacts/theatrical-v2/final-character-production/long-wing-candidate"
CUR = ROOT / "artifacts/theatrical-v2/final-character-production/clean"
CORR = ROOT / "artifacts/theatrical-v2/final-character-production/corrections"
REFS = ROOT / "artifacts/theatrical-v2/source-package-validation/refs"
OUT = CAND / "comparison"


def font(size: int):
    path = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    return ImageFont.truetype(str(path), size) if path.exists() else ImageFont.load_default()


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB")


def fit(im: Image.Image, height: int) -> Image.Image:
    width = max(1, int(im.size[0] * (height / im.size[1])))
    return im.resize((width, height), Image.Resampling.LANCZOS)


def sheet(cells: list[tuple[str, Path]], dest: Path, title: str) -> None:
    height = 980
    fitted = [(name, fit(load(path), height)) for name, path in cells if path.exists()]
    gap = 10
    width = sum(im.size[0] for _, im in fitted) + gap * (len(fitted) + 1)
    canvas = Image.new("RGB", (width, height + 108), (28, 26, 24))
    draw = ImageDraw.Draw(canvas)
    draw.text((14, 10), title, fill=(245, 236, 220), font=font(22))
    x = gap
    y = 48
    for name, im in fitted:
        canvas.paste(im, (x, y))
        draw.rectangle((x, y + im.size[1] - 36, x + im.size[0], y + im.size[1]), fill=(40, 36, 32))
        draw.text((x + 8, y + im.size[1] - 30), name, fill=(236, 226, 210), font=font(16))
        x += im.size[0] + gap
    dest.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dest, "PNG")
    print("wrote", dest)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    current_front = CORR / "06_pip_corrected_front_full.png"
    if not current_front.exists():
        current_front = CUR / "pip_final_front.png"
    current_back = CUR / "pip_final_back.png"
    current_3q = CORR / "07_pip_corrected_three_quarter_full.png"
    if not current_3q.exists():
        current_3q = CUR / "pip_final_three_quarter.png"
    sheet(
        [
            ("Binding front", REFS / "Pip_front.jpeg"),
            ("Current Pip front", current_front),
            ("Long-wing candidate front", CAND / "pip_long_wing_front.png"),
        ],
        OUT / "front_binding_current_candidate.png",
        "Pip front — binding sheet / current Prism / long-wing candidate",
    )
    sheet(
        [
            ("Binding back", REFS / "Pip_back.jpeg"),
            ("Current Pip back", current_back),
            ("Long-wing candidate back", CAND / "pip_long_wing_rear.png"),
        ],
        OUT / "rear_binding_current_candidate.png",
        "Pip rear — binding sheet / current Prism / long-wing candidate",
    )
    sheet(
        [
            ("Binding 3/4", REFS / "Pip_three_quarter.jpeg"),
            ("Current Pip 3/4", current_3q),
            ("Long-wing candidate 3/4", CAND / "pip_long_wing_front_three_quarter.png"),
        ],
        OUT / "three_quarter_binding_current_candidate.png",
        "Pip three-quarter — binding sheet / current Prism / long-wing candidate",
    )
    sheet(
        [
            ("Candidate rear", CAND / "pip_long_wing_rear.png"),
            ("Candidate strap close-up", CAND / "pip_long_wing_strap_rear_closeup.png"),
            ("Candidate rear 3/4", CAND / "pip_long_wing_rear_three_quarter.png"),
        ],
        OUT / "strap_continuity.png",
        "Long-wing candidate — rear strap continuity",
    )
    sheet(
        [
            ("Current face", CORR / "04_pip_corrected_front_neutral_closeup.png"),
            ("Candidate face", CAND / "pip_long_wing_face_closeup.png"),
        ],
        OUT / "face_current_vs_candidate.png",
        "Pip face — current Prism vs long-wing candidate",
    )


if __name__ == "__main__":
    main()
