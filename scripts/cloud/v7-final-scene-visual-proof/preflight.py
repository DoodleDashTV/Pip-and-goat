#!/usr/bin/env python3
"""Zero-RunPod preflight for the exact-scene visual proof.

Never creates a pod. Never issues or consumes an authorization.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
PIN = REPO / "config/cloud/scenery-showcase-final-image.json"
AUTH_NAME = "TIVVLEJOY_V7_FINAL_SCENE_VISUAL_PROOF_AUTHORIZATION_V2"
HARD_SPEND_USD = 0.50
HARD_RUNTIME_MINUTES = 40
USD_PER_HOUR = 0.74


def main() -> int:
    pin = json.loads(PIN.read_text()) if PIN.exists() else {}
    digest = str(pin.get("digest") or "")
    ineligible = set(pin.get("ineligibleDigests") or [])
    published = pin.get("status") == "PUBLISHED_IMMUTABLE_DIGEST" and digest.startswith("sha256:") and len(digest) == 71
    cmd = pin.get("cmd") or []
    launchable = (
        published
        and digest not in ineligible
        and cmd == ["node", "./src/scenery-showcase-original14-entry.js"]
        and pin.get("workerEntrypoint") == "scenery-showcase-original14-entry.js"
        and pin.get("runpodContacted") is False
    )
    expected_usd = round((HARD_RUNTIME_MINUTES / 60.0) * USD_PER_HOUR, 4)
    payload = {
        "schema": "TIVVLEJOY_V7_FINAL_SCENE_VISUAL_PROOF_PREFLIGHT_V1",
        "authorizationName": AUTH_NAME,
        "authorizationCreated": False,
        "authorizationConsumed": False,
        "issuable": launchable,
        "image": {
            "status": pin.get("status"),
            "digest": digest or None,
            "cmd": cmd,
            "published": published,
        },
        "jobKind": "VISUAL_PROOF",
        "gpu": "NVIDIA GeForce RTX 4090",
        "hostRamGiB": 24,
        "vramGiB": 24,
        "diskGiB": 60,
        "createCount": 1,
        "retry": False,
        "automaticSecondCreate": False,
        "hardSpendUsd": HARD_SPEND_USD,
        "hardRuntimeMinutes": HARD_RUNTIME_MINUTES,
        "expectedUsdAtCeiling": expected_usd,
        "encode900": False,
        "runpodContacted": False,
        "paidCreate": 0,
    }
    print(json.dumps(payload, indent=2))
    if expected_usd > HARD_SPEND_USD:
        print("SPEND_CEILING_INCONSISTENT", file=sys.stderr)
        return 2
    return 0 if launchable else 2


if __name__ == "__main__":
    raise SystemExit(main())
