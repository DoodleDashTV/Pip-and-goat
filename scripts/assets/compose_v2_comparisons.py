#!/usr/bin/env python3
"""Labelled before/after/binding comparison sheets for the v2 sculpt gate."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path("/workspace")
CLEAN = ROOT / "artifacts/theatrical-v2/sculpt-revision/clean"
BEFORE = ROOT / "artifacts/theatrical-v2/sculpt-revision/before"
THIS = ROOT / "artifacts/theatrical-v2/sculpt-revision/before_this_pass"
FAILED = ROOT / "artifacts/theatrical-v2/sculpt-revision/failed-stretch"
REFS = ROOT / "artifacts/theatrical-v2/source-package-validation/refs"
OUT = ROOT / "artifacts/theatrical-v2/sculpt-revision/comparison"


def font(size: int):
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def load(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB")


def fit(im: Image.Image, height: int) -> Image.Image:
    w, h = im.size
    width = max(1, int(w * (height / h)))
    return im.resize((width, height), Image.Resampling.LANCZOS)


def label_bar(width: int, text: str, fill=(36, 40, 46)) -> Image.Image:
    bar = Image.new("RGB", (width, 54), fill)
    draw = ImageDraw.Draw(bar)
    draw.text((16, 12), text, fill=(255, 255, 255), font=font(26))
    return bar


def sheet(cells: list[tuple[str, Image.Image]], dest: Path, title: str) -> None:
    height = 1100
    fitted = [(name, fit(im, height)) for name, im in cells]
    gap = 12
    width = sum(im.size[0] for _, im in fitted) + gap * (len(fitted) + 1)
    canvas = Image.new("RGB", (width, height + 54 + 64), (228, 230, 233))
    canvas.paste(label_bar(width, title, (28, 70, 92)), (0, 0))
    x = gap
    y = 54 + gap
    for name, im in fitted:
        canvas.paste(im, (x, y))
        tag = label_bar(im.size[0], name, (52, 58, 66))
        canvas.paste(tag, (x, y + im.size[1] - 54))
        x += im.size[0] + gap
    dest.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dest, "PNG")


def crop_box(im: Image.Image, box) -> Image.Image:
    w, h = im.size
    l, t, r, b = box
    return im.crop((int(l * w), int(t * h), int(r * w), int(b * h)))


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    pip_map = {
        "front": ("pip_front.png", "pip_revised_front.png", "Pip_front.jpeg"),
        "three_quarter": ("pip_three_quarter.png", "pip_revised_three_quarter.png", "Pip_three_quarter.jpeg"),
        "side": ("pip_side.png", "pip_revised_side.png", "Pip_profile_facing_left.jpeg"),
        "back": ("pip_back.png", "pip_revised_back.png", "Pip_back.jpeg"),
    }
    for view, (before_name, after_name, ref_name) in pip_map.items():
        sheet(
            [
                ("BEFORE last usable", load(BEFORE / before_name)),
                ("AFTER overnight", load(CLEAN / after_name)),
                ("BINDING sheet", load(REFS / ref_name)),
            ],
            OUT / f"pip_{view}_before_after.png",
            f"Pip {view.replace('_', ' ')} — last usable | current | binding JPEG",
        )
    if (THIS / "pip_revised_front.png").exists():
        this_map = {
            "front": ("pip_revised_front.png", "pip_revised_front.png", "Pip_front.jpeg"),
            "three_quarter": ("pip_revised_three_quarter.png", "pip_revised_three_quarter.png", "Pip_three_quarter.jpeg"),
            "side": ("pip_revised_side.png", "pip_revised_side.png", "Pip_profile_facing_left.jpeg"),
            "back": ("pip_revised_back.png", "pip_revised_back.png", "Pip_back.jpeg"),
        }
        for view, (before_name, after_name, ref_name) in this_map.items():
            sheet(
                [
                    ("BEFORE this Justin pass", load(THIS / before_name)),
                    ("AFTER this Justin pass", load(CLEAN / after_name)),
                    ("BINDING sheet", load(REFS / ref_name)),
                ],
                OUT / f"pip_{view}_justin_pass.png",
                f"Pip {view.replace('_', ' ')} — previous overnight | Justin pass | binding JPEG",
            )
    if (FAILED / "pip_revised_front.png").exists():
        sheet(
            [
                ("Failed stretch (do not keep)", load(FAILED / "pip_revised_front.png")),
                ("Overnight repair", load(CLEAN / "pip_revised_front.png")),
                ("BINDING front", load(REFS / "Pip_front.jpeg")),
            ],
            OUT / "pip_front_failed_stretch_vs_repair.png",
            "Pip front — rejected shredded stretch vs overnight repair vs binding",
        )
    after_front = load(CLEAN / "pip_revised_front.png")
    after_side = load(CLEAN / "pip_revised_side.png")
    after_3q = load(CLEAN / "pip_revised_three_quarter.png")
    after_back = load(CLEAN / "pip_revised_back.png")
    sheet(
        [
            ("AFTER wing front", crop_box(after_front, (0.18, 0.38, 0.82, 0.86))),
            ("AFTER wing 3/4", crop_box(after_3q, (0.16, 0.36, 0.84, 0.88))),
            ("BINDING wing front", crop_box(load(REFS / "Pip_front.jpeg"), (0.18, 0.38, 0.82, 0.86))),
        ],
        OUT / "pip_wings_close.png",
        "Pip wings — overnight vs binding (shoulder to lower belly / upper thigh)",
    )
    sheet(
        [
            ("AFTER crest side", crop_box(after_side, (0.28, 0.04, 0.78, 0.42))),
            ("AFTER crest 3/4", crop_box(after_3q, (0.28, 0.04, 0.78, 0.40))),
            ("BINDING crest 3/4", crop_box(load(REFS / "Pip_three_quarter.jpeg"), (0.28, 0.02, 0.78, 0.38))),
        ],
        OUT / "pip_crest_profile.png",
        "Pip crest — must read as exactly three coral feathers",
    )
    sheet(
        [
            ("AFTER satchel front", crop_box(after_front, (0.22, 0.42, 0.80, 0.82))),
            ("AFTER satchel 3/4", crop_box(after_3q, (0.20, 0.40, 0.84, 0.84))),
            ("BINDING satchel front", crop_box(load(REFS / "Pip_front.jpeg"), (0.22, 0.42, 0.80, 0.82))),
        ],
        OUT / "pip_satchel_laterality.png",
        "Pip satchel — strap over character-right shoulder, bag on character-left hip",
    )
    sheet(
        [
            ("AFTER hallux side", crop_box(after_side, (0.28, 0.72, 0.78, 0.98))),
            ("AFTER hallux back", crop_box(after_back, (0.28, 0.78, 0.72, 0.98))),
            ("BINDING hallux profile", crop_box(load(REFS / "Pip_profile_facing_left.jpeg"), (0.28, 0.72, 0.78, 0.98))),
        ],
        OUT / "pip_hallux.png",
        "Pip feet — three forward toes and planted rear hallux",
    )
    sheet(
        [
            ("AFTER goat back", load(CLEAN / "goat_revised_back.png")),
            ("BINDING goat back", load(REFS / "Goat_back.jpeg")),
            ("AFTER goat 3/4", load(CLEAN / "goat_revised_three_quarter.png")),
        ],
        OUT / "goat_back_patch.png",
        "Goat back patch — cinnamon teardrop below scarf, point down the spine",
    )
    sheet(
        [
            ("AFTER pair front", load(CLEAN / "pair_front.png")),
            ("AFTER pair 3/4", load(CLEAN / "pair_three_quarter.png")),
            ("AFTER pair side", load(CLEAN / "pair_side.png")),
        ],
        OUT / "pair_scale.png",
        "Pair scale — Goat must remain approximately 1.5× Pip character height",
    )
    print(f"wrote comparison sheets to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
