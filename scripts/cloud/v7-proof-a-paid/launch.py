#!/usr/bin/env python3
"""Exactly-one-CREATE paid launcher for V7 Proof A Water C.

Never starts the 30-second scenery showcase. Never retries CREATE.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
import zlib
from datetime import datetime, timezone
from pathlib import Path

import boto3
from botocore.config import Config

REPO = Path(__file__).resolve().parents[3]
SCENERY = REPO / "scripts/blender/scenery"
sys.path.insert(0, str(SCENERY))
from cinematic_water_lock_v1 import WATER_LOCK  # noqa: E402
from worker_memory_contract_v1 import evaluate_worker_memory_contract  # noqa: E402

AUTH = "TIVVLEJOY_V7_LARGER_MEMORY_PAID_PROOF_A_EXECUTION_V1"
POD_NAME = "tj-v7-proof-a-lm-v1"
GPU_TYPE = "NVIDIA GeForce RTX 4090"
MAX_SPEND = 0.40
MIN_RAM_GB = 32
HARD_RAM_GB = 24
MIN_VRAM_GB = 24
REQUIRED_SHA = "62ae32be06c0196a06a6c0dfcda5525ea367b14a"
REQUIRED_BRANCH = "cursor/tivvlejoy-scenery-showcase-30s-v1-73f1"
EXPECTED_H8 = "c41f736d1278b7a61684fa76bd34983c5722e3536ed1d04a7c96c8024c99f65e"
EXPECTED_SOURCE = "2c747a306f1f8a3031155d3a266cc56b62e91966431db54e67c36f772c58c20c"
PREFIX = "tivvlejoy-assets/executions/v7-proof-a-paid-v1"
OUT = REPO / "artifacts/tivvlejoy-scenery-showcase-30s/v7-proof-a-paid"
PIN_FILE = REPO / "config/cloud/scenery-showcase-worker-image.json"
ENTRY_FILE = Path(__file__).resolve().parent / "entry.js"

SOURCE_HDRI = Path("/tmp/o14-lookdev/expanded-original14/sky_hdri/HDRi_JPG_Pack/sk2/Image0001.jpg")
H8_PATH = Path("/tmp/tj_hdri_diag_8k.jpg")
ROCK_BLEND = Path("/tmp/o14-v4-source/SRC_FOREST_STYLISED_ECOKIT/Stylised EcoKit/Rock_Models.blend")
BOTANIQ_ROOT = Path("/tmp/o14-v4-source/SRC_BOTANIQ_FULL_7_2_0")
SCRIPTS_TAR = Path("/tmp/v7-proof-a-stage/v7-scenery-scripts.tar.gz")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def log(event: str, **payload) -> None:
    safe = {k: v for k, v in payload.items() if "key" not in k.lower() and "secret" not in k.lower()}
    print(json.dumps({"ts": utc_now(), "event": event, **safe}), flush=True)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


def r2_client():
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
    except client.exceptions.NoSuchKey:
        return None
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
              id name desiredStatus costPerHr gpuCount machineId lastStatusChange
              runtime { uptimeInSeconds }
              machine { gpuDisplayName }
            }
          }
        }
        """
    )
    return ((data.get("myself") or {}).get("pods")) or []


def active_pods(pods: list[dict]) -> list[dict]:
    out = []
    for pod in pods:
        status = str(pod.get("desiredStatus") or "").upper()
        if status not in {"TERMINATED", "EXITED", "STOPPED"}:
            out.append(pod)
    return out


def quote_4090(min_memory_gb: int) -> dict:
    data = runpod_gql(
        """
        query ($id: String, $mem: Int) {
          gpuTypes(input: { id: $id }) {
            id displayName memoryInGb secureCloud
            lowestPrice(input: { gpuCount: 1, secureCloud: true, minMemoryInGb: $mem }) {
              uninterruptablePrice minimumBidPrice stockStatus
            }
          }
        }
        """,
        {"id": GPU_TYPE, "mem": min_memory_gb},
    )
    gpu = (data.get("gpuTypes") or [None])[0] or {}
    price = gpu.get("lowestPrice") or {}
    return {
        "id": gpu.get("id"),
        "displayName": gpu.get("displayName"),
        "vramGb": gpu.get("memoryInGb"),
        "secureUsdPerHr": price.get("uninterruptablePrice"),
        "stockStatus": price.get("stockStatus"),
        "minMemoryInGb": min_memory_gb,
    }


def git_head() -> tuple[str, str, bool]:
    import subprocess

    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip()
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
    ancestor = (
        subprocess.call(
            ["git", "merge-base", "--is-ancestor", REQUIRED_SHA, "HEAD"],
            cwd=REPO,
        )
        == 0
    )
    return branch, sha, ancestor


def png_info(path: Path) -> dict:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return {"ok": False, "reason": "NOT_PNG", "bytes": len(data)}
    width, height = struct.unpack(">II", data[16:24])
    return {"ok": True, "width": width, "height": height, "bytes": len(data)}


def magenta_ratio(path: Path) -> float:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return 1.0
    idx = 8
    raw = b""
    while idx + 8 <= len(data):
        length = struct.unpack(">I", data[idx : idx + 4])[0]
        ctype = data[idx + 4 : idx + 8]
        chunk = data[idx + 8 : idx + 8 + length]
        idx += 12 + length
        if ctype == b"IDAT":
            raw += chunk
        if ctype == b"IEND":
            break
    try:
        pixels = zlib.decompress(raw)
    except zlib.error:
        return 1.0
    width, height = struct.unpack(">II", data[16:24])
    stride = 1 + width * 3
    if len(pixels) < stride * height:
        return 1.0
    magenta = 0
    total = width * height
    for y in range(height):
        row = pixels[y * stride + 1 : (y + 1) * stride]
        for x in range(width):
            r, g, b = row[x * 3 : x * 3 + 3]
            if r > 200 and b > 200 and g < 40:
                magenta += 1
    return magenta / max(total, 1)


def pin_ref() -> dict:
    pin = json.loads(PIN_FILE.read_text())
    ref = str(pin.get("ref") or "")
    digest = str(pin.get("digest") or "")
    if not ref.startswith("ghcr.io/") or "@sha256:" not in ref:
        raise RuntimeError("WORKER_IMAGE_NOT_PINNED")
    hexpart = ref.split("@sha256:", 1)[1]
    if len(hexpart) != 64 or any((c < "0" or c > "9") and (c < "a" or c > "f") for c in hexpart):
        raise RuntimeError("WORKER_IMAGE_BAD_DIGEST")
    if pin.get("blenderVersion") != "4.2.2":
        raise RuntimeError("WORKER_IMAGE_BLENDER_MISMATCH")
    return {"ref": ref, "digest": digest, "blenderVersion": pin["blenderVersion"]}


def source_files() -> list[dict]:
    files = [
        {
            "role": "hdri_source",
            "dest": str(SOURCE_HDRI),
            "local": SOURCE_HDRI,
            "sha256": EXPECTED_SOURCE,
            "r2_name": "Image0001.jpg",
        },
        {
            "role": "hdri_h8",
            "dest": str(H8_PATH),
            "local": H8_PATH,
            "sha256": EXPECTED_H8,
            "r2_name": "tj_hdri_diag_8k.jpg",
        },
        {
            "role": "ecokit_rocks",
            "dest": str(ROCK_BLEND),
            "local": ROCK_BLEND,
            "sha256": sha256_file(ROCK_BLEND),
            "r2_name": "Rock_Models.blend",
        },
        {
            "role": "scripts",
            "dest": "/tmp/v7-scenery-scripts.tar.gz",
            "local": SCRIPTS_TAR,
            "sha256": sha256_file(SCRIPTS_TAR),
            "r2_name": "v7-scenery-scripts.tar.gz",
        },
        {
            "role": "entry",
            "dest": "/tmp/v7-proof-a-entry.js",
            "local": ENTRY_FILE,
            "sha256": sha256_file(ENTRY_FILE),
            "r2_name": "entry.js",
        },
    ]
    names = {
        "beech_a": "bq_Tree_Fagus-sylvatica_A_summer.blend",
        "festuca_a": "bq_Grass_Festuca_glauca_A_spring.blend",
        "carex_a": "bq_Grass_Carex-oshimensis_A_spring.blend",
        "fern_a": "bq_Plant_Dryopteris-carthusiana_A_spring-summer-autumn.blend",
        "botaniq_materials": "bq_Library_Materials.blend",
    }
    for role, name in names.items():
        hits = list(BOTANIQ_ROOT.rglob(name))
        if not hits:
            raise RuntimeError(f"BOTANIQ_MISSING:{name}")
        files.append(
            {
                "role": role,
                "dest": str(hits[0]),
                "local": hits[0],
                "sha256": sha256_file(hits[0]),
                "r2_name": name,
            }
        )
    return files


def preflight() -> dict:
    blockers: list[str] = []
    branch, sha, ancestor = git_head()
    if branch != REQUIRED_BRANCH:
        blockers.append("BRANCH_MISMATCH")
    if not ancestor:
        blockers.append("REQUIRED_STARTING_SHA_NOT_ANCESTOR")
    try:
        import subprocess

        pr_raw = subprocess.check_output(
            ["gh", "pr", "view", "169", "--json", "isDraft,state,mergedAt"],
            cwd=REPO,
            text=True,
        )
        pr_info = json.loads(pr_raw)
        if not pr_info.get("isDraft") or pr_info.get("state") != "OPEN" or pr_info.get("mergedAt"):
            blockers.append("PR_NOT_DRAFT_OPEN")
    except Exception:
        blockers.append("PR_STATE_UNVERIFIED")
    pods = list_pods()
    live = active_pods(pods)
    if live:
        blockers.append("LIVE_PAID_PODS_NOT_EMPTY")
    quote32 = quote_4090(MIN_RAM_GB)
    quote24 = quote_4090(HARD_RAM_GB)
    if quote32.get("id") != GPU_TYPE:
        blockers.append("GPU_NOT_4090")
    if int(quote32.get("vramGb") or 0) < MIN_VRAM_GB:
        blockers.append("GPU_VRAM_BELOW_24GIB")
    if not quote32.get("secureUsdPerHr"):
        blockers.append("PRICE_MISSING")
    if float(quote32.get("secureUsdPerHr") or 99) > 0.80:
        blockers.append("PRICE_ABOVE_CONTRACT")
    stock = str(quote32.get("stockStatus") or "").lower()
    if stock in {"", "none", "unavailable"}:
        blockers.append("4090_32GIB_UNAVAILABLE")
        # Do not substitute another GPU. 24 GiB RAM stock is recorded only.
    rate = float(quote32.get("secureUsdPerHr") or 0)
    estimate = round((20 / 60.0) * rate, 4)
    worst = round((30 / 60.0) * rate, 4)
    if estimate > MAX_SPEND or worst > MAX_SPEND:
        if worst > MAX_SPEND:
            blockers.append("COST_ESTIMATE_EXCEEDS_040")
    pin = pin_ref()
    files = source_files()
    if sha256_file(SOURCE_HDRI) != EXPECTED_SOURCE:
        blockers.append("HDRI_SOURCE_IDENTITY")
    if sha256_file(H8_PATH) != EXPECTED_H8:
        blockers.append("H8_IDENTITY")
    if WATER_LOCK != {"ior": 1.33, "transmission": 0.80, "metallic": 0.0, "specular": 0.50, "prismM": 0.18, "volumeDensity": 0.18}:
        blockers.append("WATER_LOCK")
    catalog_contract = evaluate_worker_memory_contract(
        system_ram_bytes=MIN_RAM_GB * 1024 * 1024 * 1024,
        gpu_vram_bytes=MIN_VRAM_GB * 1024 * 1024 * 1024,
        memory_prediction_bytes=14 * 1024 * 1024 * 1024,
        source_manifest=["festuca_a", "carex_a", "fern_a", "beech_a", "ecokit_rocks", "hdri_jpg"],
        hdri_identity=f"Image0001.jpg:15000x7500:{EXPECTED_SOURCE}",
        hdri_derivative_identity=f"H8:8192x4096:{EXPECTED_H8}",
        blender_version="4.2.2",
        cycles_device="GPU",
        render_profile="PROOF_A_STILL",
        paid_create_allowed=False,
    )
    if not catalog_contract["ok"]:
        blockers.append("MEMORY_CONTRACT_CATALOG")
    # Local 16 GiB Cursor VM is expected to fail; it is not the worker.
    local_mem = int(Path("/proc/meminfo").read_text().split(":", 1)[1].split()[0]) * 1024
    local_contract = evaluate_worker_memory_contract(
        system_ram_bytes=local_mem,
        gpu_vram_bytes=0,
        source_manifest=["festuca_a", "carex_a", "fern_a", "beech_a", "ecokit_rocks", "hdri_jpg"],
        hdri_identity=f"Image0001.jpg:15000x7500:{EXPECTED_SOURCE}",
        render_profile="PROOF_A_STILL",
        paid_create_allowed=False,
    )
    authorization = {
        "id": AUTH,
        "maxSpendUsd": MAX_SPEND,
        "paidCreateAllowance": 1,
        "target": "V7_PROOF_A_WATER_TEST_C_540x960_32",
        "motion": False,
        "finalVideo": False,
        "retry": False,
    }
    row = {
        "schema": "TIVVLEJOY_V7_PROOF_A_PAID_PREFLIGHT_V1",
        "ok": not blockers,
        "blockers": blockers,
        "authorization": authorization,
        "branch": branch,
        "sha": sha,
        "requiredSha": REQUIRED_SHA,
        "requiredShaIsAncestor": ancestor,
        "pr": {"number": 169, "keep": ["OPEN", "DRAFT", "UNMERGED", "NOT_READY"]},
        "livePods": [{"id": p.get("id"), "name": p.get("name"), "desiredStatus": p.get("desiredStatus")} for p in live],
        "quote32": quote32,
        "quote24": quote24,
        "gpuSubstitution": False,
        "costEstimateUsd": estimate,
        "costWorstUsd": worst,
        "hardSpendUsd": MAX_SPEND,
        "pin": {"digest": pin["digest"], "blenderVersion": pin["blenderVersion"]},
        "catalogMemoryContract": catalog_contract,
        "localCursorMemoryContract": local_contract,
        "waterLock": WATER_LOCK,
        "h8Identity": EXPECTED_H8,
        "sourceIdentity": EXPECTED_SOURCE,
        "outputContract": {
            "png": "A_CREEK_BANK_WATER_TEST_C.png",
            "phone": "A_CREEK_BANK_WATER_TEST_C_PHONE.png",
            "receipt": "RENDER_RECEIPT.json",
            "resolution": "540x960",
            "samples": 32,
            "engine": "CYCLES",
            "device": "GPU",
        },
        "files": [{"role": f["role"], "bytes": f["local"].stat().st_size, "sha256": f["sha256"]} for f in files],
        "at": utc_now(),
    }
    write_json(OUT / "PREFLIGHT.json", row)
    return row


def upload_sources(files: list[dict]) -> dict:
    client = r2_client()
    uploaded = []
    for item in files:
        key = f"{PREFIX}/inputs/{item['r2_name']}"
        log("upload_start", role=item["role"], bytes=item["local"].stat().st_size)
        r2_upload_file(client, key, item["local"], "application/octet-stream")
        uploaded.append({"role": item["role"], "dest": item["dest"], "sha256": item["sha256"], "bytes": item["local"].stat().st_size, "name": item["r2_name"]})
    manifest = {
        "schema": "TIVVLEJOY_V7_PROOF_A_SOURCE_MANIFEST_V1",
        "files": [
            {
                "role": item["role"],
                "dest": item["dest"],
                "key": f"{PREFIX}/inputs/{item['r2_name']}",
                "sha256": item["sha256"],
                "bytes": item["local"].stat().st_size,
            }
            for item in files
        ],
    }
    r2_put(client, f"{PREFIX}/source-manifest.json", json.dumps(manifest, indent=2).encode() + b"\n", "application/json")
    write_json(OUT / "SOURCE_MANIFEST_LOCAL.json", {"fileCount": len(files), "roles": [f["role"] for f in files]})
    return manifest


def consume_ledger() -> None:
    client = r2_client()
    local = OUT / "consumption-ledger.json"
    if local.exists():
        raise RuntimeError("LOCAL_LEDGER_ALREADY_EXISTS")
    payload = {
        "schema": "TIVVLEJOY_V7_PROOF_A_CONSUMPTION_LEDGER_V1",
        "authorization": AUTH,
        "paidCreateAllowance": 1,
        "createPerformed": 0,
        "consumedAt": utc_now(),
        "podName": POD_NAME,
    }
    local.write_text(json.dumps(payload, indent=2) + "\n")
    r2_put(client, f"{PREFIX}/consumption-ledger.json", local.read_bytes(), "application/json", if_none_match=True)


def create_pod(image_ref: str, rate: float) -> str:
    docker_args = (
        "sh -c 'cd /opt/ddp-worker && node -e "
        "\"(async()=>{const r2=require(\\\"./src/r2-client\\\");const {spawnSync}=require(\\\"child_process\\\");"
        "const ctx=r2.createR2Client(process.env);"
        "await r2.downloadToFile(ctx, process.env.V7_ENTRY_KEY, \\\"/tmp/v7-proof-a-entry.js\\\");"
        "const r=spawnSync(\\\"node\\\",[\\\"/tmp/v7-proof-a-entry.js\\\"],{stdio:\\\"inherit\\\"});"
        "process.exit(r.status||0)})().catch(e=>{console.error(String(e&&e.message||e));process.exit(1)})\"'"
    )
    env = {
        "R2_ENDPOINT": os.environ["R2_ENDPOINT"],
        "R2_REGION": os.environ.get("R2_REGION") or "auto",
        "R2_BUCKET": os.environ["R2_BUCKET"],
        "R2_ACCESS_KEY_ID": os.environ["R2_ACCESS_KEY_ID"],
        "R2_SECRET_ACCESS_KEY": os.environ["R2_SECRET_ACCESS_KEY"],
        "OBJECT_STORAGE_PROVIDER": "r2",
        "CLOUD_RENDER_ENABLED": "true",
        "PAID_EXECUTION_AUTHORIZED": "true",
        "V7_PROOF_A_PREFIX": PREFIX,
        "V7_ENTRY_KEY": f"{PREFIX}/inputs/entry.js",
        "R2_CONNECT_TIMEOUT_MS": "10000",
        "R2_REQUEST_TIMEOUT_MS": "300000",
        "R2_MAX_ATTEMPTS": "3",
        "RUNPOD_GPU_HOURLY_RATE": str(rate),
    }
    if any(k in env for k in ("RUNPOD_API_KEY", "ALLOW_PAID_GPU_LAUNCH")):
        raise RuntimeError("POD_SECRET_POLICY_VIOLATION")
    if any(not v for v in env.values()):
        raise RuntimeError("POD_ENV_INCOMPLETE")
    data = runpod_gql(
        """
        mutation ($input: PodFindAndDeployOnDemandInput!) {
          podFindAndDeployOnDemand(input: $input) { id }
        }
        """,
        {
            "input": {
                "name": POD_NAME,
                "imageName": image_ref,
                "gpuTypeId": GPU_TYPE,
                "gpuCount": 1,
                "cloudType": "SECURE",
                "minMemoryInGb": MIN_RAM_GB,
                "containerDiskInGb": 40,
                "volumeInGb": 0,
                "dockerArgs": docker_args,
                "env": [{"key": k, "value": v} for k, v in env.items()],
            }
        },
    )
    pod_id = ((data.get("podFindAndDeployOnDemand") or {}).get("id")) or ""
    if not pod_id:
        raise RuntimeError("CREATE_RETURNED_NO_ID")
    return pod_id


def recover_named_pod() -> dict | None:
    deadline = time.time() + 180
    while time.time() < deadline:
        exact = [p for p in active_pods(list_pods()) if p.get("name") == POD_NAME]
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
        live = active_pods(list_pods())
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


def download_outputs() -> dict:
    client = r2_client()
    local = {}
    for name in (
        "status.json",
        "RENDER_RECEIPT.json",
        "A_CREEK_BANK_WATER_TEST_C.png",
        "A_CREEK_BANK_WATER_TEST_C_PHONE.png",
        "CONTEXTUAL_RECOVERY_V7.json",
        "worker-memory-contract.json",
        "BLENDER_STDOUT.txt",
        "BLENDER_STDERR.txt",
    ):
        dest = OUT / name
        try:
            r2_download(client, f"{PREFIX}/{name}", dest)
            local[name] = dest.stat().st_size
        except Exception:
            local[name] = 0
    return local


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preflight-only", action="store_true")
    parser.add_argument("--create-authorized-once", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    pf = preflight()
    log("preflight", ok=pf["ok"], blockers=pf["blockers"], rate=pf["quote32"].get("secureUsdPerHr"))
    if args.preflight_only:
        if pf["ok"]:
            upload_sources(source_files())
            log("sources_uploaded")
        return 0 if pf["ok"] else 2
    if not args.create_authorized_once:
        raise RuntimeError("CREATE_NOT_ARMED")
    if not pf["ok"]:
        write_json(OUT / "RESULT.json", {"status": "V7_PROOF_A_PAID_EXECUTION_FAILED", "reason": "PREFLIGHT", "blockers": pf["blockers"]})
        return 2

    files = source_files()
    upload_sources(files)
    consume_ledger()
    pin = pin_ref()
    rate = float(pf["quote32"]["secureUsdPerHr"])
    started = time.time()
    pod_id = None
    create_performed = 0
    try:
        try:
            log("create_entered", gpu=GPU_TYPE, minMemoryInGb=MIN_RAM_GB)
            pod_id = create_pod(pin["ref"], rate)
            create_performed = 1
        except Exception as exc:
            log("create_response_failed_or_ambiguous", error=type(exc).__name__)
            recovered = recover_named_pod()
            if recovered:
                pod_id = recovered["id"]
                create_performed = 1
            else:
                raise
        log("pod_confirmed", podId=pod_id)
        write_json(
            OUT / "LAUNCH.json",
            {
                "schema": "TIVVLEJOY_V7_PROOF_A_LAUNCH_V1",
                "podId": pod_id,
                "podName": POD_NAME,
                "gpuTypeId": GPU_TYPE,
                "minMemoryInGb": MIN_RAM_GB,
                "quotedUsdPerHr": rate,
                "createPerformed": create_performed,
                "startedAt": utc_now(),
            },
        )
        observed_rate = rate
        hard_deadline = started + min(32 * 60, (MAX_SPEND / max(observed_rate, 0.01)) * 3600 * 0.95)
        startup_deadline = started + 12 * 60
        status = None
        client = r2_client()
        while time.time() < hard_deadline:
            status = r2_get_json(client, f"{PREFIX}/status.json")
            if status and status.get("status") in {"COMPLETE", "FAILED"}:
                break
            pods = list_pods()
            exact = next((p for p in pods if p.get("id") == pod_id), None)
            if exact and exact.get("costPerHr"):
                observed_rate = float(exact["costPerHr"])
                hard_deadline = min(hard_deadline, started + (MAX_SPEND / observed_rate) * 3600 * 0.95)
            if not status and time.time() > startup_deadline:
                raise RuntimeError("STARTUP_WATCHDOG_TIMEOUT")
            if exact and str(exact.get("desiredStatus") or "").upper() in {"TERMINATED", "EXITED", "STOPPED"} and not status:
                raise RuntimeError("POD_EXITED_WITHOUT_STATUS")
            time.sleep(15)
        if not status:
            raise RuntimeError("HARD_RUNTIME_OR_COST_DEADLINE")
        outputs = download_outputs()
        write_json(OUT / "DOWNLOAD.json", outputs)
    finally:
        cleanup = terminate_pod(pod_id)
        write_json(OUT / "CLEANUP.json", cleanup)
        runtime_s = max(0.0, time.time() - started)
        # Use observed pod rate if recorded.
        try:
            observed_rate = float((json.loads((OUT / "LAUNCH.json").read_text()).get("quotedUsdPerHr") or rate))
        except Exception:
            observed_rate = rate
        spend = round((runtime_s / 3600.0) * observed_rate, 4)
        write_json(
            OUT / "SPEND.json",
            {
                "runtimeSeconds": round(runtime_s, 1),
                "rateUsdPerHr": observed_rate,
                "actualUsd": spend,
                "createPerformed": create_performed,
                "podId": pod_id,
                "liveAfterCleanup": cleanup.get("live"),
            },
        )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        write_json(
            OUT / "RESULT.json",
            {
                "status": "V7_PROOF_A_PAID_EXECUTION_FAILED",
                "error": f"{type(exc).__name__}:{str(exc)[:400]}",
                "at": utc_now(),
            },
        )
        log("launch_failed", error=type(exc).__name__)
        raise
