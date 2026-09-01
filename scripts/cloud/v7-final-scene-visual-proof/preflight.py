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
AUTH_NAME = "TIVVLEJOY_V7_FINAL_SCENE_VISUAL_PROOF_AUTHORIZATION_V4"
PREVIOUS_AUTH_NAME = "TIVVLEJOY_V7_FINAL_SCENE_VISUAL_PROOF_AUTHORIZATION_V3"
V2_AUTH_NAME = "TIVVLEJOY_V7_FINAL_SCENE_VISUAL_PROOF_AUTHORIZATION_V2"
FAILED_CAMERA_DIGEST = "sha256:b176ca65f36290ead95b7e24717751a89cb6e1bb49ea0351d4934f1c3b065bf6"
FAILED_VRAM_DIGEST = "sha256:1807fac1b13db900251c57ad4d5de7b0dab24cee660b31aa94cd9d0c0183498b"
FAILED_EXTRACT_DIGEST = "sha256:fc8a9aaa0f921fb200db959acdc301ea400bd5e2cb421be510c909d6c7cf49ca"
NEXT_AUTH_NAME = AUTH_NAME
AUTH_FILE = REPO / "artifacts/tivvlejoy-scenery-showcase-30s/v7-final-scene-visual-proof-v4/AUTHORIZATION.json"
V2_LEDGER = REPO / "artifacts/tivvlejoy-scenery-showcase-30s/v7-final-scene-visual-proof-v2/consumption-ledger.json"
V3_LEDGER = REPO / "artifacts/tivvlejoy-scenery-showcase-30s/v7-final-scene-visual-proof-v3/consumption-ledger.json"
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
        and digest != FAILED_CAMERA_DIGEST
        and digest != FAILED_VRAM_DIGEST
        and digest != FAILED_EXTRACT_DIGEST
        and FAILED_CAMERA_DIGEST in ineligible
        and FAILED_VRAM_DIGEST in ineligible
        and FAILED_EXTRACT_DIGEST in ineligible
        and pin.get("requiredLibraryFailClosed") is True
        and pin.get("vramFloorMib") == 24500
        and cmd == ["node", "./src/scenery-showcase-original14-entry.js"]
        and pin.get("workerEntrypoint") == "scenery-showcase-original14-entry.js"
        and pin.get("runpodContacted") is False
        and pin.get("waterVariant") == "D"
        and pin.get("cameraContract") == "six-shot-camera-c-lock-v1"
    )
    expected_usd = round((HARD_RUNTIME_MINUTES / 60.0) * USD_PER_HOUR, 4)
    auth = json.loads(AUTH_FILE.read_text()) if AUTH_FILE.exists() else {}
    v2 = json.loads(V2_LEDGER.read_text()) if V2_LEDGER.exists() else {}
    v3 = json.loads(V3_LEDGER.read_text()) if V3_LEDGER.exists() else {}
    v2_consumed = v2.get("authorization") == V2_AUTH_NAME and int(v2.get("createPerformed") or 0) == 1
    v3_consumed = v3.get("authorization") == PREVIOUS_AUTH_NAME and int(v3.get("createPerformed") or 0) == 1
    created = auth.get("name") == AUTH_NAME and str(auth.get("digest") or "") == digest and not auth.get("consumed")
    consumed = auth.get("name") == AUTH_NAME and bool(auth.get("consumed"))
    payload = {
        "schema": "TIVVLEJOY_V7_FINAL_SCENE_VISUAL_PROOF_PREFLIGHT_V1",
        "authorizationName": AUTH_NAME,
        "previousAuthorization": PREVIOUS_AUTH_NAME,
        "nextAuthorizationName": NEXT_AUTH_NAME,
        "authorizationCreated": created,
        "authorizationConsumed": consumed,
        "v2ConsumedFailedAfterCreate": v2_consumed,
        "v3ConsumedFailedAfterCreate": v3_consumed,
        "issuable": launchable and created and not consumed and v2_consumed and v3_consumed,
        "v3AuthorizationSafelyIssuable": False,
        "v4AuthorizationSafelyIssuable": launchable and created and not consumed,
        "v3AuthorizationIssued": False,
        "v4AuthorizationIssued": created,
        "image": {
            "status": pin.get("status"),
            "digest": digest or None,
            "cmd": cmd,
            "published": published,
            "vramFloorMib": pin.get("vramFloorMib"),
            "ineligibleDigests": sorted(ineligible),
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
