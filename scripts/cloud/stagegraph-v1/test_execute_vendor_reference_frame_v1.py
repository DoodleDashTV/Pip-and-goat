import importlib.util
import json
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
MODULE_PATH = Path(__file__).with_name("execute_vendor_reference_frame_v1.py")
SPEC = importlib.util.spec_from_file_location("execute_vendor_reference_frame_v1", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)

RENDERER_PATH = REPO / "scripts/blender/stagegraph/vendor_reference_render_v1.py"
RENDERER_SPEC = importlib.util.spec_from_file_location("vendor_reference_render_v1", RENDERER_PATH)
RENDERER = importlib.util.module_from_spec(RENDERER_SPEC)
assert RENDERER_SPEC and RENDERER_SPEC.loader
RENDERER_SPEC.loader.exec_module(RENDERER)


class VendorReferenceExecutorTest(unittest.TestCase):
    def test_authorization_core_hash_matches_locked_receipt(self):
        auth = json.loads((REPO / "artifacts/tivvlejoy-stagegraph-v1/VENDOR_REFERENCE_AUTHORIZATION.json").read_text())
        self.assertEqual(MODULE.node_contract_hash(MODULE.authorization_core(auth)), MODULE.AUTH_SHA256)
        self.assertEqual(auth["authorizationSha256"], MODULE.AUTH_SHA256)
        self.assertEqual(auth["scope"], "EXACTLY_ONE_VENDOR_REFERENCE_FRAME")
        self.assertEqual(auth["createCount"], 1)
        self.assertEqual(auth["retryCount"], 0)
        self.assertEqual(auth["maxSpendUsd"], 1)
        self.assertFalse(auth["encodeVideo"])

    def test_contract_accepts_locked_authorization(self):
        auth = json.loads((REPO / "artifacts/tivvlejoy-stagegraph-v1/VENDOR_REFERENCE_AUTHORIZATION.json").read_text())
        source = json.loads((REPO / "artifacts/tivvlejoy-stagegraph-v1/SOURCE_PACK_LOCKED.json").read_text())
        audit = json.loads((REPO / "artifacts/tivvlejoy-stagegraph-v1/DEPENDENCY_AUDIT_PASS.json").read_text())
        authorized = MODULE.node_assert_authorization(auth, source, audit)
        self.assertEqual(
            authorized,
            {"authorized": True, "frames": 1, "retryCount": 0, "encodeVideo": False, "maxSpendUsd": 1},
        )

    def test_renderer_rejects_retry_and_missing_hash(self):
        with self.assertRaisesRegex(RuntimeError, "RETRY_MUST_BE_ZERO"):
            RENDERER.validate_authorization(
                {
                    "actorClass": "HUMAN",
                    "scope": "EXACTLY_ONE_VENDOR_REFERENCE_FRAME",
                    "createCount": 1,
                    "retryCount": 1,
                    "maxSpendUsd": 1,
                    "authorizationSha256": "a" * 64,
                }
            )
        with self.assertRaisesRegex(RuntimeError, "AUTHORIZATION_SHA256_REQUIRED"):
            RENDERER.validate_authorization(
                {
                    "actorClass": "HUMAN",
                    "scope": "EXACTLY_ONE_VENDOR_REFERENCE_FRAME",
                    "createCount": 1,
                    "retryCount": 0,
                    "maxSpendUsd": 1,
                }
            )

    def test_renderer_keeps_verified_hashes_and_gpu_gate(self):
        self.assertEqual(RENDERER.SOURCE_SHA256, MODULE.SOURCE_SHA256)
        self.assertEqual(RENDERER.AUDIT_SHA256, MODULE.AUDIT_SHA256)
        source = RENDERER_PATH.read_text()
        self.assertIn("enable_cycles_gpu", source)
        self.assertIn("CYCLES_UNAVAILABLE", source)
        self.assertIn("visualApproval", source)
        self.assertIn("prepare_ecokit_cycles_alpha", source)
        self.assertIn("remap_backslash_image_paths", source)
        self.assertIn("count_dual_material_outputs", source)

    def test_consumed_auth_and_visual_reject_block_another_create(self):
        consumed = json.loads((REPO / "artifacts/tivvlejoy-stagegraph-v1/VENDOR_REFERENCE_AUTHORIZATION_CONSUMED_V1.json").read_text())
        auth = json.loads((REPO / "artifacts/tivvlejoy-stagegraph-v1/VENDOR_REFERENCE_AUTHORIZATION.json").read_text())
        status = json.loads((REPO / "artifacts/tivvlejoy-stagegraph-v1/STATUS.json").read_text())
        decision = json.loads((REPO / "artifacts/tivvlejoy-stagegraph-v1/VENDOR_REFERENCE_VISUAL_REVIEW_DECISION.json").read_text())
        self.assertTrue(consumed["consumed"])
        self.assertEqual(consumed["authorizationSha256"], "23d6bc4471cd36eb124baab87b673648176333aff57d4a9c0d3e7157ec034c5d")
        self.assertTrue(auth["consumed"])
        self.assertEqual(auth["authorizationSha256"], MODULE.AUTH_SHA256)
        self.assertEqual(auth["requiredBaseSha"], MODULE.REQUIRED_BASE_SHA)
        self.assertFalse(auth["encodeVideo"])
        self.assertFalse(auth["beautyFrame"])
        self.assertFalse(auth["finalRender"])
        self.assertEqual(status["paidCreateCount"], 2)
        self.assertIsNone(status["humanVisualDecision"])
        self.assertFalse(status["freshPaidAuthorizationRequired"])
        self.assertTrue(status["freshVendorReferenceAuthorizationPresent"])
        self.assertTrue(status["rejectedVendorReferenceIneligible"])
        self.assertEqual(status["vendorReferenceImageSha256"], "6f31cb689488813d54608aff0b0c959835204fb54f62e1d2e321d3957827c3b2")
        self.assertNotEqual(status["vendorReferenceImageSha256"], status["rejectedVendorReferenceImageSha256"])
        self.assertEqual(decision["imageSha256"], "a1276acb73ada320240cced525dc9902ff89516da97c019bc87c334a94cce400")
        self.assertFalse(decision["vendorReferenceReproducedApproved"])
        request = json.loads((REPO / "artifacts/tivvlejoy-stagegraph-v1/VENDOR_REFERENCE_AUTHORIZATION_REQUEST.json").read_text())
        self.assertFalse(request["authorized"])
        self.assertFalse(request["createAuthorized"])
        self.assertEqual(request["requestedScope"], "EXACTLY_ONE_VENDOR_REFERENCE_FRAME")
        self.assertEqual(request["retryCount"], 0)
        self.assertFalse(request["encodeVideo"])
        self.assertFalse(request["beautyFrame"])
        self.assertFalse(request["finalRender"])
        self.assertEqual(request["proposedAuthorizationCoreSha256"], auth["authorizationSha256"])
        source = (REPO / "scripts/cloud/stagegraph-v1/execute_vendor_reference_frame_v1.py").read_text()
        self.assertIn("AUTHORIZATION_ALREADY_CONSUMED", source)
        self.assertIn("PAID_CREATE_ALREADY_CONSUMED", source)
        self.assertIn("VENDOR_REFERENCE_VISUALLY_REJECTED", source)
        self.assertIn("FRESH_AUTHORIZATION_REQUIRED_AFTER_VISUAL_REJECTION", source)
        self.assertIn("REJECTED_IMAGE_INELIGIBLE_FOR_REUSE", source)
        self.assertIn("ecokit_cycles_alpha_v1.py", source)
        self.assertIn("VENDOR_REFERENCE_FRAME_REPAIRED.png", source)


if __name__ == "__main__":
    unittest.main()
