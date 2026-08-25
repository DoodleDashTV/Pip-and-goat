"""Pure, fail-closed checks for an artist-authored Goat rig.

This module deliberately has no bpy dependency so its selection and admission
rules can be regression-tested without launching Blender or paid compute.
"""

from __future__ import annotations

from typing import Any

MIN_BODY_VERTICES = 1_000
MIN_ARMATURE_BONES = 16
MIN_DEFORM_BONES = 10
MIN_CONTROL_SIGNALS = 4
MIN_FACE_SIGNALS = 5
MIN_WEIGHTED_FRACTION = 0.95
MAX_VERTEX_INFLUENCES = 4

CHARACTER_ROLES = {
    "BODY",
    "FUR",
    "HORNS",
    "EARS",
    "COLLAR",
    "TAG",
    "SCARF",
    "EYES",
    "MOUTH",
    "ACCESSORY",
}

_BODY_HINTS = ("goat_body", "goatbody", "char_goat_001_body", "body_geo")
_BODY_EXCLUDES = (
    "eye",
    "mouth",
    "horn",
    "collar",
    "tag",
    "scarf",
    "chain",
    "compass",
    "highlight",
    "hi-light",
    "plane",
)
_SCENE_EXCLUDES = ("plane", "ground", "background", "backdrop", "environment", "hi-light")


def _normalized(value: Any) -> str:
    return str(value or "").strip().lower().replace(" ", "_").replace("-", "_")


def body_candidate_score(candidate: dict[str, Any]) -> int:
    """Score explicit body semantics, never generic first-mesh ordering."""

    name = _normalized(candidate.get("name"))
    role = str(candidate.get("role") or "UNKNOWN").upper()
    vertices = int(candidate.get("vertices") or 0)
    if vertices <= 0 or any(token in name for token in _BODY_EXCLUDES):
        return -1
    score = 0
    if role == "BODY":
        score += 10_000
    if any(token in name for token in _BODY_HINTS):
        score += 20_000
    if "goat" in name and "body" in name:
        score += 20_000
    return score + min(vertices, 9_999)


def select_body_candidate(candidates: list[dict[str, Any]]) -> dict[str, Any]:
    ranked = sorted(
        (
            {**candidate, "score": body_candidate_score(candidate)}
            for candidate in candidates
            if body_candidate_score(candidate) >= 0
        ),
        key=lambda item: (int(item["score"]), int(item.get("vertices") or 0), str(item.get("name") or "")),
        reverse=True,
    )
    explicit = [item for item in ranked if int(item["score"]) >= 10_000]
    if not explicit:
        return {
            "ok": False,
            "code": "GOAT_BODY_MESH_MISSING",
            "selected": None,
            "candidates": ranked,
        }
    top = explicit[0]
    top_tier = int(top["score"]) // 10_000
    tied = [item for item in explicit if int(item["score"]) // 10_000 == top_tier]
    if len(tied) > 1:
        return {
            "ok": False,
            "code": "GOAT_BODY_MESH_AMBIGUOUS",
            "selected": None,
            "candidates": tied,
        }
    return {"ok": True, "code": "OK", "selected": top, "candidates": ranked}


def qa_subject_names(objects: list[dict[str, Any]], body_name: str, armature_name: str | None) -> dict[str, list[str]]:
    """Choose character meshes for framing and hide oversized scene helpers."""

    included: list[str] = []
    excluded: list[str] = []
    body_norm = _normalized(body_name)
    armature_norm = _normalized(armature_name)
    parent_targets = {value for value in (body_norm, armature_norm) if value}
    for item in objects:
        name = str(item.get("name") or "")
        normalized = _normalized(name)
        role = str(item.get("role") or "UNKNOWN").upper()
        extent_ratio = float(item.get("extentRatio") or 1.0)
        related = bool(item.get("rigRelated")) or _normalized(item.get("parent")) in parent_targets
        explicit_character = role in CHARACTER_ROLES or "goat" in normalized or "fur" in normalized
        scene_helper = any(token in normalized for token in _SCENE_EXCLUDES)
        include = normalized == body_norm or (not scene_helper and extent_ratio <= 3.0 and (related or explicit_character))
        (included if include else excluded).append(name)
    return {"included": sorted(set(included)), "excluded": sorted(set(excluded))}


def evaluate_rig_contract(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Evaluate evidence extracted from Blender without modifying the source rig."""

    blockers: list[str] = []
    body_selection = select_body_candidate(list(snapshot.get("bodyCandidates") or []))
    body = dict(snapshot.get("body") or {})
    armature = dict(snapshot.get("armature") or {})

    if not body_selection["ok"]:
        blockers.append(str(body_selection["code"]))
    if int(body.get("vertexCount") or 0) < MIN_BODY_VERTICES:
        blockers.append("GOAT_BODY_TOPOLOGY_TOO_SMALL")

    modifiers = list(body.get("armatureModifiers") or [])
    if not armature or not armature.get("name"):
        blockers.append("ARTIST_ARMATURE_MISSING")
    elif str(armature.get("name")) not in modifiers:
        blockers.append("BODY_ARMATURE_BINDING_MISSING")
    if len(modifiers) != 1:
        blockers.append("BODY_ARMATURE_BINDING_AMBIGUOUS")

    if int(armature.get("boneCount") or 0) < MIN_ARMATURE_BONES:
        blockers.append("ARMATURE_BONE_COUNT_INSUFFICIENT")
    if int(armature.get("deformBoneCount") or 0) < MIN_DEFORM_BONES:
        blockers.append("DEFORM_BONE_COUNT_INSUFFICIENT")
    control_signals = int(armature.get("controlBoneCount") or 0) + int(armature.get("constraintCount") or 0)
    if control_signals < MIN_CONTROL_SIGNALS:
        blockers.append("ANIMATION_CONTROLS_INSUFFICIENT")

    if float(body.get("weightedVertexFraction") or 0.0) < MIN_WEIGHTED_FRACTION:
        blockers.append("BODY_WEIGHT_COVERAGE_INSUFFICIENT")
    if int(body.get("maxInfluences") or 0) > MAX_VERTEX_INFLUENCES:
        blockers.append("BODY_VERTEX_INFLUENCES_EXCESSIVE")
    if int(body.get("vertexGroupCount") or 0) < MIN_DEFORM_BONES:
        blockers.append("BODY_VERTEX_GROUPS_INSUFFICIENT")

    face_signals = int(body.get("faceShapeKeyCount") or 0) + int(armature.get("faceBoneCount") or 0)
    if face_signals < MIN_FACE_SIGNALS:
        blockers.append("FACIAL_CONTROLS_INSUFFICIENT")
    if int(body.get("visemeCount") or 0) < MIN_FACE_SIGNALS:
        blockers.append("LIP_SYNC_CONTROLS_INSUFFICIENT")

    actions = list(snapshot.get("actions") or [])
    if not any(int(action.get("fcurveCount") or 0) > 0 for action in actions):
        blockers.append("TEST_ANIMATION_MISSING")

    required_accessories = {"COLLAR", "TAG"}
    bound_roles = {
        str(item.get("role") or "UNKNOWN").upper()
        for item in list(snapshot.get("accessories") or [])
        if item.get("bound") is True
    }
    for role in sorted(required_accessories - bound_roles):
        blockers.append(f"{role}_BINDING_MISSING")

    unique_blockers = list(dict.fromkeys(blockers))
    return {
        "ok": not unique_blockers,
        "code": "ARTIST_RIG_CONTRACT_OK" if not unique_blockers else "ARTIST_RIG_CONTRACT_FAILED",
        "blockers": unique_blockers,
        "bodySelection": body_selection,
        "sourceMutationAllowed": False,
        "automaticPlaceholderRigAllowed": False,
    }
