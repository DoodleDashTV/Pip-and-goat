#!/usr/bin/env python3
"""Materialize exactly one locked EcoKit archive from private R2 without publishing source bytes."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import stat
import zipfile
from pathlib import Path, PurePosixPath

SOURCE_ID = "SRC_FOREST_STYLISED_ECOKIT"
OBJECT_KEY = "tivvlejoy-assets/source/stylized-forest/Stylised EcoKit.zip"
EXPECTED_BYTES = 669_481_428
EXPECTED_SHA256 = "8370295466ae2255d6e0c0b4b36bb7f8cddbef8e9cdf5e5b847016254073c79a"
MAX_EXPANDED_BYTES = 4 * 1024 * 1024 * 1024


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_member_path(name: str) -> PurePosixPath:
    member = PurePosixPath(name.replace("\\", "/"))
    if member.is_absolute() or ".." in member.parts or not member.parts:
        raise ValueError("UNSAFE_ARCHIVE_MEMBER")
    return member


def extract_all(archive: Path, destination: Path) -> dict:
    destination.mkdir(parents=True, exist_ok=True)
    extracted = 0
    expanded_bytes = 0
    with zipfile.ZipFile(archive) as source:
        members = source.infolist()
        total = sum(int(member.file_size) for member in members if not member.is_dir())
        if total > MAX_EXPANDED_BYTES:
            raise RuntimeError("EXPANDED_ARCHIVE_TOO_LARGE")
        for member in members:
            safe = safe_member_path(member.filename)
            mode = member.external_attr >> 16
            if stat.S_ISLNK(mode):
                raise RuntimeError("ARCHIVE_SYMLINK_FORBIDDEN")
            output = destination.joinpath(*safe.parts)
            if member.is_dir():
                output.mkdir(parents=True, exist_ok=True)
                continue
            output.parent.mkdir(parents=True, exist_ok=True)
            with source.open(member) as reader, output.open("wb") as writer:
                shutil.copyfileobj(reader, writer, length=4 * 1024 * 1024)
            if output.stat().st_size != int(member.file_size):
                raise RuntimeError("EXTRACTED_MEMBER_SIZE_MISMATCH")
            extracted += 1
            expanded_bytes += int(member.file_size)
    return {
        "archiveMemberCount": len(members),
        "extractedFileCount": extracted,
        "expandedBytes": expanded_bytes,
        "skippedArchiveMembers": [],
    }


def download_private_source(destination: Path) -> None:
    import boto3

    client = boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as handle:
        client.download_fileobj(os.environ["R2_BUCKET"], OBJECT_KEY, handle)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True)
    parser.add_argument("--extract-root", required=True)
    parser.add_argument("--receipt", required=True)
    args = parser.parse_args()
    archive = Path(args.archive)
    if not archive.exists():
        download_private_source(archive)
    observed_bytes = archive.stat().st_size
    observed_sha = sha256_file(archive)
    if observed_bytes != EXPECTED_BYTES or observed_sha != EXPECTED_SHA256:
        raise RuntimeError("SOURCE_IDENTITY_MISMATCH")
    extraction = extract_all(archive, Path(args.extract_root))
    receipt = {
        "schema": "TIVVLEJOY_STAGEGRAPH_ECOKIT_MATERIALIZATION_V1",
        "sourceId": SOURCE_ID,
        "sourceBytes": observed_bytes,
        "sourceSha256": observed_sha,
        **extraction,
        "rawCommercialBytesPublished": False,
        "objectKeyPublished": False,
        "credentialsEmitted": False,
        "status": "PASS",
    }
    out = Path(args.receipt)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"status": "PASS", "sourceId": SOURCE_ID, **extraction}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
