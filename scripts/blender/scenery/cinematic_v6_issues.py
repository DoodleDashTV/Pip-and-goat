"""V6 two-strike register for recurring V5 failure classes."""
from __future__ import annotations

from pipeline_guardrails import repair_attempt_decision

ISSUE_KEYS = (
    "ISSUE_SHORELINE_HARD_CUT",
    "ISSUE_WATER_DARK_CHEAP",
    "ISSUE_MEADOW_SCATTER_READ",
    "ISSUE_BOTANIQ_STYLE_MISMATCH",
    "ISSUE_LOUIS_APRON_CLIP",
    "ISSUE_HERO_CARD_VISIBILITY",
    "ISSUE_BUILDING_SOURCE_QUALITY",
)

# Prior failed incremental repairs (V2/V3/V5). Same class, two or more strikes.
HISTORY = {
    "ISSUE_SHORELINE_HARD_CUT": (
        {"issueKey": "ISSUE_SHORELINE_HARD_CUT", "mode": "INCREMENTAL", "result": "FAIL", "attempt": "V3 authored bank isoline"},
        {"issueKey": "ISSUE_SHORELINE_HARD_CUT", "mode": "INCREMENTAL", "result": "FAIL", "attempt": "V5 vertex-color wet/olive + denser grid"},
        {"issueKey": "ISSUE_SHORELINE_HARD_CUT", "mode": "INCREMENTAL", "result": "FAIL", "attempt": "V5 earth-to-olive lerp"},
    ),
    "ISSUE_WATER_DARK_CHEAP": (
        {"issueKey": "ISSUE_WATER_DARK_CHEAP", "mode": "INCREMENTAL", "result": "FAIL", "attempt": "V33-V34 IOR lock"},
        {"issueKey": "ISSUE_WATER_DARK_CHEAP", "mode": "INCREMENTAL", "result": "FAIL", "attempt": "V5 surroundings-only beauty"},
    ),
    "ISSUE_MEADOW_SCATTER_READ": (
        {"issueKey": "ISSUE_MEADOW_SCATTER_READ", "mode": "INCREMENTAL", "result": "FAIL", "attempt": "V3 colored biome plane"},
        {"issueKey": "ISSUE_MEADOW_SCATTER_READ", "mode": "INCREMENTAL", "result": "FAIL", "attempt": "V5 Botaniq clump scatter"},
    ),
    "ISSUE_BOTANIQ_STYLE_MISMATCH": (
        {"issueKey": "ISSUE_BOTANIQ_STYLE_MISMATCH", "mode": "INCREMENTAL", "result": "FAIL", "attempt": "V5 name-prefix grade tagged 0"},
        {"issueKey": "ISSUE_BOTANIQ_STYLE_MISMATCH", "mode": "INCREMENTAL", "result": "FAIL", "attempt": "V5 image-name grade still 0 in log"},
    ),
    "ISSUE_LOUIS_APRON_CLIP": (
        {"issueKey": "ISSUE_LOUIS_APRON_CLIP", "mode": "INCREMENTAL", "result": "FAIL", "attempt": "V3 south-Y apron delete"},
        {"issueKey": "ISSUE_LOUIS_APRON_CLIP", "mode": "INCREMENTAL", "result": "FAIL", "attempt": "V5 keep clip; haze not used as cover"},
    ),
    "ISSUE_HERO_CARD_VISIBILITY": (
        {"issueKey": "ISSUE_HERO_CARD_VISIBILITY", "mode": "INCREMENTAL", "result": "FAIL", "attempt": "V3 EcoKit leaf cards"},
        {"issueKey": "ISSUE_HERO_CARD_VISIBILITY", "mode": "INCREMENTAL", "result": "FAIL", "attempt": "V5 willow as closest hero"},
    ),
    "ISSUE_BUILDING_SOURCE_QUALITY": (
        {"issueKey": "ISSUE_BUILDING_SOURCE_QUALITY", "mode": "INCREMENTAL", "result": "FAIL", "attempt": "V3 source maps on Cabin04A"},
        {"issueKey": "ISSUE_BUILDING_SOURCE_QUALITY", "mode": "INCREMENTAL", "result": "FAIL", "attempt": "V5 recede still game-kit"},
    ),
}


def decisions() -> dict[str, dict]:
    return {key: repair_attempt_decision(HISTORY[key], key) for key in ISSUE_KEYS}


def assert_all_root_cause() -> None:
    for key, decision in decisions().items():
        if decision["decision"] != "ROOT_CAUSE_AUDIT_REQUIRED":
            raise AssertionError(f"{key} expected ROOT_CAUSE_AUDIT_REQUIRED, got {decision}")
