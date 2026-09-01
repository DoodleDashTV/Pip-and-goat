#!/usr/bin/env python3
"""TivvleJoy fail-fast scenery pipeline guardrails.

This module intentionally has no bpy import so the same contracts can run in
CI, local lookdev, Blender workers, and preflight tooling.

Core rule: never silently skip, downgrade, proxy, or substitute a required
hero source. Technical success, visual approval, temporal approval, and worker
parity are separate stages and may not be collapsed into one "ready" flag.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Iterable

SCHEMA_POLICY = "TIVVLEJOY_SCENERY_FAIL_FAST_POLICY_V1"
SCHEMA_SOURCE = "TIVVLEJOY_SOURCE_PROVENANCE_V1"
SCHEMA_LIMIT_AUDIT = "TIVVLEJOY_HIDDEN_LIMIT_AUDIT_V1"
SCHEMA_ASSET_QUALITY = "TIVVLEJOY_ASSET_DISTANCE_QUALITY_V1"
SCHEMA_COMPONENT_PROOF = "TIVVLEJOY_COMPONENT_PROOF_V1"
SCHEMA_DEPENDENCY_AUDIT = "TIVVLEJOY_DEPENDENCY_AUDIT_V1"
SCHEMA_PARITY = "TIVVLEJOY_WORKER_PARITY_V1"
SCHEMA_READINESS = "TIVVLEJOY_PRODUCTION_READINESS_V1"

SOURCE_STATES = (
    "PURCHASED",
    "LOCATED",
    "MATERIALIZED",
    "OPENED_IN_BLENDER",
    "MATERIALS_RESOLVED",
    "TEXTURES_RESOLVED",
    "PRODUCTION_USABLE",
)
DISTANCE_CLASSES = ("HERO", "MIDGROUND", "BACKGROUND", "REJECT")
PRODUCTION_STAGES = (
    "TECHNICALLY_VALID",
    "VISUALLY_VALIDATED",
    "TEMPORALLY_VALIDATED",
    "WORKER_PARITY_VALIDATED",
    "PRODUCTION_READY",
)
REQUIRED_COMPONENT_PROOFS = (
    "vegetation",
    "ground_meadow",
    "water_bank",
    "building",
    "mountain_background",
)
WORKER_PARITY_FIELDS = (
    "source_identity",
    "blender_version",
    "render_engine",
    "shader_identity",
    "texture_identity",
    "color_management",
    "render_profile",
    "output_profile",
)


def _upper(value: Any) -> str:
    return str(value or "").strip().upper()


def source_provenance_record(
    source_id: str,
    *,
    role: str,
    expected_source: str,
    observed_source: str,
    states: Iterable[str],
    hero_required: bool = False,
    fallback_used: bool = False,
    fallback_reason: str = "",
    evidence: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized = {_upper(item) for item in states}
    unknown = sorted(normalized.difference(SOURCE_STATES))
    complete = all(state in normalized for state in SOURCE_STATES)
    source_matches = str(expected_source or "") == str(observed_source or "")
    undeclared_fallback = bool(fallback_used) and not bool(fallback_reason)
    blockers: list[str] = []
    if unknown:
        blockers.append("UNKNOWN_SOURCE_STATE:" + ",".join(unknown))
    if not complete:
        missing = [state for state in SOURCE_STATES if state not in normalized]
        blockers.append("SOURCE_NOT_PRODUCTION_USABLE:" + ",".join(missing))
    if not source_matches:
        blockers.append("SOURCE_IDENTITY_MISMATCH")
    if hero_required and fallback_used:
        blockers.append("HERO_FALLBACK_PROHIBITED")
    if undeclared_fallback:
        blockers.append("UNDECLARED_FALLBACK")
    return {
        "schema": SCHEMA_SOURCE,
        "sourceId": source_id,
        "role": role,
        "expectedSource": expected_source,
        "observedSource": observed_source,
        "states": [state for state in SOURCE_STATES if state in normalized],
        "complete": complete,
        "sourceMatches": source_matches,
        "heroRequired": bool(hero_required),
        "fallbackUsed": bool(fallback_used),
        "fallbackReason": fallback_reason,
        "blockers": blockers,
        "ok": not blockers,
        "evidence": dict(evidence or {}),
    }


def assert_required_sources_ready(records: Iterable[dict[str, Any]]) -> None:
    blockers: list[str] = []
    for record in records:
        if not bool(record.get("ok")):
            source_id = str(record.get("sourceId") or "UNKNOWN")
            for blocker in record.get("blockers") or ["SOURCE_NOT_READY"]:
                blockers.append(f"{source_id}:{blocker}")
    if blockers:
        raise ValueError("SOURCE_PREFLIGHT_FAILED:" + ";".join(blockers))


def hidden_limit_audit(
    requirements: dict[str, int | float],
    limits: dict[str, int | float | None],
    *,
    context: str = "scenery",
) -> dict[str, Any]:
    """Compare real project requirements to configured caps before work begins."""
    checks: list[dict[str, Any]] = []
    blockers: list[str] = []
    for name in sorted(requirements):
        required = float(requirements[name])
        configured = limits.get(name)
        if configured is None:
            checks.append({"name": name, "required": required, "limit": None, "status": "UNBOUNDED_OR_UNKNOWN"})
            continue
        cap = float(configured)
        ok = required <= cap
        checks.append({"name": name, "required": required, "limit": cap, "status": "PASS" if ok else "BLOCKED"})
        if not ok:
            blockers.append(f"LIMIT_TOO_LOW:{name}:{required:g}>{cap:g}")
    return {
        "schema": SCHEMA_LIMIT_AUDIT,
        "context": context,
        "checks": checks,
        "blockers": blockers,
        "ok": not blockers,
    }


def assert_hidden_limits_clear(audit: dict[str, Any]) -> None:
    if not bool(audit.get("ok")):
        raise ValueError("HIDDEN_LIMIT_AUDIT_FAILED:" + ";".join(audit.get("blockers") or []))


def asset_distance_record(
    asset_id: str,
    *,
    role: str,
    approved_class: str,
    intended_class: str,
    evidence: str,
    visible_cards: bool = False,
    obvious_tiling: bool = False,
    placeholder_materials: bool = False,
) -> dict[str, Any]:
    approved = _upper(approved_class)
    intended = _upper(intended_class)
    if approved not in DISTANCE_CLASSES:
        raise ValueError(f"unknown approved distance class {approved_class!r}")
    if intended not in DISTANCE_CLASSES[:-1]:
        raise ValueError(f"unknown intended distance class {intended_class!r}")
    rank = {"HERO": 0, "MIDGROUND": 1, "BACKGROUND": 2, "REJECT": 99}
    blockers: list[str] = []
    if rank[approved] > rank[intended]:
        blockers.append(f"ASSET_DISTANCE_MISMATCH:{approved}_USED_AS_{intended}")
    if intended == "HERO" and visible_cards:
        blockers.append("VISIBLE_HERO_BILLBOARD_OR_CARD")
    if intended in {"HERO", "MIDGROUND"} and obvious_tiling:
        blockers.append("OBVIOUS_TEXTURE_TILING")
    if placeholder_materials:
        blockers.append("PLACEHOLDER_MATERIAL_VISIBLE")
    if not evidence:
        blockers.append("ASSET_QUALITY_EVIDENCE_MISSING")
    return {
        "schema": SCHEMA_ASSET_QUALITY,
        "assetId": asset_id,
        "role": role,
        "approvedClass": approved,
        "intendedClass": intended,
        "visibleCards": bool(visible_cards),
        "obviousTiling": bool(obvious_tiling),
        "placeholderMaterials": bool(placeholder_materials),
        "evidence": evidence,
        "blockers": blockers,
        "ok": not blockers,
    }


def assert_asset_distance_quality(records: Iterable[dict[str, Any]]) -> None:
    blockers: list[str] = []
    for record in records:
        if not bool(record.get("ok")):
            asset_id = str(record.get("assetId") or "UNKNOWN")
            blockers.extend(f"{asset_id}:{x}" for x in record.get("blockers") or ["QUALITY_NOT_APPROVED"])
    if blockers:
        raise ValueError("ASSET_DISTANCE_QUALITY_FAILED:" + ";".join(blockers))


def dependency_audit(required: dict[str, Any], observed: dict[str, Any]) -> dict[str, Any]:
    """Exact dependency parity: Blender, textures, GN/addons, color management, etc."""
    checks: list[dict[str, Any]] = []
    blockers: list[str] = []
    for key in sorted(required):
        expected = required[key]
        actual = observed.get(key)
        ok = actual == expected
        checks.append({"name": key, "required": expected, "observed": actual, "status": "PASS" if ok else "BLOCKED"})
        if not ok:
            blockers.append(f"DEPENDENCY_MISMATCH:{key}")
    return {
        "schema": SCHEMA_DEPENDENCY_AUDIT,
        "checks": checks,
        "blockers": blockers,
        "ok": not blockers,
    }


def component_proof_record(
    component: str,
    *,
    result: str,
    evidence: str,
    resolution: str,
    phone_size_checked: bool,
    notes: str = "",
) -> dict[str, Any]:
    status = _upper(result)
    blockers: list[str] = []
    if status != "PASS":
        blockers.append("COMPONENT_PROOF_FAILED")
    if not evidence:
        blockers.append("COMPONENT_PROOF_EVIDENCE_MISSING")
    if not resolution:
        blockers.append("COMPONENT_PROOF_RESOLUTION_MISSING")
    if not phone_size_checked:
        blockers.append("PHONE_SIZE_CHECK_MISSING")
    return {
        "schema": SCHEMA_COMPONENT_PROOF,
        "component": str(component),
        "result": status,
        "evidence": evidence,
        "resolution": resolution,
        "phoneSizeChecked": bool(phone_size_checked),
        "notes": notes,
        "blockers": blockers,
        "ok": not blockers,
    }


def assert_component_proofs(records: Iterable[dict[str, Any]], required: Iterable[str] = REQUIRED_COMPONENT_PROOFS) -> None:
    by_name = {str(item.get("component") or ""): item for item in records}
    blockers: list[str] = []
    for name in required:
        record = by_name.get(str(name))
        if not record:
            blockers.append(f"MISSING_COMPONENT_PROOF:{name}")
            continue
        if not bool(record.get("ok")):
            blockers.extend(f"{name}:{x}" for x in record.get("blockers") or ["FAILED"])
    if blockers:
        raise ValueError("COMPONENT_PROOFS_FAILED:" + ";".join(blockers))


def assert_no_silent_fallbacks(fallbacks: Iterable[dict[str, Any]]) -> None:
    blockers: list[str] = []
    for item in fallbacks:
        if not bool(item.get("used")):
            continue
        role = str(item.get("role") or item.get("assetId") or "UNKNOWN")
        hero = bool(item.get("heroRequired"))
        declared = bool(item.get("declared")) and bool(item.get("reason"))
        approved = bool(item.get("approved"))
        if hero:
            blockers.append(f"HERO_FALLBACK_PROHIBITED:{role}")
        elif not declared or not approved:
            blockers.append(f"UNAPPROVED_FALLBACK:{role}")
    if blockers:
        raise ValueError("SILENT_FALLBACK_GUARD_FAILED:" + ";".join(blockers))


def repair_attempt_decision(history: Iterable[dict[str, Any]], issue_key: str, max_incremental_attempts: int = 2) -> dict[str, Any]:
    """After two failed incremental repairs, require root-cause work instead."""
    attempts = [item for item in history if str(item.get("issueKey") or "") == str(issue_key)]
    consecutive_failed = 0
    for item in reversed(attempts):
        if _upper(item.get("result")) in {"PASS", "RESOLVED"}:
            break
        if _upper(item.get("mode")) == "ROOT_CAUSE_AUDIT":
            break
        consecutive_failed += 1
    root_required = consecutive_failed >= int(max_incremental_attempts)
    return {
        "issueKey": issue_key,
        "incrementalFailures": consecutive_failed,
        "maxIncrementalAttempts": int(max_incremental_attempts),
        "decision": "ROOT_CAUSE_AUDIT_REQUIRED" if root_required else "INCREMENTAL_REPAIR_ALLOWED",
        "incrementalRepairAllowed": not root_required,
    }


def worker_parity_audit(local: dict[str, Any], worker: dict[str, Any], fields: Iterable[str] = WORKER_PARITY_FIELDS) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    blockers: list[str] = []
    for field in fields:
        expected = local.get(field)
        observed = worker.get(field)
        ok = expected is not None and expected == observed
        checks.append({"field": field, "local": expected, "worker": observed, "status": "PASS" if ok else "BLOCKED"})
        if not ok:
            blockers.append(f"WORKER_PARITY_MISMATCH:{field}")
    return {
        "schema": SCHEMA_PARITY,
        "checks": checks,
        "blockers": blockers,
        "ok": not blockers,
    }


def production_readiness_receipt(payload: dict[str, Any]) -> dict[str, Any]:
    """Build one fail-closed receipt consumed by paid/cloud preflight."""
    blockers: list[str] = []

    sources = list(payload.get("sources") or [])
    if not sources:
        blockers.append("SOURCE_PROVENANCE_MISSING")
    else:
        try:
            assert_required_sources_ready(sources)
        except ValueError as exc:
            blockers.append(str(exc))

    limit_audit = dict(payload.get("hiddenLimitAudit") or {})
    if not limit_audit:
        blockers.append("HIDDEN_LIMIT_AUDIT_MISSING")
    elif not bool(limit_audit.get("ok")):
        blockers.append("HIDDEN_LIMIT_AUDIT_FAILED")

    dependencies = dict(payload.get("dependencyAudit") or {})
    if not dependencies:
        blockers.append("DEPENDENCY_AUDIT_MISSING")
    elif not bool(dependencies.get("ok")):
        blockers.append("DEPENDENCY_AUDIT_FAILED")

    assets = list(payload.get("assetQuality") or [])
    if not assets:
        blockers.append("ASSET_DISTANCE_QUALITY_MISSING")
    else:
        try:
            assert_asset_distance_quality(assets)
        except ValueError as exc:
            blockers.append(str(exc))

    proofs = list(payload.get("componentProofs") or [])
    try:
        assert_component_proofs(proofs)
    except ValueError as exc:
        blockers.append(str(exc))

    fallbacks = list(payload.get("fallbacks") or [])
    try:
        assert_no_silent_fallbacks(fallbacks)
    except ValueError as exc:
        blockers.append(str(exc))

    human_visual = bool(payload.get("humanVisualApproved"))
    temporal = bool(payload.get("motionTemporalApproved"))
    if not human_visual:
        blockers.append("HUMAN_VISUAL_APPROVAL_MISSING")
    if not temporal:
        blockers.append("MOTION_TEMPORAL_APPROVAL_MISSING")

    parity = dict(payload.get("workerParity") or {})
    if not parity:
        blockers.append("WORKER_PARITY_MISSING")
    elif not bool(parity.get("ok")):
        blockers.append("WORKER_PARITY_FAILED")

    stages = {_upper(item) for item in payload.get("stages") or []}
    for stage in PRODUCTION_STAGES[:-1]:
        if stage not in stages:
            blockers.append(f"STAGE_MISSING:{stage}")

    ready = not blockers
    if ready:
        stages.add("PRODUCTION_READY")
    return {
        "schema": SCHEMA_READINESS,
        "policySchema": SCHEMA_POLICY,
        "productionReady": ready,
        "stages": [stage for stage in PRODUCTION_STAGES if stage in stages],
        "sourceCount": len(sources),
        "assetQualityCount": len(assets),
        "componentProofCount": len(proofs),
        "fallbackCount": sum(1 for item in fallbacks if item.get("used")),
        "humanVisualApproved": human_visual,
        "motionTemporalApproved": temporal,
        "workerParityOk": bool(parity.get("ok")) if parity else False,
        "blockers": blockers,
        "paidFinalAllowed": ready,
    }


def assert_paid_final_ready(receipt: dict[str, Any]) -> None:
    if str(receipt.get("schema") or "") != SCHEMA_READINESS:
        raise ValueError("PRODUCTION_READINESS_SCHEMA_INVALID")
    if not bool(receipt.get("productionReady")) or not bool(receipt.get("paidFinalAllowed")):
        raise ValueError("PRODUCTION_NOT_READY:" + ";".join(receipt.get("blockers") or ["UNKNOWN"]))


def _cli() -> int:
    parser = argparse.ArgumentParser(description="Build TivvleJoy fail-fast production-readiness receipt")
    parser.add_argument("--input", required=True, help="JSON payload with source/quality/proof/parity facts")
    parser.add_argument("--output", required=True, help="Receipt JSON output path")
    args = parser.parse_args()
    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    receipt = production_readiness_receipt(payload)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "PRODUCTION_READY" if receipt["productionReady"] else "BLOCKED", "blockers": receipt["blockers"]}))
    return 0 if receipt["productionReady"] else 2


if __name__ == "__main__":
    raise SystemExit(_cli())
