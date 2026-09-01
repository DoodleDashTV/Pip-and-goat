import importlib.util
import tempfile
import unittest
import zipfile
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("materialize_ecokit_v1.py")
SPEC = importlib.util.spec_from_file_location("materialize_ecokit_v1", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class MaterializeEcoKitTest(unittest.TestCase):
    def test_extracts_every_regular_member(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / "source.zip"
            with zipfile.ZipFile(archive, "w") as target:
                target.writestr("Stylised EcoKit/Flora.blend", b"blend")
                target.writestr("Stylised EcoKit/Textures/leaf.png", b"png")
            receipt = MODULE.extract_all(archive, root / "expanded")
            self.assertEqual(receipt["extractedFileCount"], 2)
            self.assertEqual(receipt["skippedArchiveMembers"], [])
            self.assertTrue((root / "expanded/Stylised EcoKit/Flora.blend").is_file())

    def test_rejects_parent_traversal(self):
        with self.assertRaisesRegex(ValueError, "UNSAFE_ARCHIVE_MEMBER"):
            MODULE.safe_member_path("../escape.blend")

    def test_rejects_absolute_member(self):
        with self.assertRaisesRegex(ValueError, "UNSAFE_ARCHIVE_MEMBER"):
            MODULE.safe_member_path("/tmp/escape.blend")


if __name__ == "__main__":
    unittest.main()
