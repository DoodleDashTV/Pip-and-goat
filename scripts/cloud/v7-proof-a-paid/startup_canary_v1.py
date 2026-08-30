#!/usr/bin/env python3
"""TIVVLEJOY_WORKER_STARTUP_CANARY_V1

Zero-cost canary: GHCR anonymous pullability, image config, dockerArgs shape,
startup markers, host-memory receipt, and optional local container start.
Never creates a RunPod pod.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO / "scripts/blender/scenery"))

from docker_args_v1 import (  # noqa: E402
    CURRENT_PIN_DOCKER_ARGS,
    IMAGE_CMD,
    NVIDIA_ENTRYPOINT,
    PREFERRED_BAKED_DOCKER_ARGS,
    docker_args_compatible,
)
from host_memory_receipt_v1 import collect_host_memory_receipt  # noqa: E402
from startup_markers_v1 import MARKERS, marker_payload  # noqa: E402

PIN = REPO / "config/cloud/scenery-showcase-worker-image.json"
OUT = REPO / "artifacts/tivvlejoy-scenery-showcase-30s/v7-startup-root-cause-v2"


def log(event: str, **payload) -> None:
    print(json.dumps({"event": event, **payload}), flush=True)


def http(url: str, headers: dict | None = None):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read()


def audit_ghcr(ref: str) -> dict:
    digest = ref.split("@", 1)[1]
    repo = ref.split("/", 1)[1].split("@", 1)[0]
    accept = ",".join(
        [
            "application/vnd.oci.image.index.v1+json",
            "application/vnd.docker.distribution.manifest.list.v2+json",
            "application/vnd.oci.image.manifest.v1+json",
            "application/vnd.docker.distribution.manifest.v2+json",
        ]
    )
    unauth_status, _, _ = http(f"https://ghcr.io/v2/{repo}/manifests/{digest}", {"Accept": accept})
    tok_status, _, tok_body = http(f"https://ghcr.io/token?scope=repository:{repo}:pull&service=ghcr.io")
    token = None
    try:
        token = json.loads(tok_body.decode()).get("token")
    except Exception:
        token = None
    man = None
    anon_manifest = None
    if token:
        anon_manifest, _, man_body = http(
            f"https://ghcr.io/v2/{repo}/manifests/{digest}",
            {"Authorization": f"Bearer {token}", "Accept": accept},
        )
        if anon_manifest == 200:
            man = json.loads(man_body.decode())
    layers = (man or {}).get("layers") or []
    sizes = [int(layer.get("size") or 0) for layer in layers]
    config = {}
    entrypoint = None
    cmd = None
    arch = None
    if man and token and (man.get("config") or {}).get("digest"):
        st, _, cfg_body = http(
            f"https://ghcr.io/v2/{repo}/blobs/{man['config']['digest']}",
            {"Authorization": f"Bearer {token}"},
        )
        if st == 200:
            config = json.loads(cfg_body.decode())
            arch = config.get("architecture")
            entrypoint = (config.get("config") or {}).get("Entrypoint")
            cmd = (config.get("config") or {}).get("Cmd")
    public_pull = bool(token) and anon_manifest == 200
    return {
        "schema": "TIVVLEJOY_GHCR_STARTUP_AUDIT_V2",
        "digest": digest,
        "unauthenticatedManifestStatus": unauth_status,
        "anonymousTokenHttp": tok_status,
        "anonymousManifestStatus": anon_manifest,
        "unauthenticatedRuntimeCanPullExactDigest": public_pull,
        "registryAuthRequiredForPublicPull": not public_pull,
        "architecture": arch,
        "linuxAmd64": arch == "amd64",
        "entrypoint": entrypoint,
        "cmd": cmd,
        "layerCount": len(layers),
        "compressedBytes": sum(sizes),
        "largestLayerBytes": sorted(sizes, reverse=True)[:8],
        "coldPullExpectationSeconds": 90 if sum(sizes) < 3 * 1024**3 else 300,
        "twentyMinutesPlausibleForPullOnly": sum(sizes) > 0,
    }


def local_container_canary(ref: str) -> dict:
    docker = shutil.which("docker")
    if not docker:
        return {"attempted": False, "reason": "DOCKER_NOT_AVAILABLE"}
    commands = {
        "nodeStart": [docker, "run", "--rm", "--network", "none", ref, "node", "-e", "console.log('NODE_ENTRY_STARTED')"],
        "blenderVersion": [docker, "run", "--rm", "--network", "none", ref, "blender", "--version"],
    }
    results = {}
    for name, argv in commands.items():
        try:
            run = subprocess.run(argv, capture_output=True, text=True, timeout=180)
            results[name] = {
                "status": run.returncode,
                "stdout": (run.stdout or "")[:400],
                "stderr": (run.stderr or "")[:200],
            }
        except Exception as exc:
            results[name] = {"status": 1, "error": type(exc).__name__}
    node_ok = results.get("nodeStart", {}).get("status") == 0
    blender_out = results.get("blenderVersion", {}).get("stdout") or ""
    blender_ok = "4.2.2" in blender_out
    return {"attempted": True, "nodeStart": node_ok, "blender422": blender_ok, "details": results}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    pin = json.loads(PIN.read_text())
    ref = pin["ref"]
    ghcr = audit_ghcr(ref)
    old_args = (
        "sh -c 'cd /opt/ddp-worker && node -e "
        "\"(async()=>{const r2=require(\\\"./src/r2-client\\\");})()\"'"
    )
    old_compat = docker_args_compatible(old_args)
    new_compat = docker_args_compatible(PREFERRED_BAKED_DOCKER_ARGS)
    pin_compat = docker_args_compatible(CURRENT_PIN_DOCKER_ARGS)
    markers = [marker_payload(name)["stage"] for name in MARKERS]
    receipt = collect_host_memory_receipt(
        meminfo_text=Path("/proc/meminfo").read_text(encoding="utf-8"),
        gpu_name=None,
        gpu_vram_bytes=0,
        hdri_identity="Image0001.jpg:15000x7500",
        source_manifest=["hdri_jpg"],
    )
    container = local_container_canary(ref)
    boot_js = REPO / "workers/runpod-blender/src/v7-proof-a-boot.js"
    node_check = subprocess.run(["node", "--check", str(boot_js)], capture_output=True, text=True)
    row = {
        "schema": "TIVVLEJOY_WORKER_STARTUP_CANARY_V1",
        "imageRefDigest": pin.get("digest"),
        "ghcr": {
            "publicPull": ghcr["unauthenticatedRuntimeCanPullExactDigest"],
            "architecture": ghcr["architecture"],
            "compressedBytes": ghcr["compressedBytes"],
            "layerCount": ghcr["layerCount"],
            "entrypoint": ghcr["entrypoint"],
            "cmd": ghcr["cmd"],
        },
        "previousDockerArgsCompatible": old_compat["ok"],
        "preferredDockerArgsCompatible": new_compat["ok"],
        "currentPinDockerArgsCompatible": pin_compat["ok"],
        "nvidiaEntrypoint": NVIDIA_ENTRYPOINT,
        "imageCmd": list(IMAGE_CMD),
        "markers": markers,
        "hostMemoryReceiptOnCursorVm": {"ok": receipt["ok"], "blockers": receipt["blockers"], "warnings": receipt["warnings"]},
        "container": container,
        "bootScriptSyntax": node_check.returncode == 0,
        "runpodContactedForCreate": False,
        "paidCreate": 0,
        "ok": bool(
            ghcr["unauthenticatedRuntimeCanPullExactDigest"]
            and ghcr["linuxAmd64"]
            and new_compat["ok"]
            and not old_compat["ok"]
            and node_check.returncode == 0
            and (not container["attempted"] or (container.get("nodeStart") and container.get("blender422")))
        ),
    }
    (OUT / "STARTUP_CANARY.json").write_text(json.dumps(row, indent=2) + "\n")
    (OUT / "GHCR_AUDIT.json").write_text(json.dumps(ghcr, indent=2) + "\n")
    log("canary_done", ok=row["ok"], publicPull=ghcr["unauthenticatedRuntimeCanPullExactDigest"], docker=container["attempted"])
    return 0 if row["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
