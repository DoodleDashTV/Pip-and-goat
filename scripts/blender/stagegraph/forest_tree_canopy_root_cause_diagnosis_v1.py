#!/usr/bin/env python3
"""Diagnose why camera-visible EcoKit trees still read as soft clumps.

Builds the same locked scene as the failed interior-sun proof, then writes
object-ID / material / frustum artifacts. Does not repair. Does not start
final video. Does not overwrite the failed beauty proof.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_BLENDER = SCRIPT_DIR.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
if str(REPO_BLENDER) not in sys.path:
    sys.path.insert(0, str(REPO_BLENDER))

from asset_certify_blender_v1 import apply_image_bindings
from ecokit_cycles_alpha_v1 import (
    activate_all_ecokit_cycles_outputs,
    configure_cycles_transparency,
    remap_backslash_image_paths,
)
from forest_botaniq_production_recovery_v1 import apply_botaniq_production_recovery, missing_owned_paths
from forest_camera_ground_cover_v1 import apply_camera_ground_cover
from forest_canopy_lighting_repair_v1 import apply_forest_canopy_lighting_repair
from forest_cinematic_lighting_recovery_v1 import apply_cinematic_lighting_recovery
from forest_ground_detail_recovery_v1 import (
    apply_locked_material_lighting,
    hide_identified_rainbow_specks,
    replace_failed_micro_dressing,
)
from forest_interior_sun_canopy_structure_v1 import apply_interior_sun_canopy_structure
from forest_lookdev_isolation_v1 import verify_production_camera
from forest_tree_canopy_root_cause_diagnosis_v1 import (
    diagnose_scene,
    paint_tree_object_ids,
)
from vendor_reference_lookdev_v1 import apply_cycles_bounce_lift
from vendor_reference_render_v1 import AUDIT_SHA256, SOURCE_SHA256, build_scene


def parse_args():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--source-sha256", default=SOURCE_SHA256)
    parser.add_argument("--dependency-audit-sha256", default=AUDIT_SHA256)
    parser.add_argument("--owned-hdri", required=True)
    parser.add_argument("--image-bindings-json", default="[]")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--samples", type=int, default=4)
    parser.add_argument("--bark-kind", default="tilia")
    parser.add_argument(
        "--id-proof-name",
        default="FOREST_TREE_CANOPY_OBJECT_ID_PROOF_V1.png",
    )
    parser.add_argument(
        "--report-name",
        default="FOREST_TREE_CANOPY_ROOT_CAUSE_DIAGNOSIS_V1.json",
    )
    parser.add_argument(
        "--material-report-name",
        default="FOREST_TREE_CANOPY_MATERIAL_REPORT_V1.json",
    )
    parser.add_argument(
        "--frustum-list-name",
        default="FOREST_TREE_CANOPY_FRUSTUM_LIST_V1.json",
    )
    return parser.parse_args(raw)


def _prepare(args):
    import bpy

    if args.source_sha256.removeprefix("sha256:") != SOURCE_SHA256:
        raise RuntimeError("SOURCE_SHA256_MISMATCH")
    if args.dependency_audit_sha256.removeprefix("sha256:") != AUDIT_SHA256:
        raise RuntimeError("DEPENDENCY_AUDIT_SHA256_MISMATCH")
    missing = missing_owned_paths()
    if missing:
        raise RuntimeError("OWNED_SOURCES_MISSING:" + "|".join(str(item) for item in missing))

    apply_image_bindings(json.loads(args.image_bindings_json))
    remap_backslash_image_paths()
    activate_all_ecokit_cycles_outputs()
    scene, camera, placed, composition = build_scene(args)
    bpy.context.window.scene = scene
    scene.render.engine = "CYCLES"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    # Keep the failed-proof sample/denoise state while diagnosing.
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.cycles.device = "CPU"
    configure_cycles_transparency(scene)
    apply_cycles_bounce_lift(scene)
    production = apply_botaniq_production_recovery(scene, mode="production", bark_kind=args.bark_kind)
    cover = apply_camera_ground_cover(scene)
    apply_locked_material_lighting(scene)
    hidden = hide_identified_rainbow_specks(scene, ("prod_flower",))
    detail = replace_failed_micro_dressing(scene)
    apply_locked_material_lighting(scene)
    locks = verify_production_camera(scene)
    scene.camera = camera
    return {
        "scene": scene,
        "placed": placed,
        "composition": composition,
        "production": production,
        "groundCover": cover,
        "rainbowSpeckObjectsHidden": hidden,
        "groundDetail": detail,
        "productionCamera": locks,
    }


def _write_markdown(path: Path, report: dict) -> None:
    summary = report["summary"]
    lines = [
        "# Forest tree canopy root-cause diagnosis V1",
        "",
        "Diagnosis only. No repair. No final video. No paid work.",
        "",
        f"- executionStatus: `{report['executionStatus']}`",
        f"- visibleTreeObjects: `{summary['visibleTreeObjects']}`",
        f"- treeAssetSources: `{summary['treeAssetSources']}`",
        f"- canopyGeometryType: `{summary['canopyGeometryType']}`",
        f"- heroQualityTreesPresent: `{summary['heroQualityTreesPresent']}`",
        f"- lodOrProxyDetected: `{summary['lodOrProxyDetected']}`",
        f"- leafTexturePaths: `{summary['leafTexturePaths']}`",
        f"- leafTextureResolution: `{summary['leafTextureResolution']}`",
        f"- materialProblemsFound: `{summary['materialProblemsFound']}`",
        f"- lightingBlockersFound: `{summary['lightingBlockersFound']}`",
        f"- denoiseOrSampleBlurRisk: `{summary['denoiseOrSampleBlurRisk']}`",
        f"- whyLeafOverlaysFailed: {summary['whyLeafOverlaysFailed']}",
        f"- whySunDidNotReachTrunks: {summary['whySunDidNotReachTrunks']}",
        f"- bestRepairPath: {summary['bestRepairPath']}",
        f"- finalVideoRenderStarted: `{report['finalVideoRenderStarted']}`",
        f"- paidCreateCount: `{report['paidCreateCount']}`",
        f"- paidSpendUsd: `{report['paidSpendUsd']}`",
        "",
        "Failed beauty proof (unchanged): "
        "`artifacts/tivvlejoy-stagegraph-v1/FOREST_INTERIOR_SUN_CANOPY_STRUCTURE_PROOF_V1.png` "
        "`sha256=8064a223957124fb31370d59219ee1d97904a5c961ecde4c41124d7dd69f797b`.",
        "",
        "Object-ID proof: `artifacts/tivvlejoy-stagegraph-v1/FOREST_TREE_CANOPY_OBJECT_ID_PROOF_V1.png`.",
        "",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    import bpy

    args = parse_args()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    beauty = out_dir / "FOREST_INTERIOR_SUN_CANOPY_STRUCTURE_PROOF_V1.png"
    if args.id_proof_name == beauty.name:
        raise RuntimeError("DIAGNOSIS_MUST_NOT_OVERWRITE_FAILED_BEAUTY_PROOF")

    prepared = _prepare(args)
    scene = prepared["scene"]
    apply_forest_canopy_lighting_repair(scene)
    apply_cinematic_lighting_recovery(scene)
    interior = apply_interior_sun_canopy_structure(scene)

    raw = diagnose_scene(scene)
    summary = raw["summary"]
    report = {
        **raw,
        "executionStatus": "PASS" if summary["visibleTreeObjects"] else "FAIL",
        "sourceId": args.source_id,
        "failedBeautyProof": str(beauty),
        "failedBeautySha256": "8064a223957124fb31370d59219ee1d97904a5c961ecde4c41124d7dd69f797b",
        "interiorCanopyStructure": interior.get("canopyStructure"),
        "visibleTreeObjects": summary["visibleTreeObjects"],
        "treeAssetSources": summary["treeAssetSources"],
        "canopyGeometryType": summary["canopyGeometryType"],
        "heroQualityTreesPresent": summary["heroQualityTreesPresent"],
        "lodOrProxyDetected": summary["lodOrProxyDetected"],
        "leafTexturePaths": summary["leafTexturePaths"],
        "leafTextureResolution": summary["leafTextureResolution"],
        "materialProblemsFound": summary["materialProblemsFound"],
        "lightingBlockersFound": summary["lightingBlockersFound"],
        "denoiseOrSampleBlurRisk": summary["denoiseOrSampleBlurRisk"],
        "whyLeafOverlaysFailed": summary["whyLeafOverlaysFailed"],
        "whySunDidNotReachTrunks": summary["whySunDidNotReachTrunks"],
        "bestRepairPath": summary["bestRepairPath"],
    }

    (out_dir / args.report_name).write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    (out_dir / args.material_report_name).write_text(
        json.dumps(
            {
                "sourceCollections": raw["sourceTreeCollections"],
                "heroCatalog": raw["heroTreeAssets"],
                "vendorPreviews": raw["vendorPreviews"],
                "visibleTrees": [
                    {
                        "name": tree["name"],
                        "class": tree["class"],
                        "sourceCollection": tree["sourceCollection"],
                        "distanceFromCameraM": tree["distanceFromCameraM"],
                        "inFrustum": tree["inFrustum"],
                        "heroQuality": tree["heroQuality"],
                        "heroMidgroundSuitable": tree["heroMidgroundSuitable"],
                        "heroMidgroundSuitableReason": tree["heroMidgroundSuitableReason"],
                        "tooCloseForAssetQuality": tree["tooCloseForAssetQuality"],
                        "geometryType": tree["geometryType"],
                        "canopyMeshes": tree["canopyMeshes"],
                        "materials": tree["materials"],
                    }
                    for tree in raw["placedTrees"]
                    if tree["class"] != "background"
                ],
                "overlays": raw["overlays"],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (out_dir / args.frustum_list_name).write_text(
        json.dumps(
            {
                "camera": raw["productionCamera"],
                "visibleTrees": raw["placedTrees"],
                "overlays": raw["overlays"],
                "rayHits": raw["cameraRayHits"],
                "sunOcclusion": raw["sunOcclusion"],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    _write_markdown(
        Path(__file__).resolve().parents[3] / "reports" / "nightshift" / "FOREST_TREE_CANOPY_ROOT_CAUSE_DIAGNOSIS_V1.md",
        report,
    )

    id_paint = paint_tree_object_ids(scene, raw["placedTrees"])
    report["objectIdLegend"] = id_paint
    (out_dir / args.report_name).write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )

    scene.render.engine = "CYCLES"
    scene.cycles.samples = max(int(args.samples), 2)
    scene.cycles.use_denoising = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    dest = out_dir / args.id_proof_name
    if dest.exists():
        dest.unlink()
    scene.render.filepath = str(dest)
    bpy.ops.render.render(write_still=True)
    if not dest.is_file():
        raise RuntimeError("OBJECT_ID_PROOF_MISSING:" + dest.name)
    print(json.dumps({
        "schema": report["schema"],
        "executionStatus": report["executionStatus"],
        "idProof": str(dest),
        "visibleTreeObjects": report["visibleTreeObjects"],
        "heroQualityTreesPresent": report["heroQualityTreesPresent"],
        "lodOrProxyDetected": report["lodOrProxyDetected"],
        "finalVideoRenderStarted": False,
        "paidCreateCount": 0,
        "paidSpendUsd": 0,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
