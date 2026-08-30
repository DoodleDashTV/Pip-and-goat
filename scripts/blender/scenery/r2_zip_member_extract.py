#!/usr/bin/env python3
"""Range-extract selected ZIP members from catalogued R2 objects.

Never downloads a full multi-gigabyte archive into RAM or disk.
Never prints credentials, endpoints, or object keys.
"""
from __future__ import annotations

import io
import os
import struct
import sys
import zipfile
import zlib
from pathlib import Path


EOCD_SIG = b"PK\x05\x06"
EOCD64_LOC_SIG = b"PK\x06\x07"
EOCD64_SIG = b"PK\x06\x06"
CDH_SIG = b"PK\x01\x02"
LFH_SIG = b"PK\x03\x04"


def _client():
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def _get_range(client, bucket: str, key: str, start: int, end: int) -> bytes:
    resp = client.get_object(
        Bucket=bucket,
        Key=key,
        Range=f"bytes={start}-{end}",
    )
    return resp["Body"].read()


def _object_size(client, bucket: str, key: str) -> int:
    return int(client.head_object(Bucket=bucket, Key=key)["ContentLength"])


def _find_eocd(tail: bytes) -> int:
    idx = tail.rfind(EOCD_SIG)
    if idx < 0:
        raise RuntimeError("ZIP EOCD not found")
    return idx


def _parse_eocd(tail: bytes, tail_start: int, total: int) -> dict:
    idx = _find_eocd(tail)
    comment_len = struct.unpack_from("<H", tail, idx + 20)[0]
    rec = tail[idx : idx + 22 + comment_len]
    cd_size, cd_offset, n_entries = struct.unpack_from("<IIH", rec, 12)
    # Zip64 locator sits immediately before EOCD when present.
    if cd_offset == 0xFFFFFFFF or cd_size == 0xFFFFFFFF or n_entries == 0xFFFF:
        loc = tail.rfind(EOCD64_LOC_SIG)
        if loc < 0:
            raise RuntimeError("ZIP64 locator missing")
        eocd64_off = struct.unpack_from("<Q", tail, loc + 8)[0]
        return {"zip64": True, "eocd64_offset": eocd64_off}
    return {
        "zip64": False,
        "cd_size": cd_size,
        "cd_offset": cd_offset,
        "n_entries": n_entries,
    }


def _parse_eocd64(buf: bytes) -> dict:
    if buf[:4] != EOCD64_SIG:
        raise RuntimeError("ZIP64 EOCD signature mismatch")
    n_entries = struct.unpack_from("<Q", buf, 32)[0]
    cd_size = struct.unpack_from("<Q", buf, 40)[0]
    cd_offset = struct.unpack_from("<Q", buf, 48)[0]
    return {
        "zip64": True,
        "cd_size": cd_size,
        "cd_offset": cd_offset,
        "n_entries": n_entries,
    }


def _parse_central_directory(cd: bytes) -> list[dict]:
    members = []
    i = 0
    n = len(cd)
    while i + 46 <= n:
        if cd[i : i + 4] != CDH_SIG:
            break
        flags = struct.unpack_from("<H", cd, i + 8)[0]
        method = struct.unpack_from("<H", cd, i + 10)[0]
        crc = struct.unpack_from("<I", cd, i + 16)[0]
        csize = struct.unpack_from("<I", cd, i + 20)[0]
        usize = struct.unpack_from("<I", cd, i + 24)[0]
        namelen = struct.unpack_from("<H", cd, i + 28)[0]
        extralen = struct.unpack_from("<H", cd, i + 30)[0]
        commentlen = struct.unpack_from("<H", cd, i + 32)[0]
        local_off = struct.unpack_from("<I", cd, i + 42)[0]
        name = cd[i + 46 : i + 46 + namelen].decode("utf-8", "replace")
        extra = cd[i + 46 + namelen : i + 46 + namelen + extralen]
        # Zip64 extra
        j = 0
        while j + 4 <= len(extra):
            eid, elen = struct.unpack_from("<HH", extra, j)
            payload = extra[j + 4 : j + 4 + elen]
            k = 0
            if eid == 0x0001:
                if usize == 0xFFFFFFFF and k + 8 <= elen:
                    usize = struct.unpack_from("<Q", payload, k)[0]
                    k += 8
                if csize == 0xFFFFFFFF and k + 8 <= elen:
                    csize = struct.unpack_from("<Q", payload, k)[0]
                    k += 8
                if local_off == 0xFFFFFFFF and k + 8 <= elen:
                    local_off = struct.unpack_from("<Q", payload, k)[0]
                    k += 8
            j += 4 + elen
        members.append(
            {
                "name": name,
                "method": method,
                "crc": crc,
                "csize": csize,
                "usize": usize,
                "local_off": local_off,
                "flags": flags,
            }
        )
        i += 46 + namelen + extralen + commentlen
    return members


def list_members(object_key: str) -> list[dict]:
    client = _client()
    bucket = os.environ["R2_BUCKET"]
    total = _object_size(client, bucket, object_key)
    tail_len = min(256 * 1024, total)
    tail = _get_range(client, bucket, object_key, total - tail_len, total - 1)
    meta = _parse_eocd(tail, total - tail_len, total)
    if meta.get("zip64"):
        eoff = meta["eocd64_offset"]
        eocd64 = _get_range(client, bucket, object_key, eoff, eoff + 128)
        meta = _parse_eocd64(eocd64)
    cd = _get_range(
        client,
        bucket,
        object_key,
        meta["cd_offset"],
        meta["cd_offset"] + meta["cd_size"] - 1,
    )
    return _parse_central_directory(cd)


def select_members(members: list[dict], wanted_substrings: list[str]) -> list[dict]:
    return [
        m
        for m in members
        if any(s.lower() in m["name"].lower() for s in wanted_substrings)
        and not m["name"].endswith("/")
    ]


def extract_members(
    object_key: str,
    wanted_substrings: list[str],
    dest_root: Path,
    max_member_bytes: int = 280 * 1024 * 1024,
    members: list[dict] | None = None,
) -> list[dict]:
    catalog = members if members is not None else list_members(object_key)
    selected = select_members(catalog, wanted_substrings)
    client = _client()
    bucket = os.environ["R2_BUCKET"]
    results = []
    for m in selected:
        if m["usize"] > max_member_bytes:
            results.append({"name": m["name"], "status": "SKIP_TOO_LARGE", "bytes": m["usize"]})
            continue
        # Local file header + payload. Header is typically < 256 bytes + name.
        header_pad = 512 + len(m["name"].encode())
        start = m["local_off"]
        end = start + header_pad + m["csize"] - 1
        blob = _get_range(client, bucket, object_key, start, end)
        if blob[:4] != LFH_SIG:
            results.append({"name": m["name"], "status": "BAD_LFH"})
            continue
        namelen = struct.unpack_from("<H", blob, 26)[0]
        extralen = struct.unpack_from("<H", blob, 28)[0]
        data_off = 30 + namelen + extralen
        payload = blob[data_off : data_off + m["csize"]]
        if m["method"] == 0:
            raw = payload
        elif m["method"] == 8:
            raw = zlib.decompress(payload, -15)
        else:
            results.append({"name": m["name"], "status": f"SKIP_METHOD_{m['method']}"})
            continue
        if len(raw) != m["usize"]:
            results.append(
                {
                    "name": m["name"],
                    "status": "SIZE_MISMATCH",
                    "got": len(raw),
                    "want": m["usize"],
                }
            )
            continue
        out = dest_root / m["name"]
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(raw)
        results.append({"name": m["name"], "status": "OK", "bytes": len(raw)})
    return results


def main() -> int:
    if len(sys.argv) < 4:
        print("usage: r2_zip_member_extract.py <objectKey> <dest> <substr> [substr...]")
        return 2
    key = sys.argv[1]
    dest = Path(sys.argv[2])
    wanted = sys.argv[3:]
    rows = extract_members(key, wanted, dest)
    ok = sum(1 for r in rows if r["status"] == "OK")
    print(f"extracted {ok}/{len(rows)} members")
    for r in rows:
        print(f"  {r['status']} {r.get('bytes', '')} {Path(r['name']).name}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
