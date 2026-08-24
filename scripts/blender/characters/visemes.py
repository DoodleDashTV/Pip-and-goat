from __future__ import annotations

from typing import Any

PRODUCTION_VISEMES = (
    "REST",
    "AI",
    "E",
    "O",
    "U",
    "MBP",
    "FV",
    "L",
    "TH",
    "WQ",
    "CHSH",
    "KG",
    "R",
)

PHONEME_TO_VISEME = {
    "A": "AI",
    "AH": "AI",
    "I": "AI",
    "E": "E",
    "EH": "E",
    "O": "O",
    "U": "U",
    "OO": "U",
    "M": "MBP",
    "B": "MBP",
    "P": "MBP",
    "F": "FV",
    "V": "FV",
    "L": "L",
    "TH": "TH",
    "W": "WQ",
    "Q": "WQ",
    "CH": "CHSH",
    "SH": "CHSH",
    "K": "KG",
    "G": "KG",
    "R": "R",
}


def viseme_for_phoneme(phoneme: str) -> str:
    return PHONEME_TO_VISEME.get(phoneme.upper(), "REST")


def plan_speech(character_id: str, line_id: str, cues: list[dict[str, Any]]) -> dict[str, Any]:
    mapped = [
        {"atMs": cue["atMs"], "viseme": viseme_for_phoneme(str(cue["phoneme"]))}
        for cue in cues
    ]
    return {
        "characterId": character_id,
        "lineId": line_id,
        "cues": mapped,
        "source": "SYNTHETIC_FIXTURE",
        "elevenLabsContacted": False,
        "pretendsAccurateLipSync": False,
        "visemeSet": list(PRODUCTION_VISEMES),
    }
