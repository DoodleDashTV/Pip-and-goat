import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from forest_visual_qa_v1 import LOCKED_CAMERA, FEATURE, check_camera_lock


class FakeCameraData:
    def __init__(self, lens):
        self.lens = lens


class FakeCamera:
    def __init__(self, location, lens):
        self.location = location
        self.data = FakeCameraData(lens)


class FakeScene:
    def __init__(self, camera):
        self.objects = {"TJ_VendorReference_Camera": camera}


class ForestVisualQaTest(unittest.TestCase):
    def test_camera_lock_constants(self):
        self.assertEqual(FEATURE, "forest_visual_qa_v1")
        self.assertEqual(LOCKED_CAMERA["location"], (0.0, -12.5, 2.15))
        self.assertEqual(LOCKED_CAMERA["lensMm"], 42.0)

    def test_camera_lock_detects_move(self):
        scene = FakeScene(FakeCamera((0.0, -12.5, 2.15), 42.0))
        self.assertEqual(check_camera_lock(scene), [])
        moved = FakeScene(FakeCamera((1.0, -12.5, 2.15), 42.0))
        self.assertTrue(any(item.startswith("CAMERA_LOCATION_CHANGED") for item in check_camera_lock(moved)))

    def test_inspect_refuses_artistic_pass(self):
        source = Path(__file__).with_name("forest_visual_qa_v1.py").read_text(encoding="utf-8")
        self.assertIn("artisticPassForbidden", source)
        self.assertIn("UNEXPECTED_EMISSION", source)
        self.assertIn("DATA_MAP_NOT_NONCOLOR", source)
        self.assertNotIn("finalClassification\": \"PASS\"", source)
