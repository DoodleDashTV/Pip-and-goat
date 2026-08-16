#!/usr/bin/env python3
"""Aligned binding vs proposed comparison sheets for final-character-production."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = Path("/workspace")
CLEAN = ROOT / "artifacts/theatrical-v2/final-character-production/clean"
CLOSE = ROOT / "artifacts/theatrical-v2/final-character-production/closeups"
FEATURE = ROOT / "artifacts/theatrical-v2/final-character-production/feature"
REFS = ROOT / "artifacts/theatrical-v2/source-package-validation/refs"
OUT = ROOT / "artifacts/theatrical-v2/final-character-production/comparison"
PHONE = ROOT / "artifacts/theatrical-v2/final-character-production/phone"


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
    width = max(1, int(im.size[0] * (height / im.size[1])))
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


def silhouette(im: Image.Image) -> Image.Image:
    gray = ImageOps.grayscale(im)
    mask = gray.point(lambda p: 255 if p < 232 else 0)
    edge = mask.filter(ImageFilter.FIND_EDGES).point(lambda p: 255 if p > 8 else 0)
    rgb = Image.new("RGB", im.size, (236, 238, 240))
    rgb.paste((28, 36, 44), mask=edge)
    return rgb


def overlay(proposed: Image.Image, binding: Image.Image) -> Image.Image:
    a = fit(proposed, 1100)
    b = fit(binding, 1100)
    if b.size != a.size:
        b = b.resize(a.size, Image.Resampling.LANCZOS)
    return Image.blend(a, b, 0.42)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    PHONE.mkdir(parents=True, exist_ok=True)
    pairs = {
        "pip_front": ("pip_final_front.png", "Pip_front.jpeg", "Pip front"),
        "pip_three_quarter": ("pip_final_three_quarter.png", "Pip_three_quarter.jpeg", "Pip three-quarter"),
        "pip_side": ("pip_final_side.png", "Pip_profile_facing_left.jpeg", "Pip side / profile facing left"),
        "pip_back": ("pip_final_back.png", "Pip_back.jpeg", "Pip back"),
        "goat_front": ("goat_final_front.png", "Goat_front.jpeg", "Goat front"),
        "goat_three_quarter": ("goat_final_three_quarter.png", "Goat_three_quarter.jpeg", "Goat three-quarter"),
        "goat_side": ("goat_final_side.png", "Goat_profile_facing_left.jpeg", "Goat side / profile facing left"),
        "goat_back": ("goat_final_back.png", "Goat_back.jpeg", "Goat back"),
    }
    for stem, (prop, ref, title) in pairs.items():
        proposed = load(CLEAN / prop)
        binding = load(REFS / ref)
        sheet(
            [
                ("PROPOSED Prism candidate", proposed),
                ("BINDING sheet", binding),
                ("Silhouette overlay", overlay(proposed, binding)),
            ],
            OUT / f"{stem}_vs_binding.png",
            f"{title} — proposed | binding | 42% overlay",
        )
        sheet(
            [
                ("PROPOSED silhouette", silhouette(proposed)),
                ("BINDING silhouette", silhouette(binding)),
            ],
            OUT / f"{stem}_silhouette.png",
            f"{title} — silhouette comparison",
        )
    pip_front = load(CLEAN / "pip_final_front.png")
    pip_3q = load(CLEAN / "pip_final_three_quarter.png")
    pip_side = load(CLEAN / "pip_final_side.png")
    pip_back = load(CLEAN / "pip_final_back.png")
    pip_face = load(CLEAN / "pip_final_face.png")
    goat_back = load(CLEAN / "goat_final_back.png")
    goat_front = load(CLEAN / "goat_final_front.png")
    sheet(
        [
            ("PROPOSED crest face", crop_box(pip_face, (0.18, 0.02, 0.82, 0.42))),
            ("PROPOSED crest 3/4", crop_box(pip_3q, (0.28, 0.02, 0.78, 0.38))),
            ("BINDING crest 3/4", crop_box(load(REFS / "Pip_three_quarter.jpeg"), (0.28, 0.02, 0.78, 0.38))),
        ],
        OUT / "pip_crest_close.png",
        "Pip crest — must read as exactly three coral feathers",
    )
    sheet(
        [
            ("PROPOSED satchel front", crop_box(pip_front, (0.20, 0.40, 0.82, 0.84))),
            ("PROPOSED satchel 3/4", crop_box(pip_3q, (0.18, 0.40, 0.86, 0.86))),
            ("BINDING satchel front", crop_box(load(REFS / "Pip_front.jpeg"), (0.20, 0.40, 0.82, 0.84))),
        ],
        OUT / "pip_satchel_laterality.png",
        "Pip satchel — strap character-right shoulder, bag character-left hip",
    )
    sheet(
        [
            ("PROPOSED hallux side", crop_box(pip_side, (0.28, 0.72, 0.78, 0.98))),
            ("PROPOSED hallux back", crop_box(pip_back, (0.28, 0.78, 0.72, 0.98))),
            ("BINDING hallux profile", crop_box(load(REFS / "Pip_profile_facing_left.jpeg"), (0.28, 0.72, 0.78, 0.98))),
        ],
        OUT / "pip_hallux.png",
        "Pip feet — three forward toes and planted rear hallux",
    )
    sheet(
        [
            ("PROPOSED goat back", goat_back),
            ("BINDING goat back", load(REFS / "Goat_back.jpeg")),
            ("PROPOSED goat front laterality", goat_front),
        ],
        OUT / "goat_back_patch.png",
        "Goat back — cinnamon teardrop below scarf, point down the spine",
    )
    sheet(
        [
            ("PROPOSED pair front", load(CLEAN / "pair_front.png")),
            ("PROPOSED pair 3/4", load(CLEAN / "pair_three_quarter.png")),
            ("PROPOSED pair side", load(CLEAN / "pair_side.png")),
        ],
        OUT / "pair_scale.png",
        "Pair scale — Goat must remain approximately 1.50× Pip height",
    )
    close_cells = []
    for name, path in (
        ("Pip strap", CLOSE / "pip_strap.png"),
        ("Pip wing", CLOSE / "pip_wing.png"),
        ("Pip crest", CLOSE / "pip_crest.png"),
        ("Pip eye", CLOSE / "pip_eye.png"),
        ("Goat eye patch", CLOSE / "goat_eye_patch.png"),
        ("Goat back mark", CLOSE / "goat_back_mark.png"),
        ("Goat horn", CLOSE / "goat_horn.png"),
        ("Goat compass", CLOSE / "goat_compass.png"),
        ("Goat fur", CLOSE / "goat_fur.png"),
    ):
        if path.exists():
            close_cells.append((name, load(path)))
    if close_cells:
        sheet(close_cells[:3], OUT / "pip_required_closeups.png", "Pip required close-ups — strap, wing, crest")
        if len(close_cells) >= 6:
            sheet(close_cells[4:8], OUT / "goat_required_closeups.png", "Goat required close-ups — patch, back, horn, compass")
    compose_phone()
    print(f"wrote comparison sheets to {OUT}")
    return 0


def compose_phone() -> None:
    cells = [
        ("Pip front", CLEAN / "pip_final_front.png"),
        ("Pip 3/4", CLEAN / "pip_final_three_quarter.png"),
        ("Pip side", CLEAN / "pip_final_side.png"),
        ("Pip back", CLEAN / "pip_final_back.png"),
        ("Pip face", CLEAN / "pip_final_face.png"),
        ("Goat front", CLEAN / "goat_final_front.png"),
        ("Goat 3/4", CLEAN / "goat_final_three_quarter.png"),
        ("Goat side", CLEAN / "goat_final_side.png"),
        ("Goat back", CLEAN / "goat_final_back.png"),
        ("Pair front", CLEAN / "pair_front.png"),
        ("Pip strap", CLOSE / "pip_strap.png"),
        ("Pip wing", CLOSE / "pip_wing.png"),
        ("Goat patch", CLOSE / "goat_eye_patch.png"),
        ("Goat back mark", CLOSE / "goat_back_mark.png"),
        ("Goat compass", CLOSE / "goat_compass.png"),
    ]
    cells = [(name, path) for name, path in cells if path.exists()]
    width = 1080
    thumb_h = 520
    gap = 10
    title_h = 72
    rows = []
    for i in range(0, len(cells), 2):
        pair = cells[i : i + 2]
        fitted = []
        for name, path in pair:
            im = fit(load(path), thumb_h)
            fitted.append((name, im))
        row_w = sum(im.size[0] for _, im in fitted) + gap * (len(fitted) + 1)
        scale = (width - 24) / row_w
        row = Image.new("RGB", (width, int(thumb_h * scale) + 48), (236, 238, 240))
        x = 12
        for name, im in fitted:
            im = im.resize((max(1, int(im.size[0] * scale)), int(thumb_h * scale)), Image.Resampling.LANCZOS)
            row.paste(im, (x, 0))
            draw = ImageDraw.Draw(row)
            draw.rectangle((x, im.size[1], x + im.size[0], im.size[1] + 48), fill=(40, 46, 54))
            draw.text((x + 12, im.size[1] + 10), name, fill=(255, 255, 255), font=font(22))
            x += im.size[0] + gap
        rows.append(row)
    height = title_h + sum(r.size[1] for r in rows) + 16
    canvas = Image.new("RGB", (width, height), (28, 70, 92))
    draw = ImageDraw.Draw(canvas)
    draw.text((24, 18), "TivvleJoy — Pip & Goat proposed Prism candidates", fill=(255, 255, 255), font=font(28))
    y = title_h
    for row in rows:
        canvas.paste(row, (0, y))
        y += row.size[1]
    dest = PHONE / "pip_goat_final_contact.jpg"
    dest.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(dest, "JPEG", quality=88, optimize=True)


if __name__ == "__main__":
    raise SystemExit(main())
