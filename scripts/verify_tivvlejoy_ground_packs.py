#!/usr/bin/env python3
"""Fail-closed verifier for TivvleJoy ground-pack source ZIPs."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import zipfile


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_args() -> argparse.Namespace:
    root = repo_root()
    parser = argparse.ArgumentParser(
        description="Verify TivvleJoy dirt/grass source ZIPs without extracting or mutating them."
    )
    parser.add_argument(
        "--registry",
        type=Path,
        default=root / "assets" / "inbox" / "ground" / "ground_pack_registry.json",
        help="Registry JSON path.",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=None,
        help=(
            "Directory containing source ZIPs. Defaults to TIVVLEJOY_GROUND_PACK_ROOT, "
            "then the registry default_root relative to the repository."
        ),
    )
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON receipt.")
    return parser.parse_args()


def resolve_asset_root(args: argparse.Namespace, registry: dict) -> Path:
    if args.root is not None:
        return args.root.expanduser().resolve()
    env_root = os.environ.get("TIVVLEJOY_GROUND_PACK_ROOT")
    if env_root:
        return Path(env_root).expanduser().resolve()
    default_root = registry.get("default_root", "assets/inbox/ground")
    return (repo_root() / default_root).resolve()


def verify_pack(asset_root: Path, pack: dict) -> dict:
    result = {
        "id": pack["id"],
        "filename": pack["filename"],
        "status": "PASS",
        "errors": [],
    }
    path = asset_root / pack["filename"]
    if not path.is_file():
        result["status"] = "FAIL"
        result["errors"].append("MISSING_FILE")
        return result

    size = path.stat().st_size
    result["size_bytes"] = size
    if size != int(pack["size_bytes"]):
        result["status"] = "FAIL"
        result["errors"].append(f"SIZE_MISMATCH expected={pack['size_bytes']} observed={size}")

    observed_sha = sha256_file(path)
    result["sha256"] = observed_sha
    if observed_sha.lower() != str(pack["sha256"]).lower():
        result["status"] = "FAIL"
        result["errors"].append(
            f"SHA256_MISMATCH expected={pack['sha256']} observed={observed_sha}"
        )

    try:
        with zipfile.ZipFile(path, "r") as archive:
            members = set(archive.namelist())
            corrupt_member = archive.testzip()
            if corrupt_member is not None:
                result["status"] = "FAIL"
                result["errors"].append(f"ZIP_CRC_FAILURE member={corrupt_member}")
            missing_members = [m for m in pack["required_members"] if m not in members]
            if missing_members:
                result["status"] = "FAIL"
                result["errors"].append("MISSING_MEMBERS " + ",".join(missing_members))
            if pack["blend_member"] not in members:
                result["status"] = "FAIL"
                result["errors"].append(f"MISSING_BLEND_MEMBER {pack['blend_member']}")
            result["member_count"] = len(members)
    except (OSError, zipfile.BadZipFile, RuntimeError) as exc:
        result["status"] = "FAIL"
        result["errors"].append(f"ZIP_OPEN_FAILURE {type(exc).__name__}: {exc}")

    return result


def main() -> int:
    args = parse_args()
    registry_path = args.registry.expanduser().resolve()
    try:
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"TIVVLEJOY_GROUND_PACK_VERIFY=FAIL registry={registry_path} error={exc}", file=sys.stderr)
        return 2

    asset_root = resolve_asset_root(args, registry)
    results = [verify_pack(asset_root, pack) for pack in registry.get("packs", [])]
    status = "PASS" if results and all(item["status"] == "PASS" for item in results) else "FAIL"
    receipt = {
        "schema": "TIVVLEJOY_GROUND_PACK_VERIFY_V1",
        "task": registry.get("task"),
        "status": status,
        "asset_root": str(asset_root),
        "pack_count": len(results),
        "packs": results,
        "mutated_assets": False,
        "paid_render_started": False,
    }

    if args.json:
        print(json.dumps(receipt, indent=2, sort_keys=True))
    else:
        print(f"TIVVLEJOY_GROUND_PACK_VERIFY_V1 status={status} root={asset_root}")
        for item in results:
            errors = "; ".join(item["errors"]) if item["errors"] else "none"
            print(
                f"{item['id']} status={item['status']} file={item['filename']} "
                f"size={item.get('size_bytes', 'n/a')} sha256={item.get('sha256', 'n/a')} "
                f"errors={errors}"
            )
        print("mutatedAssets=false paidRenderStarted=false")
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
