import tempfile
import unittest
from pathlib import Path

from materialize_ecokit_dependencies_v1 import create_texture_case_alias, find_unique_key


class _Paginator:
    def __init__(self, pages):
        self.pages = pages

    def paginate(self, **_kwargs):
        return self.pages


class _Client:
    def __init__(self, pages):
        self.pages = pages

    def get_paginator(self, _name):
        return _Paginator(self.pages)


class DependencyMaterializationTests(unittest.TestCase):
    def test_creates_lowercase_alias_without_copying_vendor_textures(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "Textures").mkdir()
            create_texture_case_alias(root)
            self.assertTrue((root / "textures").is_symlink())
            self.assertEqual((root / "textures").resolve(), (root / "Textures").resolve())

    def test_requires_one_owned_hdri_match(self):
        client = _Client([{"Contents": [{"Key": "tivvlejoy-assets/light/tj_hdri_diag_8k.jpg"}]}])
        self.assertEqual(find_unique_key(client, "bucket", "tj_hdri_diag_8k.jpg"), "tivvlejoy-assets/light/tj_hdri_diag_8k.jpg")

    def test_rejects_ambiguous_owned_hdri(self):
        client = _Client([{"Contents": [
            {"Key": "tivvlejoy-assets/a/tj_hdri_diag_8k.jpg"},
            {"Key": "tivvlejoy-assets/b/tj_hdri_diag_8k.jpg"},
        ]}])
        with self.assertRaisesRegex(RuntimeError, "OWNED_HDRI_NOT_UNIQUE"):
            find_unique_key(client, "bucket", "tj_hdri_diag_8k.jpg")


if __name__ == "__main__":
    unittest.main()
