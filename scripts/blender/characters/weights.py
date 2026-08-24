from __future__ import annotations

from typing import Any

MAX_INFLUENCES = 4
NORMALIZE_EPSILON = 0.02


def diagnose_vertex(vertex: dict[str, Any]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    weights = vertex.get("weights", [])
    total = sum(float(item["value"]) for item in weights)
    index = vertex.get("vertexIndex")
    if not weights or total <= 1e-4:
        findings.append({"code": "UNWEIGHTED_VERTEX", "vertexIndex": index})
        return findings
    if abs(total - 1) > NORMALIZE_EPSILON:
        findings.append({"code": "NON_NORMALIZED", "vertexIndex": index, "total": total})
    if len([item for item in weights if float(item["value"]) > 0.02]) > MAX_INFLUENCES:
        findings.append({"code": "EXCESSIVE_INFLUENCES", "vertexIndex": index})
    side = vertex.get("side")
    groups = [str(item["group"]) for item in weights if float(item["value"]) > 0.15]
    if side == "L" and any(group.endswith(".R") or group.endswith("_R") or "Right" in group for group in groups):
        findings.append({"code": "WRONG_SIDE_CONTAMINATION", "vertexIndex": index})
    if side == "R" and any(group.endswith(".L") or group.endswith("_L") or "Left" in group for group in groups):
        findings.append({"code": "WRONG_SIDE_CONTAMINATION", "vertexIndex": index})
    return findings


def diagnose_vertices(vertices: list[dict[str, Any]]) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for vertex in vertices:
        findings.extend(diagnose_vertex(vertex))
    return findings or [{"code": "OK", "detail": "No weight defects in the supplied sample."}]
