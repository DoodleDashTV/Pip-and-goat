#!/usr/bin/env python3
"""Exactly-one-CREATE paid executor for the V7 final-scene visual proof.

Fails closed before CREATE when identity, resources, budget, lifecycle, or
the staged output contract differ from the locked preflight. Never retries
CREATE. Never starts the 900-frame FINAL encode.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from preflight import AUTH_NAME, HARD_RUNTIME_MINUTES, HARD_SPEND_USD, USD_PER_HOUR, PREVIOUS_AUTH_NAME  # noqa: E402

PIN = REPO / "config/cloud/scenery-showcase-final-image.json"
INSPECT = REPO / "artifacts/tivvlejoy-scenery-showcase-30s/v7-final-image-build-v1/IMAGE_INSPECT.json"
STAGED = REPO / "artifacts/tivvlejoy-scenery-showcase-30s/v7-final-scene-visual-proof-v3/STAGED.json"
OUT = REPO / "artifacts/tivvlejoy-scenery-showcase-30s/v7-final-scene-visual-proof-v3"
AUTH_FILE = OUT / "AUTHORIZATION.json"
V2_LEDGER = REPO / "artifacts/tivvlejoy-scenery-showcase-30s/v7-final-scene-visual-proof-v2/consumption-ledger.json"

FAILED_DIGEST = "sha256:b176ca65f36290ead95b7e24717751a89cb6e1bb49ea0351d4934f1c3b065bf6"
FAILED_VRAM_DIGEST = "sha256:1807fac1b13db900251c57ad4d5de7b0dab24cee660b31aa94cd9d0c0183498b"
FAILED_EXTRACT_DIGEST = "sha256:fc8a9aaa0f921fb200db959acdc301ea400bd5e2cb421be510c909d6c7cf49ca"
REQUIRED_DIGEST = "sha256:b66c0a8e6bc83ef7aeb15dcf2801ec004575fc1bcee7c727cf1956e591635749"
REQUIRED_BRANCH = "cursor/tivvlejoy-scenery-showcase-30s-v1-73f1"
REQUIRED_IMAGE_COMMIT = "b8ec9a4195d3f56caf6398ea642ec04596819c71"
REQUIRED_LAUNCHER_SHA = "b8ec9a4195d3f56caf6398ea642ec04596819c71"
REQUIRED_CONTENT_ANCESTOR = "d5654510599f5b42919a949c5c4503c5ec1442f1"
GPU_TYPE = "NVIDIA GeForce RTX 4090"
POD_NAME = "tj-v7-fsvp-3"
JOB_ID = "v7-final-visual-proof-v3"
CMD = ["node", "./src/scenery-showcase-original14-entry.js"]
CAMERA_C = (2.2, -21.4, 3.40)
CAMERA_C_LOOK = (-3.4, -10.2, 1.75)
CAMERA_C_LENS = 32.0
V3_COMP_A = (2.05, -21.6, 3.05)
MIN_RAM_GB = 24
MIN_VRAM_GB = 24
MIN_DISK_GB = 60
CONTAINER_DISK_GB = 100
MAX_PRICE = 0.74


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def log(event: str, **payload) -> None:
    safe = {k: v for k, v in payload.items() if "key" not in k.lower() and "secret" not in k.lower()}
    print(json.dumps({"ts": utc_now(), "event": event, **safe}), flush=True)


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=REPO, text=True).strip()


def git_ok(*args: str) -> bool:
    return subprocess.call(["git", *args], cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0


def image_repo() -> str:
    owner = (os.environ.get("GHCR_USER") or os.environ.get("GITHUB_REPOSITORY_OWNER") or "").strip().lower()
    if not owner:
        raise RuntimeError("GHCR_OWNER_MISSING")
    return f"ghcr.io/{owner}/ddp-runpod-blender"


def r2_client():
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name=os.environ.get("R2_REGION") or "auto",
        config=Config(retries={"max_attempts": 4, "mode": "standard"}),
    )


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


def active_pods(pods: list[dict]) -> list[dict]:
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


def public_or_token_pull(repo: str, digest: str) -> dict:
    accept = ",".join(
        [
            "application/vnd.oci.image.index.v1+json",
            "application/vnd.docker.distribution.manifest.list.v2+json",
            "application/vnd.oci.image.manifest.v1+json",
            "application/vnd.docker.distribution.manifest.v2+json",
        ]
    )
    repo_path = repo.split("ghcr.io/", 1)[-1]
    token = None
    try:
        req = urllib.request.Request(f"https://ghcr.io/token?scope=repository:{repo_path}:pull&service=ghcr.io")
        with urllib.request.urlopen(req, timeout=30) as resp:
            token = json.loads(resp.read().decode()).get("token")
        man_req = urllib.request.Request(
            f"https://ghcr.io/v2/{repo_path}/manifests/{digest}",
            headers={"Authorization": "Bearer " + token, "Accept": accept},
        )
        with urllib.request.urlopen(man_req, timeout=30) as resp:
            status = resp.status
            body = json.loads(resp.read().decode())
        layers = body.get("layers") or []
        if status == 200 and layers:
            return {
                "ok": True,
                "anonymous": True,
                "anonymousManifestStatus": status,
                "layerCount": len(layers),
                "compressedBytes": sum(int(layer.get("size") or 0) for layer in layers),
            }
    except Exception as exc:
        anon_error = type(exc).__name__
    else:
        anon_error = f"HTTP_{status}"
    ghcr_token = os.environ.get("GHCR_TOKEN") or ""
    if not ghcr_token:
        return {"ok": False, "anonymous": False, "error": anon_error, "authenticated": False}
    try:
        user = (os.environ.get("GHCR_USERNAME") or os.environ.get("GHCR_USER") or "user").strip()
        req = urllib.request.Request(f"https://ghcr.io/token?scope=repository:{repo_path}:pull&service=ghcr.io")
        req.add_header("Authorization", "Basic " + __import__("base64").b64encode(f"{user}:{ghcr_token}".encode()).decode())
        with urllib.request.urlopen(req, timeout=30) as resp:
            token = json.loads(resp.read().decode()).get("token")
        man_req = urllib.request.Request(
            f"https://ghcr.io/v2/{repo_path}/manifests/{digest}",
            headers={"Authorization": "Bearer " + token, "Accept": accept},
        )
        with urllib.request.urlopen(man_req, timeout=30) as resp:
            status = resp.status
            body = json.loads(resp.read().decode())
        layers = body.get("layers") or []
        return {
            "ok": status == 200 and bool(layers),
            "anonymous": False,
            "authenticated": True,
            "authenticatedManifestStatus": status,
            "layerCount": len(layers),
            "compressedBytes": sum(int(layer.get("size") or 0) for layer in layers),
            "needsRegistryAuth": True,
        }
    except Exception as exc:
        return {"ok": False, "anonymous": False, "authenticated": True, "error": type(exc).__name__}


def output_contract() -> dict:
    """Current source must keep Camera C and six shot cameras. Failed digest stays ineligible."""
    valley = (REPO / "scripts/blender/scenery/cinematic_valley_world_v1.py").read_text()
    hero = (REPO / "scripts/blender/scenery/cinematic_hero_rebuild_v3.py").read_text()
    shots = (REPO / "scripts/blender/scenery/cinematic_shots.py").read_text()
    proof = (REPO / "workers/runpod-blender/src/visual-proof-contract-v1.js").read_text()
    hijack = (
        "bpy.context.scene.camera = v3_cam" in valley
        or 'v3_cam = bpy.data.objects.get(v3_spec["name"])' in valley
        or ("setup_comp_cameras()" in hero and "install_compare_cameras" not in hero)
    )
    camera_c_locked = "2.2, -21.4, 3.40" in shots and "-3.4, -10.2, 1.75" in shots
    production_uses_resolver = "resolve_production_camera" in valley
    ineligible = json.loads(PIN.read_text()).get("ineligibleDigests") or []
    failed_ineligible = FAILED_DIGEST in ineligible
    vram_failed_ineligible = FAILED_VRAM_DIGEST in ineligible
    extract_failed_ineligible = FAILED_EXTRACT_DIGEST in ineligible
    blockers = []
    if hijack:
        blockers.extend(["CAMERA_C_REPLACED_BY_V3_COMP_A", "SIX_SHOT_CAMERAS_NOT_USED"])
    if not camera_c_locked:
        blockers.append("CAMERA_C_LOCK_MISSING")
    if not production_uses_resolver:
        blockers.append("PRODUCTION_CAMERA_RESOLVER_MISSING")
    if not failed_ineligible:
        blockers.append("FAILED_DIGEST_NOT_MARKED_INELIGIBLE")
    if not vram_failed_ineligible:
        blockers.append("VRAM_GATE_DIGEST_NOT_MARKED_INELIGIBLE")
    if not extract_failed_ineligible:
        blockers.append("EXTRACT_FAILED_DIGEST_NOT_MARKED_INELIGIBLE")
    if "--v3-camera" not in proof or "V3_CAMERA_FORBIDDEN" not in proof:
        blockers.append("VISUAL_PROOF_ALLOWS_V3_CAMERA")
    return {
        "schema": "TIVVLEJOY_V7_VISUAL_PROOF_OUTPUT_CONTRACT_V1",
        "stagedCameraC": list(CAMERA_C),
        "stagedLook": list(CAMERA_C_LOOK),
        "stagedLens": CAMERA_C_LENS,
        "failedDigest": FAILED_DIGEST,
        "failedDigestIneligible": failed_ineligible,
        "failedVramDigest": FAILED_VRAM_DIGEST,
        "failedVramDigestIneligible": vram_failed_ineligible,
        "failedExtractDigest": FAILED_EXTRACT_DIGEST,
        "failedExtractDigestIneligible": extract_failed_ineligible,
        "heroRebuildForcesV3CompCameras": hijack,
        "v3CompA": list(V3_COMP_A),
        "cameraCPresentInShotLock": camera_c_locked,
        "sixShotCamerasUsed": production_uses_resolver and not hijack,
        "waterVariant": "D",
        "encode900": False,
        "ok": not blockers,
        "blockers": blockers,
    }


def identity() -> dict:
    subprocess.check_call(
        ["git", "fetch", "origin", REQUIRED_BRANCH],
        cwd=REPO,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    branch = git("branch", "--show-current")
    local = git("rev-parse", "HEAD")
    remote = git("rev-parse", f"origin/{REQUIRED_BRANCH}")
    return {
        "schema": "TIVVLEJOY_V7_VISUAL_PROOF_IDENTITY_V1",
        "authorization": AUTH_NAME,
        "branch": branch,
        "localSha": local,
        "remoteTip": remote,
        "requiredImageCommit": REQUIRED_IMAGE_COMMIT,
        "requiredImageCommitIsAncestor": git_ok("merge-base", "--is-ancestor", REQUIRED_IMAGE_COMMIT, remote),
        "requiredLauncherSha": REQUIRED_LAUNCHER_SHA,
        "requiredLauncherShaIsAncestor": git_ok("merge-base", "--is-ancestor", REQUIRED_LAUNCHER_SHA, remote),
        "requiredContentAncestor": REQUIRED_CONTENT_ANCESTOR,
        "requiredContentAncestorIsAncestor": git_ok("merge-base", "--is-ancestor", REQUIRED_CONTENT_ANCESTOR, remote),
        "at": utc_now(),
    }


def pin_identity() -> dict:
    pin = json.loads(PIN.read_text())
    inspect = json.loads(INSPECT.read_text()) if INSPECT.is_file() else {}
    staged = json.loads(STAGED.read_text()) if STAGED.is_file() else {}
    digest = str(pin.get("digest") or "")
    cmd = pin.get("cmd") or []
    return {
        "digest": digest,
        "requiredDigest": REQUIRED_DIGEST,
        "digestMatch": digest == REQUIRED_DIGEST and inspect.get("digest") == REQUIRED_DIGEST,
        "status": pin.get("status"),
        "cmd": cmd,
        "cmdMatch": cmd == CMD,
        "entrypoint": pin.get("workerEntrypoint"),
        "forbiddenCmds": pin.get("forbiddenCmds") or [],
        "blenderVersion": pin.get("blenderVersion"),
        "waterVariant": pin.get("waterVariant"),
        "visualProofJobKind": pin.get("visualProofJobKind"),
        "stagedCameraC": ((staged.get("visualProof") or {}).get("cameraC")),
        "stagedDigest": ((staged.get("image") or {}).get("digest")),
        "inspectCmd": inspect.get("Cmd"),
        "inspectWorkingDir": inspect.get("WorkingDir"),
        "inspectLauncher": inspect.get("launcher"),
    }


def expected_usd() -> float:
    return round((HARD_RUNTIME_MINUTES / 60.0) * USD_PER_HOUR, 4)


def fail_closed_checks() -> dict:
    blockers: list[str] = []
    ident = identity()
    pin = pin_identity()
    contract = output_contract()
    if ident["branch"] != REQUIRED_BRANCH:
        blockers.append("BRANCH_MISMATCH")
    if AUTH_NAME != "TIVVLEJOY_V7_FINAL_SCENE_VISUAL_PROOF_AUTHORIZATION_V3":
        blockers.append("V2_AUTHORIZATION_REUSED")
    if AUTH_NAME == PREVIOUS_AUTH_NAME:
        blockers.append("V2_AUTHORIZATION_REUSED")
    if not ident["requiredImageCommitIsAncestor"]:
        blockers.append("IMAGE_COMMIT_NOT_ANCESTOR")
    if not ident.get("requiredLauncherShaIsAncestor"):
        blockers.append("LAUNCHER_SHA_NOT_ANCESTOR")
    if not ident["requiredContentAncestorIsAncestor"]:
        blockers.append("REQUIRED_ANCESTOR_MISSING")
    if pin["digest"] == FAILED_DIGEST or REQUIRED_DIGEST == FAILED_DIGEST:
        blockers.append("FAILED_DIGEST_INELIGIBLE")
    if pin["digest"] == FAILED_VRAM_DIGEST or REQUIRED_DIGEST == FAILED_VRAM_DIGEST:
        blockers.append("VRAM_GATE_DIGEST_INELIGIBLE")
    if pin["digest"] == FAILED_EXTRACT_DIGEST or REQUIRED_DIGEST == FAILED_EXTRACT_DIGEST:
        blockers.append("EXTRACT_FAILED_DIGEST_INELIGIBLE")
    if not REQUIRED_DIGEST or not REQUIRED_DIGEST.startswith("sha256:") or len(REQUIRED_DIGEST) != 71:
        blockers.append("EXTRACT_REPAIR_DIGEST_NOT_PINNED")
    auth = json.loads(AUTH_FILE.read_text()) if AUTH_FILE.is_file() else {}
    if auth.get("name") != AUTH_NAME or auth.get("digest") != REQUIRED_DIGEST or auth.get("requiredLauncherSha") != REQUIRED_LAUNCHER_SHA:
        blockers.append("V3_AUTHORIZATION_NOT_BOUND")
    if auth.get("consumed"):
        blockers.append("V3_AUTHORIZATION_ALREADY_CONSUMED")
    v2 = json.loads(V2_LEDGER.read_text()) if V2_LEDGER.is_file() else {}
    if v2.get("authorization") != PREVIOUS_AUTH_NAME or int(v2.get("createPerformed") or 0) != 1:
        blockers.append("V2_CONSUMPTION_NOT_PROVEN")
    if JOB_ID.endswith("v2") or POD_NAME.endswith("-2"):
        blockers.append("V2_JOB_REUSED")
    if not pin["digest"] or not pin["digestMatch"]:
        blockers.append("DIGEST_NOT_PINNED")
    inspect = json.loads(INSPECT.read_text()) if INSPECT.is_file() else {}
    blender = inspect.get("blenderCameraContract") or {}
    if (blender.get("frame210") != "TJ_SHOT_02_CAM"
            and (blender.get("frame210") or {}).get("camera") != "TJ_SHOT_02_CAM"):
        blockers.append("FRAME_210_NOT_SHOT_02_CAM")
    if blender.get("v3CompAUsed") is True:
        blockers.append("V3_COMP_A_SELECTED")
    if blender.get("cameras") != [
        "TJ_SHOT_01_CAM",
        "TJ_SHOT_02_CAM",
        "TJ_SHOT_03_CAM",
        "TJ_SHOT_04_CAM",
        "TJ_SHOT_05_CAM",
        "TJ_SHOT_06_CAM",
    ]:
        blockers.append("SIX_SHOT_MAPPING_MISSING")
    if not pin["cmdMatch"] or pin.get("inspectCmd") != CMD:
        blockers.append("CMD_NOT_ORIGINAL14_ENTRY")
    if pin.get("blenderVersion") != "4.2.2":
        blockers.append("BLENDER_VERSION_MISMATCH")
    if pin.get("waterVariant") != "D":
        blockers.append("WATER_VARIANT_NOT_D")
    if pin.get("visualProofJobKind") != "VISUAL_PROOF":
        blockers.append("JOB_KIND_NOT_VISUAL_PROOF")
    if pin.get("stagedDigest") != REQUIRED_DIGEST:
        blockers.append("STAGED_DIGEST_MISMATCH")
    if pin.get("stagedCameraC") != [2.2, -21.4, 3.4] and pin.get("stagedCameraC") != list(CAMERA_C):
        blockers.append("STAGED_CAMERA_C_MISMATCH")
    if not contract["ok"]:
        blockers.extend(contract["blockers"])
    if expected_usd() > HARD_SPEND_USD:
        blockers.append("SPEND_CEILING_INCONSISTENT")
    if HARD_RUNTIME_MINUTES != 40 or HARD_SPEND_USD != 0.50:
        blockers.append("BUDGET_CONTRACT_CHANGED")
    try:
        pr = json.loads(subprocess.check_output(["gh", "pr", "view", "169", "--json", "isDraft,state,mergedAt"], cwd=REPO, text=True))
        pr_state = {"isDraft": pr.get("isDraft"), "state": pr.get("state"), "mergedAt": pr.get("mergedAt")}
        if not pr.get("isDraft") or pr.get("state") != "OPEN" or pr.get("mergedAt"):
            blockers.append("PR_NOT_DRAFT_OPEN")
    except Exception:
        pr_state = {"error": "PR_STATE_UNVERIFIED"}
        blockers.append("PR_STATE_UNVERIFIED")
    required_env = ("RUNPOD_API_KEY", "R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "GHCR_USER")
    missing_env = [name for name in required_env if not os.environ.get(name)]
    if missing_env:
        blockers.append("REQUIRED_ENV_MISSING")
    live = []
    quote = {}
    pull = {}
    try:
        live = active_pods(list_pods())
        if live:
            blockers.append("LIVE_PODS_NOT_EMPTY")
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
        if REQUIRED_DIGEST.startswith("sha256:") and len(REQUIRED_DIGEST) == 71:
            repo = image_repo()
            pull = public_or_token_pull(repo, REQUIRED_DIGEST)
            if not pull.get("ok"):
                blockers.append("IMAGE_DIGEST_NOT_PULLABLE")
            if pull.get("ok") and pull.get("needsRegistryAuth") and not os.environ.get("RUNPOD_CONTAINER_REGISTRY_AUTH_ID"):
                blockers.append("REGISTRY_AUTH_ID_REQUIRED_FOR_PRIVATE_PULL")
        else:
            pull = {"ok": False, "skipped": True, "reason": "DIGEST_NOT_PINNED"}
    except Exception as exc:
        blockers.append("RUNPOD_OR_REGISTRY_PROBE_FAILED")
        quote = {"error": type(exc).__name__}
    unique = []
    for item in blockers:
        if item not in unique:
            unique.append(item)
    payload = {
        "schema": "TIVVLEJOY_V7_FINAL_SCENE_VISUAL_PROOF_FAIL_CLOSED_V1",
        "authorization": AUTH_NAME,
        "ok": not unique,
        "blockers": unique,
        "identity": ident,
        "pin": {k: pin[k] for k in pin if k != "inspectLauncher" or True},
        "outputContract": contract,
        "quote": quote,
        "pull": {k: pull[k] for k in pull if k != "error" or not pull.get("ok")},
        "livePodCount": len(live),
        "livePodNames": [p.get("name") for p in live],
        "pr169": pr_state,
        "missingEnvNames": missing_env,
        "budget": {
            "hardSpendUsd": HARD_SPEND_USD,
            "hardRuntimeMinutes": HARD_RUNTIME_MINUTES,
            "expectedUsdAtCeiling": expected_usd(),
            "usdPerHour": USD_PER_HOUR,
        },
        "resources": {
            "gpu": GPU_TYPE,
            "hostRamGiB": MIN_RAM_GB,
            "vramGiB": MIN_VRAM_GB,
            "diskGiB": MIN_DISK_GB,
            "containerDiskGiB": CONTAINER_DISK_GB,
        },
        "createCount": 1,
        "retry": False,
        "encode900": False,
        "runpodMutation": False,
        "paidCreate": 0,
        "at": utc_now(),
    }
    write_json(OUT / "FAIL_CLOSED.json", payload)
    write_json(OUT / "IDENTITY.json", ident)
    write_json(OUT / "OUTPUT_CONTRACT.json", contract)
    return payload


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


def create_pod(image_ref: str, rate: float) -> str:
    env = {
        "R2_ENDPOINT": os.environ["R2_ENDPOINT"],
        "R2_REGION": os.environ.get("R2_REGION") or "auto",
        "R2_BUCKET": os.environ["R2_BUCKET"],
        "R2_ACCESS_KEY_ID": os.environ["R2_ACCESS_KEY_ID"],
        "R2_SECRET_ACCESS_KEY": os.environ["R2_SECRET_ACCESS_KEY"],
        "OBJECT_STORAGE_PROVIDER": "r2",
        "CLOUD_RENDER_ENABLED": "true",
        "PAID_EXECUTION_AUTHORIZED": "true",
        "SCENERY_SHOWCASE_EXECUTION_MODE": "live",
        "TIVVLEJOY_JOB_KIND": "VISUAL_PROOF",
        "TIVVLEJOY_SCENERY_ASSET_PREFIX": "tivvlejoy-assets",
        "RENDER_JOB_ID": JOB_ID,
        "RENDER_WORKER_ID": f"tivvlejoy-{JOB_ID}",
        "VISUAL_APPROVAL_RECEIPT_RESULT": "BLOCKED_PENDING_PAID_PIXEL_PROOF",
        "TIVVLEJOY_WATER_VARIANT": "D",
        "TIVVLEJOY_CAMERA_VARIANT": "C",
        "WATER_VARIANT": "D",
        "CAMERA_VARIANT": "C",
        "V7_PAID_CREATE_COUNT": "1",
        "V7_AUTOMATIC_RETRY_CREATE": "false",
        "TIVVLEJOY_VISUAL_PROOF_HARD_CEILING_USD": "0.50",
        "TIVVLEJOY_VISUAL_PROOF_HARD_CEILING_MIN": "40",
        "TIVVLEJOY_VISUAL_PROOF_NO_RETRY": "true",
        "TIVVLEJOY_VISUAL_PROOF_NO_REPLACEMENT_POD": "true",
        "TIVVLEJOY_VISUAL_PROOF_AUTO_TERMINATE": "true",
        "R2_CONNECT_TIMEOUT_MS": "10000",
        "R2_REQUEST_TIMEOUT_MS": "300000",
        "R2_MAX_ATTEMPTS": "3",
        "RUNPOD_GPU_HOURLY_RATE": str(rate),
        "SCENERY_SHOWCASE_MAX_INPUT_BYTES": str(5 * 1024 * 1024 * 1024),
        "V7_IMAGE_DIGEST": REQUIRED_DIGEST,
    }
    if any(k in env for k in ("RUNPOD_API_KEY", "ALLOW_PAID_GPU_LAUNCH")):
        raise RuntimeError("POD_SECRET_POLICY_VIOLATION")
    if any(not str(v) for v in env.values()):
        raise RuntimeError("POD_ENV_INCOMPLETE")
    payload = {
        "name": POD_NAME,
        "imageName": image_ref,
        "gpuTypeId": GPU_TYPE,
        "gpuCount": 1,
        "cloudType": "SECURE",
        "minMemoryInGb": MIN_RAM_GB,
        "containerDiskInGb": CONTAINER_DISK_GB,
        "volumeInGb": 0,
        "env": [{"key": k, "value": v} for k, v in env.items()],
    }
    if os.environ.get("RUNPOD_CONTAINER_REGISTRY_AUTH_ID"):
        payload["containerRegistryAuthId"] = os.environ["RUNPOD_CONTAINER_REGISTRY_AUTH_ID"]
    data = runpod_gql(
        """
        mutation ($input: PodFindAndDeployOnDemandInput!) {
          podFindAndDeployOnDemand(input: $input) { id }
        }
        """,
        {"input": payload},
    )
    pod_id = ((data.get("podFindAndDeployOnDemand") or {}).get("id")) or ""
    if not pod_id:
        raise RuntimeError("CREATE_RETURNED_NO_ID")
    return pod_id


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def download_outputs() -> dict:
    client = r2_client()
    local: dict = {"files": {}}
    status = r2_get_json(client, f"jobs/{JOB_ID}/status.json")
    startup = r2_get_json(client, f"jobs/{JOB_ID}/startup-status.json")
    write_json(OUT / "status.json", status or {})
    write_json(OUT / "startup-status.json", startup or {})
    local["status"] = status
    local["startup"] = startup
    uploaded = (status or {}).get("uploaded") or []
    for row in uploaded:
        key = row.get("key")
        name = f"{row.get('kind')}-{row.get('shot')}-{row.get('name')}"
        dest = OUT / "images" / name
        try:
            r2_download(client, key, dest)
            digest = sha256_file(dest)
            viewable = OUT / "images" / f"{row.get('kind')}_{row.get('shot')}.png"
            if dest.suffix.lower() == ".png":
                viewable.write_bytes(dest.read_bytes())
            local["files"][name] = {
                "bytes": dest.stat().st_size,
                "sha256": digest,
                "matches": digest == row.get("sha256"),
                "shot": row.get("shot"),
                "kind": row.get("kind"),
                "viewable": str(viewable.name) if dest.suffix.lower() == ".png" else None,
            }
        except Exception as exc:
            local["files"][name] = {"error": type(exc).__name__}
        usage_key = str(key or "").rsplit("/", 1)[0] + "/usage.json"
        usage_dest = OUT / "usage" / f"{row.get('kind')}-{row.get('shot')}-usage.json"
        try:
            if key:
                r2_download(client, usage_key, usage_dest)
                local["files"][usage_dest.name] = {"bytes": usage_dest.stat().st_size}
        except Exception:
            pass
    if (status or {}).get("gpuTelemetry"):
        write_json(OUT / "WORKER_GPU_TELEMETRY.json", status["gpuTelemetry"])
        local["gpuTelemetry"] = status["gpuTelemetry"]
    return local


def mark_auth_consumed(pod_id: str | None) -> None:
    auth = json.loads(AUTH_FILE.read_text()) if AUTH_FILE.is_file() else {}
    auth["consumed"] = True
    auth["consumedAt"] = utc_now()
    auth["podId"] = pod_id
    auth["createPerformed"] = 1
    write_json(AUTH_FILE, auth)


def capture_host_telemetry(pod_id: str | None, pods: list[dict] | None = None) -> dict:
    pods = pods if pods is not None else (list_pods() if pod_id else [])
    exact = next((p for p in pods if p.get("id") == pod_id), None) if pod_id else None
    assigned = ((exact or {}).get("machine") or {}).get("gpuDisplayName") or ""
    logs = ""
    if pod_id:
        try:
            req = urllib.request.Request(
                f"https://rest.runpod.io/v1/pods/{pod_id}",
                headers={
                    "Authorization": "Bearer " + os.environ["RUNPOD_API_KEY"],
                    "User-Agent": "DoodleDashProduction/1.0",
                },
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                body = json.loads(resp.read().decode() or "{}")
            logs = str(body.get("logs") or body.get("containerLog") or "")
        except Exception:
            logs = ""
    telemetry = None
    raw = ""
    for line in logs.splitlines():
        if "gpu_telemetry" in line or "nvidia-smi" in line:
            raw = line
            try:
                telemetry = json.loads(line)
            except Exception:
                telemetry = {"raw": line}
            break
    parsed = telemetry or {}
    total = parsed.get("vramTotalMiB")
    free = parsed.get("vramFreeMiB")
    model = parsed.get("gpuModel") or assigned
    converted = parsed.get("converted") or {}
    if total is None and converted.get("mib") is not None:
        total = converted.get("mib")
    payload = {
        "requestedGpuSku": GPU_TYPE,
        "assignedGpuName": assigned or model or "NOT_CAPTURED",
        "rawNvidiaSmi": parsed.get("raw") or raw or "NOT_CAPTURED",
        "vramTotalMiB": total,
        "vramFreeMiB": free,
        "gib": None if total is None else (float(total) / 1024.0),
        "decimalGb": None if total is None else (float(total) * 1024 * 1024) / 1e9,
        "modelCheck": bool(model) and bool(__import__("re").search(r"rtx\s*4090", str(model), __import__("re").I)),
        "capacityCheck24500": Number_is_finite(total) and int(total) >= 24500,
        "runpodGpuDisplayName": assigned or None,
        "source": "worker_log_or_runpod_machine",
    }
    write_json(OUT / "HOST_TELEMETRY.json", payload)
    return payload


def Number_is_finite(value) -> bool:
    try:
        return value is not None and float(value) == float(value)
    except Exception:
        return False


def write_result(status: str, **extra) -> None:
    payload = {
        "schema": "TIVVLEJOY_V7_FINAL_SCENE_VISUAL_PROOF_AUTHORIZATION_V3_RESULT",
        "status": status,
        "authorization": AUTH_NAME,
        "digest": REQUIRED_DIGEST,
        "paidCreate": extra.get("paidCreate", 0),
        "runpodSpendUsd": extra.get("runpodSpendUsd", 0),
        "runtimeSeconds": extra.get("runtimeSeconds"),
        "pr169": extra.get("pr169") or {"state": "OPEN", "draft": True, "merged": False, "ready": False},
        "encode900": False,
        "merged": False,
        "at": utc_now(),
        **{k: v for k, v in extra.items() if k not in {"paidCreate", "runpodSpendUsd", "runtimeSeconds", "pr169"}},
    }
    write_json(OUT / "RESULT.json", payload)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--create-authorized-once", action="store_true")
    parser.add_argument("--fail-closed-only", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    checks = fail_closed_checks()
    log("fail_closed", ok=checks["ok"], blockers=checks["blockers"], live=checks["livePodCount"])
    if args.fail_closed_only or not args.create_authorized_once:
        write_result(
            "FAILED_CLOSED_BEFORE_CREATE" if not checks["ok"] else "CHECKS_PASSED_CREATE_NOT_ARMED",
            blockers=checks["blockers"],
            paidCreate=0,
            runpodSpendUsd=0,
            outputContract=checks["outputContract"],
            quote=checks.get("quote"),
        )
        return 0 if checks["ok"] and args.fail_closed_only else (2 if not checks["ok"] else 3)
    if not checks["ok"]:
        write_result(
            "FAILED_CLOSED_BEFORE_CREATE",
            reason="OUTPUT_OR_IDENTITY_CONTRACT",
            blockers=checks["blockers"],
            paidCreate=0,
            runpodSpendUsd=0,
            outputContract=checks["outputContract"],
            quote=checks.get("quote"),
            V7_FINAL_SCENE_VISUAL_PROOF_READY_AWAITING_AUTHORIZATION="NO",
            V7_FINAL_VIDEO_RENDER_READY_AWAITING_AUTHORIZATION="NO",
            FINAL_VIDEO_RENDER_NOT_AUTHORIZED=True,
            gates={"E": "NOT_RUN", "F": "NOT_RUN", "J": "NOT_RUN", "pixelSuiteRun": False},
        )
        return 2
    ledger = OUT / "consumption-ledger.json"
    if ledger.exists():
        raise RuntimeError("LEDGER_ALREADY_EXISTS")
    write_json(
        ledger,
        {
            "schema": "TIVVLEJOY_V7_VISUAL_PROOF_LEDGER_V1",
            "authorization": AUTH_NAME,
            "createPerformed": 0,
            "jobId": JOB_ID,
            "digest": REQUIRED_DIGEST,
            "at": utc_now(),
        },
    )
    rate = float(checks["quote"]["secureUsdPerHr"])
    started = time.time()
    pod_id = None
    create_performed = 0
    cleanup = None
    try:
        image_ref = f"{image_repo()}@{REQUIRED_DIGEST}"
        log("create_entered", gpu=GPU_TYPE, digest=REQUIRED_DIGEST)
        try:
            pod_id = create_pod(image_ref, rate)
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
                "schema": "TIVVLEJOY_V7_VISUAL_PROOF_LEDGER_V1",
                "authorization": AUTH_NAME,
                "createPerformed": 1,
                "jobId": JOB_ID,
                "podId": pod_id,
                "digest": REQUIRED_DIGEST,
                "at": utc_now(),
            },
        )
        write_json(
            OUT / "LAUNCH.json",
            {
                "podId": pod_id,
                "podName": POD_NAME,
                "digest": REQUIRED_DIGEST,
                "quotedUsdPerHr": rate,
                "jobKind": "VISUAL_PROOF",
                "at": utc_now(),
            },
        )
        log("pod_confirmed", podId=pod_id)
        mark_auth_consumed(pod_id)
        client = r2_client()
        observed_rate = rate
        hard_deadline = started + min(HARD_RUNTIME_MINUTES * 60, (HARD_SPEND_USD / max(observed_rate, 0.01)) * 3600 * 0.97)
        startup_deadline = started + 12 * 60
        status = None
        worker_started = False
        while time.time() < hard_deadline:
            status = r2_get_json(client, f"jobs/{JOB_ID}/status.json")
            startup = r2_get_json(client, f"jobs/{JOB_ID}/startup-status.json")
            if startup:
                worker_started = True
                log("startup", stage=startup.get("stage"), result=startup.get("result"))
            if status and status.get("status") in {"COMPLETE", "FAILED"}:
                break
            pods = list_pods()
            capture_host_telemetry(pod_id, pods)
            exact = next((p for p in pods if p.get("id") == pod_id), None)
            if exact and float(exact.get("costPerHr") or 0) > 0:
                observed_rate = float(exact["costPerHr"])
                hard_deadline = min(
                    started + HARD_RUNTIME_MINUTES * 60,
                    started + (HARD_SPEND_USD / max(observed_rate, 0.01)) * 3600 * 0.97,
                )
            if not worker_started and time.time() > startup_deadline:
                raise RuntimeError("STARTUP_WATCHDOG_TIMEOUT")
            if exact and str(exact.get("desiredStatus") or "").upper() in {"TERMINATED", "EXITED"} and not status:
                raise RuntimeError("POD_EXITED_WITHOUT_TERMINAL_STATUS")
            time.sleep(15)
        if not status or status.get("status") != "COMPLETE":
            raise RuntimeError("HARD_RUNTIME_OR_COST_DEADLINE_OR_FAILED")
        outputs = download_outputs()
        runtime = time.time() - started
        spend = round((runtime / 3600.0) * observed_rate, 4)
        telemetry = capture_host_telemetry(pod_id)
        if (outputs.get("status") or {}).get("gpuTelemetry"):
            telemetry = {**telemetry, **{"worker": outputs["status"]["gpuTelemetry"]}}
            write_json(OUT / "HOST_TELEMETRY.json", telemetry)
        write_result(
            "COMPLETE",
            paidCreate=create_performed,
            runpodSpendUsd=spend,
            runtimeSeconds=round(runtime, 1),
            outputs=outputs,
            podId=pod_id,
            hostTelemetry=telemetry,
            workerStatus=outputs.get("status"),
        )
        return 0
    except Exception as exc:
        runtime = time.time() - started
        spend = round((runtime / 3600.0) * float((checks.get("quote") or {}).get("secureUsdPerHr") or 0), 4)
        outputs = {}
        try:
            outputs = download_outputs()
        except Exception:
            outputs = {}
        telemetry = {}
        try:
            telemetry = capture_host_telemetry(pod_id)
        except Exception:
            telemetry = {}
        write_result(
            "FAILED_AFTER_CREATE" if create_performed else "FAILED_CLOSED_BEFORE_CREATE",
            reason=type(exc).__name__,
            message=str(exc)[:400],
            paidCreate=create_performed,
            runpodSpendUsd=spend if create_performed else 0,
            runtimeSeconds=round(runtime, 1),
            podId=pod_id,
            outputs=outputs,
            hostTelemetry=telemetry,
            workerStatus=(outputs or {}).get("status"),
        )
        log("failed", error=type(exc).__name__)
        return 2
    finally:
        if create_performed:
            cleanup = terminate_pod(pod_id)
            write_json(OUT / "CLEANUP.json", cleanup)
            log("cleanup", confirmed=cleanup.get("confirmed"), live=cleanup.get("live"))


if __name__ == "__main__":
    raise SystemExit(main())
