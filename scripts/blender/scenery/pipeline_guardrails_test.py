#!/usr/bin/env python3
from __future__ import annotations

from pipeline_guardrails import (
    REQUIRED_COMPONENT_PROOFS,
    asset_distance_record,
    assert_asset_distance_quality,
    assert_hidden_limits_clear,
    assert_no_silent_fallbacks,
    component_proof_record,
    dependency_audit,
    hidden_limit_audit,
    production_readiness_receipt,
    repair_attempt_decision,
    source_provenance_record,
    worker_parity_audit,
)


def _full_source(source_id: str = "SRC_BOTANIQ") -> dict:
    return source_provenance_record(
        source_id,
        role="hero_vegetation",
        expected_source="botaniq_full-7.2.0",
        observed_source="botaniq_full-7.2.0",
        states=[
            "PURCHASED",
            "LOCATED",
            "MATERIALIZED",
            "OPENED_IN_BLENDER",
            "MATERIALS_RESOLVED",
            "TEXTURES_RESOLVED",
            "PRODUCTION_USABLE",
        ],
        hero_required=True,
        evidence={"crop": "vegetation.png"},
    )


def test_source_provenance_is_fail_closed():
    good = _full_source()
    assert good["ok"] is True
    bad = source_provenance_record(
        "SRC_TREE",
        role="hero_tree",
        expected_source="botaniq",
        observed_source="proxy_fbx",
        states=["PURCHASED", "LOCATED"],
        hero_required=True,
        fallback_used=True,
        fallback_reason="large source skipped",
    )
    assert bad["ok"] is False
    assert "SOURCE_IDENTITY_MISMATCH" in bad["blockers"]
    assert "HERO_FALLBACK_PROHIBITED" in bad["blockers"]


def test_hidden_limit_audit_catches_180mb_problem():
    audit = hidden_limit_audit(
        {"blend_extract_bytes": 670 * 1024 * 1024},
        {"blend_extract_bytes": 180 * 1024 * 1024},
    )
    assert audit["ok"] is False
    assert audit["blockers"]
    try:
        assert_hidden_limits_clear(audit)
        raise AssertionError("expected hidden-limit blocker")
    except ValueError:
        pass


def test_distance_quality_stops_background_asset_in_hero():
    bad = asset_distance_record(
        "TREE_CARD",
        role="tree",
        approved_class="BACKGROUND",
        intended_class="HERO",
        evidence="hero crop",
        visible_cards=True,
    )
    assert bad["ok"] is False
    try:
        assert_asset_distance_quality([bad])
        raise AssertionError("expected distance mismatch")
    except ValueError:
        pass


def test_no_silent_or_hero_fallbacks():
    try:
        assert_no_silent_fallbacks([
            {"used": True, "role": "hero_tree", "heroRequired": True, "declared": True, "approved": True, "reason": "source unavailable"}
        ])
        raise AssertionError("hero fallback must fail")
    except ValueError:
        pass
    assert_no_silent_fallbacks([
        {"used": True, "role": "background_tree", "heroRequired": False, "declared": True, "approved": True, "reason": "distance-approved LOD"}
    ])


def test_two_failed_repairs_force_root_cause_audit():
    history = [
        {"issueKey": "riverbank", "mode": "INCREMENTAL", "result": "FAIL"},
        {"issueKey": "riverbank", "mode": "INCREMENTAL", "result": "PARTIAL"},
    ]
    decision = repair_attempt_decision(history, "riverbank")
    assert decision["decision"] == "ROOT_CAUSE_AUDIT_REQUIRED"
    assert decision["incrementalRepairAllowed"] is False


def test_worker_parity_requires_exact_identity():
    local = {field: "same" for field in (
        "source_identity", "blender_version", "render_engine", "shader_identity",
        "texture_identity", "color_management", "render_profile", "output_profile",
    )}
    worker = dict(local)
    parity = worker_parity_audit(local, worker)
    assert parity["ok"] is True
    worker["blender_version"] = "different"
    assert worker_parity_audit(local, worker)["ok"] is False


def test_full_readiness_requires_every_gate():
    source = _full_source()
    limit = hidden_limit_audit({"blend_extract_bytes": 100}, {"blend_extract_bytes": 200})
    dep = dependency_audit({"blender": "4.2.2"}, {"blender": "4.2.2"})
    asset = asset_distance_record(
        "BOTANIQ_TREE",
        role="tree",
        approved_class="HERO",
        intended_class="HERO",
        evidence="hero crop pass",
    )
    proofs = [
        component_proof_record(
            component,
            result="PASS",
            evidence=f"{component}.png",
            resolution="1080x1920",
            phone_size_checked=True,
        )
        for component in REQUIRED_COMPONENT_PROOFS
    ]
    parity_values = {
        "source_identity": "abc",
        "blender_version": "4.2.2",
        "render_engine": "CYCLES",
        "shader_identity": "shader-v1",
        "texture_identity": "textures-v1",
        "color_management": "AgX",
        "render_profile": "FINAL",
        "output_profile": "1080x1920@30",
    }
    parity = worker_parity_audit(parity_values, parity_values)
    receipt = production_readiness_receipt({
        "sources": [source],
        "hiddenLimitAudit": limit,
        "dependencyAudit": dep,
        "assetQuality": [asset],
        "componentProofs": proofs,
        "fallbacks": [],
        "humanVisualApproved": True,
        "motionTemporalApproved": True,
        "workerParity": parity,
        "stages": [
            "TECHNICALLY_VALID",
            "VISUALLY_VALIDATED",
            "TEMPORALLY_VALIDATED",
            "WORKER_PARITY_VALIDATED",
        ],
    })
    assert receipt["productionReady"] is True
    assert receipt["paidFinalAllowed"] is True


if __name__ == "__main__":
    test_source_provenance_is_fail_closed()
    test_hidden_limit_audit_catches_180mb_problem()
    test_distance_quality_stops_background_asset_in_hero()
    test_no_silent_or_hero_fallbacks()
    test_two_failed_repairs_force_root_cause_audit()
    test_worker_parity_requires_exact_identity()
    test_full_readiness_requires_every_gate()
    print("pipeline_guardrails_test PASS")
