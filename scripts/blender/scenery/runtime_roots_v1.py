"""Deterministic runtime roots for the cinematic FINAL package.

No /tmp/lookdev defaults. Callers must set TIVVLEJOY_SCENERY_ASSETS_ROOT
(or pass an explicit root). Credentials are never printed.
"""
from __future__ import annotations

import os
from pathlib import Path


ENV_ASSETS = "TIVVLEJOY_SCENERY_ASSETS_ROOT"
ENV_OUTPUT = "TIVVLEJOY_SCENERY_OUTPUT_ROOT"
ENV_SCRIPTS = "TIVVLEJOY_SCENERY_SCRIPTS_ROOT"

FORBIDDEN_ROOT_PREFIXES = (
    "/tmp/o14-lookdev",
    "/tmp/o14-v3-source",
    "/tmp/o14-v4-source",
    "/tmp/lookdev",
)


class RuntimeRootError(FileNotFoundError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def _strip(value: str) -> str:
    return str(value or "").strip()


def assert_not_lookdev_path(path: Path | str) -> Path:
    resolved = Path(path).expanduser()
    text = str(resolved)
    for prefix in FORBIDDEN_ROOT_PREFIXES:
        if text == prefix or text.startswith(prefix + "/"):
            raise RuntimeRootError("LOOKDEV_TMP_PATH_FORBIDDEN", f"lookdev tmp path forbidden: {resolved.name}")
    return resolved


def resolve_assets_root(explicit: str | Path | None = None, env: dict | None = None) -> Path:
    row = env if env is not None else os.environ
    raw = _strip(str(explicit or "")) or _strip(row.get(ENV_ASSETS, ""))
    if not raw:
        raise RuntimeRootError("ASSETS_ROOT_MISSING", f"{ENV_ASSETS} is required")
    root = assert_not_lookdev_path(raw)
    if not root.is_dir():
        raise RuntimeRootError("ASSETS_ROOT_MISSING", f"assets root does not exist ({root.name})")
    return root.resolve()


def resolve_output_root(explicit: str | Path | None = None, env: dict | None = None) -> Path:
    row = env if env is not None else os.environ
    raw = _strip(str(explicit or "")) or _strip(row.get(ENV_OUTPUT, ""))
    if not raw:
        raise RuntimeRootError("OUTPUT_ROOT_MISSING", f"{ENV_OUTPUT} is required")
    root = assert_not_lookdev_path(raw)
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def resolve_scripts_root(explicit: str | Path | None = None, env: dict | None = None) -> Path:
    row = env if env is not None else os.environ
    raw = _strip(str(explicit or "")) or _strip(row.get(ENV_SCRIPTS, ""))
    if raw:
        root = assert_not_lookdev_path(raw)
    else:
        root = Path(__file__).resolve().parent
    if not root.is_dir():
        raise RuntimeRootError("SCRIPTS_ROOT_MISSING", f"scripts root does not exist ({root.name})")
    return root.resolve()


def find_named(root: Path, name: str, *, kind: str = "any") -> Path | None:
    target = str(name)
    for path in Path(root).rglob(target):
        if path.name != target:
            continue
        if kind == "file" and not path.is_file():
            continue
        if kind == "dir" and not path.is_dir():
            continue
        return assert_not_lookdev_path(path)
    return None


def require_named(root: Path, name: str, *, kind: str = "any") -> Path:
    found = find_named(root, name, kind=kind)
    if found is None:
        raise RuntimeRootError("REQUIRED_FILE_MISSING", f"required {kind} missing: {name}")
    return found


def file_receipt(path: Path) -> dict:
    safe = assert_not_lookdev_path(path)
    exists = safe.exists()
    size = int(safe.stat().st_size) if exists and safe.is_file() else (0 if exists else None)
    return {
        "name": safe.name,
        "exists": exists,
        "bytes": size,
        "kind": "dir" if safe.is_dir() else "file",
    }


def require_files(root: Path, names: list[str]) -> list[dict]:
    receipts = []
    missing = []
    for name in names:
        found = find_named(root, name, kind="file")
        if found is None:
            missing.append(name)
            receipts.append({"name": name, "exists": False, "bytes": None, "kind": "file"})
            continue
        receipts.append(file_receipt(found))
    if missing:
        raise RuntimeRootError("REQUIRED_FILE_MISSING", "required files missing: " + ", ".join(missing))
    return receipts
