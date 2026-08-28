"""TivvleJoy cinematic production standards (no Blender import).

These contracts keep a technical-proof profile from being labeled FINAL.
They are reusable for future Pip and Goat episodes.
"""
from __future__ import annotations

from typing import Any

SCHEMA_RECIPE = "TIVVLEJOY_CINEMATIC_WORLD_RECIPE_V1"
SCHEMA_RENDER = "TIVVLEJOY_CINEMATIC_RENDER_STANDARD_V1"
SCHEMA_SHOT = "TIVVLEJOY_CINEMATIC_SHOT_STANDARD_V1"
SCHEMA_GATE = "TIVVLEJOY_CINEMATIC_VISUAL_GATE_V1"
SCHEMA_VISIBLE_USE = "TIVVLEJOY_PURCHASED_ASSET_VISIBLE_USE_V1"
SCHEMA_OUTPUT_MASTER = "TIVVLEJOY_FINAL_OUTPUT_MASTER_V1"

PROFILES = ("BLOCKOUT", "LOOKDEV_FAST", "HERO_STILL", "FINAL")
FINAL_NATIVE_RESOLUTION = "1080x1920"
FINAL_FPS = 30
FINAL_FRAME_COUNT = 900
FINAL_START_FRAME = 1
FINAL_END_FRAME = 900
LOOKDEV_RESOLUTIONS = ("540x960", "720x1280")
BLOCKOUT_RESOLUTIONS = ("270x480", "360x640", "540x960")
HERO_STILL_RESOLUTION = "1080x1920"
HERO_STILL_BIT_DEPTHS = ("16", "16bit", "half", "exr")

MASTER_COLLECTIONS = (
    "WORLD_TERRAIN",
    "WORLD_RIVER",
    "WORLD_VILLAGE",
    "WORLD_FOREST_FOREGROUND",
    "WORLD_FOREST_MIDGROUND",
    "WORLD_FOREST_BACKGROUND",
    "WORLD_MOUNTAINS_HERO",
    "WORLD_MOUNTAINS_BACKGROUND",
    "WORLD_SKY_ATMOSPHERE",
    "WORLD_LIGHTING",
    "WORLD_PROPS",
    "WORLD_CHARACTER_STAGING",
    "WORLD_CAMERAS",
    "WORLD_RENDER_SUPPORT",
)

PROOF_QUALITY_FORBIDDEN_IN_FINAL = (
    "internal_540x960_upscale",
    "lanczos_upscale_to_1080",
    "eevee_12_samples_as_final",
    "target_faces_per_mesh_8000",
    "target_faces_scene_160000",
    "eevee_raytracing_disabled",
    "volumetric_shadows_disabled",
    "cycles_forced_cpu",
    "denoising_disabled",
    "hero_decimation",
    "flat_generated_ground_as_hero",
    "substitute_dark_river_material",
    "rectangular_tree_rows",
    "forest_shadows_disabled",
    "single_wide_camera_drift",
    "atmosphere_defined_but_not_executed",
    "datablock_load_counted_as_visible_use",
)

AUTOMATIC_VISUAL_FAILURES = (
    "flat_lime_or_pale_green_ground",
    "river_reads_as_road_path_or_blue_tape",
    "pale_bush_lumps",
    "rectangular_forest_wall",
    "repeated_tree_rows",
    "obvious_asset_clones",
    "missing_textures",
    "wrong_normal_orm_colorspace",
    "broken_foliage_alpha",
    "neon_foliage_edges",
    "ungrounded_trees_or_props",
    "floating_buildings",
    "roof_tree_intersections",
    "village_as_small_asset_cluster",
    "mountains_as_repeated_stretched_tiles",
    "identical_looking_shots",
    "all_wide_angle_coverage",
    "weak_fg_mg_bg_separation",
    "no_atmospheric_perspective",
    "muddy_or_crushed_lighting",
    "clipped_sky",
    "low_poly_asset_test_appearance",
    "excessive_noise",
    "temporal_denoiser_flicker",
    "excessive_dof_blur",
    "excessive_motion_blur",
    "upscaled_softness",
    "visible_placeholder_fallback_materials",
)


def parse_resolution(value: str) -> tuple[int, int]:
    text = str(value or "").lower().strip()
    width_s, height_s = text.split("x", 1)
    width, height = int(width_s), int(height_s)
    if width <= 0 or height <= 0:
        raise ValueError(f"invalid resolution {value!r}")
    return width, height


def normalize_profile(value: str) -> str:
    profile = str(value or "").strip().upper().replace("-", "_")
    if profile not in PROFILES:
        raise ValueError(f"unknown render profile {value!r}")
    return profile


def is_final_profile(value: str) -> bool:
    return normalize_profile(value) == "FINAL"


def profile_defaults(profile: str) -> dict[str, Any]:
    name = normalize_profile(profile)
    if name == "BLOCKOUT":
        return {
            "schema": SCHEMA_RENDER,
            "profile": name,
            "resolution": "360x640",
            "engine": "BLENDER_EEVEE_NEXT",
            "samples": 8,
            "denoise": False,
            "motionBlur": False,
            "depthOfField": False,
            "rayTracing": False,
            "canLabelFinal": False,
            "allowUpscale": False,
            "imageSequenceRequired": False,
            "masterBitDepth": "8",
            "cyclesDevice": "NONE",
        }
    if name == "LOOKDEV_FAST":
        return {
            "schema": SCHEMA_RENDER,
            "profile": name,
            "resolution": "540x960",
            "engine": "BLENDER_EEVEE_NEXT",
            "samples": 48,
            "denoise": False,
            "motionBlur": False,
            "depthOfField": True,
            "rayTracing": True,
            "canLabelFinal": False,
            "allowUpscale": False,
            "imageSequenceRequired": False,
            "masterBitDepth": "8",
            "cyclesDevice": "NONE",
        }
    if name == "HERO_STILL":
        return {
            "schema": SCHEMA_RENDER,
            "profile": name,
            "resolution": HERO_STILL_RESOLUTION,
            "engine": "CYCLES",
            "samples": 256,
            "denoise": True,
            "motionBlur": False,
            "depthOfField": True,
            "rayTracing": True,
            "canLabelFinal": False,
            "allowUpscale": False,
            "imageSequenceRequired": True,
            "masterBitDepth": "16",
            "cyclesDevice": "GPU",
            "noiseThreshold": 0.02,
        }
    return {
        "schema": SCHEMA_RENDER,
        "profile": "FINAL",
        "resolution": FINAL_NATIVE_RESOLUTION,
        "engine": "CYCLES",
        "samples": 256,
        "denoise": True,
        "motionBlur": True,
        "depthOfField": True,
        "rayTracing": True,
        "canLabelFinal": True,
        "allowUpscale": False,
        "imageSequenceRequired": True,
        "masterBitDepth": "16",
        "cyclesDevice": "GPU",
        "fps": FINAL_FPS,
        "frameCount": FINAL_FRAME_COUNT,
        "shutter": 0.5,
        "noiseThreshold": 0.02,
    }


def assert_final_contract(config: dict[str, Any]) -> None:
    profile = normalize_profile(str(config.get("profile") or "FINAL"))
    if profile != "FINAL":
        if bool(config.get("canLabelFinal")) or str(config.get("label") or "").upper() in {"FINAL", "FINAL_1080P"}:
            raise ValueError("LOOKDEV/BLOCKOUT/HERO_STILL cannot be labeled FINAL")
        return
    resolution = str(config.get("resolution") or "")
    if resolution != FINAL_NATIVE_RESOLUTION:
        raise ValueError(f"FINAL internal resolution must be {FINAL_NATIVE_RESOLUTION}, got {resolution}")
    if bool(config.get("allowUpscale")) or bool(config.get("upscaleStage")):
        raise ValueError("FINAL must not contain an upscale stage")
    if str(config.get("upscaleFilter") or "").lower() == "lanczos":
        raise ValueError("FINAL must not Lanczos-upscale a lower-resolution source")
    engine = str(config.get("engine") or "").upper()
    if "CYCLES" not in engine and not bool(config.get("eeveeFinalApprovedByVisualGate")):
        raise ValueError("FINAL engine must be Cycles GPU unless the visual gate approved an EEVEE A/B")
    device = str(config.get("cyclesDevice") or "GPU").upper()
    if "CYCLES" in engine and device == "CPU" and not bool(config.get("gpuUnavailableProven")):
        raise ValueError("FINAL must not force Cycles CPU when a compatible GPU is available")
    if not bool(config.get("denoise", True)):
        raise ValueError("FINAL requires denoising data passes")
    if not bool(config.get("imageSequenceRequired", True)):
        raise ValueError("FINAL requires a native image sequence before encode")
    bit_depth = str(config.get("masterBitDepth") or "")
    if bit_depth in {"8", "8bit"} and not bool(config.get("exrImpracticalProven")):
        raise ValueError("FINAL master must not be 8-bit when preventable")
    if int(config.get("fps") or FINAL_FPS) != FINAL_FPS:
        raise ValueError("FINAL fps must be 30")
    if int(config.get("frameCount") or FINAL_FRAME_COUNT) != FINAL_FRAME_COUNT:
        raise ValueError("FINAL frame count must be 900")


def assert_no_proof_quality_in_final(flags: dict[str, Any]) -> list[str]:
    hits = [name for name in PROOF_QUALITY_FORBIDDEN_IN_FINAL if flags.get(name)]
    if hits:
        raise ValueError("FINAL path still contains proof-quality compromises: " + ", ".join(hits))
    return hits


def visible_use_record(
    package_id: str,
    *,
    downloaded: bool = False,
    extracted: bool = False,
    datablockLoaded: bool = False,
    renderedPixels: bool = False,
    shotIds: list[str] | None = None,
    evidence: str = "",
) -> dict[str, Any]:
    visible = bool(renderedPixels) and bool(evidence)
    return {
        "schema": SCHEMA_VISIBLE_USE,
        "packageId": package_id,
        "downloaded": bool(downloaded),
        "extracted": bool(extracted),
        "datablockLoaded": bool(datablockLoaded),
        "renderedPixels": bool(renderedPixels),
        "visiblyUsed": visible,
        "shotIds": list(shotIds or []),
        "evidence": evidence,
    }


def require_visual_approval_before_paid_final(receipt: dict[str, Any] | None) -> None:
    if not receipt:
        raise ValueError("visual approval receipt is required before paid FINAL authorization")
    if str(receipt.get("result") or "").upper() != "PASS":
        raise ValueError("visual gate has not passed")
    if not bool(receipt.get("humanApproved")):
        raise ValueError("Justin visual approval is required before paid FINAL")
    if str(receipt.get("recipeIdentity") or "") != str(receipt.get("authorizedRecipeIdentity") or ""):
        raise ValueError("approval receipt identity does not match this recipe")


def ffmpeg_final_args(fps: int = FINAL_FPS) -> list[str]:
    """Native 1080x1920 encode. No scale/Lanczos filter."""
    return [
        "-y",
        "-framerate",
        str(fps),
        "-i",
        "frame_%04d.png",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "17",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
    ]


def ffmpeg_has_upscale(args: list[str]) -> bool:
    blob = " ".join(str(part).lower() for part in args)
    return "scale=" in blob or "lanczos" in blob
