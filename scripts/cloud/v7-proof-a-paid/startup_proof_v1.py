#!/usr/bin/env python3
"""Zero-cost startup-contract proof. Never creates a RunPod pod. Never renders."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(HERE))
from docker_args_v1 import (  # noqa: E402
    BROKEN_NODE_E_DOCKER_ARGS,
    CURRENT_PIN_DOCKER_ARGS,
    PREFERRED_BAKED_DOCKER_ARGS,
    docker_args_compatible,
)

BOOT = REPO / "workers/runpod-blender/src/v7-proof-a-boot.js"
BOOTSTRAP = REPO / "workers/runpod-blender/src/v7-pid1-bootstrap.sh"
OUT = REPO / "artifacts/tivvlejoy-scenery-showcase-30s/v7-worker-marker-timeout-v1"


def log(event: str, **payload) -> None:
    print(json.dumps({"event": event, **payload}), flush=True)


def test_broken_args_die_under_bash_c() -> dict:
    run = subprocess.run(["bash", "-c", BROKEN_NODE_E_DOCKER_ARGS], capture_output=True, text=True, timeout=10)
    tokens = BROKEN_NODE_E_DOCKER_ARGS.split()
    argv = subprocess.run(tokens, capture_output=True, text=True, timeout=10)
    row = {
        "bashCStatus": run.returncode,
        "bashCStderr": (run.stderr or "")[:240],
        "tokenCount": len(tokens),
        "argvStatus": argv.returncode,
        "argvStderr": (argv.stderr or "")[:240],
        "bashSyntaxError": "syntax error near unexpected token" in (run.stderr or ""),
        "argvTruncated": "Unexpected end of input" in (argv.stderr or ""),
    }
    assert run.returncode != 0
    assert row["bashSyntaxError"] is True
    assert len(tokens) != 2
    assert docker_args_compatible(BROKEN_NODE_E_DOCKER_ARGS)["ok"] is False
    return row


def test_file_args_survive_bash_c() -> dict:
    assert docker_args_compatible(CURRENT_PIN_DOCKER_ARGS)["ok"] is True
    assert docker_args_compatible(PREFERRED_BAKED_DOCKER_ARGS)["ok"] is True
    run = subprocess.run(
        ["bash", "-c", PREFERRED_BAKED_DOCKER_ARGS],
        cwd=str(REPO / "workers/runpod-blender"),
        capture_output=True,
        text=True,
        timeout=12,
        env={**os.environ, "V7_STARTUP_PROOF": "1", "V7_STARTUP_PROOF_SECONDS": "1"},
    )
    text = f"{run.stdout or ''}\n{run.stderr or ''}"
    assert "IMAGE_PROCESS_STARTED" in text
    assert "NODE_ENTRY_STARTED" in text
    return {"status": run.returncode, "hasImageProcess": True}


def test_pid1_bootstrap() -> dict:
    run = subprocess.run(
        ["sh", str(BOOTSTRAP), "node", "-e", "console.log(JSON.stringify({event:'CHILD'}))"],
        capture_output=True,
        text=True,
        timeout=10,
    )
    text = run.stdout or ""
    assert "BOOTSTRAP_ENTERED" in text
    assert "NODE_AVAILABLE" in text
    assert "CHILD" in text
    assert run.returncode == 0
    return {"status": 0, "stdout": text.splitlines()[:6]}


def _proof_once(seconds: int, run_id: int) -> dict:
    env = {
        **os.environ,
        "V7_STARTUP_PROOF": "1",
        "V7_STARTUP_PROOF_SECONDS": str(seconds + 30),
        "V7_HEALTH_PORT": str(18080 + run_id),
    }
    proc = subprocess.Popen(
        ["node", str(BOOT)],
        cwd=str(REPO / "workers/runpod-blender"),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        env=env,
    )
    lines: list[str] = []

    def drain() -> None:
        if not proc.stdout:
            return
        for line in proc.stdout:
            lines.append(line.rstrip())

    threading.Thread(target=drain, daemon=True).start()
    started = time.time()
    port = 18080 + run_id
    ready = False
    while time.time() - started < 20:
        if any("WORKER_READY" in ln for ln in lines):
            try:
                body = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/ready", timeout=2).read().decode())
                if body.get("ok") is True:
                    ready = True
                    break
            except Exception:
                pass
        if proc.poll() is not None:
            break
        time.sleep(0.2)
    assert ready, "WORKER_READY missing: " + "\n".join(lines[-20:])
    while time.time() - started < seconds:
        assert proc.poll() is None, "worker exited before 180s proof window"
        time.sleep(1)
    assert proc.poll() is None, "worker exited at end of proof window"
    health = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/ready", timeout=2).read().decode())
    assert health.get("ok") is True
    joined = "\n".join(lines)
    assert "R2_CLIENT_STARTED" not in joined
    proc.terminate()
    try:
        proc.wait(timeout=8)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=4)
    return {
        "run": run_id,
        "ready": True,
        "healthOk": True,
        "stayedAliveSeconds": round(time.time() - started, 1),
        "exitAfterTerminate": proc.returncode,
        "markers": [ln for ln in lines if any(k in ln for k in ("NODE_ENTRY", "WORKER_", "IMAGE_PROCESS", "HEARTBEAT"))],
        "blenderInvoked": False,
        "r2Invoked": False,
    }


def test_three_consecutive(seconds: int) -> list[dict]:
    rows = []
    for i in range(1, 4):
        rows.append(_proof_once(seconds, i))
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fast", action="store_true")
    parser.add_argument("--seconds", type=int, default=180)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    broken = test_broken_args_die_under_bash_c()
    file_ok = test_file_args_survive_bash_c()
    pid1 = test_pid1_bootstrap()
    seconds = 2 if args.fast else args.seconds
    runs = test_three_consecutive(seconds)
    row = {
        "schema": "TIVVLEJOY_V7_STARTUP_PROOF_V1",
        "brokenNodeE": broken,
        "fileShapedArgs": file_ok,
        "pid1": pid1,
        "seconds": seconds,
        "threeRuns": runs,
        "blenderInvoked": False,
        "r2Invoked": False,
        "runpodCreate": 0,
        "ok": True,
    }
    (OUT / "STARTUP_PROOF.json").write_text(json.dumps(row, indent=2) + "\n")
    log("startup_proof_done", ok=True, seconds=seconds, runs=len(runs))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
