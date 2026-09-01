"""Pure fail-closed contract for a TivvleJoy Blender asset audit receipt."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List

SCHEMA = "TIVVLEJOY_STAGEGRAPH_ASSET_AUDIT_V1"
REQUIRED_BLENDER_PREFIX = "4.3."


def _nonempty(value: Any) -> bool:
    return isinstance(value, list) and len(value) > 0


def evaluate_audit(audit: Dict[str, Any]) -> Dict[str, Any]:
    blockers: List[str] = []
    if audit.get("schema") != SCHEMA:
        blockers.append("AUDIT_SCHEMA_INVALID")
    if not str(audit.get("blenderVersion", "")).startswith(REQUIRED_BLENDER_PREFIX):
        blockers.append("BLENDER_VERSION_NOT_4_3_X")
    if not audit.get("sourceId"):
        blockers.append("SOURCE_ID_REQUIRED")
    source_sha = str(audit.get("sourceSha256", "")).removeprefix("sha256:")
    if len(source_sha) != 64 or any(ch not in "0123456789abcdef" for ch in source_sha):
        blockers.append("SOURCE_SHA256_REQUIRED")

    list_checks = {
        "missingImages": "MISSING_IMAGES",
        "missingLibraries": "MISSING_LINKED_LIBRARIES",
        "missingFonts": "MISSING_FONTS",
        "missingMovieClips": "MISSING_MOVIE_CLIPS",
        "missingVolumes": "MISSING_VOLUMES",
        "missingCaches": "MISSING_CACHES",
        "missingNodeGroups": "MISSING_NODE_GROUPS",
        "materialsWithoutOutput": "MATERIAL_OUTPUT_MISSING",
        "skippedArchiveMembers": "ARCHIVE_MEMBER_SKIPPED",
    }
    for field, blocker in list_checks.items():
        if _nonempty(audit.get(field)):
            blockers.append(blocker)

    if audit.get("externalDependenciesMaterialized") is not True:
        blockers.append("EXTERNAL_DEPENDENCIES_NOT_MATERIALIZED")
    if audit.get("colorManagementVerified") is not True:
        blockers.append("COLOR_MANAGEMENT_NOT_VERIFIED")
    if audit.get("geometryNodesVerified") is not True:
        blockers.append("GEOMETRY_NODES_NOT_VERIFIED")
    if audit.get("materialOutputsVerified") is not True:
        blockers.append("MATERIAL_OUTPUTS_NOT_VERIFIED")

    body = {
        "schema": SCHEMA,
        "sourceId": audit.get("sourceId"),
        "sourceSha256": source_sha,
        "status": "PASS" if not blockers else "BLOCKED",
        "blockers": sorted(set(blockers)),
    }
    body["auditSha256"] = hashlib.sha256(
        json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return body
