#!/usr/bin/env python3
"""Fail-closed exactly-one-CREATE paid executor for the StageGraph vendor-reference frame."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
ART = REPO / "artifacts/tivvlejoy-stagegraph-v1"
AUTH_FILE = ART / "VENDOR_REFERENCE_AUTHORIZATION.json"
STATUS_FILE = ART / "STATUS.json"
RENDERER = REPO / "scripts/blender/stagegraph/vendor_reference_render_v1.py"
CONTRACT = REPO / "workers/runpod-blender/src/stagegraph-production-contract-v1.js"

AUTH_NAME = "TIVVLEJOY_STAGEGRAPH_VENDOR_REFERENCE_EXECUTION_AUTHORIZATION_V1"
REQUIRED_BRANCH = "cursor/tivvlejoy-stagegraph-v1-73f1"
REQUIRED_BASE_SHA = "ae766f1b8daf4ecbad7ff2e6be81e42661e755b4"
SOURCE_ID = "SRC_FOREST_STYLISED_ECOKIT"
SOURCE_SHA256 = "8370295466ae2255d6e0c0b4b36bb7f8cddbef8e9cdf5e5b847016254073c79a"
AUDIT_SHA256 = "3c6804cbda061ed16a5d7027618089583ea7e99d2d0b96a6d2541bff89bbfdf0"
PREFLIGHT_SHA256 = "f61bc077b6122e24ccb098b1b7b15c753e84c8a393d5a2e237923f0942e3d8c7"
HDRI_SHA256 = "c41f736d1278b7a61684fa76bd34983c5722e3536ed1d04a7c96c8024c99f65e"
AUTH_SHA256 = "12618427bd4c083d50c5affb7f13fafa032061a465dec3f42e3793eb4abbd031"
PREVIOUS_AUTH_SHA256 = "270865630a301bf39d7067b0545c56a489d37c77c0633dc605d2d95ff7934161"
FIRST_AUTH_SHA256 = "23d6bc4471cd36eb124baab87b673648176333aff57d4a9c0d3e7157ec034c5d"
REJECTED_IMAGE_SHA256 = "6f31cb689488813d54608aff0b0c959835204fb54f62e1d2e321d3957827c3b2"
PREVIOUS_REJECTED_IMAGE_SHA256 = "a1276acb73ada320240cced525dc9902ff89516da97c019bc87c334a94cce400"
SCENE = "TJ_VENDOR_REFERENCE_GOLDEN_FOREST"
GPU_TYPE = "NVIDIA GeForce RTX 4090"
POD_NAME = "tj-sg-vr-3"
MAX_SPEND = 1.00
MAX_PRICE = 0.74
MIN_RAM_GB = 32
MIN_VRAM_GB = 24
CONTAINER_DISK_GB = 60
IMAGE_NAME = "nvidia/cuda:12.4.1-base-ubuntu22.04"
PREFIX = "tivvlejoy-assets/executions/stagegraph-vendor-reference-exposure-v1"
LEDGER_NAME = "VENDOR_REFERENCE_CONSUMPTION_LEDGER_V3.json"
FRAME_NAME = "VENDOR_REFERENCE_FRAME_EXPOSURE_REPAIRED.png"
FOLIAGE_WARNING = "NON_TRIVIAL_ALPHA_BLENDING_WARNINGS_PRESENT_FOR_FOLIAGE_MATERIALS"
HARD_RUNTIME_S = 70 * 60
FAIL_CLOSED_CODES = (
    "AUTHORIZATION_ALREADY_CONSUMED",
    "PAID_CREATE_ALREADY_CONSUMED",
    "VENDOR_REFERENCE_VISUALLY_REJECTED",
    "FRESH_AUTHORIZATION_REQUIRED_AFTER_VISUAL_REJECTION",
    "REJECTED_IMAGE_INELIGIBLE_FOR_REUSE",
)

RECEIPT_FILES = (
    "STATUS.json",
    "SOURCE_PACK_LOCKED.json",
    "DEPENDENCY_AUDIT_PASS.json",
    "VENDOR_REFERENCE_PREFLIGHT_PASS.json",
    "VENDOR_REFERENCE_TARGET.json",
    "VENDOR_REFERENCE_SCENE_PLAN.json",
    "VENDOR_REFERENCE_AUTHORIZATION.json",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def log(event: str, **payload) -> None:
    safe = {k: v for k, v in payload.items() if "key" not in k.lower() and "secret" not in k.lower()}
    print(json.dumps({"ts": utc_now(), "event": event, **safe}), flush=True)


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=REPO, text=True).strip()


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


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


def r2_put(client, key: str, body: bytes, content_type: str, if_none_match: bool = False) -> None:
    extra = {"IfNoneMatch": "*"} if if_none_match else {}
    client.put_object(Bucket=os.environ["R2_BUCKET"], Key=key, Body=body, ContentType=content_type, **extra)


def r2_upload_file(client, key: str, path: Path, content_type: str) -> None:
    client.upload_file(str(path), os.environ["R2_BUCKET"], key, ExtraArgs={"ContentType": content_type})


def r2_get_json(client, key: str):
    try:
        resp = client.get_object(Bucket=os.environ["R2_BUCKET"], Key=key)
        return json.loads(resp["Body"].read().decode())
    except Exception as exc:
        if "NoSuchKey" in type(exc).__name__ or "404" in str(exc):
            return None
        raise


def r2_download(client, key: str, dest: Path) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    client.download_file(os.environ["R2_BUCKET"], key, str(dest))
    return dest.stat().st_size


def runpod_gql(query: str, variables: dict | None = None) -> dict:
    body = {"query": query}
    if variables:
        body["variables"] = variables
    req = urllib.request.Request(
        os.environ.get("RUNPOD_API_ENDPOINT") or "https://api.runpod.io/graphql",
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + os.environ["RUNPOD_API_KEY"],
            "User-Agent": "DoodleDashProduction/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            parsed = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"RUNPOD_HTTP_{exc.code}") from exc
    if parsed.get("errors"):
        raise RuntimeError("RUNPOD_GRAPHQL:" + ";".join(e.get("message", "error")[:240] for e in parsed["errors"]))
    return parsed.get("data") or {}


def list_pods() -> list[dict]:
    data = runpod_gql(
        """
        query {
          myself {
            pods {
              id name desiredStatus costPerHr machineId lastStatusChange
              runtime { uptimeInSeconds }
              machine { gpuDisplayName }
            }
          }
        }
        """
    )
    return ((data.get("myself") or {}).get("pods")) or []


def active_pods(pods: list[dict] | None = None) -> list[dict]:
    pods = list_pods() if pods is None else pods
    return [p for p in pods if str(p.get("desiredStatus") or "").upper() not in {"TERMINATED", "EXITED", "STOPPED"}]


def quote_4090() -> dict:
    data = runpod_gql(
        """
        query ($id: String) {
          gpuTypes(input: { id: $id }) {
            id displayName memoryInGb
            lowestPrice(input: { gpuCount: 1, secureCloud: true, minMemoryInGb: 24 }) {
              uninterruptablePrice stockStatus
            }
          }
        }
        """,
        {"id": GPU_TYPE},
    )
    gpu = (data.get("gpuTypes") or [None])[0] or {}
    price = gpu.get("lowestPrice") or {}
    return {
        "id": gpu.get("id"),
        "displayName": gpu.get("displayName"),
        "vramGb": gpu.get("memoryInGb"),
        "secureUsdPerHr": price.get("uninterruptablePrice"),
        "stockStatus": price.get("stockStatus"),
    }


def authorization_core(auth: dict) -> dict:
    return {
        "schema": auth.get("schema"),
        "actorClass": auth.get("actorClass"),
        "scope": auth.get("scope"),
        "createCount": auth.get("createCount"),
        "retryCount": auth.get("retryCount"),
        "maxSpendUsd": auth.get("maxSpendUsd"),
        "encodeVideo": auth.get("encodeVideo"),
        "sceneName": auth.get("sceneName"),
        "sourceId": auth.get("sourceId"),
        "sourceSha256": auth.get("sourceSha256"),
        "dependencyAuditSha256": auth.get("dependencyAuditSha256"),
        "vendorReferencePreflightSha256": auth.get("vendorReferencePreflightSha256"),
        "ownedHdriSha256": auth.get("ownedHdriSha256"),
        "requiredBranch": auth.get("requiredBranch"),
        "requiredBaseSha": auth.get("requiredBaseSha"),
    }


def node_contract_hash(value: dict) -> str:
    script = (
        "const contract=require('./workers/runpod-blender/src/stagegraph-production-contract-v1.js');"
        "const value=JSON.parse(process.argv[1]);"
        "process.stdout.write(contract.sha256Canonical(value));"
    )
    return subprocess.check_output(["node", "-e", script, json.dumps(value)], cwd=REPO, text=True).strip()


def node_assert_authorization(auth: dict, source: dict, audit: dict) -> dict:
    script = (
        "const contract=require('./workers/runpod-blender/src/stagegraph-production-contract-v1.js');"
        "const input=JSON.parse(process.argv[1]);"
        "process.stdout.write(JSON.stringify(contract.assertBeautyFrameAuthorization(input)));"
    )
    payload = {"receipts": {"SOURCE_PACK_LOCKED": source, "DEPENDENCY_AUDIT_PASS": audit}, "authorization": auth}
    return json.loads(subprocess.check_output(["node", "-e", script, json.dumps(payload)], cwd=REPO, text=True))


def verify_identity() -> dict:
    blockers: list[str] = []
    status = load_json(STATUS_FILE)
    source = load_json(ART / "SOURCE_PACK_LOCKED.json")
    audit = load_json(ART / "DEPENDENCY_AUDIT_PASS.json")
    preflight = load_json(ART / "VENDOR_REFERENCE_PREFLIGHT_PASS.json")
    target = load_json(ART / "VENDOR_REFERENCE_TARGET.json")
    plan = load_json(ART / "VENDOR_REFERENCE_SCENE_PLAN.json")
    auth = load_json(AUTH_FILE)
    renderer = RENDERER.read_text(encoding="utf-8")
    contract = CONTRACT.read_text(encoding="utf-8")

    branch = git("branch", "--show-current")
    head = git("rev-parse", "HEAD")
    if branch != REQUIRED_BRANCH:
        blockers.append("BRANCH_MISMATCH")
    if subprocess.call(["git", "merge-base", "--is-ancestor", REQUIRED_BASE_SHA, head], cwd=REPO) != 0:
        blockers.append("REQUIRED_BASE_SHA_NOT_ANCESTOR")

    if source.get("sourceSha256") != SOURCE_SHA256 or status.get("sourcePackSha256") != SOURCE_SHA256:
        blockers.append("SOURCE_SHA256_MISMATCH")
    if source.get("sourceId") != SOURCE_ID or audit.get("sourceId") != SOURCE_ID:
        blockers.append("SOURCE_ID_MISMATCH")
    if audit.get("artifactSha256") != AUDIT_SHA256 or status.get("dependencyAuditSha256") != AUDIT_SHA256:
        blockers.append("DEPENDENCY_AUDIT_SHA256_MISMATCH")
    if preflight.get("preflightReceiptSha256") != PREFLIGHT_SHA256 or status.get("vendorReferencePreflightSha256") != PREFLIGHT_SHA256:
        blockers.append("VENDOR_REFERENCE_PREFLIGHT_SHA256_MISMATCH")
    if preflight.get("prepareOnly") is not True or preflight.get("rendered") is not False:
        blockers.append("PREFLIGHT_NOT_PREPARE_ONLY")
    if preflight.get("scene", {}).get("name") != SCENE or status.get("preflightScene", {}).get("name") != SCENE:
        blockers.append("SCENE_NAME_MISMATCH")
    if preflight.get("ownedHdriSha256") != HDRI_SHA256 or audit.get("dependencyBinding", {}).get("ownedHdriSha256") != HDRI_SHA256:
        blockers.append("OWNED_HDRI_SHA256_MISMATCH")
    if FOLIAGE_WARNING not in (status.get("auditWarnings") or []) or FOLIAGE_WARNING not in (audit.get("blenderAudit", {}).get("warnings") or []):
        blockers.append("FOLIAGE_ALPHA_WARNING_MISSING")
    historical_creates = int(status.get("paidCreateCount") or 0)
    if historical_creates > 2:
        blockers.append("PAID_CREATE_ALREADY_CONSUMED")
    if historical_creates != 2:
        blockers.append("UNEXPECTED_HISTORICAL_CREATE_COUNT")
    if target.get("renderPolicy", {}).get("videoEncode") is not False or plan.get("videoEncode") is not False:
        blockers.append("VIDEO_ENCODE_NOT_FORBIDDEN")
    if auth.get("schema") != AUTH_NAME:
        blockers.append("AUTHORIZATION_SCHEMA_MISMATCH")
    if auth.get("consumed") is True:
        blockers.append("AUTHORIZATION_ALREADY_CONSUMED")
    if auth.get("authorizationSha256") in {PREVIOUS_AUTH_SHA256, FIRST_AUTH_SHA256} or auth.get("previousAuthorizationSha256") != PREVIOUS_AUTH_SHA256:
        blockers.append("PREVIOUS_AUTHORIZATION_NOT_REUSABLE")
    if float(auth.get("maxSpendUsd") or 0) != 1:
        blockers.append("AUTHORIZATION_SPEND_MISMATCH")
    if auth.get("encodeVideo") is not False or auth.get("retryCount") != 0 or auth.get("beautyFrame") is not False or auth.get("finalRender") is not False:
        blockers.append("AUTHORIZATION_SCOPE_BROADER_THAN_ONE_FRAME")
    if node_contract_hash(authorization_core(auth)) != AUTH_SHA256 or auth.get("authorizationSha256") != AUTH_SHA256:
        blockers.append("AUTHORIZATION_SHA256_MISMATCH")
    try:
        authorized = node_assert_authorization(auth, source, audit)
        if authorized.get("authorized") is not True or authorized.get("encodeVideo") is not False:
            blockers.append("CONTRACT_AUTHORIZATION_REJECTED")
    except Exception:
        blockers.append("CONTRACT_AUTHORIZATION_REJECTED")
        authorized = {}
    if f'SOURCE_SHA256 = "{SOURCE_SHA256}"' not in renderer or f'AUDIT_SHA256 = "{AUDIT_SHA256}"' not in renderer:
        blockers.append("RENDERER_HASH_CONSTANTS_MISMATCH")
    if "enable_cycles_gpu" not in renderer or "CYCLES_UNAVAILABLE" not in renderer:
        blockers.append("RENDERER_GPU_CONTRACT_MISSING")
    if "prepare_ecokit_cycles_alpha" not in renderer:
        blockers.append("RENDERER_CYCLES_ALPHA_REPAIR_MISSING")
    if "apply_color_management" not in renderer or "assert_composition_locked" not in renderer:
        blockers.append("RENDERER_EXPOSURE_LOOKDEV_MISSING")
    if not (HERE.parent.parent / "blender/stagegraph/ecokit_cycles_alpha_v1.py").is_file():
        blockers.append("CYCLES_ALPHA_REPAIR_MODULE_MISSING")
    if not (HERE.parent.parent / "blender/stagegraph/vendor_reference_lookdev_v1.py").is_file():
        blockers.append("EXPOSURE_LOOKDEV_MODULE_MISSING")
    if not (HERE.parent.parent / "blender/forest_canopy_lighting_repair_v1.py").is_file():
        blockers.append("FOREST_CANOPY_LIGHTING_REPAIR_MODULE_MISSING")
    if "assertBeautyFrameAuthorization" not in contract or "EXACTLY_ONE_VENDOR_REFERENCE_FRAME" not in contract:
        blockers.append("RENDERER_CONTRACT_MISSING")
    if status.get("currentGate") != "VENDOR_REFERENCE_REPRODUCED":
        blockers.append("CURRENT_GATE_MISMATCH")
    if status.get("beautyFrameAuthorizationPresent") or status.get("finalRenderAuthorized"):
        blockers.append("LATER_PAID_STAGE_ALREADY_PRESENT")
    if status.get("vendorReferenceReproducedApproved") is not False or status.get("rejectedVendorReferenceIneligible") is not True:
        blockers.append("REJECTED_IMAGE_INELIGIBLE_FOR_REUSE")
    if status.get("rejectedVendorReferenceImageSha256") != REJECTED_IMAGE_SHA256:
        blockers.append("REJECTED_IMAGE_BINDING_MISMATCH")
    if status.get("previousRejectedVendorReferenceImageSha256") != PREVIOUS_REJECTED_IMAGE_SHA256:
        blockers.append("PREVIOUS_REJECTED_IMAGE_BINDING_MISMATCH")
    if status.get("zeroPaidRepairImplemented") is not True:
        blockers.append("ZERO_PAID_REPAIR_NOT_IMPLEMENTED")
    if status.get("zeroPaidExposureRepairImplemented") is not True:
        blockers.append("ZERO_PAID_EXPOSURE_REPAIR_NOT_IMPLEMENTED")
    if status.get("freshVendorReferenceAuthorizationPresent") is not True:
        blockers.append("FRESH_AUTHORIZATION_REQUIRED_AFTER_VISUAL_REJECTION")
    if status.get("humanVisualDecision") != "REJECTED":
        blockers.append("VENDOR_REFERENCE_VISUALLY_REJECTED")

    ledger = ART / LEDGER_NAME
    if ledger.exists() and int(load_json(ledger).get("createPerformed") or 0) != 0:
        blockers.append("LEDGER_ALREADY_CONSUMED")
    old_ledger = ART / "VENDOR_REFERENCE_CONSUMPTION_LEDGER.json"
    if old_ledger.exists() and load_json(old_ledger).get("authorizationSha256") == AUTH_SHA256:
        blockers.append("OLD_LEDGER_BOUND_TO_NEW_AUTH")

    required_env = ("RUNPOD_API_KEY", "R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")
    missing_env = [name for name in required_env if not os.environ.get(name)]
    if missing_env:
        blockers.append("REQUIRED_ENV_MISSING")

    live = []
    quote = {}
    try:
        live = active_pods()
        named = [p for p in live if p.get("name") == POD_NAME]
        if live:
            blockers.append("LIVE_PODS_NOT_EMPTY")
        if named:
            blockers.append("NAMED_POD_ALREADY_EXISTS")
        quote = quote_4090()
        if quote.get("id") != GPU_TYPE:
            blockers.append("GPU_NOT_4090")
        rate = float(quote.get("secureUsdPerHr") or 99)
        if rate > MAX_PRICE:
            blockers.append("PRICE_ABOVE_CONTRACT")
        if not quote.get("secureUsdPerHr"):
            blockers.append("PRICE_MISSING")
        if float(quote.get("vramGb") or 0) < MIN_VRAM_GB:
            blockers.append("VRAM_BELOW_24GIB")
        stock = str(quote.get("stockStatus") or "").lower()
        if stock in {"out", "unavailable", "none"}:
            blockers.append("SECURE_4090_NO_STOCK")
    except Exception as exc:
        blockers.append("RUNPOD_PROBE_FAILED")
        quote = {"error": type(exc).__name__}

    unique = []
    for item in blockers:
        if item not in unique:
            unique.append(item)
    file_hashes = {name: sha256_file(ART / name) for name in RECEIPT_FILES if (ART / name).is_file()}
    payload = {
        "schema": "TIVVLEJOY_STAGEGRAPH_VENDOR_REFERENCE_FAIL_CLOSED_V1",
        "ok": not unique,
        "blockers": unique,
        "authorizationSha256": AUTH_SHA256,
        "branch": branch,
        "headSha": head,
        "requiredBaseSha": REQUIRED_BASE_SHA,
        "receiptFileSha256": file_hashes,
        "quote": quote,
        "livePodCount": len(live),
        "livePodNames": [p.get("name") for p in live],
        "authorized": authorized,
        "missingEnvNames": missing_env,
        "createCount": 1,
        "retry": False,
        "encodeVideo": False,
        "paidCreate": 0,
        "at": utc_now(),
    }
    write_json(ART / "VENDOR_REFERENCE_FAIL_CLOSED.json", payload)
    return payload


def docker_start_cmd() -> list[str]:
    bootstrap = (
        "set -euo pipefail; "
        "export DEBIAN_FRONTEND=noninteractive; "
        "apt-get update; "
        "apt-get install -y python3 python3-pip curl xz-utils "
        "libgl1 libxi6 libxrender1 libxkbcommon0 libsm6 libxxf86vm1 libxfixes3 libx11-6 libxext6; "
        "pip3 install --disable-pip-version-check boto3==1.40.14; "
        "python3 -c 'import os,boto3; "
        "c=boto3.client(\"s3\",endpoint_url=os.environ[\"R2_ENDPOINT\"],"
        "aws_access_key_id=os.environ[\"R2_ACCESS_KEY_ID\"],"
        "aws_secret_access_key=os.environ[\"R2_SECRET_ACCESS_KEY\"],region_name=\"auto\"); "
        "c.download_file(os.environ[\"R2_BUCKET\"],os.environ[\"SG_ENTRY_KEY\"],\"/tmp/sg-entry.py\")'; "
        "python3 /tmp/sg-entry.py"
    )
    return ["/bin/bash", "-lc", bootstrap]


def upload_bundle(client) -> dict:
    files = [
        REPO / "scripts/cloud/stagegraph-v1/materialize_ecokit_v1.py",
        REPO / "scripts/cloud/stagegraph-v1/materialize_ecokit_dependencies_v1.py",
        REPO / "scripts/cloud/stagegraph-v1/pod_entry_vendor_reference_v1.py",
        REPO / "scripts/blender/stagegraph/vendor_reference_render_v1.py",
        REPO / "scripts/blender/stagegraph/ecokit_cycles_alpha_v1.py",
        REPO / "scripts/blender/stagegraph/vendor_reference_lookdev_v1.py",
        REPO / "scripts/blender/forest_canopy_lighting_repair_v1.py",
        REPO / "scripts/blender/stagegraph/asset_certify_blender_v1.py",
        REPO / "scripts/blender/stagegraph/asset_certify_contract_v1.py",
        AUTH_FILE,
    ]
    with tempfile.TemporaryDirectory() as tmp:
        tarball = Path(tmp) / "bundle.tgz"
        with tarfile.open(tarball, "w:gz") as archive:
            for path in files:
                if path == AUTH_FILE:
                    archive.add(path, arcname="VENDOR_REFERENCE_AUTHORIZATION.json")
                else:
                    archive.add(path, arcname=str(path.relative_to(REPO)))
        bundle_key = f"{PREFIX}/inputs/bundle.tgz"
        entry_key = f"{PREFIX}/inputs/pod_entry_vendor_reference_v1.py"
        r2_upload_file(client, bundle_key, tarball, "application/gzip")
        r2_upload_file(client, entry_key, HERE / "pod_entry_vendor_reference_v1.py", "text/x-python")
        return {
            "bundleKey": bundle_key,
            "bundleSha256": sha256_file(tarball),
            "entryKey": entry_key,
            "entrySha256": sha256_file(HERE / "pod_entry_vendor_reference_v1.py"),
        }


def create_pod(rate: float, bundle: dict) -> str:
    env = {
        "R2_ENDPOINT": os.environ["R2_ENDPOINT"],
        "R2_BUCKET": os.environ["R2_BUCKET"],
        "R2_ACCESS_KEY_ID": os.environ["R2_ACCESS_KEY_ID"],
        "R2_SECRET_ACCESS_KEY": os.environ["R2_SECRET_ACCESS_KEY"],
        "SG_BUNDLE_KEY": bundle["bundleKey"],
        "SG_ENTRY_KEY": bundle["entryKey"],
        "SG_OUTPUT_PREFIX": PREFIX,
        "SG_AUTHORIZATION_SHA256": AUTH_SHA256,
        "RUNPOD_GPU_HOURLY_RATE": str(rate),
        "TIVVLEJOY_JOB_KIND": "STAGEGRAPH_VENDOR_REFERENCE_FRAME",
    }
    if any(k in env for k in ("RUNPOD_API_KEY", "ALLOW_PAID_GPU_LAUNCH")):
        raise RuntimeError("POD_SECRET_POLICY_VIOLATION")
    if any(not str(v) for v in env.values()):
        raise RuntimeError("POD_ENV_INCOMPLETE")
    payload = {
        "name": POD_NAME,
        "imageName": IMAGE_NAME,
        "gpuTypeIds": [GPU_TYPE],
        "gpuCount": 1,
        "cloudType": "SECURE",
        "computeType": "GPU",
        "interruptible": False,
        "minRAMPerGPU": MIN_RAM_GB,
        "containerDiskInGb": CONTAINER_DISK_GB,
        "volumeInGb": 0,
        "dockerStartCmd": docker_start_cmd(),
        "env": env,
    }
    req = urllib.request.Request(
        "https://rest.runpod.io/v1/pods",
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + os.environ["RUNPOD_API_KEY"],
            "User-Agent": "DoodleDashProduction/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()[:400]
        raise RuntimeError(f"RUNPOD_REST_CREATE_{exc.code}:{detail}") from exc
    pod_id = str(body.get("id") or "")
    if not pod_id:
        raise RuntimeError("CREATE_RETURNED_NO_ID")
    return pod_id


def recover_named_pod() -> dict | None:
    deadline = time.time() + 180
    while time.time() < deadline:
        exact = [p for p in active_pods() if p.get("name") == POD_NAME]
        if len(exact) > 1:
            raise RuntimeError("MAX_POD_COUNT_VIOLATED")
        if len(exact) == 1:
            return exact[0]
        time.sleep(10)
    return None


def terminate_pod(pod_id: str | None) -> dict:
    if pod_id:
        for attempt in range(1, 4):
            try:
                runpod_gql("mutation ($podId: String!) { podTerminate(input: { podId: $podId }) }", {"podId": pod_id})
                log("terminate_requested", attempt=attempt)
                break
            except Exception as exc:
                log("terminate_error", attempt=attempt, error=type(exc).__name__)
                time.sleep(8)
    deadline = time.time() + 180
    live = []
    while time.time() < deadline:
        live = active_pods()
        exact = [p for p in live if p.get("id") == pod_id or p.get("name") == POD_NAME]
        if not exact and not live:
            return {"confirmed": True, "live": []}
        time.sleep(8)
        try:
            if pod_id:
                runpod_gql("mutation ($podId: String!) { podTerminate(input: { podId: $podId }) }", {"podId": pod_id})
        except Exception:
            pass
    return {"confirmed": False, "live": [{"id": p.get("id"), "name": p.get("name")} for p in live]}


def mark_auth_consumed(pod_id: str | None) -> None:
    auth = load_json(AUTH_FILE)
    auth["consumed"] = True
    auth["consumedAt"] = utc_now()
    auth["podId"] = pod_id
    auth["createPerformed"] = 1
    write_json(AUTH_FILE, auth)


def update_status(execution: dict) -> None:
    status = load_json(STATUS_FILE)
    status["status"] = "VENDOR_REFERENCE_FRAME_RENDERED_AWAITING_HUMAN_VISUAL_APPROVAL"
    status["currentGate"] = "VENDOR_REFERENCE_REPRODUCED"
    status["currentGateStatus"] = "FRAME_RENDERED_AWAITING_HUMAN_VISUAL_APPROVAL"
    status["currentGateBlocker"] = "HUMAN_VISUAL_APPROVAL_REQUIRED"
    previous_spend = float(status.get("paidSpendUsd") or 0)
    status["paidCreateCount"] = 3
    status["paidSpendUsd"] = execution.get("actualSpendUsd")
    status["totalAccountedSpendUsd"] = round(previous_spend + float(execution.get("actualSpendUsd") or 0), 4)
    status["vendorReferenceFrameAuthorizationPresent"] = True
    status["vendorReferenceFrameAuthorizationConsumed"] = True
    status["freshVendorReferenceAuthorizationPresent"] = True
    status["vendorReferenceFrameAuthorizationSha256"] = AUTH_SHA256
    status["vendorReferenceExecutionSha256"] = execution.get("executionReceiptSha256")
    status["vendorReferenceImageSha256"] = execution.get("imageSha256")
    status["rejectedVendorReferenceImageSha256"] = REJECTED_IMAGE_SHA256
    status["previousRejectedVendorReferenceImageSha256"] = PREVIOUS_REJECTED_IMAGE_SHA256
    status["rejectedVendorReferenceImageSha256s"] = [PREVIOUS_REJECTED_IMAGE_SHA256, REJECTED_IMAGE_SHA256]
    status["rejectedVendorReferenceIneligible"] = True
    status["vendorReferenceReproducedApproved"] = False
    status["humanVisualReviewRequired"] = True
    status["humanVisualDecision"] = None
    status["preflightScene"] = {
        **(status.get("preflightScene") or {}),
        "rendered": True,
        "visualApproval": False,
    }
    status["auditWarnings"] = [FOLIAGE_WARNING]
    status["beautyFrameAuthorizationPresent"] = False
    status["finalRenderAuthorized"] = False
    status["productionReady"] = False
    status["anotherVendorReferenceFrameRequired"] = False
    status["freshPaidAuthorizationRequired"] = False
    status["nextRequiredHumanDecision"] = "HUMAN_VISUAL_REVIEW_OF_EXPOSURE_REPAIRED_VENDOR_REFERENCE_FRAME"
    write_json(STATUS_FILE, status)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--create-authorized-once", action="store_true")
    parser.add_argument("--fail-closed-only", action="store_true")
    args = parser.parse_args()
    ART.mkdir(parents=True, exist_ok=True)
    checks = verify_identity()
    log("fail_closed", ok=checks["ok"], blockers=checks["blockers"], live=checks["livePodCount"])
    if args.fail_closed_only or not args.create_authorized_once:
        write_json(
            ART / "VENDOR_REFERENCE_RESULT.json",
            {
                "schema": "TIVVLEJOY_STAGEGRAPH_VENDOR_REFERENCE_RESULT_V1",
                "status": "FAILED_CLOSED_BEFORE_CREATE" if not checks["ok"] else "CHECKS_PASSED_CREATE_NOT_ARMED",
                "authorizationSha256": AUTH_SHA256,
                "paidCreate": 0,
                "actualSpendUsd": 0,
                "blockers": checks["blockers"],
                "at": utc_now(),
            },
        )
        return 0 if checks["ok"] and args.fail_closed_only else (2 if not checks["ok"] else 3)
    if not checks["ok"]:
        write_json(
            ART / "VENDOR_REFERENCE_RESULT.json",
            {
                "schema": "TIVVLEJOY_STAGEGRAPH_VENDOR_REFERENCE_RESULT_V1",
                "status": "FAILED_CLOSED_BEFORE_CREATE",
                "authorizationSha256": AUTH_SHA256,
                "paidCreate": 0,
                "actualSpendUsd": 0,
                "blockers": checks["blockers"],
                "at": utc_now(),
            },
        )
        return 2

    ledger = ART / LEDGER_NAME
    if ledger.exists() and int(load_json(ledger).get("createPerformed") or 0) != 0:
        raise RuntimeError("LEDGER_ALREADY_CONSUMED")
    write_json(
        ledger,
        {
            "schema": "TIVVLEJOY_STAGEGRAPH_VENDOR_REFERENCE_LEDGER_V1",
            "authorizationSha256": AUTH_SHA256,
            "createPerformed": 0,
            "at": utc_now(),
        },
    )
    client = r2_client()
    existing = r2_get_json(client, f"{PREFIX}/consumption-ledger.json")
    if existing and int(existing.get("createPerformed") or 0) != 0:
        raise RuntimeError("REMOTE_LEDGER_ALREADY_CONSUMED")
    bundle = upload_bundle(client)
    rate = float(checks["quote"]["secureUsdPerHr"])
    started = time.time()
    pod_id = None
    create_performed = 0
    cleanup = None
    try:
        log("create_entered", gpu=GPU_TYPE, image=IMAGE_NAME)
        try:
            pod_id = create_pod(rate, bundle)
            create_performed = 1
        except Exception as exc:
            log("create_response_failed_or_ambiguous", error=type(exc).__name__)
            recovered = recover_named_pod()
            if recovered:
                pod_id = recovered["id"]
                create_performed = 1
            else:
                raise
        write_json(
            ledger,
            {
                "schema": "TIVVLEJOY_STAGEGRAPH_VENDOR_REFERENCE_LEDGER_V1",
                "authorizationSha256": AUTH_SHA256,
                "createPerformed": 1,
                "podId": pod_id,
                "at": utc_now(),
            },
        )
        r2_put(client, f"{PREFIX}/consumption-ledger.json", ledger.read_bytes(), "application/json", if_none_match=True)
        mark_auth_consumed(pod_id)
        write_json(
            ART / "VENDOR_REFERENCE_LAUNCH.json",
            {
                "podId": pod_id,
                "podName": POD_NAME,
                "imageName": IMAGE_NAME,
                "quotedUsdPerHr": rate,
                "bundle": bundle,
                "at": utc_now(),
            },
        )
        log("pod_confirmed", podId=pod_id)
        observed_rate = rate
        hard_deadline = started + min(HARD_RUNTIME_S, (MAX_SPEND / max(observed_rate, 0.01)) * 3600 * 0.95)
        status = None
        while time.time() < hard_deadline:
            status = r2_get_json(client, f"{PREFIX}/status.json")
            if status and status.get("status") in {"COMPLETE", "FAILED"}:
                break
            pods = list_pods()
            exact = next((p for p in pods if p.get("id") == pod_id), None)
            if exact and float(exact.get("costPerHr") or 0) > 0:
                observed_rate = float(exact["costPerHr"])
                hard_deadline = min(
                    started + HARD_RUNTIME_S,
                    started + (MAX_SPEND / max(observed_rate, 0.01)) * 3600 * 0.95,
                )
            if exact and str(exact.get("desiredStatus") or "").upper() in {"TERMINATED", "EXITED"} and not status:
                raise RuntimeError("POD_EXITED_WITHOUT_TERMINAL_STATUS")
            elapsed = time.time() - started
            spend = (elapsed / 3600.0) * observed_rate
            log("poll", status=(status or {}).get("status"), spend=round(spend, 4), podId=pod_id)
            if spend >= MAX_SPEND * 0.95:
                raise RuntimeError("SPEND_CEILING_REACHED")
            time.sleep(15)
        if not status or status.get("status") != "COMPLETE":
            raise RuntimeError("HARD_RUNTIME_OR_COST_DEADLINE_OR_FAILED")
        rejected_path = ART / "VENDOR_REFERENCE_FRAME.png"
        if rejected_path.is_file() and sha256_file(rejected_path) != PREVIOUS_REJECTED_IMAGE_SHA256:
            raise RuntimeError("REJECTED_FRAME_FILE_TAMPERED")
        exposure_rejected_path = ART / "VENDOR_REFERENCE_FRAME_REPAIRED.png"
        if exposure_rejected_path.is_file() and sha256_file(exposure_rejected_path) != REJECTED_IMAGE_SHA256:
            raise RuntimeError("EXPOSURE_REJECTED_FRAME_FILE_TAMPERED")
        image_path = ART / FRAME_NAME
        r2_download(client, f"{PREFIX}/VENDOR_REFERENCE_FRAME.png", image_path)
        render_receipt_path = ART / "VENDOR_REFERENCE_RENDER_RECEIPT_EXPOSURE.json"
        r2_download(client, f"{PREFIX}/VENDOR_REFERENCE_RENDER_RECEIPT.json", render_receipt_path)
        image_sha = sha256_file(image_path)
        render_receipt = load_json(render_receipt_path)
        if image_sha in {REJECTED_IMAGE_SHA256, PREVIOUS_REJECTED_IMAGE_SHA256}:
            raise RuntimeError("REJECTED_IMAGE_INELIGIBLE_FOR_REUSE")
        if render_receipt.get("artifactSha256") != image_sha:
            raise RuntimeError("DOWNLOADED_IMAGE_SHA256_MISMATCH")
        if image_sha != status.get("imageSha256"):
            raise RuntimeError("STATUS_IMAGE_SHA256_MISMATCH")
        runtime = time.time() - started
        spend = round((runtime / 3600.0) * observed_rate, 4)
        if spend > MAX_SPEND:
            raise RuntimeError("SPEND_EXCEEDED")
        pods = list_pods()
        exact = next((p for p in pods if p.get("id") == pod_id), None)
        gpu_name = ((exact or {}).get("machine") or {}).get("gpuDisplayName") or (status.get("gpu") or {}).get("gpuName")
        execution = {
            "schema": "TIVVLEJOY_STAGEGRAPH_VENDOR_REFERENCE_EXECUTION_RECEIPT_V1",
            "result": "RENDERED_AWAITING_HUMAN_VISUAL_APPROVAL",
            "stage": "VENDOR_REFERENCE_REPRODUCED",
            "actorClass": "SYSTEM",
            "claimedApprovalLabel": "BLENDER_RENDERED",
            "visualApproval": False,
            "decision": "NOT_APPROVED",
            "authorizationSha256": AUTH_SHA256,
            "sourceSha256": SOURCE_SHA256,
            "dependencyAuditSha256": AUDIT_SHA256,
            "vendorReferencePreflightSha256": PREFLIGHT_SHA256,
            "ownedHdriSha256": HDRI_SHA256,
            "imageSha256": image_sha,
            "artifactSha256": image_sha,
            "imageBytes": image_path.stat().st_size,
            "imageDimensions": render_receipt.get("imageDimensions") or [1280, 720],
            "imagePath": f"artifacts/tivvlejoy-stagegraph-v1/{FRAME_NAME}",
            "podId": pod_id,
            "podName": POD_NAME,
            "gpuTypeId": GPU_TYPE,
            "assignedGpuName": gpu_name,
            "quotedUsdPerHr": rate,
            "observedUsdPerHr": observed_rate,
            "actualSpendUsd": spend,
            "runtimeSeconds": round(runtime, 1),
            "renderEngine": render_receipt.get("renderEngine"),
            "gpuComputeDevice": render_receipt.get("gpuComputeDevice"),
            "blenderVersion": status.get("blenderVersion"),
            "placed": render_receipt.get("placed"),
            "videoEncoded": False,
            "paidCreateCount": 1,
            "retryCount": 0,
            "foliageMaterialWarnings": [FOLIAGE_WARNING],
            "humanVisualDecisionRequired": True,
            "nextFormalStage": "VENDOR_REFERENCE_REPRODUCED",
            "laterPaidStagesForbidden": [
                "TIVVLEJOY_BEAUTY_FRAME_APPROVED",
                "FINAL_RENDER_AUTHORIZED",
            ],
            "at": utc_now(),
        }
        execution["executionReceiptSha256"] = hashlib.sha256(
            json.dumps({k: v for k, v in execution.items() if k != "executionReceiptSha256"}, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        write_json(ART / "VENDOR_REFERENCE_EXECUTION.json", execution)
        r2_put(client, f"{PREFIX}/VENDOR_REFERENCE_EXECUTION.json", (ART / "VENDOR_REFERENCE_EXECUTION.json").read_bytes(), "application/json")
        update_status(execution)
        write_json(
            ART / "VENDOR_REFERENCE_RESULT.json",
            {
                "schema": "TIVVLEJOY_STAGEGRAPH_VENDOR_REFERENCE_RESULT_V1",
                "status": "RENDERED_AWAITING_HUMAN_VISUAL_APPROVAL",
                "authorizationSha256": AUTH_SHA256,
                "paidCreate": 1,
                "actualSpendUsd": spend,
                "runtimeSeconds": round(runtime, 1),
                "imageSha256": image_sha,
                "podId": pod_id,
                "gpu": gpu_name,
                "at": utc_now(),
            },
        )
        return 0
    except Exception as exc:
        runtime = time.time() - started
        spend = round((runtime / 3600.0) * float((checks.get("quote") or {}).get("secureUsdPerHr") or 0), 4) if create_performed else 0
        write_json(
            ART / "VENDOR_REFERENCE_RESULT.json",
            {
                "schema": "TIVVLEJOY_STAGEGRAPH_VENDOR_REFERENCE_RESULT_V1",
                "status": "FAILED_AFTER_CREATE" if create_performed else "FAILED_CLOSED_BEFORE_CREATE",
                "reason": type(exc).__name__,
                "message": str(exc)[:400],
                "authorizationSha256": AUTH_SHA256,
                "paidCreate": create_performed,
                "actualSpendUsd": spend,
                "runtimeSeconds": round(runtime, 1),
                "podId": pod_id,
                "at": utc_now(),
            },
        )
        log("failed", error=type(exc).__name__, message=str(exc)[:400])
        return 2
    finally:
        if create_performed:
            cleanup = terminate_pod(pod_id)
            write_json(ART / "VENDOR_REFERENCE_CLEANUP.json", cleanup)
            log("cleanup", confirmed=cleanup.get("confirmed"), live=cleanup.get("live"))


if __name__ == "__main__":
    raise SystemExit(main())
