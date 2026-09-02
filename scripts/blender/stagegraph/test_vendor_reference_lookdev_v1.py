import unittest

from vendor_reference_lookdev_v1 import (
    ACTIVE_LOOKDEV,
    CAMERA_LENS_MM,
    CAMERA_LOCATION,
    LOOKDEV_EXPOSURE_REPAIR_V2,
    LOOKDEV_REJECTED_EXPOSURE_V1,
    PLACED_COUNTS,
    SEED,
    SUN_ROTATION_DEG,
    composition_lock,
    lookdev_receipt,
)


class VendorReferenceLookdevTest(unittest.TestCase):
    def test_composition_stays_locked_to_the_rejected_frame(self):
        lock = composition_lock()
        self.assertEqual(lock["seed"], 7301)
        self.assertEqual(lock["seed"], SEED)
        self.assertEqual(lock["cameraLensMm"], 42.0)
        self.assertEqual(lock["cameraLensMm"], CAMERA_LENS_MM)
        self.assertEqual(lock["cameraLocation"], [0.0, -12.5, 2.15])
        self.assertEqual(tuple(lock["cameraLocation"]), CAMERA_LOCATION)
        self.assertEqual(lock["cameraLookAt"], [0.0, 9.5, 2.6])
        self.assertEqual(lock["sunRotationDeg"], [58.0, -8.0, -42.0])
        self.assertEqual(tuple(lock["sunRotationDeg"]), SUN_ROTATION_DEG)
        self.assertEqual(
            lock["placed"],
            {"trees": 14, "grass": 70, "ferns": 28, "bushes": 24, "floral": 16, "fallenLeaves": 65},
        )
        self.assertEqual(lock["placed"], PLACED_COUNTS)

    def test_exposure_repair_lifts_shadows_without_changing_view_transform(self):
        rejected = LOOKDEV_REJECTED_EXPOSURE_V1
        repaired = LOOKDEV_EXPOSURE_REPAIR_V2
        self.assertEqual(ACTIVE_LOOKDEV, repaired)
        self.assertEqual(repaired["viewTransform"], "AgX")
        self.assertGreater(repaired["hdriStrength"], rejected["hdriStrength"])
        self.assertGreater(repaired["exposure"], rejected["exposure"])
        self.assertGreater(repaired["gamma"], rejected["gamma"])
        self.assertGreater(repaired["sunEnergy"], rejected["sunEnergy"])
        self.assertGreater(repaired["fillEnergy"], rejected["fillEnergy"])
        self.assertGreater(repaired["sunColor"][1], rejected["sunColor"][1])
        self.assertGreater(repaired["sunColor"][2], rejected["sunColor"][2])
        self.assertGreater(repaired["groundColor"][1], rejected["groundColor"][1])
        self.assertLess(repaired["atmosphereDensity"], rejected["atmosphereDensity"])
        self.assertTrue(repaired["rimEnabled"])
        self.assertTrue(repaired["bounceEnabled"])
        self.assertFalse(rejected["rimEnabled"])
        self.assertGreater(repaired["diffuseBounces"], rejected["diffuseBounces"])

    def test_receipt_does_not_claim_visual_approval(self):
        receipt = lookdev_receipt()
        self.assertEqual(receipt["lookdevId"], "VENDOR_REFERENCE_LOOKDEV_EXPOSURE_REPAIR_V2")
        self.assertTrue(receipt["compositionLocked"])
        self.assertTrue(receipt["shadowLiftApplied"])
        self.assertTrue(receipt["redCastReduced"])
        self.assertFalse(receipt["vendorBlendSaved"])


if __name__ == "__main__":
    unittest.main()
