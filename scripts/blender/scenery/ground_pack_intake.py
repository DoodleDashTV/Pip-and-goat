#!/usr/bin/env python3
"""TivvleJoy ground-pack intake.

Validates the three user-provided source ZIPs without committing source binaries
to Git, unwraps nested gzip/zstd Blender payloads into a private work area,
copies texture payloads, and emits a sanitized receipt suitable for Git.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import shutil
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

PACKS = (
    {
        "file": "dirt_4k.blend.zip",
        "registryId": "TJ_GROUND_DIRT_4K_001",
        "expectedBytes": 75_853_439,
        "expectedSha256": "126184ec4cb24629b970c81053630ca4ff7be65e07d5af604c3495b5dd27f855",
        "blend": "dirt_4k.blend",
    },
    {
        "file": "sparse_grass_4k.blend.zip",
        "registryId": "TJ_GROUND_SPARSE_GRASS_4K_001",
        "expectedBytes": 107_103_973,
        "expectedSha256": "a7c199590a03f45bb8c00c44fb6b77096b107fc2cd075019b30ea590bbf64327",
        "blend": "sparse_grass_4k.blend",
    },
    {
        "file": "grass_path_2_4k.blend.zip",
        "registryId": "TJ_GROUND_GRASS_PATH_2_4K_001",
        "expectedBytes": 57_949_131,
        "expectedSha256": "73658d129d9572d058aa0525e9bcbecc3e39a7d172025396674570e951ba9d9c",
        "blend": "grass_path_2_4k.blend",
    },
)

ALLOWED_TEXTURE_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".exr"}
BLOCKED_EXTS = {".py", ".pyc", ".pyo", ".so", ".dll", ".dylib", ".exe", ".bat", ".cmd", ".sh", ".ps1", ".js"}


def now_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_member(name: str) -> bool:
    path = PurePosixPath(name.replace("\\", "/"))
    return not path.is_absolute() and ".." not in path.parts


def unwrap_blend(data: bytes) -> tuple[bytes, str]:
    if data.startswith(b"BLENDER"):
        return data, "none"
    if data.startswith(b"\x1f\x8b"):
        raw = gzip.decompress(data)
        if not raw.startswith(b"BLENDER"):
            raise ValueError("gzip payload did not decode to a Blender file")
        return raw, "gzip"
    if data.startswith(b"\x28\xb5\x2f\xfd"):
        try:
            import zstandard as zstd  # type: ignore
            raw = zstd.ZstdDecompressor().decompress(data)
        except Exception:
            exe = shutil.which("zstd")
            if not exe:
                raise RuntimeError("zstd payload found but no zstandard module/CLI is available")
            proc = subprocess.run(
                [exe, "-d", "-q", "-c"],
                input=data,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=True,
            )
            raw = proc.stdout
        if not raw.startswith(b"BLENDER"):
            raise ValueError("zstd payload did not decode to a Blender file")
        return raw, "zstd"
    raise ValueError(f"unsupported Blender payload wrapper: magic={data[:8].hex()}")


def inspect_blend(raw: bytes) -> dict:
    if len(raw) < 12 or not raw.startswith(b"BLENDER"):
        raise ValueError("invalid Blender header")
    pointer_code = chr(raw[7])
    endian_code = chr(raw[8])
    version = raw[9:12].decode("ascii", errors="replace")
    if pointer_code not in {"-", "_"} or endian_code not in {"v", "V"} or not version.isdigit():
        raise ValueError("malformed Blender header")
    if b"DNA1" not in raw or b"ENDB" not in raw:
        raise ValueError("Blender block structure missing DNA1/ENDB")
    return {
        "version": f"{version[0]}.{version[1:]}",
        "pointerBits": 64 if pointer_code == "-" else 32,
        "endianness": "little" if endian_code == "v" else "big",
        "hasDNA1": True,
        "hasENDB": True,
    }


def process_pack(root: Path, private_out: Path, spec: dict) -> dict:
    source = root / spec["file"]
    item = {
        "registryId": spec["registryId"],
        "sourceFile": spec["file"],
        "expectedBytes": spec["expectedBytes"],
        "expectedSha256": spec["expectedSha256"],
        "sourceCommittedToGit": False,
    }
    if not source.is_file():
        return {**item, "status": "BLOCKED", "reason": "SOURCE_MISSING"}

    actual_size = source.stat().st_size
    actual_sha = sha256_file(source)
    item.update({"sourceBytes": actual_size, "sourceSha256": actual_sha})
    if actual_size != spec["expectedBytes"] or actual_sha != spec["expectedSha256"]:
        return {**item, "status": "BLOCKED", "reason": "SOURCE_IDENTITY_MISMATCH"}

    with zipfile.ZipFile(source) as archive:
        bad = archive.testzip()
        if bad:
            return {**item, "status": "BLOCKED", "reason": f"ZIP_CRC_FAILED:{bad}"}
        infos = [i for i in archive.infolist() if not i.is_dir()]
        unsafe = [i.filename for i in infos if not safe_member(i.filename)]
        blocked = [i.filename for i in infos if Path(i.filename).suffix.lower() in BLOCKED_EXTS]
        if unsafe or blocked:
            return {
                **item,
                "status": "BLOCKED",
                "reason": "UNSAFE_ARCHIVE_CONTENT",
                "unsafe": unsafe,
                "blocked": blocked,
            }

        names = {i.filename for i in infos}
        if spec["blend"] not in names:
            return {**item, "status": "BLOCKED", "reason": "BLEND_MEMBER_MISSING"}

        wrapped = archive.read(spec["blend"])
        raw, wrapper = unwrap_blend(wrapped)
        blend_info = inspect_blend(raw)

        out_dir = private_out / spec["registryId"]
        out_dir.mkdir(parents=True, exist_ok=True)
        blend_out = out_dir / spec["blend"]
        blend_out.write_bytes(raw)

        textures = []
        for info in infos:
            ext = Path(info.filename).suffix.lower()
            if ext not in ALLOWED_TEXTURE_EXTS:
                continue
            rel = PurePosixPath(info.filename.replace("\\", "/"))
            target = out_dir.joinpath(*rel.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as src, target.open("wb") as dst:
                shutil.copyfileobj(src, dst, length=4 * 1024 * 1024)
            textures.append({
                "member": info.filename,
                "bytes": info.file_size,
                "sha256": sha256_file(target),
            })

    return {
        **item,
        "status": "PASS",
        "wrapper": wrapper,
        "wrappedBlendBytes": len(wrapped),
        "wrappedBlendSha256": sha256_bytes(wrapped),
        "normalizedBlendBytes": len(raw),
        "normalizedBlendSha256": sha256_bytes(raw),
        "blend": blend_info,
        "textureCount": len(textures),
        "textures": textures,
        "normalizedPrivatePath": f"{spec['registryId']}/{spec['blend']}",
    }


def condition_ground_source(source: Path, out_root: Path, source_id: str, role: str) -> dict:
    """Adapter used by condition_purchased_source.py for registered ground roles."""
    spec = next((item for item in PACKS if item["file"] == source.name), None)
    if spec is None:
        return {
            "schema": "TIVVLEJOY_CONDITIONED_SOURCE_RECEIPT_V1",
            "sourceId": source_id,
            "role": role,
            "status": "BLOCKED",
            "conditioned": False,
            "reason": f"UNREGISTERED_GROUND_SOURCE:{source.name}",
            "licensedBytesCommitted": False,
        }
    result = process_pack(source.parent, out_root, spec)
    result.update({
        "schema": "TIVVLEJOY_CONDITIONED_SOURCE_RECEIPT_V1",
        "sourceId": source_id,
        "role": role,
        "conditioned": result.get("status") == "PASS",
        "reason": (
            "Ground source identity verified; wrapped Blender payload normalized for private lookdev."
            if result.get("status") == "PASS"
            else result.get("reason", "GROUND_INTAKE_BLOCKED")
        ),
        "privateWorkDir": str(out_root / spec["registryId"]),
        "licensedBytesCommitted": False,
        "embeddedScriptsAutoExecuted": False,
        "addonEnabled": False,
    })
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", default="/tmp/tivvlejoy-owned-recovery/ground-packs")
    parser.add_argument("--private-out", default="/tmp/tivvlejoy-conditioned/ground-packs")
    parser.add_argument("--receipt-out", default="")
    args = parser.parse_args()

    root = Path(args.source_root)
    private_out = Path(args.private_out)
    private_out.mkdir(parents=True, exist_ok=True)
    results = []
    for spec in PACKS:
        try:
            results.append(process_pack(root, private_out, spec))
        except Exception as exc:
            results.append({
                "registryId": spec["registryId"],
                "sourceFile": spec["file"],
                "status": "BLOCKED",
                "reason": f"INTAKE_ERROR:{type(exc).__name__}:{exc}",
                "sourceCommittedToGit": False,
            })

    overall = "PASS" if all(i.get("status") == "PASS" for i in results) else "BLOCKED"
    receipt = {
        "schema": "TIVVLEJOY_GROUND_PACK_INTAKE_V1",
        "status": overall,
        "generatedAt": now_utc(),
        "sourceRootKind": "private_local_recovery",
        "productionSceneModified": False,
        "paidExecutionPerformed": False,
        "sourceBinariesCommittedToGit": False,
        "packs": results,
    }
    if args.receipt_out:
        dest = Path(args.receipt_out)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))
    return 0 if overall == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
