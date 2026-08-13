"""Read rendered PNG frames as the 8-bit values actually stored in the file.

QC numbers are only meaningful if they describe the pixels a viewer will see.
The previous loader round-tripped frames through Blender's image system and then
applied an sRGB encode to the result, which encoded already-encoded data a
second time and inflated every brightness figure by roughly 1.77x: a frame whose
stored mean luma was 86.65/255 was reported as 153.53/255, so a dark render
scored as a well-exposed one. This module removes colour management from the
measurement path entirely — it decodes the PNG itself and hands back the stored
bytes.

Everything fails closed. A frame whose colour space or transfer function cannot
be established from the file is an error, never an assumption, because guessing
is exactly how the original defect survived.
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

SIGNATURE = b"\x89PNG\r\n\x1a\n"

#: gAMA stores 1/gamma * 100000. libpng writes 45455 for the sRGB transfer
#: function; a linear file writes 100000.
SRGB_GAMA = 45455
GAMA_TOLERANCE = 1000

COLOR_TYPE_RGB = 2
COLOR_TYPE_RGBA = 6
SUPPORTED_COLOR_TYPES = {COLOR_TYPE_RGB: 3, COLOR_TYPE_RGBA: 4}


class UnsupportedPng(Exception):
    """The file cannot be measured honestly, so measuring it is refused."""


def _chunks(data: bytes):
    if data[:8] != SIGNATURE:
        raise UnsupportedPng("not a PNG file (bad signature)")
    offset = 8
    while offset + 8 <= len(data):
        (length,) = struct.unpack(">I", data[offset : offset + 4])
        kind = data[offset + 4 : offset + 8].decode("latin1")
        body = data[offset + 8 : offset + 8 + length]
        if len(body) != length:
            raise UnsupportedPng(f"truncated {kind} chunk")
        yield kind, body
        offset += 12 + length


def _resolve_colorspace(seen: dict) -> str:
    """Name the transfer function, or refuse.

    PNG has several ways to declare colour, and they disagree often enough that
    silently preferring one is how a linear file gets measured as if it were
    display-referred.
    """
    if "cICP" in seen:
        raise UnsupportedPng("cICP colour declaration is not interpreted by this reader")
    if "iCCP" in seen:
        profile = seen["iCCP"].split(b"\x00", 1)[0].decode("latin1", "replace")
        if "srgb" not in profile.lower():
            raise UnsupportedPng(f"embedded ICC profile {profile!r} is not sRGB")
        return f"sRGB (iCCP {profile})"
    if "sRGB" in seen:
        return "sRGB (sRGB chunk)"
    if "gAMA" in seen:
        (gama,) = struct.unpack(">I", seen["gAMA"])
        if abs(gama - SRGB_GAMA) > GAMA_TOLERANCE:
            raise UnsupportedPng(
                f"gAMA {gama} declares a transfer function this reader will not assume "
                f"is sRGB (expected {SRGB_GAMA} +/- {GAMA_TOLERANCE})"
            )
        return f"sRGB (gAMA {gama})"
    # PNG's default for 8-bit display data, and what Blender writes.
    return "sRGB (PNG default, no colour chunk)"


def _unfilter(raw: bytes, width: int, height: int, channels: int) -> bytearray:
    """Reverse the per-scanline PNG filters. See RFC 2083 section 6."""
    stride = width * channels
    expected = (stride + 1) * height
    if len(raw) < expected:
        raise UnsupportedPng(f"decompressed {len(raw)} bytes, expected {expected}")
    out = bytearray(stride * height)
    prev = bytearray(stride)
    pos = 0
    for row in range(height):
        ftype = raw[pos]
        pos += 1
        line = bytearray(raw[pos : pos + stride])
        pos += stride
        if ftype == 0:
            pass
        elif ftype == 1:
            for i in range(channels, stride):
                line[i] = (line[i] + line[i - channels]) & 0xFF
        elif ftype == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ftype == 3:
            for i in range(stride):
                left = line[i - channels] if i >= channels else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif ftype == 4:
            for i in range(stride):
                left = line[i - channels] if i >= channels else 0
                up = prev[i]
                upleft = prev[i - channels] if i >= channels else 0
                p = left + up - upleft
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - upleft)
                if pa <= pb and pa <= pc:
                    pred = left
                elif pb <= pc:
                    pred = up
                else:
                    pred = upleft
                line[i] = (line[i] + pred) & 0xFF
        else:
            raise UnsupportedPng(f"unknown scanline filter {ftype}")
        out[row * stride : (row + 1) * stride] = line
        prev = line
    return out


def describe_png(path: Path) -> dict:
    """Header facts and the resolved colour space, without decoding pixels."""
    data = Path(path).read_bytes()
    header = None
    seen: dict = {}
    for kind, body in _chunks(data):
        if kind == "IHDR":
            width, height, depth, color_type, compression, filter_method, interlace = struct.unpack(
                ">IIBBBBB", body
            )
            header = {
                "width": width,
                "height": height,
                "bitDepth": depth,
                "colorType": color_type,
                "compression": compression,
                "filterMethod": filter_method,
                "interlace": interlace,
            }
        elif kind in ("gAMA", "sRGB", "iCCP", "cICP"):
            seen.setdefault(kind, body)
        elif kind == "IDAT" and header is not None:
            break
    if header is None:
        raise UnsupportedPng("no IHDR chunk")
    if header["bitDepth"] != 8:
        raise UnsupportedPng(f"bit depth {header['bitDepth']} is not the 8-bit data this QC measures")
    if header["colorType"] not in SUPPORTED_COLOR_TYPES:
        raise UnsupportedPng(f"colour type {header['colorType']} is not RGB or RGBA")
    if header["interlace"] != 0:
        raise UnsupportedPng("interlaced PNG is not supported")
    if header["compression"] != 0 or header["filterMethod"] != 0:
        raise UnsupportedPng("non-standard compression or filter method")
    header["colorspace"] = _resolve_colorspace(seen)
    header["declarations"] = sorted(seen)
    return header


def read_stored_srgb(path: Path):
    """Return the stored pixels as an HxWx3 float array of 0-255 sRGB values.

    No colour transform of any kind is applied: these are the bytes in the file.
    """
    import numpy as np

    path = Path(path)
    info = describe_png(path)
    data = path.read_bytes()
    channels = SUPPORTED_COLOR_TYPES[info["colorType"]]
    idat = b"".join(body for kind, body in _chunks(data) if kind == "IDAT")
    if not idat:
        raise UnsupportedPng("no image data")
    raw = zlib.decompress(idat)
    flat = _unfilter(raw, info["width"], info["height"], channels)
    arr = np.frombuffer(bytes(flat), dtype=np.uint8).reshape(info["height"], info["width"], channels)
    return arr[:, :, :3].astype(np.float64)


def write_stored_srgb(path: Path, pixels, colorspace_chunk: bytes | None = None, chunk_type: str = "") -> Path:
    """Write an HxWx3 uint8 array as an unfiltered 8-bit RGB PNG.

    Used by the regression fixtures: filter type 0 on every row makes the file
    contents trivially predictable, so a test can assert the reader returns
    exactly the values that were written.
    """
    import numpy as np

    arr = np.asarray(pixels, dtype=np.uint8)
    if arr.ndim != 3 or arr.shape[2] != 3:
        raise ValueError("expected an HxWx3 array")
    height, width = arr.shape[0], arr.shape[1]
    rows = bytearray()
    for row in arr:
        rows.append(0)
        rows.extend(row.tobytes())

    def chunk(kind: str, body: bytes) -> bytes:
        raw = kind.encode("latin1") + body
        return struct.pack(">I", len(body)) + raw + struct.pack(">I", zlib.crc32(raw) & 0xFFFFFFFF)

    out = bytearray(SIGNATURE)
    out += chunk("IHDR", struct.pack(">IIBBBBB", width, height, 8, COLOR_TYPE_RGB, 0, 0, 0))
    if colorspace_chunk is not None and chunk_type:
        out += chunk(chunk_type, colorspace_chunk)
    out += chunk("IDAT", zlib.compress(bytes(rows), 6))
    out += chunk("IEND", b"")
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(bytes(out))
    return path
