#!/usr/bin/env python3
"""Stage 3 comparison sheets: NEW PROPOSED REBUILD beside BINDING SHEET only."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path("/workspace")
CLEAN = ROOT / "artifacts/theatrical-v2/production-rebuild/clean"
REFS = ROOT / "artifacts/theatrical-v2/source-package-validation/refs"
OUT = ROOT / "artifacts/theatrical-v2/production-rebuild/comparison"


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


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    pairs = {
        "pip_front": ("pip_rebuild_front.png", "Pip_front.jpeg", "Pip front"),
        "pip_three_quarter": ("pip_rebuild_three_quarter.png", "Pip_three_quarter.jpeg", "Pip three-quarter"),
        "pip_side": ("pip_rebuild_side.png", "Pip_profile_facing_left.jpeg", "Pip side / profile facing left"),
        "pip_back": ("pip_rebuild_back.png", "Pip_back.jpeg", "Pip back"),
        "goat_front": ("goat_rebuild_front.png", "Goat_front.jpeg", "Goat front"),
        "goat_three_quarter": ("goat_rebuild_three_quarter.png", "Goat_three_quarter.jpeg", "Goat three-quarter"),
        "goat_side": ("goat_rebuild_side.png", "Goat_profile_facing_left.jpeg", "Goat side / profile facing left"),
        "goat_back": ("goat_rebuild_back.png", "Goat_back.jpeg", "Goat back"),
    }
    written = []
    for stem, (rebuild, ref, title) in pairs.items():
        sheet(
            [
                ("NEW PROPOSED REBUILD", load(CLEAN / rebuild)),
                ("BINDING SHEET", load(REFS / ref)),
            ],
            OUT / f"{stem}_new_vs_binding.png",
            f"{title} — NEW PROPOSED REBUILD | BINDING SHEET",
        )
        written.append(f"artifacts/theatrical-v2/production-rebuild/comparison/{stem}_new_vs_binding.png")
    print(f"wrote {len(written)} comparison sheets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
