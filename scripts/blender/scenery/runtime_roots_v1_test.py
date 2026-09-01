from __future__ import annotations

from pathlib import Path
import tempfile

from runtime_roots_v1 import (
    RuntimeRootError,
    assert_not_lookdev_path,
    find_named,
    require_files,
    resolve_assets_root,
)


def test_forbids_lookdev_tmp() -> None:
    try:
        assert_not_lookdev_path("/tmp/o14-lookdev/expanded-original14/x")
        raise AssertionError("lookdev path should fail")
    except RuntimeRootError as exc:
        assert exc.code == "LOOKDEV_TMP_PATH_FORBIDDEN"


def test_requires_assets_root() -> None:
    try:
        resolve_assets_root(env={})
        raise AssertionError("missing root should fail")
    except RuntimeRootError as exc:
        assert exc.code == "ASSETS_ROOT_MISSING"


def test_find_and_require_files() -> None:
    with tempfile.TemporaryDirectory() as raw:
        root = Path(raw)
        nested = root / "forest" / "Stylised EcoKit"
        nested.mkdir(parents=True)
        flora = nested / "Flora_Mat&GN&Models.blend"
        flora.write_bytes(b"blend")
        assert find_named(root, "Flora_Mat&GN&Models.blend", kind="file") == flora
        receipts = require_files(root, ["Flora_Mat&GN&Models.blend"])
        assert receipts[0]["bytes"] == 5
        try:
            require_files(root, ["missing.blend"])
            raise AssertionError("missing file should fail")
        except RuntimeRootError as exc:
            assert exc.code == "REQUIRED_FILE_MISSING"


if __name__ == "__main__":
    test_forbids_lookdev_tmp()
    test_requires_assets_root()
    test_find_and_require_files()
    print("runtime_roots_v1_test PASS")
