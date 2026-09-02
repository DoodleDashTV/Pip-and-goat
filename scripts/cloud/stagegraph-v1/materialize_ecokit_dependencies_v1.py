#!/usr/bin/env python3
"""Materialize declared EcoKit dependency bindings without altering source files."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath

PREFIX = "tivvlejoy-assets/"
HDRI_BASENAME = "tj_hdri_diag_8k.jpg"
HDRI_SHA256 = "c41f736d1278b7a61684fa76bd34983c5722e3536ed1d04a7c96c8024c99f65e"
VENDOR_HDRI = "E:/000_素材/030_3D_Assets/031_HDRI/sunny_vondelpark_2k.hdr"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def create_texture_case_alias(ecokit_root: Path) -> None:
    source = ecokit_root / "Textures"
    alias = ecokit_root / "textures"
    if not source.is_dir():
        raise RuntimeError("ECOKIT_TEXTURE_DIRECTORY_MISSING")
    if alias.exists() or alias.is_symlink():
        if alias.resolve() != source.resolve():
            raise RuntimeError("ECOKIT_TEXTURE_ALIAS_COLLISION")
        return
    alias.symlink_to(source.name, target_is_directory=True)


def find_unique_key(client, bucket: str, basename: str) -> str:
    matches = []
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=PREFIX):
        for item in page.get("Contents", []):
            key = str(item.get("Key") or "")
            if PurePosixPath(key).name == basename:
                matches.append(key)
    if len(matches) != 1:
        raise RuntimeError("OWNED_HDRI_NOT_UNIQUE")
    return matches[0]


def download_owned_hdri(destination: Path) -> None:
    import boto3

    client = boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )
    bucket = os.environ["R2_BUCKET"]
    key = find_unique_key(client, bucket, HDRI_BASENAME)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as handle:
        client.download_fileobj(bucket, key, handle)
    if sha256_file(destination) != HDRI_SHA256:
        raise RuntimeError("OWNED_HDRI_IDENTITY_MISMATCH")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ecokit-root", required=True)
    parser.add_argument("--hdri", required=True)
    parser.add_argument("--bindings", required=True)
    parser.add_argument("--receipt", required=True)
    args = parser.parse_args()

    ecokit_root = Path(args.ecokit_root)
    hdri = Path(args.hdri)
    create_texture_case_alias(ecokit_root)
    download_owned_hdri(hdri)
    bindings = [{
        "original": VENDOR_HDRI,
        "replacement": str(hdri),
        "replacementSha256": HDRI_SHA256,
        "policy": "TIVVLEJOY_OWNED_LIGHTING_SUBSTITUTE",
    }]
    bindings_path = Path(args.bindings)
    bindings_path.parent.mkdir(parents=True, exist_ok=True)
    bindings_path.write_text(json.dumps(bindings, indent=2) + "\n", encoding="utf-8")

    receipt = {
        "schema": "TIVVLEJOY_STAGEGRAPH_ECOKIT_DEPENDENCY_BINDING_V1",
        "status": "PASS",
        "textureCaseAlias": "textures -> Textures",
        "ownedHdriBasename": HDRI_BASENAME,
        "ownedHdriSha256": HDRI_SHA256,
        "vendorHdriBasename": PurePosixPath(VENDOR_HDRI).name,
        "originalVendorFilesModified": False,
        "objectKeyPublished": False,
        "credentialsEmitted": False,
        "paidMutationPerformed": False,
    }
    receipt_path = Path(args.receipt)
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(receipt, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
