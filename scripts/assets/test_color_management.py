"""Regression tests for DDP colour management in the QC measurement path.

These exist because a colour-space mistake is invisible: the numbers still look
plausible, the gates still pass, and the picture is wrong anyway. The historical
defect was ``load_srgb`` applying an sRGB encode to PNG data that was already
sRGB-encoded, which inflated every brightness figure by ~1.77x — a stored mean
luma of 86.65 was reported as 153.53, so a render sitting at a third of range
scored inside a band written for a well-exposed one.

Runs without Blender:

  python3 scripts/assets/test_color_management.py
"""

from __future__ import annotations

import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
import zlib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "assets"))
sys.path.insert(0, str(REPO_ROOT / "scripts" / "blender"))

import numpy as np  # noqa: E402

from local_acceptance import frame_stats  # noqa: E402
from png_io import (  # noqa: E402
    SIGNATURE,
    UnsupportedPng,
    describe_png,
    read_stored_srgb,
    write_stored_srgb,
)


def srgb_encode(linear: np.ndarray) -> np.ndarray:
    """The transform the broken loader applied on top of encoded data."""
    low = linear <= 0.0031308
    return np.where(low, linear * 12.92, 1.055 * np.clip(linear, 1e-8, None) ** (1 / 2.4) - 0.055)


def chunk(kind: str, body: bytes) -> bytes:
    raw = kind.encode("latin1") + body
    return struct.pack(">I", len(body)) + raw + struct.pack(">I", zlib.crc32(raw) & 0xFFFFFFFF)


def write_filtered_png(path: Path, pixels: np.ndarray, filter_type: int) -> Path:
    """Write an 8-bit RGB PNG using one specific scanline filter on every row.

    The reader has to reverse all five PNG filters; libpng picks them
    adaptively, so a fixture that only ever uses filter 0 would leave four
    branches untested.
    """
    arr = np.asarray(pixels, dtype=np.uint8)
    height, width, _ = arr.shape
    stride = width * 3
    out = bytearray()
    prev = bytearray(stride)
    for row in arr:
        line = bytearray(row.tobytes())
        encoded = bytearray(stride)
        for i in range(stride):
            left = line[i - 3] if i >= 3 else 0
            up = prev[i]
            upleft = prev[i - 3] if i >= 3 else 0
            if filter_type == 0:
                pred = 0
            elif filter_type == 1:
                pred = left
            elif filter_type == 2:
                pred = up
            elif filter_type == 3:
                pred = (left + up) >> 1
            else:
                p = left + up - upleft
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - upleft)
                pred = left if (pa <= pb and pa <= pc) else (up if pb <= pc else upleft)
            encoded[i] = (line[i] - pred) & 0xFF
        out.append(filter_type)
        out.extend(encoded)
        prev = line
    data = bytearray(SIGNATURE)
    data += chunk("IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    data += chunk("IDAT", zlib.compress(bytes(out), 6))
    data += chunk("IEND", b"")
    path.write_bytes(bytes(data))
    return path


def write_header_only_png(path: Path, *, bit_depth: int = 8, color_type: int = 2, interlace: int = 0) -> Path:
    """A PNG whose header alone must be enough to refuse it."""
    data = bytearray(SIGNATURE)
    data += chunk("IHDR", struct.pack(">IIBBBBB", 4, 4, bit_depth, color_type, 0, 0, interlace))
    data += chunk("IDAT", zlib.compress(b"\x00" * 64, 6))
    data += chunk("IEND", b"")
    path.write_bytes(bytes(data))
    return path


class ColourManagementTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        cls.tmp = Path(cls._tmp.name)
        # A deterministic ramp plus saturated primaries and both extremes.
        rows = []
        for y in range(16):
            row = []
            for x in range(16):
                row.append((x * 17, y * 17, (x * y) % 256))
            rows.append(row)
        cls.known = np.array(rows, dtype=np.uint8)
        cls.known[0, 0] = (0, 0, 0)
        cls.known[0, 1] = (255, 255, 255)
        cls.known[0, 2] = (255, 0, 0)
        cls.known[0, 3] = (87, 87, 87)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def test_srgb_fixture_reads_back_exactly(self):
        """A known 8-bit sRGB file must measure as the values it stores."""
        path = write_stored_srgb(self.tmp / "srgb.png", self.known)
        got = read_stored_srgb(path)
        np.testing.assert_array_equal(got, self.known.astype(np.float64))

    def test_no_second_encode_applied(self):
        """The specific historical defect: encoding already-encoded data again."""
        grey = np.full((8, 8, 3), 87, dtype=np.uint8)
        path = write_stored_srgb(self.tmp / "grey.png", grey)
        got = read_stored_srgb(path)
        self.assertAlmostEqual(float(got.mean()), 87.0, places=6)
        double_encoded = float(srgb_encode(np.array(87 / 255.0)) * 255.0)
        self.assertAlmostEqual(double_encoded, 157.8, delta=0.5)  # what the bug produced
        self.assertGreater(double_encoded - float(got.mean()), 70.0)

    def test_known_linear_fixture_is_measured_once_encoded(self):
        """A linear ramp encoded to sRGB once must read back as that encoding.

        This is the round trip the render pipeline performs: Blender tone-maps and
        encodes linear render output, then writes 8-bit sRGB. The loader's job is
        to hand back exactly those stored values. Measuring the same file as if it
        still needed encoding is the defect, and on this fixture it lands 43 luma
        too high in the midtones.
        """
        linear = np.linspace(0.0, 1.0, 256, dtype=np.float64).reshape(16, 16)
        linear = np.repeat(linear[:, :, None], 3, axis=2)
        encoded_once = np.rint(srgb_encode(linear) * 255.0).astype(np.uint8)
        path = write_stored_srgb(self.tmp / "linear_ramp.png", encoded_once)

        got = read_stored_srgb(path)
        np.testing.assert_array_equal(got, encoded_once.astype(np.float64))
        # The stored file is NOT the linear values it came from...
        self.assertGreater(float(got.mean()) - float(linear.mean() * 255.0), 40.0)
        # ...and encoding it a second time inflates it again by about as much.
        twice = srgb_encode(encoded_once.astype(np.float64) / 255.0) * 255.0
        self.assertGreater(float(twice.mean()) - float(got.mean()), 30.0)
        self.assertAlmostEqual(float(got[8, 8, 0]), float(encoded_once[8, 8, 0]), places=6)

    def test_frame_stats_reports_stored_values(self):
        """The reported statistics are the stored pixels, not a transform of them."""
        grey = np.full((8, 8, 3), 87, dtype=np.uint8)
        path = write_stored_srgb(self.tmp / "stats.png", grey)
        stats = frame_stats(path)
        self.assertAlmostEqual(stats["meanLuma"], 87.0, places=2)
        self.assertAlmostEqual(stats["meanLumaPct"], 87.0 / 255.0, places=4)
        self.assertAlmostEqual(stats["p01Luma"], 87.0, places=2)
        self.assertEqual(stats["clippedHighlightFraction"], 0.0)
        self.assertIn("sRGB", stats["colorspace"])

    def test_frame_stats_detects_clipping_and_spread(self):
        half = np.zeros((8, 8, 3), dtype=np.uint8)
        half[:, :4] = 255
        path = write_stored_srgb(self.tmp / "clip.png", half)
        stats = frame_stats(path)
        self.assertAlmostEqual(stats["clippedHighlightFraction"], 0.5, places=6)
        self.assertAlmostEqual(stats["clippedShadowFraction"], 0.5, places=6)
        self.assertGreater(stats["contrast"], 200)

    def test_all_scanline_filters_decode_identically(self):
        for filter_type in range(5):
            with self.subTest(filter=filter_type):
                path = write_filtered_png(self.tmp / f"f{filter_type}.png", self.known, filter_type)
                np.testing.assert_array_equal(read_stored_srgb(path), self.known.astype(np.float64))

    def test_linear_transfer_function_is_refused(self):
        """A file declaring gamma 1.0 is linear data; measuring it as sRGB is the bug."""
        path = write_stored_srgb(
            self.tmp / "linear.png", self.known, colorspace_chunk=struct.pack(">I", 100000), chunk_type="gAMA"
        )
        with self.assertRaises(UnsupportedPng) as ctx:
            read_stored_srgb(path)
        self.assertIn("100000", str(ctx.exception))

    def test_srgb_gama_is_accepted_and_named(self):
        path = write_stored_srgb(
            self.tmp / "gama.png", self.known, colorspace_chunk=struct.pack(">I", 45455), chunk_type="gAMA"
        )
        self.assertIn("gAMA 45455", describe_png(path)["colorspace"])
        np.testing.assert_array_equal(read_stored_srgb(path), self.known.astype(np.float64))

    def test_srgb_chunk_is_accepted(self):
        path = write_stored_srgb(self.tmp / "srgbchunk.png", self.known, colorspace_chunk=b"\x00", chunk_type="sRGB")
        self.assertIn("sRGB chunk", describe_png(path)["colorspace"])

    def test_foreign_icc_profile_is_refused(self):
        body = b"Display P3\x00\x00" + zlib.compress(b"not-a-real-profile")
        path = write_stored_srgb(self.tmp / "p3.png", self.known, colorspace_chunk=body, chunk_type="iCCP")
        with self.assertRaises(UnsupportedPng):
            describe_png(path)

    def test_unknown_colour_declaration_is_refused(self):
        path = write_stored_srgb(
            self.tmp / "cicp.png", self.known, colorspace_chunk=b"\x09\x10\x00\x01", chunk_type="cICP"
        )
        with self.assertRaises(UnsupportedPng):
            describe_png(path)

    def test_unsupported_pixel_formats_are_refused(self):
        for kwargs in ({"bit_depth": 16}, {"color_type": 0}, {"color_type": 3}, {"interlace": 1}):
            with self.subTest(**kwargs):
                path = write_header_only_png(self.tmp / "bad.png", **kwargs)
                with self.assertRaises(UnsupportedPng):
                    describe_png(path)

    def test_absent_declaration_is_named_as_an_assumption(self):
        """Blender writes no colour chunk; the report must say so, not stay silent."""
        path = write_stored_srgb(self.tmp / "plain.png", self.known)
        self.assertEqual(describe_png(path)["colorspace"], "sRGB (PNG default, no colour chunk)")

    @unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg not available")
    def test_matches_an_independent_decoder(self):
        """Parity with ffmpeg on a real render, including libpng's adaptive filters."""
        frames = sorted((REPO_ROOT / "artifacts" / "local-acceptance" / "keyframes").glob("production_*.png"))
        if not frames:
            self.skipTest("no rendered keyframes available")
        for frame in frames[:2]:
            with self.subTest(frame=frame.name):
                info = describe_png(frame)
                raw = subprocess.run(
                    ["ffmpeg", "-v", "error", "-i", str(frame), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                    capture_output=True,
                    check=True,
                ).stdout
                reference = np.frombuffer(raw, dtype=np.uint8).reshape(info["height"], info["width"], 3)
                np.testing.assert_array_equal(read_stored_srgb(frame), reference.astype(np.float64))


if __name__ == "__main__":
    unittest.main(verbosity=2)
