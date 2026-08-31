#!/usr/bin/env python3
"""Refuse paid CREATE until the visual-proof authorization is explicitly issued.

This file is the future launch entry. It never contacts RunPod in this pass.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from preflight import AUTH_NAME, main as preflight_main  # noqa: E402


def main() -> int:
    code = preflight_main()
    print(json.dumps({
        "event": "visual_proof_create_refused",
        "authorization": AUTH_NAME,
        "reason": "AUTHORIZATION_NOT_ISSUED",
        "runpodContacted": False,
        "paidCreate": 0,
    }))
    if "--create" in sys.argv:
        return 3
    return code


if __name__ == "__main__":
    raise SystemExit(main())
