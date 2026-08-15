#!/usr/bin/env python3
"""Sheets: binding / current Pip / reduced candidate / untouched original."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path("/workspace")
ORIG = ROOT / "artifacts/theatrical-v2/final-character-production/long-wing-original"
CAND = ROOT / "artifacts/theatrical-v2/final-character-production/long-wing-candidate"
CUR = ROOT / "artifacts/theatrical-v2/final-character-production/clean"
CORR = ROOT / "artifacts/theatrical-v2/final-character-production/corrections"
REFS = ROOT / "artifacts/theatrical-v2/source-package-validation/refs"
OUT = ORIG / "comparison"


def font(size: int):
    path = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    return ImageFont.truetype(str(path), size) if path.exists() else ImageFont.load_default()


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB")


def fit(im: Image.Image, height: int) -> Image.Image:
    width = max(1, int(im.size[0] * (height / im.size[1])))
    return im.resize((width, height), Image.Resampling.LANCZOS)


def sheet(cells: list[tuple[str, Path]], dest: Path, title: str) -> None:
    height = 900
    fitted = [(name, fit(load(path), height)) for name, path in cells if path.exists()]
    gap = 8
    width = sum(im.size[0] for _, im in fitted) + gap * (len(fitted) + 1)
    canvas = Image.new("RGB", (width, height + 100), (28, 26, 24))
    draw = ImageDraw.Draw(canvas)
    draw.text((12, 8), title, fill=(245, 236, 220), font=font(20))
    x = gap
    y = 42
    for name, im in fitted:
        canvas.paste(im, (x, y))
        draw.rectangle((x, y + im.size[1] - 32, x + im.size[0], y + im.size[1]), fill=(40, 36, 32))
        draw.text((x + 6, y + im.size[1] - 26), name, fill=(236, 226, 210), font=font(14))
        x += im.size[0] + gap
    dest.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dest, "PNG")
    print("wrote", dest)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    current_front = CORR / "06_pip_corrected_front_full.png"
    current_3q = CORR / "07_pip_corrected_three_quarter_full.png"
    current_face = CORR / "04_pip_corrected_front_neutral_closeup.png"
    sheet(
        [
            ("Binding front", REFS / "Pip_front.jpeg"),
            ("Current Pip", current_front),
            ("Reduced 19.4MB", CAND / "pip_long_wing_front.png"),
            ("Untouched original", ORIG / "pip_long_wing_original_front.png"),
        ],
        OUT / "front_binding_current_reduced_original.png",
        "Pip front — binding / current Prism / reduced / untouched original",
    )
    sheet(
        [
            ("Binding back", REFS / "Pip_back.jpeg"),
            ("Current Pip", CUR / "pip_final_back.png"),
            ("Reduced 19.4MB", CAND / "pip_long_wing_rear.png"),
            ("Untouched original", ORIG / "pip_long_wing_original_rear.png"),
        ],
        OUT / "rear_binding_current_reduced_original.png",
        "Pip rear — binding / current Prism / reduced / untouched original",
    )
    sheet(
        [
            ("Binding 3/4", REFS / "Pip_three_quarter.jpeg"),
            ("Current Pip", current_3q),
            ("Reduced 19.4MB", CAND / "pip_long_wing_front_three_quarter.png"),
            ("Untouched original", ORIG / "pip_long_wing_original_front_three_quarter.png"),
        ],
        OUT / "three_quarter_binding_current_reduced_original.png",
        "Pip 3/4 — binding / current Prism / reduced / untouched original",
    )
    sheet(
        [
            ("Current face", current_face),
            ("Reduced face", CAND / "pip_long_wing_face_closeup.png"),
            ("Original face", ORIG / "pip_long_wing_original_face_closeup.png"),
        ],
        OUT / "face_current_reduced_original.png",
        "Pip face — current Prism / reduced / untouched original",
    )
    sheet(
        [
            ("Original rear", ORIG / "pip_long_wing_original_rear.png"),
            ("Original strap close-up", ORIG / "pip_long_wing_original_strap_rear_closeup.png"),
            ("Original rear 3/4", ORIG / "pip_long_wing_original_rear_three_quarter.png"),
        ],
        OUT / "original_strap_continuity.png",
        "Untouched original — rear strap continuity",
    )


if __name__ == "__main__":
    main()
