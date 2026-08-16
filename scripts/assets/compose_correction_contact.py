#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path("/workspace")
SRC = ROOT / "artifacts/theatrical-v2/final-character-production/corrections"
OUT = SRC / "correction_contact_sheet.png"

files = [
    "01_goat_corrected_front_closeup.png",
    "02_goat_corrected_rear.png",
    "03_goat_corrected_rear_three_quarter.png",
    "04_pip_corrected_front_neutral_closeup.png",
    "05_pip_corrected_three_quarter_closeup.png",
    "06_pip_corrected_front_full.png",
    "07_pip_corrected_three_quarter_full.png",
    "08_corrected_pair.png",
]
labels = [
    "1 Goat front close-up",
    "2 Goat rear",
    "3 Goat rear 3/4",
    "4 Pip front ortho close-up",
    "5 Pip 3/4 close-up",
    "6 Pip front full",
    "7 Pip 3/4 full (wings)",
    "8 Pair comparison",
]

cell_w, cell_h = 270, 480
cols, rows = 4, 2
pad = 10
img = Image.new("RGB", (cols * cell_w + pad * 2, rows * cell_h + 70), (22, 20, 18))
draw = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
    title_f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 18)
except Exception:
    font = ImageFont.load_default()
    title_f = font
draw.text((pad, 12), "TivvleJoy targeted correction pass — validation (PR #24)", fill=(245, 236, 220), font=title_f)
for i, (fn, lab) in enumerate(zip(files, labels)):
    p = SRC / fn
    if not p.exists():
        continue
    im = Image.open(p).convert("RGB")
    im.thumbnail((cell_w - 8, cell_h - 36))
    x = pad + (i % cols) * cell_w
    y = 50 + (i // cols) * cell_h
    ox = x + (cell_w - im.width) // 2
    img.paste(im, (ox, y))
    draw.text((x + 6, y + im.height + 4), lab, fill=(230, 220, 200), font=font)
img.save(OUT, quality=90)
print("wrote", OUT, OUT.stat().st_size)
