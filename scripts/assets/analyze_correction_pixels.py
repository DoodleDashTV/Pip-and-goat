#!/usr/bin/env python3
"""Measure white forehead spots and brown back marks in correction renders."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path("/workspace")
CORR = ROOT / "artifacts/theatrical-v2/final-character-production/corrections"
OUT = ROOT / "theatrical-foundation/proposed/final-character-production/reports/TARGETED_PIXEL_ANALYSIS.json"


def load(name: str) -> np.ndarray:
    im = Image.open(CORR / name).convert("RGB")
    return np.asarray(im, dtype=np.float32) / 255.0


def region_stats(arr: np.ndarray, y0, y1, x0, x1, label: str) -> dict:
    crop = arr[y0:y1, x0:x1]
    lum = crop.mean(axis=2)
    white = (crop[..., 0] > 0.88) & (crop[..., 1] > 0.88) & (crop[..., 2] > 0.88) & (lum > 0.90)
    brown = (crop[..., 0] > 0.28) & (crop[..., 0] > crop[..., 1] + 0.08) & (crop[..., 2] < 0.28) & (crop[..., 1] < 0.42)
    return {
        "label": label,
        "shape": list(crop.shape[:2]),
        "mean_rgb": [float(crop[..., i].mean()) for i in range(3)],
        "max_lum": float(lum.max()),
        "white_frac": float(white.mean()),
        "white_count": int(white.sum()),
        "brown_frac": float(brown.mean()),
        "brown_count": int(brown.sum()),
    }


def main() -> None:
    front = load("01_goat_corrected_front_closeup.png")
    rear = load("02_goat_corrected_rear.png")
    pair = load("08_corrected_pair.png")
    h, w = front.shape[:2]
    rh, rw = rear.shape[:2]
    ph, pw = pair.shape[:2]
    report = {
        "front": {
            "size": [w, h],
            "brow_band": region_stats(front, int(h * 0.28), int(h * 0.48), int(w * 0.22), int(w * 0.78), "brow"),
            "forehead": region_stats(front, int(h * 0.12), int(h * 0.32), int(w * 0.28), int(w * 0.72), "forehead"),
            "left_eye": region_stats(front, int(h * 0.42), int(h * 0.68), int(w * 0.18), int(w * 0.46), "viewer_left_eye"),
            "right_eye": region_stats(front, int(h * 0.42), int(h * 0.68), int(w * 0.54), int(w * 0.82), "viewer_right_eye"),
        },
        "rear": {
            "size": [rw, rh],
            "upper_back": region_stats(rear, int(rh * 0.28), int(rh * 0.48), int(rw * 0.32), int(rw * 0.68), "upper_back"),
            "mid_back": region_stats(rear, int(rh * 0.48), int(rh * 0.62), int(rw * 0.36), int(rw * 0.64), "mid_back"),
            "tail_band": region_stats(rear, int(rh * 0.62), int(rh * 0.78), int(rw * 0.38), int(rw * 0.62), "tail_band"),
        },
        "pair": {
            "size": [pw, ph],
            "goat_forehead": region_stats(pair, int(ph * 0.18), int(ph * 0.32), int(pw * 0.52), int(pw * 0.88), "goat_forehead"),
        },
    }
    OUT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
