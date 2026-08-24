"""TivvleJoy character builder entry point.

Safe defaults:
- dry-run unless the guarded dispatcher passes --execute
- no GPU
- no SOURCE overwrite
- no false PASS
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from animation_tests import plan_animation_suite  # noqa: E402
from audit import inventory_scene  # noqa: E402
from common.bpy_guard import detect_bpy  # noqa: E402
from common.io import ModeError, emit, parse_args, write_report  # noqa: E402
from common.stages import BUILD_STAGES, blocked_stage  # noqa: E402
from controls import plan_controls  # noqa: E402
from correctives import plan_correctives  # noqa: E402
from execute import execute_department  # noqa: E402
from export import plan_export  # noqa: E402
from face import plan_face  # noqa: E402
from intake import inspect_source  # noqa: E402
from quality_gate import evaluate_master_gate  # noqa: E402
from render_tests import plan_render_qa  # noqa: E402
from secondary import plan_secondary  # noqa: E402
from skeleton import plan_skeleton  # noqa: E402
from skinning import initial_bind_policy  # noqa: E402
from visemes import plan_speech  # noqa: E402


def repo_root_from_here() -> Path:
    env_root = os.environ.get("CHARACTER_WORKER_ROOT")
    if env_root:
        return Path(env_root)
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "apps" / "web").is_dir() and (parent / "scripts" / "blender").is_dir():
            return parent
        if (parent / "src" / "character-master.js").is_file() and (parent / "blender" / "characters").is_dir():
            return parent
    return here.parents[3]


def run_dry(args: Any, root: Path) -> dict:  # type: ignore[name-defined]
    intake = inspect_source(root, extra_paths=[args.source_zip] if args.source_zip else None)
    bpy_available = detect_bpy() is not None
    missing = "Real Goat_FINN.zip and explicit --execute are required for live department operations."
    stages = [blocked_stage(stage, missing) for stage in BUILD_STAGES]
    if intake["present"]:
        stages[0] = {
            "stage": "SOURCE_INTAKE",
            "disposition": "CREATED",
            "reason": "Hashed package bytes during dry-run planning.",
            "status": "HASH_LOCKED",
            "simulated": True,
        }
        stages[1] = {
            "stage": "SOURCE_HASH_LOCK",
            "disposition": "CREATED",
            "reason": "Source hash locked during dry-run planning.",
            "status": "HASH_LOCKED",
            "simulated": True,
        }
    gate = evaluate_master_gate(bool(intake["present"]), bpy_available, executed=False)
    reports = {
        "goat_source_audit.json": intake,
        "goat_topology_report.json": {"status": "BLOCKED_REAL_EXECUTION_REQUIRED", "blindDecimateForbidden": True},
        "goat_texture_report.json": {"status": "BLOCKED_REAL_EXECUTION_REQUIRED"},
        "goat_rig_build_report.json": {
            "status": "PLANNED_NOT_EXECUTED",
            "skeleton": plan_skeleton(),
            "controls": plan_controls(),
        },
        "goat_weight_report.json": initial_bind_policy(),
        "goat_face_report.json": plan_face(),
        "goat_viseme_report.json": plan_speech(
            args.character_id,
            "GOAT.SYNTHETIC.VISEME_SWEEP",
            [{"atMs": 0, "phoneme": "REST"}, {"atMs": 80, "phoneme": "AH"}],
        ),
        "goat_deformation_report.json": plan_animation_suite(),
        "goat_animation_validation.json": plan_animation_suite(),
        "goat_performance_report.json": {"status": "BLOCKED_REAL_EXECUTION_REQUIRED"},
        "goat_character_master_gate.json": gate,
    }
    for name, payload in reports.items():
        write_report(args.artifact_dir, name, payload)
    emit(
        "BLOCKED_REAL_EXECUTION_REQUIRED",
        "Character builder dry-run complete. Goat is not production-ready.",
        characterId=args.character_id,
        stages=stages,
        inventory=inventory_scene(),
        secondary=plan_secondary(),
        correctives=plan_correctives(),
        export=plan_export(),
        render=plan_render_qa(),
        gate=gate,
        dryRun=True,
        execute=False,
        gpuRequested=False,
        blenderExecuted=False,
        paidCompute=False,
        goatProductionReady=False,
    )
    return {"status": "BLOCKED", "stages": stages, "gate": gate, "reports": reports, "dryRun": True}


def run(argv: list[str] | None = None) -> dict:
    try:
        args = parse_args(argv)
    except ModeError as error:
        emit("FAIL_CLOSED", str(error), goatProductionReady=False, dryRun=False, execute=False)
        raise
    root = repo_root_from_here()
    if args.execution_mode == "live":
        result = execute_department(args, Path(args.artifact_dir))
        write_report(args.artifact_dir, "goat_character_master_gate.json", result["gate"])
        write_report(args.artifact_dir, "goat_live_department.json", {
            "stages": result["stages"],
            "failedStages": result["failedStages"],
            "workingSha256": result["workingSha256"],
            "objectDelta": result["objectDelta"],
            "shapeKeys": result["shapeKeys"],
            "simulated": False,
        })
        emit(
            result["status"],
            "Character builder live execute complete. Goat is not production-ready.",
            characterId=args.character_id,
            stages=result["stages"],
            gate=result["gate"],
            dryRun=False,
            execute=True,
            gpuRequested=False,
            blenderExecuted=True,
            paidCompute=False,
            goatProductionReady=False,
            workingSha256=result["workingSha256"],
            objectDelta=result["objectDelta"],
            datablocksChanged=result["datablocksChanged"],
        )
        return result
    return run_dry(args, root)


def main() -> int:
    try:
        result = run()
    except ModeError:
        return 2
    except Exception as error:  # noqa: BLE001
        emit("FAIL_CLOSED", str(error), goatProductionReady=False)
        return 1
    if result.get("failedStages"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
