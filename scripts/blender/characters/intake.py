from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

PACKAGE_NAME = "Goat_FINN.zip"
SOURCE_SLOT = "production-library/characters/goat/SOURCE/Goat_FINN.zip"


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def inspect_source(repo_root: str | Path, extra_paths: list[str] | None = None) -> dict[str, Any]:
    root = Path(repo_root)
    candidates = [
        root / "incoming" / PACKAGE_NAME,
        root / SOURCE_SLOT,
        root / PACKAGE_NAME,
    ]
    for extra in extra_paths or []:
        candidates.append(Path(extra))
    found = next((item for item in candidates if item.is_file()), None)
    if found is None:
        return {
            "packageName": PACKAGE_NAME,
            "present": False,
            "sha256": None,
            "status": "BLOCKED_REAL_EXECUTION_REQUIRED",
            "code": "GOAT_REAL_ASSET_EXECUTION_BLOCKED",
            "nextInputRequired": f"Place the immutable {PACKAGE_NAME} at {SOURCE_SLOT} and rerun SOURCE_INTAKE.",
            "inspectionFaked": False,
            "substitutedPlaceholder": False,
        }
    return {
        "packageName": PACKAGE_NAME,
        "present": True,
        "resolvedPath": str(found),
        "sha256": hash_file(found),
        "byteSize": found.stat().st_size,
        "status": "HASH_LOCKED",
        "inspectionFaked": False,
        "substitutedPlaceholder": False,
        "nextInputRequired": "Create a WORKING conversion copy without overwriting SOURCE.",
    }
