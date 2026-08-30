#!/usr/bin/env python3
"""Predict Cycles sync memory from measured per-component peaks.

Zero-bpy. Stores base counts, texture bytes, and known component HWM history.
"""
from __future__ import annotations

from typing import Any

SCHEMA = "TIVVLEJOY_CYCLES_MEMORY_PREDICTOR_V1"


def predict_cycles_sync(
    *,
    component_peaks: dict[str, int],
    parts: list[str],
    base_vertices: int = 0,
    evaluated_vertices: int | None = None,
    texture_bytes: int = 0,
    empty_hwm: int = 0,
    interaction_slack: float = 1.15,
) -> dict[str, Any]:
    chosen = [name for name in parts if name in component_peaks]
    raw = empty_hwm + sum(component_peaks.get(name, 0) for name in chosen)
    # Isolated peaks already include empty process overhead; subtract extras.
    if chosen:
        raw = empty_hwm + sum(max(0, component_peaks[name] - empty_hwm) for name in chosen)
    predicted = int(raw * interaction_slack) if chosen else empty_hwm
    return {
        "schema": SCHEMA,
        "parts": list(parts),
        "componentPeaksUsed": {name: component_peaks[name] for name in chosen},
        "baseVertices": base_vertices,
        "evaluatedVertices": evaluated_vertices,
        "textureBytes": texture_bytes,
        "emptyHwm": empty_hwm,
        "sumIsolatedDeltas": raw - empty_hwm,
        "interactionSlack": interaction_slack,
        "predictedPeak": predicted,
    }
