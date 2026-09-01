from cinematic_visual_gate_contracts_v1 import evaluate_geometry_gates


def test_geometry_gates() -> None:
    row = evaluate_geometry_gates()
    assert row["identity"]["cameraC"]["matches"] is True
    assert row["identity"]["waterLock"]["ior"] == 1.33
    assert row["E"]["ok"] is True
    assert row["F"]["ok"] is True
    assert row["J"]["ok"] is True
    assert row["ok"] is True
    assert row["pixelSuiteRun"] is False


if __name__ == "__main__":
    test_geometry_gates()
    print("cinematic_visual_gate_contracts_v1_test PASS")
