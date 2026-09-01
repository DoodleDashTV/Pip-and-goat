#!/usr/bin/env python3
"""Visual-proof launcher. CREATE is armed only with --create-authorized-once.

Default invocation stays preflight-only. The paid path fail-closes before
CREATE when the pinned digest cannot keep Camera C and the six shot cameras.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from execute_paid import main as execute_main  # noqa: E402
from preflight import AUTH_NAME, main as preflight_main  # noqa: E402


def main() -> int:
    if "--create-authorized-once" in sys.argv:
        return execute_main()
    code = preflight_main()
    print(json.dumps({
        "event": "visual_proof_create_refused",
        "authorization": AUTH_NAME,
        "reason": "AUTHORIZATION_NOT_ARMED",
        "runpodContacted": False,
        "paidCreate": 0,
    }))
    if "--create" in sys.argv:
        return 3
    return code


if __name__ == "__main__":
    raise SystemExit(main())
