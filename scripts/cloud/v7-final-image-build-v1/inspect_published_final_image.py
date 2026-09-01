#!/usr/bin/env python3
"""Inspect a published FINAL worker digest without nested-shell quoting.

Never contacts RunPod. Parses Blender camera-contract JSON out of mixed logs.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
OUT = REPO / "artifacts/tivvlejoy-scenery-showcase-30s/v7-final-image-build-v1/IMAGE_INSPECT.json"
FAILED_DIGEST = "sha256:b176ca65f36290ead95b7e24717751a89cb6e1bb49ea0351d4934f1c3b065bf6"
FAILED_VRAM_DIGEST = "sha256:1807fac1b13db900251c57ad4d5de7b0dab24cee660b31aa94cd9d0c0183498b"
FAILED_EXTRACT_DIGEST = "sha256:fc8a9aaa0f921fb200db959acdc301ea400bd5e2cb421be510c909d6c7cf49ca"
FAILED_VISUAL_DIGEST = "sha256:b66c0a8e6bc83ef7aeb15dcf2801ec004575fc1bcee7c727cf1956e591635749"
INELIGIBLE_DIGESTS = (FAILED_DIGEST, FAILED_VRAM_DIGEST, FAILED_EXTRACT_DIGEST, FAILED_VISUAL_DIGEST)
REQUIRED_FILES = (
    "./src/scenery-showcase-original14-entry.js",
    "./src/scenery-showcase-original14.js",
    "./src/final-launch-contract-v1.js",
    "./src/frame-checkpoint-v1.js",
    "./src/visual-proof-contract-v1.js",
    "./blender/scenery/cinematic_valley_world_v1.py",
    "./blender/scenery/cinematic_camera_contract_v1.py",
    "./blender/scenery/cinematic_camera_contract_blender_v1.py",
    "./blender/scenery/cinematic_shots.py",
    "./blender/scenery/runtime_roots_v1.py",
    "./blender/scenery/cinematic_required_extract_v1.py",
    "./blender/scenery/cinematic_ecokit_image_resolve_v1.py",
    "./blender/scenery/cinematic_hero_rebuild_v3.py",
    "./blender/scenery/showcase_original14_select.py",
)
REQUIRED_SUBSTRINGS = (
    ("./blender/scenery/cinematic_shots.py", "TJ_SHOT_02_CAM"),
    ("./blender/scenery/cinematic_shots.py", "2.2, -21.4, 3.40"),
    ("./blender/scenery/cinematic_shots.py", "-3.4, -10.2, 1.75"),
    ("./src/scenery-showcase-original14-entry.js", "require('./scenery-showcase-original14.js')"),
    ("./src/visual-proof-contract-v1.js", "TJ_SHOT_02_CAM"),
    ("./src/frame-checkpoint-v1.js", "checkpoint"),
    ("./src/scenery-showcase-original14.js", "--extract-and-verify"),
    ("./src/scenery-showcase-original14.js", "REQUIRED_LIBRARY_MISSING"),
    ("./blender/scenery/cinematic_required_extract_v1.py", "Flora_Mat&GN&Models.blend"),
    ("./blender/scenery/cinematic_required_extract_v1.py", "Rock_Models.blend"),
    ("./blender/scenery/cinematic_required_extract_v1.py", "REQUIRED_TEXTURE_PREFIXES"),
    ("./blender/scenery/cinematic_ecokit_image_resolve_v1.py", "assets library"),
    ("./blender/scenery/cinematic_hero_rebuild_v3.py", "resolve_appended_ecokit_images"),
    ("./blender/scenery/showcase_original14_select.py", "is_required_cinematic_library"),
    ("./src/final-launch-contract-v1.js", "REQUIRED_VRAM_MIB = 24500"),
)
FORBIDDEN_SUBSTRINGS = (
    ("./src/scenery-showcase-original14-entry.js", "scenery-showcase-entry-v2.js"),
    ("./src/scenery-showcase-original14-entry.js", "v7-proof-a-boot.js"),
)
CONTAINS_PY = (
    "from pathlib import Path\n"
    "import sys\n"
    "path, needle, mode = sys.argv[1], sys.argv[2], sys.argv[3]\n"
    "found = needle in Path(path).read_text()\n"
    "if mode == 'require':\n"
    "    raise SystemExit(0 if found else 1)\n"
    "raise SystemExit(0 if not found else 1)\n"
)
REQUIRED_ENV = {
    "TIVVLEJOY_SCENERY_SCRIPTS_ROOT": "/opt/ddp-worker/blender/scenery",
    "SCENERY_SHOWCASE_RENDER_PROFILE": "FINAL",
    "SCENERY_SHOWCASE_BLENDER_TIMEOUT_MINUTES": "1440",
}


def extract_camera_contract(log: str) -> dict:
    found = None
    for line in log.splitlines():
        text = line.strip()
        if not text.startswith("{") or "TJ_SHOT_02_CAM" not in text:
            continue
        try:
            obj = json.loads(text)
        except json.JSONDecodeError:
            continue
        if obj.get("schema") == "TIVVLEJOY_V7_CAMERA_CONTRACT_BLENDER_V1" or obj.get("ok") is True:
            found = obj
    if found is None:
        raise ValueError("CAMERA_CONTRACT_JSON_MISSING_FROM_BLENDER_LOG")
    return found


def _xyz(value) -> list[float]:
    return [round(float(item), 4) for item in value]


def frame210_camera(camera: dict) -> str:
    value = camera.get("frame210")
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return str(value.get("camera") or "")
    return ""


def docker(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["docker", *args], check=check, capture_output=True, text=True)


def image_ref() -> str:
    digest = os.environ["PUBLISHED_DIGEST"]
    if not digest.startswith("sha256:") or len(digest) != 71:
        raise SystemExit("PUBLISHED_DIGEST_INVALID")
    if digest in INELIGIBLE_DIGESTS:
        raise SystemExit("FAILED_VISUAL_PROOF_DIGEST_INELIGIBLE")
    repo = os.environ["IMAGE_REPO"]
    return f"{repo}@{digest}"


def require_file(image: str, path: str) -> None:
    docker("run", "--rm", "--workdir", "/opt/ddp-worker", "--entrypoint", "test", image, "-f", path)


def file_contains(image: str, path: str, pattern: str, *, required: bool) -> None:
    result = docker(
        "run",
        "--rm",
        "--workdir",
        "/opt/ddp-worker",
        "--entrypoint",
        "python3",
        image,
        "-c",
        CONTAINS_PY,
        path,
        pattern,
        "require" if required else "forbid",
        check=False,
    )
    if required and result.returncode != 0:
        raise SystemExit(f"SUBSTRING_MISSING {pattern!r} in {path}: {result.stderr or result.stdout}")
    if not required and result.returncode != 0:
        raise SystemExit(f"FORBIDDEN_PATTERN_PRESENT {pattern!r} in {path}")


def container_env(image: str) -> dict[str, str]:
    result = docker("run", "--rm", "--entrypoint", "printenv", image)
    env: dict[str, str] = {}
    for line in result.stdout.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            env[key] = value
    return env


def inspect_image() -> dict:
    image = image_ref()
    raw = json.loads(docker("image", "inspect", image).stdout)[0]
    cfg = raw.get("Config") or {}
    blender = docker("run", "--rm", "--entrypoint", "blender", image, "--version")
    if "Blender 4.2.2" not in (blender.stdout + blender.stderr):
        raise SystemExit("BLENDER_VERSION_MISMATCH")
    camera_proc = docker(
        "run",
        "--rm",
        "--workdir",
        "/opt/ddp-worker",
        "--entrypoint",
        "blender",
        image,
        "--background",
        "--factory-startup",
        "--python-exit-code",
        "1",
        "--python",
        "./blender/scenery/cinematic_camera_contract_blender_v1.py",
        check=False,
    )
    camera_log = (camera_proc.stdout or "") + "\n" + (camera_proc.stderr or "")
    Path("/tmp/final-camera-contract.log").write_text(camera_log)
    if camera_proc.returncode != 0:
        raise SystemExit(f"BLENDER_CAMERA_CONTRACT_FAILED rc={camera_proc.returncode}\n{camera_log}")
    camera = extract_camera_contract(camera_log)
    print(json.dumps({"blenderCameraContract": camera}, indent=2), flush=True)
    for path in REQUIRED_FILES:
        require_file(image, path)
    for path, pattern in REQUIRED_SUBSTRINGS:
        file_contains(image, path, pattern, required=True)
    for path, pattern in FORBIDDEN_SUBSTRINGS:
        file_contains(image, path, pattern, required=False)
    env = container_env(image)
    for key, value in REQUIRED_ENV.items():
        if env.get(key) != value:
            raise SystemExit(f"ENV_MISMATCH {key}={env.get(key)!r}")
    camera_c = camera.get("cameraC") or {}
    if camera.get("ok") is not True:
        raise SystemExit(f"CAMERA_CONTRACT_NOT_OK {camera}")
    if camera.get("cameras") != [
        "TJ_SHOT_01_CAM",
        "TJ_SHOT_02_CAM",
        "TJ_SHOT_03_CAM",
        "TJ_SHOT_04_CAM",
        "TJ_SHOT_05_CAM",
        "TJ_SHOT_06_CAM",
    ]:
        raise SystemExit(f"SIX_SHOT_CAMERAS_MISSING {camera.get('cameras')}")
    if _xyz(camera_c.get("location") or []) != [2.2, -21.4, 3.4]:
        raise SystemExit(f"CAMERA_C_LOCATION_MISMATCH {camera_c}")
    if _xyz(camera_c.get("look") or []) != [-3.4, -10.2, 1.75]:
        raise SystemExit(f"CAMERA_C_LOOK_MISMATCH {camera_c}")
    if float(camera_c.get("lens") or 0) != 32.0:
        raise SystemExit(f"CAMERA_C_LENS_MISMATCH {camera_c}")
    if frame210_camera(camera) != "TJ_SHOT_02_CAM":
        raise SystemExit(f"FRAME_210_CAMERA_MISMATCH {camera.get('frame210')}")
    if camera.get("v3CompAUsed") is not False:
        raise SystemExit("V3_COMP_A_USED")
    cmd = cfg.get("Cmd") or []
    entry = cfg.get("Entrypoint")
    if cmd != ["node", "./src/scenery-showcase-original14-entry.js"]:
        raise SystemExit(f"CMD_MISMATCH {cmd}")
    if entry != ["/opt/nvidia/nvidia_entrypoint.sh"]:
        raise SystemExit(f"ENTRYPOINT_MISMATCH {entry}")
    if cfg.get("WorkingDir") != "/opt/ddp-worker":
        raise SystemExit(f"WORKDIR_MISMATCH {cfg.get('WorkingDir')}")
    if raw.get("Os") != "linux" or raw.get("Architecture") != "amd64":
        raise SystemExit(f"PLATFORM_MISMATCH {raw.get('Os')}/{raw.get('Architecture')}")
    inspect = {
        "schema": "TIVVLEJOY_SCENERY_SHOWCASE_FINAL_IMAGE_INSPECT_V1",
        "status": "PUBLISHED_IMMUTABLE_DIGEST",
        "digest": os.environ["PUBLISHED_DIGEST"],
        "sourceCommit": os.environ["GITHUB_SHA"],
        "sourceBranch": os.environ.get("GITHUB_REF_NAME") or "",
        "requiredContentAncestor": os.environ.get("REQUIRED_CONTENT_ANCESTOR") or "",
        "parentDigest": os.environ.get("EXPECTED_PARENT_DIGEST") or "",
        "architecture": raw.get("Architecture"),
        "os": raw.get("Os"),
        "platform": f"{raw.get('Os')}/{raw.get('Architecture')}",
        "Entrypoint": entry,
        "Cmd": cmd,
        "WorkingDir": cfg.get("WorkingDir"),
        "blenderVersion": "4.2.2",
        "launcher": "node ./src/scenery-showcase-original14-entry.js",
        "forbiddenCmdsAbsent": True,
        "scriptsRoot": "/opt/ddp-worker/blender/scenery",
        "checkpointModule": True,
        "visualProofModule": True,
        "cameraContractModule": True,
        "sixShotCameraContract": True,
        "cameraCLock": True,
        "blenderCameraContract": {
            "ok": True,
            "frame210": camera.get("frame210"),
            "cameraC": camera.get("cameraC"),
            "v3CompAUsed": False,
            "cameras": camera.get("cameras"),
            "cuts": camera.get("cuts"),
        },
        "failedVisualProofDigestIneligible": FAILED_DIGEST,
        "failedVramDigestIneligible": FAILED_VRAM_DIGEST,
        "failedExtractDigestIneligible": FAILED_EXTRACT_DIGEST,
        "failedVisualDigestIneligible": FAILED_VISUAL_DIGEST,
        "requiredLibraryExtract": True,
        "requiredTextureTreeExtract": True,
        "paidGpuLaunchCount": 0,
        "runpodContacted": False,
        "credentialsIncluded": False,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(inspect, indent=2) + "\n")
    print(json.dumps({"digest": inspect["digest"], "Cmd": inspect["Cmd"], "WorkingDir": inspect["WorkingDir"], "platform": inspect["platform"], "frame210": inspect["blenderCameraContract"]["frame210"]}, indent=2))
    return inspect


if __name__ == "__main__":
    try:
        inspect_image()
    except subprocess.CalledProcessError as exc:
        sys.stderr.write((exc.stderr or exc.stdout or str(exc)) + "\n")
        raise SystemExit(exc.returncode or 1)
