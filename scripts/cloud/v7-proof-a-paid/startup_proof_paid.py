#!/usr/bin/env python3
"""Exactly-one-CREATE paid V7 startup proof. No Blender. No R2. No render."""
from __future__ import annotations

import argparse
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

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(HERE))
from docker_args_v1 import CURRENT_PIN_DOCKER_ARGS, docker_args_compatible  # noqa: E402

AUTH = "TIVVLEJOY_V7_PAID_STARTUP_PROOF_AUTHORIZATION_V1"
POD_NAME = "tj-v7-sup-v1"
GPU_TYPE = "NVIDIA GeForce RTX 4090"
MAX_SPEND = 0.10
OBSERVE_S = 180
CONTAINER_START_TIMEOUT_S = 240
REQUIRED_BRANCH = "cursor/tivvlejoy-scenery-showcase-30s-v1-73f1"
REQUIRED_ANCESTOR = "d1e3c15242b1f59bc7e5f187a5daa5c31be93e1c"
REQUIRED_DIGEST = "sha256:868b7d5e796df7cd8e3c96df39a1eb2560344f492ed3d081f0bf6e3416a65142"
OVERLAY_PIN = REPO / "config/cloud/v7-proof-a-startup-image.json"
SCENERY_PIN = REPO / "config/cloud/scenery-showcase-worker-image.json"
OUT = REPO / "artifacts/tivvlejoy-scenery-showcase-30s/v7-paid-startup-proof-v1"
REQUIRED_MARKERS = (
    "BOOTSTRAP_ENTERED",
    "NODE_AVAILABLE",
    "IMAGE_PROCESS_STARTED",
    "NODE_ENTRY_STARTED",
    "WORKER_MODULE_LOADED",
    "WORKER_LISTENING",
    "WORKER_READY",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def log(event: str, **payload) -> None:
    safe = {k: v for k, v in payload.items() if "key" not in k.lower() and "secret" not in k.lower()}
    print(json.dumps({"ts": utc_now(), "event": event, **safe}), flush=True)


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n")


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


def runpod_rest(url: str, timeout: int = 30):
    req = urllib.request.Request(
        url,
        headers={"Authorization": "Bearer " + os.environ["RUNPOD_API_KEY"], "User-Agent": "DoodleDashProduction/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode() or ""
            try:
                return resp.status, json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                return resp.status, {"text": raw}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()[:800]
        return exc.code, {"error": raw}
    except Exception as exc:
        return 0, {"error": type(exc).__name__}


def list_pods() -> list[dict]:
    data = runpod_gql(
        """
        query {
          myself {
            pods {
              id name desiredStatus costPerHr machineId lastStatusChange
              runtime { uptimeInSeconds ports { ip isIpPublic privatePort publicPort type } }
              machine { gpuDisplayName }
            }
          }
        }
        """
    )
    return ((data.get("myself") or {}).get("pods")) or []


def active_pods(pods: list[dict]) -> list[dict]:
    return [p for p in pods if str(p.get("desiredStatus") or "").upper() not in {"TERMINATED", "EXITED", "STOPPED"}]


def pod_uptime(pod: dict | None):
    if not pod:
        return None
    runtime = pod.get("runtime") if isinstance(pod.get("runtime"), dict) else {}
    raw = runtime.get("uptimeInSeconds")
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


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


def overlay_ref() -> dict:
    overlay = json.loads(OVERLAY_PIN.read_text())
    scenery = json.loads(SCENERY_PIN.read_text())
    repo = str(scenery.get("imageRepository") or "")
    digest = str(overlay.get("digest") or "")
    if digest != REQUIRED_DIGEST:
        raise RuntimeError("OVERLAY_DIGEST_MISMATCH")
    if overlay.get("workerEntrypoint") != "v7-proof-a-boot.js":
        raise RuntimeError("OVERLAY_ENTRY_MISMATCH")
    if overlay.get("pid1") != "v7-pid1-bootstrap.sh":
        raise RuntimeError("OVERLAY_PID1_MISMATCH")
    if (overlay.get("dockerArgs") or CURRENT_PIN_DOCKER_ARGS) != CURRENT_PIN_DOCKER_ARGS:
        raise RuntimeError("OVERLAY_DOCKER_ARGS_MISMATCH")
    if not repo.startswith("ghcr.io/") or not digest.startswith("sha256:"):
        raise RuntimeError("OVERLAY_REF_INCOMPLETE")
    return {"ref": f"{repo}@{digest}", "digest": digest, "dockerArgs": CURRENT_PIN_DOCKER_ARGS, "repo": repo}


def public_pull_ok(repo: str, digest: str) -> dict:
    accept = ",".join(
        [
            "application/vnd.oci.image.index.v1+json",
            "application/vnd.docker.distribution.manifest.list.v2+json",
            "application/vnd.oci.image.manifest.v1+json",
            "application/vnd.docker.distribution.manifest.v2+json",
        ]
    )
    repo_path = repo.split("ghcr.io/", 1)[-1]
    try:
        req = urllib.request.Request(
            f"https://ghcr.io/token?scope=repository:{repo_path}:pull&service=ghcr.io"
        )
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
            "anonymousManifestStatus": status,
            "layerCount": len(layers),
            "compressedBytes": sum(int(layer.get("size") or 0) for layer in layers),
        }
    except Exception as exc:
        return {"ok": False, "error": type(exc).__name__}


def identity() -> dict:
    subprocess.check_call(
        ["git", "fetch", "origin", REQUIRED_BRANCH],
        cwd=REPO,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip()
    local = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
    remote = subprocess.check_output(
        ["git", "rev-parse", f"origin/{REQUIRED_BRANCH}"], cwd=REPO, text=True
    ).strip()
    ancestor = (
        subprocess.call(["git", "merge-base", "--is-ancestor", REQUIRED_ANCESTOR, remote], cwd=REPO) == 0
    )
    tip_parent = subprocess.check_output(["git", "rev-parse", f"{remote}^"], cwd=REPO, text=True).strip()
    overlay = json.loads(OVERLAY_PIN.read_text())
    return {
        "schema": "TIVVLEJOY_V7_PAID_STARTUP_PROOF_IDENTITY_V1",
        "branch": branch,
        "localSha": local,
        "remoteTip": remote,
        "remoteTipParent": tip_parent,
        "requiredAncestor": REQUIRED_ANCESTOR,
        "requiredAncestorIsAncestor": ancestor,
        "requiredAncestorIsParentOfTip": tip_parent == REQUIRED_ANCESTOR,
        "whyStampFollowsReportedSha": (
            "d1e3c152 is the content commit that pinned the overlay and recorded the 180s proofs. "
            "28a58e74 is the later stamp commit whose parent is d1e3c152; it only writes "
            "'final SHA: d1e3c152...' into the result markdown. The required check is ancestry, "
            "not tip equality."
        ),
        "overlayDigest": overlay.get("digest"),
        "requiredDigest": REQUIRED_DIGEST,
        "digestMatch": overlay.get("digest") == REQUIRED_DIGEST,
        "at": utc_now(),
    }


def http_json(url: str):
    ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"User-Agent": "DoodleDashProduction/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=12, context=ctx) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        return exc.code, {}
    except Exception:
        return 0, {}


def _collect_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        chunks = []
        for key in ("logs", "containerLog", "stdout", "text", "log", "lastLogs"):
            if value.get(key):
                chunks.append(str(value.get(key)))
        return "\n".join(chunks)
    return str(value)


def fetch_logs(pod_id: str) -> str:
    chunks: list[str] = []
    for url in (
        f"https://rest.runpod.io/v1/pods/{pod_id}",
        f"https://rest.runpod.io/v1/pods/{pod_id}/logs",
        f"https://api.runpod.io/v2/{pod_id}/logs",
        f"https://api.runpod.io/v2/pods/{pod_id}/logs",
    ):
        status, body = runpod_rest(url)
        if status == 200:
            text = _collect_text(body)
            if text.strip():
                chunks.append(text)
    for query in (
        "query ($id: String!) { pod(input: { podId: $id }) { id desiredStatus } }",
        "query ($id: String!) { pod(input: { podId: $id }) { containerLog } }",
        "query ($id: String!) { pod(input: { podId: $id }) { lastLogs } }",
        "query ($id: String!) { pod(input: { podId: $id }) { logs } }",
    ):
        try:
            data = runpod_gql(query, {"id": pod_id})
            text = _collect_text((data.get("pod") or {}))
            if text.strip() and "desiredStatus" not in text:
                chunks.append(text)
        except Exception:
            continue
    return "\n".join(chunks)


def extract_markers(text: str) -> list[str]:
    found = []
    for name in list(REQUIRED_MARKERS) + ["HEARTBEAT", "R2_CLIENT_STARTED", "BLENDER_EXEC_STARTED"]:
        if name in text and name not in found:
            found.append(name)
    return found


def markers_in_order(text: str) -> bool:
    positions = []
    for name in REQUIRED_MARKERS:
        idx = text.find(name)
        if idx < 0:
            return False
        positions.append(idx)
    return positions == sorted(positions)


def heartbeat_count(text: str) -> int:
    return text.count("HEARTBEAT")


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
        for _ in range(3):
            try:
                runpod_gql("mutation ($podId: String!) { podTerminate(input: { podId: $podId }) }", {"podId": pod_id})
                log("terminate_requested")
                break
            except Exception as exc:
                log("terminate_error", error=type(exc).__name__)
                time.sleep(6)
    deadline = time.time() + 120
    live = []
    while time.time() < deadline:
        live = active_pods(list_pods())
        if not live:
            return {"confirmed": True, "live": []}
        try:
            if pod_id:
                runpod_gql("mutation ($podId: String!) { podTerminate(input: { podId: $podId }) }", {"podId": pod_id})
        except Exception:
            pass
        time.sleep(6)
    return {"confirmed": False, "live": [{"id": p.get("id"), "name": p.get("name")} for p in live]}


def create_pod(image_ref: str, rate: float) -> str:
    docker_args = CURRENT_PIN_DOCKER_ARGS
    compat = docker_args_compatible(docker_args)
    if not compat["ok"]:
        raise RuntimeError("DOCKER_ARGS_INCOMPATIBLE:" + ",".join(compat["blockers"]))
    env = {
        "V7_STARTUP_PROOF": "1",
        "V7_STARTUP_PROOF_SECONDS": "300",
        "V7_HEALTH_PORT": "18080",
        "V7_HEALTH_BIND": "0.0.0.0",
        "PAID_EXECUTION_AUTHORIZED": "false",
        "CLOUD_RENDER_ENABLED": "false",
        "RUNPOD_GPU_HOURLY_RATE": str(rate),
    }
    if any(k in env for k in ("RUNPOD_API_KEY", "ALLOW_PAID_GPU_LAUNCH", "R2_SECRET_ACCESS_KEY", "R2_ACCESS_KEY_ID")):
        raise RuntimeError("POD_SECRET_POLICY_VIOLATION")
    payload = {
        "name": POD_NAME,
        "imageName": image_ref,
        "gpuTypeId": GPU_TYPE,
        "gpuCount": 1,
        "cloudType": "SECURE",
        "minMemoryInGb": 24,
        "containerDiskInGb": 40,
        "volumeInGb": 0,
        "ports": "18080/http",
        "dockerArgs": docker_args,
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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--create-authorized-once", action="store_true")
    parser.add_argument("--identity-only", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    ident = identity()
    write_json(OUT / "IDENTITY.json", ident)
    log("identity", **{k: ident[k] for k in ident if k != "schema"})
    blockers = []
    if ident["branch"] != REQUIRED_BRANCH:
        blockers.append("BRANCH_MISMATCH")
    if not ident["requiredAncestorIsAncestor"]:
        blockers.append("REQUIRED_ANCESTOR_MISSING")
    if not ident["digestMatch"]:
        blockers.append("DIGEST_MISMATCH")
    live = active_pods(list_pods())
    if live:
        blockers.append("LIVE_PODS_NOT_EMPTY")
    try:
        pr = json.loads(
            subprocess.check_output(["gh", "pr", "view", "169", "--json", "isDraft,state,mergedAt"], cwd=REPO, text=True)
        )
        if not pr.get("isDraft") or pr.get("state") != "OPEN" or pr.get("mergedAt"):
            blockers.append("PR_NOT_DRAFT_OPEN")
    except Exception:
        blockers.append("PR_STATE_UNVERIFIED")
    quote = quote_4090()
    if quote.get("id") != GPU_TYPE:
        blockers.append("GPU_NOT_4090")
    if float(quote.get("secureUsdPerHr") or 99) > 0.80:
        blockers.append("PRICE_ABOVE_CONTRACT")
    if not quote.get("secureUsdPerHr"):
        blockers.append("PRICE_MISSING")
    overlay = overlay_ref()
    if not docker_args_compatible(overlay["dockerArgs"])["ok"]:
        blockers.append("DOCKER_ARGS_INCOMPATIBLE")
    pull = public_pull_ok(overlay["repo"], overlay["digest"])
    if not pull.get("ok"):
        blockers.append("OVERLAY_NOT_ANONYMOUSLY_PULLABLE")
    write_json(
        OUT / "PREFLIGHT.json",
        {
            "ok": not blockers,
            "blockers": blockers,
            "quote": quote,
            "digest": overlay["digest"],
            "publicPull": {k: pull[k] for k in pull if k != "error" or pull.get("ok")},
            "dockerArgs": CURRENT_PIN_DOCKER_ARGS,
            "at": utc_now(),
        },
    )
    if args.identity_only:
        return 0 if not blockers else 2
    if not args.create_authorized_once:
        raise RuntimeError("CREATE_NOT_ARMED")
    if blockers:
        write_json(OUT / "RESULT.json", {"status": "FAILED", "reason": "IDENTITY_OR_PREFLIGHT", "blockers": blockers})
        return 2
    ledger = OUT / "consumption-ledger.json"
    if ledger.exists():
        raise RuntimeError("LEDGER_ALREADY_EXISTS")
    write_json(
        ledger,
        {"schema": "TIVVLEJOY_V7_STARTUP_PROOF_LEDGER_V1", "authorization": AUTH, "createPerformed": 0, "at": utc_now()},
    )
    rate = float(quote["secureUsdPerHr"])
    started = time.time()
    pod_id = None
    create_performed = 0
    ready_at = None
    ready_http = None
    markers: list[str] = []
    timeline: list[dict] = []
    crash_loops = 0
    saw_positive = False
    restart_count = 0
    log_text = ""
    try:
        log("create_entered", gpu=GPU_TYPE, digest=REQUIRED_DIGEST)
        try:
            pod_id = create_pod(overlay["ref"], rate)
            create_performed = 1
        except Exception as exc:
            log("create_response_failed_or_ambiguous", error=type(exc).__name__)
            recovered = recover_named_pod()
            if recovered:
                pod_id = recovered["id"]
                create_performed = 1
            else:
                raise
        ledger.write_text(
            json.dumps(
                {
                    "schema": "TIVVLEJOY_V7_STARTUP_PROOF_LEDGER_V1",
                    "authorization": AUTH,
                    "createPerformed": 1,
                    "podId": pod_id,
                    "at": utc_now(),
                },
                indent=2,
            )
            + "\n"
        )
        log("pod_confirmed", podId=pod_id)
        write_json(
            OUT / "LAUNCH.json",
            {"podId": pod_id, "digest": REQUIRED_DIGEST, "dockerArgs": CURRENT_PIN_DOCKER_ARGS, "quotedUsdPerHr": rate, "at": utc_now()},
        )
        hard_deadline = started + (MAX_SPEND / max(rate, 0.01)) * 3600 * 0.92
        container_deadline = started + CONTAINER_START_TIMEOUT_S
        stage = "POD_CREATED"
        timeline.append({"ts": utc_now(), "stage": stage})
        while time.time() < hard_deadline:
            pods = list_pods()
            exact = next((p for p in pods if p.get("id") == pod_id), None)
            uptime = pod_uptime(exact)
            observed_rate = float((exact or {}).get("costPerHr") or rate)
            hard_deadline = min(hard_deadline, started + (MAX_SPEND / max(observed_rate, 0.01)) * 3600 * 0.92)
            if uptime is not None and uptime >= 0:
                if not saw_positive:
                    saw_positive = True
                    stage = "CONTAINER_STARTED"
                    timeline.append({"ts": utc_now(), "stage": stage, "uptimeInSeconds": uptime})
            elif saw_positive and uptime is not None and uptime < 0:
                crash_loops += 1
                restart_count += 1
                timeline.append({"ts": utc_now(), "stage": "CRASH_LOOP", "uptimeInSeconds": uptime, "count": crash_loops})
                if crash_loops >= 2:
                    raise RuntimeError("WORKER_CRASH_LOOP")
            chunk = fetch_logs(pod_id)
            if chunk and len(chunk) > len(log_text):
                log_text = chunk
                markers = extract_markers(log_text)
            proxy = f"https://{pod_id}-18080.proxy.runpod.net/ready"
            status, body = http_json(proxy)
            if status == 200 and (body.get("ok") is True or body.get("event") == "WORKER_READY"):
                ready_http = {"urlHost": "runpod-proxy-18080", "status": 200, "body": body}
                if "WORKER_READY" not in markers:
                    markers.append("WORKER_READY")
                if ready_at is None:
                    ready_at = time.time()
                    timeline.append({"ts": utc_now(), "stage": "WORKER_READY", "uptimeInSeconds": uptime})
                    log("ready", uptime=uptime)
            ports = ((exact or {}).get("runtime") or {}).get("ports") or []
            for port in ports:
                if int(port.get("privatePort") or 0) == 18080 and port.get("ip"):
                    alt = f"http://{port.get('ip')}:{port.get('publicPort') or 18080}/ready"
                    st2, body2 = http_json(alt)
                    if st2 == 200 and body2.get("ok") is True:
                        ready_http = {"status": 200, "via": "runtime.ports", "body": body2}
                        if ready_at is None:
                            ready_at = time.time()
            elapsed = time.time() - started
            log(
                "poll",
                stage=stage,
                uptime=uptime,
                elapsed=round(elapsed, 1),
                ready=bool(ready_at),
                markers=markers,
                crashLoops=crash_loops,
            )
            if ready_at and time.time() - ready_at >= OBSERVE_S:
                if restart_count:
                    raise RuntimeError("RESTART_DURING_OBSERVE")
                timeline.append({"ts": utc_now(), "stage": "OBSERVE_COMPLETE", "uptimeInSeconds": uptime})
                break
            if time.time() > container_deadline and not saw_positive:
                raise RuntimeError(f"CONTAINER_START_TIMEOUT:{round(elapsed,1)}")
            if str((exact or {}).get("desiredStatus") or "").upper() in {"TERMINATED", "EXITED"} and not ready_at:
                raise RuntimeError("POD_EXITED_BEFORE_READY")
            time.sleep(10)
        if not ready_at:
            raise RuntimeError("READY_NOT_REACHED")
        missing = [m for m in REQUIRED_MARKERS if m not in markers]
        forbidden = [m for m in ("R2_CLIENT_STARTED", "BLENDER_EXEC_STARTED") if m in markers]
        beats = heartbeat_count(log_text)
        ordered = markers_in_order(log_text) if not missing else False
        write_json(OUT / "LOG_META.json", {"bytes": len(log_text), "preview": log_text[-2000:]})
        (OUT / "CONTAINER_LOG.txt").write_text(log_text[-20000:] if log_text else "")
        write_json(
            OUT / "MARKERS.json",
            {
                "seen": markers,
                "missing": missing,
                "ordered": ordered,
                "heartbeatCount": beats,
                "forbidden": forbidden,
                "readyHttp": ready_http,
                "restartCount": restart_count,
            },
        )
        if missing:
            raise RuntimeError("REQUIRED_MARKERS_MISSING:" + ",".join(missing))
        if not ordered:
            raise RuntimeError("REQUIRED_MARKERS_OUT_OF_ORDER")
        if beats < 2:
            raise RuntimeError("HEARTBEAT_NOT_CONTINUING")
        if forbidden:
            raise RuntimeError("FORBIDDEN_MARKERS:" + ",".join(forbidden))
    finally:
        cleanup = terminate_pod(pod_id)
        write_json(OUT / "CLEANUP.json", cleanup)
        write_json(OUT / "STARTUP_TIMELINE.json", {"events": timeline})
        runtime_s = max(0.0, time.time() - started)
        spend = round((runtime_s / 3600.0) * rate, 4)
        write_json(
            OUT / "SPEND.json",
            {"runtimeSeconds": round(runtime_s, 1), "rateUsdPerHr": rate, "actualUsd": spend, "createPerformed": create_performed, "podId": pod_id},
        )
        missing = [m for m in REQUIRED_MARKERS if m not in markers]
        forbidden = [m for m in ("R2_CLIENT_STARTED", "BLENDER_EXEC_STARTED") if m in markers]
        beats = heartbeat_count(log_text)
        ordered = markers_in_order(log_text) if log_text else False
        ok = (
            bool(ready_at)
            and not missing
            and ordered
            and beats >= 2
            and not forbidden
            and restart_count == 0
            and spend <= MAX_SPEND
            and create_performed == 1
            and bool(cleanup.get("confirmed"))
            and not (cleanup.get("live") or [])
        )
        result = {
            "schema": AUTH + "_RESULT",
            "status": "V7_PAID_STARTUP_PROOF_PASSED" if ok else "V7_PAID_STARTUP_PROOF_FAILED",
            "authorization": AUTH,
            "branch": REQUIRED_BRANCH,
            "remoteTip": ident.get("remoteTip"),
            "requiredAncestor": REQUIRED_ANCESTOR,
            "requiredAncestorIsAncestor": ident.get("requiredAncestorIsAncestor"),
            "digest": REQUIRED_DIGEST,
            "podId": pod_id,
            "gpu": GPU_TYPE,
            "hourlyRateUsd": rate,
            "createPerformed": create_performed,
            "markers": markers,
            "missingMarkers": missing,
            "orderedMarkers": ordered,
            "heartbeatCount": beats,
            "readyHttp": ready_http,
            "restartCount": restart_count,
            "runtimeSeconds": round(runtime_s, 1),
            "actualUsd": spend,
            "cleanup": cleanup,
            "blenderInvoked": False,
            "r2Invoked": False,
            "imageRebuild": False,
            "secondCreate": False,
            "V7_PROOF_A_RENDER_READY_AWAITING_AUTHORIZATION": "YES" if ok else "NO",
            "at": utc_now(),
        }
        write_json(OUT / "RESULT.json", result)
        write_result_md(result, ident, timeline)
    return 0 if result["status"].endswith("PASSED") else 1


def write_result_md(result: dict, ident: dict, timeline: list[dict]) -> None:
    lines = [
        "# TIVVLEJOY_V7_PAID_STARTUP_PROOF_V1_RESULT",
        "",
        f"branch: {REQUIRED_BRANCH}",
        f"remote tip: {ident.get('remoteTip')}",
        f"required ancestor: {REQUIRED_ANCESTOR}",
        f"ancestor of tip: {ident.get('requiredAncestorIsAncestor')}",
        f"why 28a58e74 follows d1e3c152: {ident.get('whyStampFollowsReportedSha')}",
        f"digest: {REQUIRED_DIGEST}",
        "PR state: #169 OPEN DRAFT UNMERGED NOT READY",
        "",
        f"pod ID: {result.get('podId')}",
        f"GPU: SECURE {GPU_TYPE}",
        f"hourly rate: ${result.get('hourlyRateUsd')}",
        f"CREATE count: {result.get('createPerformed')}",
        f"restart count: {result.get('restartCount')}",
        f"runtime: {result.get('runtimeSeconds')} s",
        f"actual spend: ${result.get('actualUsd')}",
        "",
        "startup timeline:",
    ]
    for event in timeline:
        lines.append(f"- {event.get('ts')} {event.get('stage')} uptime={event.get('uptimeInSeconds')}")
    lines.extend(
        [
            "",
            f"markers: {', '.join(result.get('markers') or []) or 'none'}",
            f"missing: {', '.join(result.get('missingMarkers') or []) or 'none'}",
            f"ordered: {result.get('orderedMarkers')}",
            f"heartbeat count: {result.get('heartbeatCount')}",
            f"ready HTTP: {json.dumps(result.get('readyHttp'))}",
            f"cleanup confirmed: {(result.get('cleanup') or {}).get('confirmed')}",
            f"live pods: {(result.get('cleanup') or {}).get('live')}",
            f"Blender invoked: {result.get('blenderInvoked')}",
            f"R2 invoked: {result.get('r2Invoked')}",
            f"image rebuild: {result.get('imageRebuild')}",
            f"second CREATE: {result.get('secondCreate')}",
            "",
            f"END STATUS: {result.get('status')}",
            f"V7_PROOF_A_RENDER_READY_AWAITING_AUTHORIZATION: {result.get('V7_PROOF_A_RENDER_READY_AWAITING_AUTHORIZATION')}",
            "",
            "FINAL_VIDEO_RENDER_NOT_AUTHORIZED",
            "NO PR MERGE / NOT READY / NO PRODUCTION DEPLOY",
            "",
        ]
    )
    (OUT / "TIVVLEJOY_V7_PAID_STARTUP_PROOF_V1_RESULT.md").write_text("\n".join(lines))


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        existing = {}
        if (OUT / "RESULT.json").exists():
            try:
                existing = json.loads((OUT / "RESULT.json").read_text())
            except Exception:
                existing = {}
        existing["status"] = "V7_PAID_STARTUP_PROOF_FAILED"
        existing["error"] = f"{type(exc).__name__}:{str(exc)[:400]}"
        existing["at"] = utc_now()
        if "V7_PROOF_A_RENDER_READY_AWAITING_AUTHORIZATION" not in existing:
            existing["V7_PROOF_A_RENDER_READY_AWAITING_AUTHORIZATION"] = "NO"
        write_json(OUT / "RESULT.json", existing)
        log("launch_failed", error=type(exc).__name__)
        raise
