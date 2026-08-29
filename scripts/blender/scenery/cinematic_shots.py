"""Six-shot TivvleJoy cinematic camera plan (no Blender import)."""
from __future__ import annotations

from cinematic_standards import SCHEMA_SHOT

SHOTS = (
    {
        "id": "SHOT_01",
        "name": "VALLEY_ESTABLISH",
        "start": 1,
        "end": 150,
        "lensMin": 24.0,
        "lensMax": 28.0,
        "purpose": "valley shape, sky, layered mountains, forest, village destination",
        "move": "high_crane_dolly_foreground_parallax",
    },
    {
        "id": "SHOT_02",
        "name": "RIVER_DISCOVERY",
        "start": 151,
        "end": 300,
        "lensMin": 30.0,
        "lensMax": 36.0,
        "purpose": "unmistakable water, reflections, ripples, irregular banks, wet rocks, flora",
        "move": "low_riverbank_dolly",
    },
    {
        "id": "SHOT_03",
        "name": "FOREST_PASSAGE",
        "start": 301,
        "end": 450,
        "lensMin": 45.0,
        "lensMax": 55.0,
        "purpose": "species variation, foreground parallax, midground depth, opening to village",
        "move": "forest_lateral_with_opening",
    },
    {
        "id": "SHOT_04",
        "name": "VILLAGE_REVEAL",
        "start": 451,
        "end": 600,
        "lensMin": 32.0,
        "lensMax": 40.0,
        "purpose": "hero buildings, street/clearing, props, forest and mountain context",
        "move": "path_lead_in_reveal",
    },
    {
        "id": "SHOT_05",
        "name": "MOUNTAIN_COMPRESSION",
        "start": 601,
        "end": 750,
        "lensMin": 60.0,
        "lensMax": 85.0,
        "purpose": "long-lens compression of village/forest, 3DT hero, Louis ridges, atmosphere",
        "move": "locked_long_lens_push",
    },
    {
        "id": "SHOT_06",
        "name": "TIVVLEJOY_HERO_CLOSE",
        "start": 751,
        "end": 900,
        "lensMin": 40.0,
        "lensMax": 55.0,
        "purpose": "river, village, forest, mountains, sky, character staging; settle for title",
        "move": "hero_settle",
    },
)


def shot_by_id(shot_id: str) -> dict:
    for shot in SHOTS:
        if shot["id"] == shot_id:
            return dict(shot)
    raise KeyError(shot_id)


def marker_frames() -> list[int]:
    return [shot["start"] for shot in SHOTS]


def frame_to_shot(frame: int) -> dict:
    for shot in SHOTS:
        if shot["start"] <= int(frame) <= shot["end"]:
            return dict(shot)
    raise ValueError(f"frame {frame} is outside the 1-900 edit")


def camera_name(shot_id: str) -> str:
    return f"TJ_{shot_id}_CAM"


def lookdev_frames() -> list[int]:
    """Two useful frames per shot for the contact sheet."""
    frames: list[int] = []
    for shot in SHOTS:
        frames.append(shot["start"] + 12)
        frames.append(shot["start"] + ((shot["end"] - shot["start"]) // 2))
    return frames


def hero_still_frames() -> dict[str, int]:
    return {
        "SHOT_01": 48,
        "SHOT_02": 210,
        "SHOT_03": 360,
        "SHOT_04": 520,
        "SHOT_05": 680,
        "SHOT_06": 860,
    }


def hero_search_cameras() -> list[dict]:
    """V36: five materially different creek-hero viewpoints. Not SHOT_02 tweaks.

    Creek runs east around y≈-12. Cabin01 sits near (-9.2, -2).
    """
    return [
        {
            "id": "A",
            "name": "three_quarter_downstream",
            "location": (-24.0, -26.0, 7.2),
            "look": (6.0, -10.0, -0.50),
            "lens": 28.0,
            "why": "Moderately elevated 3/4 looking downstream along the bend toward the village.",
        },
        {
            "id": "B",
            "name": "low_upstream_stones",
            "location": (14.0, -16.5, 2.25),
            "look": (-10.0, -10.0, -1.00),
            "lens": 35.0,
            "why": "Low upstream view so water comes toward camera with stones in the foreground.",
        },
        {
            "id": "C",
            "name": "across_creek_opposite_bank",
            "location": (1.4, -19.8, 2.72),
            "look": (-3.6, -10.4, -0.52),
            "lens": 32.0,
            "why": "V37 hero: creek-first diagonal with a thin horizon so mountains stay readable behind the off-axis cabin.",
        },
        {
            "id": "D",
            "name": "elevated_oblique_bed_cabin",
            "location": (-20.0, -32.0, 10.5),
            "look": (-4.0, -8.0, -0.80),
            "lens": 26.0,
            "why": "Elevated oblique so bed, water film, cabin, and valley depth sit in one frame.",
        },
        {
            "id": "E",
            "name": "creek_leading_line_village",
            "location": (-32.0, -22.0, 5.0),
            "look": (-6.0, -6.0, 0.60),
            "lens": 30.0,
            "why": "Creek as a leading line from the west bend toward the cabin/village.",
        },
    ]


def default_shot_cameras() -> list[dict]:
    """Authored 9:16 valley cameras. Distinct purpose, lens, and composition.

    World layout this path assumes:
    - river spline through y≈-12, winding east
    - village street on x≈0 from y≈-4 to y≈12
    - forest clumps on the east/west flanks, mountain corridor |x|<8
    """
    return [
        {
            "id": "SHOT_01",
            "camera": "TJ_SHOT_01_CAM",
            "start": {"location": (12.0, -62.0, 30.0), "look": (0.0, 34.0, 13.0), "lens": 24.0},
            "end": {"location": (9.0, -52.0, 26.0), "look": (0.0, 30.0, 11.0), "lens": 26.0},
        },
        {
            "id": "SHOT_02",
            "camera": "TJ_SHOT_02_CAM",
            # V37: camera C remains authoritative, with a lower sightline and
            # wider lens so the creek leads before the off-axis cabin resolves.
            "retiredV35": {"location": (-6.2, -20.4, 4.45), "look": (9.0, -11.2, -1.16), "lens": 38.0},
            "publishedV37": {"location": (0.2, -23.2, 3.05), "look": (-5.8, -5.2, 0.20), "lens": 34.0},
            "start": {"location": (1.4, -19.8, 2.72), "look": (-3.6, -10.4, -0.52), "lens": 32.0},
            "end": {"location": (2.8, -18.8, 2.82), "look": (-1.8, -9.2, -0.32), "lens": 34.0},
        },
        {
            "id": "SHOT_03",
            "camera": "TJ_SHOT_03_CAM",
            # Stay on the west flank, but look along the tree line toward the
            # village opening instead of over empty north meadow.
            "retiredEmptyMeadow": {"location": (-34.0, 16.0, 5.2), "look": (-14.0, 36.0, 7.2), "lens": 48.0},
            "start": {"location": (-40.0, -8.0, 5.40), "look": (-16.0, 10.0, 4.20), "lens": 48.0},
            "end": {"location": (-37.5, -5.2, 5.60), "look": (-13.6, 12.8, 4.50), "lens": 52.0},
        },
        {
            "id": "SHOT_04",
            "camera": "TJ_SHOT_04_CAM",
            "start": {"location": (1.2, -36.0, 8.2), "look": (0.0, 12.0, 3.0), "lens": 34.0},
            "end": {"location": (0.8, -28.0, 8.6), "look": (0.4, 14.0, 3.2), "lens": 38.0},
        },
        {
            "id": "SHOT_05",
            "camera": "TJ_SHOT_05_CAM",
            "start": {"location": (26.0, -104.0, 18.5), "look": (0.0, 48.0, 14.0), "lens": 70.0},
            "end": {"location": (22.0, -96.0, 19.5), "look": (0.0, 54.0, 15.5), "lens": 78.0},
        },
        {
            "id": "SHOT_06",
            "camera": "TJ_SHOT_06_CAM",
            "start": {"location": (7.2, -32.0, 7.6), "look": (0.0, 9.0, 1.15), "lens": 42.0},
            "end": {"location": (5.8, -26.0, 7.2), "look": (0.0, 8.2, 1.05), "lens": 48.0},
        },
    ]


def assert_shot_plan(shots: tuple | list = SHOTS) -> None:
    if len(shots) != 6:
        raise ValueError("exactly six shots are required")
    expected = [1, 151, 301, 451, 601, 751]
    ends = [150, 300, 450, 600, 750, 900]
    lenses: list[tuple[float, float]] = []
    for i, shot in enumerate(shots):
        if shot["start"] != expected[i] or shot["end"] != ends[i]:
            raise ValueError(f"{shot['id']} has the wrong frame range")
        if shot["lensMax"] <= shot["lensMin"]:
            raise ValueError(f"{shot['id']} lens range is not distinct")
        lenses.append((shot["lensMin"], shot["lensMax"]))
        if shot["end"] < shot["start"]:
            raise ValueError(f"{shot['id']} inverted range")
    if shots[0]["lensMax"] >= 30.0:
        raise ValueError("SHOT_01 must stay wide (24-28)")
    if shots[4]["lensMin"] < 60.0:
        raise ValueError("SHOT_05 must be a long-lens compression shot")
    if len({tuple(item) for item in lenses}) < 5:
        raise ValueError("shot lenses are not distinct enough")


def shot_standard_payload() -> dict:
    assert_shot_plan()
    return {
        "schema": SCHEMA_SHOT,
        "shots": [dict(shot) for shot in SHOTS],
        "cameras": default_shot_cameras(),
        "markers": marker_frames(),
        "lookdevFrames": lookdev_frames(),
        "heroStillFrames": hero_still_frames(),
        "cutsNotInterpolated": True,
    }
