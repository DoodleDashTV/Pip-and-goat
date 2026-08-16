#!/usr/bin/env python3
"""Make phone-viewable JPEGs and a contact sheet from an intake preview folder."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PHONE_MAX = (540, 960)


def font(size: int):
    path = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    return ImageFont.truetype(str(path), size) if path.exists() else ImageFont.load_default()


def to_phone(src: Path, dest: Path) -> None:
    im = Image.open(src).convert("RGB")
    im.thumbnail(PHONE_MAX, Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "JPEG", quality=82, optimize=True)


def contact_sheet(paths: list[Path], dest: Path, title: str) -> None:
    cells = []
    for path in paths:
        if path.exists():
            im = Image.open(path).convert("RGB")
            im.thumbnail((280, 500), Image.Resampling.LANCZOS)
            cells.append((path.stem, im))
    if not cells:
        return
    cols = min(4, len(cells))
    rows = (len(cells) + cols - 1) // cols
    cell_w = max(im.size[0] for _, im in cells) + 8
    cell_h = max(im.size[1] for _, im in cells) + 28
    canvas = Image.new("RGB", (cols * cell_w + 16, rows * cell_h + 48), (28, 26, 24))
    draw = ImageDraw.Draw(canvas)
    draw.text((10, 8), title, fill=(245, 236, 220), font=font(18))
    for index, (name, im) in enumerate(cells):
        col = index % cols
        row = index // cols
        x = 8 + col * cell_w
        y = 40 + row * cell_h
        canvas.paste(im, (x, y))
        draw.text((x, y + im.size[1] + 4), name, fill=(220, 210, 196), font=font(12))
    dest.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dest, "JPEG", quality=84, optimize=True)
    phone = dest.with_name(dest.stem + "_phone.jpg")
    sheet = Image.open(dest)
    sheet.thumbnail((1080, 1920), Image.Resampling.LANCZOS)
    sheet.save(phone, "JPEG", quality=80, optimize=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--previews", required=True)
    parser.add_argument("--phone", required=True)
    parser.add_argument("--title", default="Pip replacement intake")
    args = parser.parse_args()
    previews = Path(args.previews)
    phone = Path(args.phone)
    phone.mkdir(parents=True, exist_ok=True)
    order = [
        "front",
        "rear",
        "left",
        "right",
        "front_three_quarter",
        "three_quarter",
        "rear_three_quarter",
        "shoulder_left",
        "shoulder_right",
        "backpack_attachment",
        "backpack_wing_clearance",
        "satchel_left",
        "face",
    ]
    written = []
    for name in order:
        src = previews / f"{name}.png"
        if src.exists():
            dest = phone / f"{name}.jpg"
            to_phone(src, dest)
            written.append(dest)
    for src in sorted(previews.glob("turntable_*.png")):
        dest = phone / f"{src.stem}.jpg"
        to_phone(src, dest)
        written.append(dest)
    contact_sheet(written, phone / "contact_sheet.jpg", args.title)
    print(f"wrote {len(written)} phone jpegs to {phone}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
