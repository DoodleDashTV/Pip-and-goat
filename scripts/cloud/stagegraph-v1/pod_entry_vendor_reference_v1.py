#!/usr/bin/env python3
"""Paid pod entry: materialize verified EcoKit + owned HDRI and render one vendor-reference frame."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tarfile
import time
from datetime import datetime, timezone
from pathlib import Path

SOURCE_ID = "SRC_FOREST_STYLISED_ECOKIT"
SOURCE_SHA256 = "8370295466ae2255d6e0c0b4b36bb7f8cddbef8e9cdf5e5b847016254073c79a"
AUDIT_SHA256 = "3c6804cbda061ed16a5d7027618089583ea7e99d2d0b96a6d2541bff89bbfdf0"
HDRI_SHA256 = "c41f736d1278b7a61684fa76bd34983c5722e3536ed1d04a7c96c8024c99f65e"
BLENDER_TARBALL_SHA256 = "4da1c956673c0485e63054e563ee69198cc8f80d8157dd7592dffc8a6a5592e6"
BLENDER_URL = "https://download.blender.org/release/Blender4.3/blender-4.3.2-linux-x64.tar.xz"
WORK = Path("/tmp/tivvlejoy-stagegraph-vr")
BUNDLE = Path("/tmp/tivvlejoy-stagegraph-vr-bundle.tgz")
ARCHIVE = Path("/tmp/tivvlejoy-ecokit.zip")
EXTRACT = Path("/tmp/tivvlejoy-ecokit")
HDRI = Path("/tmp/tivvlejoy-owned-light/tj_hdri_diag_8k.jpg")
BLENDER_DIR = Path("/tmp/blender")
OUT_PNG = WORK / "VENDOR_REFERENCE_FRAME.png"
OUT_RECEIPT = WORK / "VENDOR_REFERENCE_RENDER_RECEIPT.json"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def log(event: str, **payload) -> None:
    safe = {k: v for k, v in payload.items() if "key" not in k.lower() and "secret" not in k.lower()}
    print(json.dumps({"ts": utc_now(), "event": event, **safe}), flush=True)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def r2_client():
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
        config=Config(retries={"max_attempts": 4, "mode": "standard"}),
    )


def r2_put(client, key: str, body: bytes, content_type: str) -> None:
    client.put_object(Bucket=os.environ["R2_BUCKET"], Key=key, Body=body, ContentType=content_type)


def r2_upload_file(client, key: str, path: Path, content_type: str) -> None:
    client.upload_file(str(path), os.environ["R2_BUCKET"], key, ExtraArgs={"ContentType": content_type})


def gpu_telemetry() -> dict:
    try:
        raw = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.total,memory.free,driver_version", "--format=csv,noheader"],
            text=True,
        ).strip()
    except Exception as exc:
        return {"ok": False, "error": type(exc).__name__}
    parts = [part.strip() for part in raw.split(",")]
    name = parts[0] if parts else ""
    return {
        "ok": True,
        "raw": raw,
        "gpuName": name,
        "memoryTotal": parts[1] if len(parts) > 1 else None,
        "memoryFree": parts[2] if len(parts) > 2 else None,
        "driverVersion": parts[3] if len(parts) > 3 else None,
        "rtx4090": "4090" in name,
    }


def write_status(client, status: str, **payload) -> None:
    prefix = os.environ["SG_OUTPUT_PREFIX"]
    body = {"schema": "TIVVLEJOY_STAGEGRAPH_VENDOR_REFERENCE_POD_STATUS_V1", "status": status, "at": utc_now(), **payload}
    r2_put(client, f"{prefix}/status.json", json.dumps(body, indent=2).encode(), "application/json")


def install_blender() -> str:
    tarball = Path("/tmp/blender.tar.xz")
    if not tarball.is_file() or sha256_file(tarball) != BLENDER_TARBALL_SHA256:
        subprocess.check_call(["curl", "--fail", "--location", "--retry", "4", "--output", str(tarball), BLENDER_URL])
    observed = sha256_file(tarball)
    if observed != BLENDER_TARBALL_SHA256:
        raise RuntimeError("BLENDER_TARBALL_SHA256_MISMATCH")
    if BLENDER_DIR.exists():
        shutil.rmtree(BLENDER_DIR)
    BLENDER_DIR.mkdir(parents=True)
    subprocess.check_call(["tar", "-xJf", str(tarball), "--strip-components=1", "-C", str(BLENDER_DIR)])
    version = subprocess.check_output([str(BLENDER_DIR / "blender"), "--version"], text=True).splitlines()[0]
    if "4.3.2" not in version:
        raise RuntimeError("BLENDER_VERSION_MISMATCH")
    return version


def main() -> int:
    started = time.time()
    client = r2_client()
    prefix = os.environ["SG_OUTPUT_PREFIX"]
    WORK.mkdir(parents=True, exist_ok=True)
    write_status(client, "STARTED", gpu=gpu_telemetry())
    try:
        telemetry = gpu_telemetry()
        if not telemetry.get("rtx4090"):
            raise RuntimeError("GPU_NOT_RTX_4090")
        client.download_file(os.environ["R2_BUCKET"], os.environ["SG_BUNDLE_KEY"], str(BUNDLE))
        bundle_root = WORK / "bundle"
        if bundle_root.exists():
            shutil.rmtree(bundle_root)
        bundle_root.mkdir(parents=True)
        with tarfile.open(BUNDLE, "r:gz") as archive:
            try:
                archive.extractall(bundle_root, filter="data")
            except TypeError:
                archive.extractall(bundle_root)
        scripts = bundle_root / "scripts"
        auth_path = bundle_root / "VENDOR_REFERENCE_AUTHORIZATION.json"
        auth = json.loads(auth_path.read_text(encoding="utf-8"))
        if auth.get("authorizationSha256") != os.environ["SG_AUTHORIZATION_SHA256"]:
            raise RuntimeError("AUTHORIZATION_SHA256_MISMATCH")
        blender_version = install_blender()
        log("blender_ready", version=blender_version)
        subprocess.check_call(
            [
                "python3",
                str(scripts / "cloud/stagegraph-v1/materialize_ecokit_v1.py"),
                "--archive",
                str(ARCHIVE),
                "--extract-root",
                str(EXTRACT),
                "--receipt",
                str(WORK / "ECOKIT_MATERIALIZATION.json"),
            ]
        )
        subprocess.check_call(
            [
                "python3",
                str(scripts / "cloud/stagegraph-v1/materialize_ecokit_dependencies_v1.py"),
                "--ecokit-root",
                str(EXTRACT / "Stylised EcoKit"),
                "--hdri",
                str(HDRI),
                "--bindings",
                str(WORK / "IMAGE_BINDINGS.json"),
                "--receipt",
                str(WORK / "DEPENDENCY_BINDING.json"),
            ]
        )
        if sha256_file(HDRI) != HDRI_SHA256:
            raise RuntimeError("OWNED_HDRI_IDENTITY_MISMATCH")
        bindings = (WORK / "IMAGE_BINDINGS.json").read_text(encoding="utf-8")
        flora = EXTRACT / "Stylised EcoKit" / "Flora_Mat&GN&Models.blend"
        if not flora.is_file():
            raise RuntimeError("FLORA_BLEND_MISSING")
        write_status(client, "RENDERING", blenderVersion=blender_version, gpu=telemetry)
        render = subprocess.run(
            [
                str(BLENDER_DIR / "blender"),
                "--factory-startup",
                "-b",
                str(flora),
                "--python",
                str(scripts / "blender/stagegraph/vendor_reference_render_v1.py"),
                "--",
                "--source-id",
                SOURCE_ID,
                "--source-sha256",
                SOURCE_SHA256,
                "--dependency-audit-sha256",
                AUDIT_SHA256,
                "--owned-hdri",
                str(HDRI),
                "--image-bindings-json",
                bindings,
                "--authorization-json",
                auth_path.read_text(encoding="utf-8"),
                "--out",
                str(OUT_PNG),
                "--receipt",
                str(OUT_RECEIPT),
            ],
            check=False,
            text=True,
            capture_output=True,
        )
        (WORK / "blender-stdout.txt").write_text(render.stdout or "", encoding="utf-8")
        (WORK / "blender-stderr.txt").write_text(render.stderr or "", encoding="utf-8")
        if render.returncode != 0:
            raise RuntimeError(f"BLENDER_RENDER_FAILED:{render.returncode}")
        if not OUT_PNG.is_file() or not OUT_RECEIPT.is_file():
            raise RuntimeError("VENDOR_REFERENCE_FRAME_MISSING")
        receipt = json.loads(OUT_RECEIPT.read_text(encoding="utf-8"))
        image_sha = sha256_file(OUT_PNG)
        if receipt.get("artifactSha256") != image_sha:
            raise RuntimeError("RENDER_RECEIPT_SHA256_MISMATCH")
        if receipt.get("rendered") is not True or receipt.get("videoEncoded") is not False:
            raise RuntimeError("RENDER_RECEIPT_CONTRACT_MISMATCH")
        runtime = round(time.time() - started, 1)
        r2_upload_file(client, f"{prefix}/VENDOR_REFERENCE_FRAME.png", OUT_PNG, "image/png")
        r2_put(client, f"{prefix}/VENDOR_REFERENCE_RENDER_RECEIPT.json", OUT_RECEIPT.read_bytes(), "application/json")
        r2_put(client, f"{prefix}/ECOKIT_MATERIALIZATION.json", (WORK / "ECOKIT_MATERIALIZATION.json").read_bytes(), "application/json")
        r2_put(client, f"{prefix}/DEPENDENCY_BINDING.json", (WORK / "DEPENDENCY_BINDING.json").read_bytes(), "application/json")
        write_status(
            client,
            "COMPLETE",
            blenderVersion=blender_version,
            gpu=telemetry,
            imageSha256=image_sha,
            imageBytes=OUT_PNG.stat().st_size,
            runtimeSeconds=runtime,
            renderEngine=receipt.get("renderEngine"),
            gpuComputeDevice=receipt.get("gpuComputeDevice"),
            imageDimensions=receipt.get("imageDimensions"),
            placed=receipt.get("placed"),
            videoEncoded=False,
            visualApproval=False,
        )
        log("complete", imageSha256=image_sha, runtimeSeconds=runtime)
        return 0
    except Exception as exc:
        write_status(client, "FAILED", error=type(exc).__name__, message=str(exc)[:400], gpu=gpu_telemetry())
        log("failed", error=type(exc).__name__, message=str(exc)[:400])
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
