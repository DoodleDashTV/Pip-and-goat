from __future__ import annotations

from typing import Any


def plan_export() -> dict[str, Any]:
    return {
        "productionMasterAllowed": False,
        "status": "BLOCKED_REAL_EXECUTION_REQUIRED",
        "reason": "Export QA cannot mint a PRODUCTION master until CHARACTER_MASTER_GATE passes.",
    }
