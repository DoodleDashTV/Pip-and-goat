#!/usr/bin/env python3
"""Zero-cost tests for the local lookdev large-source intake."""
from __future__ import annotations

import json
import zipfile
from pathlib import Path

from lookdev_large_source_intake import (
    extract_verified_members,
    inspect_zip_integrity,
    lookdev_should_extract_member,
    safe_member_path,
)
from showcase_original14_select import should_extract_member


def test_production_cap_still_blocks_large_blends():
    assert should_extract_member('Flora_Mat&GN&Models.blend', 670 * 1024 * 1024, 'forest_ecokit') is False
    assert lookdev_should_extract_member('Flora_Mat&GN&Models.blend', 670 * 1024 * 1024, 'forest_ecokit') is True


def test_lookdev_refuses_scripts_and_dumps():
    assert lookdev_should_extract_member('addon.py', 1200, 'forest_ecokit') is False
    assert lookdev_should_extract_member('Stylized_Forest_Nature_Kit.obj', 40 * 1024 * 1024, 'forest_nature') is False
    assert lookdev_should_extract_member('../Stylized_Forest_Nature_Kit.blend', 494 * 1024 * 1024, 'forest_nature') is False


def test_safe_member_path_blocks_traversal(tmp_path: Path):
    assert safe_member_path(tmp_path, 'ok/a.blend') is not None
    assert safe_member_path(tmp_path, '../escape.blend') is None
    assert safe_member_path(tmp_path, '/tmp/escape.blend') is None


def test_extract_writes_provenance_and_skips_bad_crc(tmp_path: Path):
    tmp_path.mkdir(parents=True, exist_ok=True)
    zip_path = tmp_path / 'kit.zip'
    with zipfile.ZipFile(zip_path, 'w') as archive:
        archive.writestr('Stylized_Forest_Nature_Kit.blend', b'BLENDER-FAKE' * 1024)
        archive.writestr('addon.py', b'print("no")\n')
    integrity = inspect_zip_integrity(zip_path)
    assert integrity['ok'] is True
    assert integrity['blockedScriptCount'] == 1
    dest = tmp_path / 'out'
    receipt = extract_verified_members(
        zip_path,
        dest,
        ('Stylized_Forest_Nature_Kit.blend', 'addon.py'),
        'SRC_FOREST_MODEL_PACKAGE',
        'forest_nature',
    )
    assert receipt['status'] == 'MATERIALIZED'
    assert receipt['extracted'][0]['member'] == 'Stylized_Forest_Nature_Kit.blend'
    assert receipt['sourceSha256']
    assert receipt['addonEnabled'] is False
    assert any(item['reason'] == 'blocked_extension' for item in receipt['skipped'])
    saved = json.loads((dest / 'receipt.json').read_text(encoding='utf-8'))
    assert saved['licensedBytesCommitted'] is False


def test_bad_zip_fails_integrity(tmp_path: Path):
    tmp_path.mkdir(parents=True, exist_ok=True)
    zip_path = tmp_path / 'bad.zip'
    zip_path.write_bytes(b'not-a-zip')
    assert inspect_zip_integrity(zip_path)['ok'] is False


if __name__ == '__main__':
    from tempfile import TemporaryDirectory
    test_production_cap_still_blocks_large_blends()
    test_lookdev_refuses_scripts_and_dumps()
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        test_safe_member_path_blocks_traversal(root)
        test_extract_writes_provenance_and_skips_bad_crc(root / 'extract')
        test_bad_zip_fails_integrity(root / 'bad')
    print('lookdev_large_source_intake_test PASS')
