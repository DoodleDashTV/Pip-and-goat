#!/usr/bin/env python3
"""Live fail-fast proofs. No Blender. No paid compute. No production mutation."""
from __future__ import annotations

import json
from pathlib import Path

from pipeline_guardrails import (
    REQUIRED_COMPONENT_PROOFS,
    asset_distance_record,
    assert_asset_distance_quality,
    assert_component_proofs,
    assert_hidden_limits_clear,
    assert_no_silent_fallbacks,
    assert_paid_final_ready,
    component_proof_record,
    dependency_audit,
    hidden_limit_audit,
    production_readiness_receipt,
    repair_attempt_decision,
    source_provenance_record,
    worker_parity_audit,
)

ECOKIT_FLORA = Path(
    "/tmp/o14-v4-source/SRC_FOREST_STYLISED_ECOKIT/Stylised EcoKit/Flora_Mat&GN&Models.blend"
)
LEGACY_BLEND_CAP = 180 * 1024 * 1024
CANONICAL_FLORA = 670 * 1024 * 1024


def _catch(fn) -> tuple[bool, str]:
    try:
        fn()
        return False, ""
    except ValueError as exc:
        return True, str(exc)


def prove_hidden_limit() -> dict:
    observed = int(ECOKIT_FLORA.stat().st_size) if ECOKIT_FLORA.exists() else CANONICAL_FLORA
    audit = hidden_limit_audit(
        {"blend_extract_bytes": observed, "ecokit_flora_canonical_bytes": CANONICAL_FLORA},
        {"blend_extract_bytes": LEGACY_BLEND_CAP, "ecokit_flora_canonical_bytes": LEGACY_BLEND_CAP},
        context="lookdev_before_scene_assemble",
    )
    blocked, message = _catch(lambda: assert_hidden_limits_clear(audit))
    return {
        "observedFloraBytes": observed,
        "canonicalFloraBytes": CANONICAL_FLORA,
        "legacyCapBytes": LEGACY_BLEND_CAP,
        "auditOk": audit["ok"],
        "assertRaised": blocked,
        "message": message,
        "expected": "HIDDEN_LIMIT_AUDIT_FAILED",
        "pass": (not audit["ok"]) and blocked and message.startswith("HIDDEN_LIMIT_AUDIT_FAILED"),
    }


def prove_no_hero_fallback() -> dict:
    cases = []
    for name, observed in (
        ("village_trees", "village_tree01"),
        ("ecokit_card_trees", "ecokit_fbx_tree_card"),
        ("forest_nature_proxy", "stylized_forest_nature_kit_fbx"),
        ("fbx_fallback", "tree.fbx"),
        ("obj_fallback", "tree.obj"),
    ):
        record = source_provenance_record(
            "SRC_BOTANIQ_FULL",
            role="hero_vegetation",
            expected_source="botaniq_full-7.2.0",
            observed_source=observed,
            states=["PURCHASED", "LOCATED"],
            hero_required=True,
            fallback_used=True,
            fallback_reason=f"botaniq unavailable substitute {name}",
        )
        cases.append({
            "substitute": name,
            "blockers": record["blockers"],
            "ok": record["ok"],
        })
    fallback_err = _catch(lambda: assert_no_silent_fallbacks([
        {"used": True, "role": "hero_tree", "heroRequired": True, "declared": True, "approved": True, "reason": "botaniq missing"}
    ]))
    bg_ok = True
    try:
        assert_no_silent_fallbacks([
            {"used": True, "role": "background_tree", "heroRequired": False, "declared": True, "approved": True, "reason": "distance-approved LOD"}
        ])
    except ValueError:
        bg_ok = False
    undeclared_bg = _catch(lambda: assert_no_silent_fallbacks([
        {"used": True, "role": "background_tree", "heroRequired": False, "declared": False, "approved": False, "reason": ""}
    ]))
    hero_blocked = all("HERO_FALLBACK_PROHIBITED" in case["blockers"] for case in cases)
    return {
        "substitutes": cases,
        "heroAssert": {"raised": fallback_err[0], "message": fallback_err[1]},
        "declaredBackgroundAllowed": bg_ok,
        "undeclaredBackgroundBlocked": undeclared_bg[0],
        "pass": hero_blocked and fallback_err[0] and bg_ok and undeclared_bg[0],
    }


def prove_distance_classes() -> dict:
    bg_in_hero = asset_distance_record(
        "FOREST_NATURE_CARD",
        role="tree",
        approved_class="BACKGROUND",
        intended_class="HERO",
        evidence="hero crop",
        visible_cards=True,
    )
    tiling = asset_distance_record(
        "VILLAGE_CABIN04A",
        role="building",
        approved_class="MIDGROUND",
        intended_class="HERO",
        evidence="cabin crop",
        obvious_tiling=True,
    )
    placeholder = asset_distance_record(
        "DEFAULT_BSDF",
        role="material",
        approved_class="HERO",
        intended_class="HERO",
        evidence="material crop",
        placeholder_materials=True,
    )
    hero_ok = asset_distance_record(
        "BOTANIQ_WILLOW",
        role="tree",
        approved_class="HERO",
        intended_class="HERO",
        evidence="vegetation crop PASS",
    )
    blocked, message = _catch(lambda: assert_asset_distance_quality([bg_in_hero, tiling, placeholder]))
    return {
        "classes": ["HERO", "MIDGROUND", "BACKGROUND", "REJECT"],
        "backgroundInHeroBlockers": bg_in_hero["blockers"],
        "tilingHeroBlockers": tiling["blockers"],
        "placeholderBlockers": placeholder["blockers"],
        "heroLegalOk": hero_ok["ok"],
        "assertRaised": blocked,
        "message": message,
        "pass": (
            not bg_in_hero["ok"]
            and "VISIBLE_HERO_BILLBOARD_OR_CARD" in bg_in_hero["blockers"]
            and "OBVIOUS_TEXTURE_TILING" in tiling["blockers"]
            and "PLACEHOLDER_MATERIAL_VISIBLE" in placeholder["blockers"]
            and hero_ok["ok"]
            and blocked
        ),
    }


def prove_two_strike() -> dict:
    history = [
        {"issueKey": "riverbank", "mode": "INCREMENTAL", "result": "FAIL"},
        {"issueKey": "riverbank", "mode": "INCREMENTAL", "result": "FAIL"},
    ]
    decision = repair_attempt_decision(history, "riverbank")
    third_not_normal = decision["decision"] == "ROOT_CAUSE_AUDIT_REQUIRED" and not decision["incrementalRepairAllowed"]
    first = repair_attempt_decision([{"issueKey": "water", "mode": "INCREMENTAL", "result": "FAIL"}], "water")
    return {
        "afterTwoRiverbankFails": decision,
        "afterOneWaterFail": first,
        "pass": third_not_normal and first["incrementalRepairAllowed"] is True,
    }


def prove_component_proofs() -> dict:
    existence_only = [
        component_proof_record(name, result="PASS", evidence="", resolution="", phone_size_checked=False)
        for name in REQUIRED_COMPONENT_PROOFS
    ]
    blocked, message = _catch(lambda: assert_component_proofs(existence_only))
    missing = _catch(lambda: assert_component_proofs([]))
    return {
        "required": list(REQUIRED_COMPONENT_PROOFS),
        "objectExistenceRejected": blocked,
        "message": message,
        "missingRejected": missing[0],
        "pass": blocked and missing[0] and "COMPONENT_PROOF_EVIDENCE_MISSING" in message,
    }


def prove_worker_parity() -> dict:
    local = {
        "source_identity": "botaniq+ecokit+louis",
        "blender_version": "4.2.2",
        "render_engine": "CYCLES",
        "shader_identity": "Water_Mat_1/v34_d",
        "texture_identity": "sk2_jpg+botaniq_tex",
        "color_management": "AgX-Base-Contrast",
        "render_profile": "HERO_STILL",
        "output_profile": "1080x1920",
    }
    match = worker_parity_audit(local, dict(local))
    mismatch = worker_parity_audit(local, {**local, "blender_version": "4.1.0", "render_engine": "EEVEE"})
    return {
        "matchOk": match["ok"],
        "mismatchOk": mismatch["ok"],
        "mismatchBlockers": mismatch["blockers"],
        "pass": match["ok"] and (not mismatch["ok"]) and any("blender_version" in b for b in mismatch["blockers"]),
    }


def prove_paid_preflight_fail_closed() -> dict:
    empty = production_readiness_receipt({})
    missing_assert = _catch(lambda: assert_paid_final_ready(empty))
    malformed = _catch(lambda: assert_paid_final_ready({"schema": "WRONG"}))
    technical_only = production_readiness_receipt({
        "sources": [source_provenance_record(
            "SRC_BOTANIQ_FULL",
            role="hero_vegetation",
            expected_source="botaniq_full-7.2.0",
            observed_source="botaniq_full-7.2.0",
            states=[
                "PURCHASED", "LOCATED", "MATERIALIZED", "OPENED_IN_BLENDER",
                "MATERIALS_RESOLVED", "TEXTURES_RESOLVED", "PRODUCTION_USABLE",
            ],
            hero_required=True,
            evidence={"crop": "veg.png"},
        )],
        "hiddenLimitAudit": hidden_limit_audit({"blend_extract_bytes": 100}, {"blend_extract_bytes": 200}),
        "dependencyAudit": dependency_audit({"blender": "4.2.2"}, {"blender": "4.2.2"}),
        "assetQuality": [asset_distance_record("T", role="tree", approved_class="HERO", intended_class="HERO", evidence="e")],
        "componentProofs": [
            component_proof_record(name, result="PASS", evidence=f"{name}.png", resolution="1080x1920", phone_size_checked=True)
            for name in REQUIRED_COMPONENT_PROOFS
        ],
        "fallbacks": [],
        "humanVisualApproved": False,
        "motionTemporalApproved": False,
        "workerParity": worker_parity_audit(
            {k: "x" for k in (
                "source_identity", "blender_version", "render_engine", "shader_identity",
                "texture_identity", "color_management", "render_profile", "output_profile",
            )},
            {k: "x" for k in (
                "source_identity", "blender_version", "render_engine", "shader_identity",
                "texture_identity", "color_management", "render_profile", "output_profile",
            )},
        ),
        "stages": ["TECHNICALLY_VALID"],
    })
    return {
        "emptyReady": empty["productionReady"],
        "emptyPaidAllowed": empty["paidFinalAllowed"],
        "emptyBlockers": empty["blockers"],
        "missingReceiptBlocked": missing_assert[0],
        "malformedBlocked": malformed[0],
        "technicalOnlyReady": technical_only["productionReady"],
        "technicalOnlyBlockers": technical_only["blockers"],
        "pass": (
            empty["productionReady"] is False
            and empty["paidFinalAllowed"] is False
            and missing_assert[0]
            and malformed[0]
            and technical_only["productionReady"] is False
            and "HUMAN_VISUAL_APPROVAL_MISSING" in technical_only["blockers"]
            and "STAGE_MISSING:VISUALLY_VALIDATED" in technical_only["blockers"]
        ),
    }


def main() -> int:
    payload = {
        "schema": "TIVVLEJOY_FAIL_FAST_VERIFY_V1",
        "startingShaRequired": "a865dd5858d711726a25ead44e6f0efe37ff0027",
        "hiddenLimit": prove_hidden_limit(),
        "noSilentHeroFallback": prove_no_hero_fallback(),
        "distanceQuality": prove_distance_classes(),
        "twoStrike": prove_two_strike(),
        "componentProofs": prove_component_proofs(),
        "workerParity": prove_worker_parity(),
        "paidPreflightFailClosed": prove_paid_preflight_fail_closed(),
    }
    payload["allPass"] = all(payload[key]["pass"] for key in (
        "hiddenLimit", "noSilentHeroFallback", "distanceQuality", "twoStrike",
        "componentProofs", "workerParity", "paidPreflightFailClosed",
    ))
    print(json.dumps(payload, indent=2))
    return 0 if payload["allPass"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
