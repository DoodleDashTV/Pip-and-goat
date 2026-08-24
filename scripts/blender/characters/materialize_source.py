"""Dry-run Goat source materialization. Never launches GPU or overwrites SOURCE."""

from __future__ import annotations

import argparse
import json
import sys

EXPECTED_SHA = "f5e85122f5af476e07df58c884b16a9663e05aaeef668f4d218fb7a410162ea5"
OBJECT_KEY = "tivvlejoy-assets/characters/CHAR_GOAT_001/source/Goat_FINN.zip"


def plan() -> dict:
    return {
        "jobKind": "CHARACTER_SOURCE_MATERIALIZE",
        "objectKey": OBJECT_KEY,
        "expectedSha256": EXPECTED_SHA,
        "localSourcePath": "production-library/characters/goat/SOURCE/Goat_FINN.zip",
        "workingBlendPath": "production-library/characters/goat/WORKING/goat_working_4_2_2.blend",
        "verifyHashAfterDownload": True,
        "overwriteSourceForbidden": True,
        "modifyOriginalBlendForbidden": True,
        "fbxIsEquivalentToBlend": False,
        "blenderConversionClaimed": False,
        "launched": False,
        "paid": False,
        "gpuRequested": False,
        "status": "BLOCKED_REAL_EXECUTION_REQUIRED",
        "goatProductionReady": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Dry-run Goat source materialization.")
    parser.add_argument("--dry-run", action="store_true", default=True)
    raw = sys.argv[1:]
    if "--" in raw:
        raw = raw[raw.index("--") + 1 :]
    parser.parse_args(raw)
    payload = plan()
    print(json.dumps({"status": "BLOCKED_REAL_EXECUTION_REQUIRED", "message": "Goat source materialization is dry-run only.", **payload}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
