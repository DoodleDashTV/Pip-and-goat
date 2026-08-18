import type { CatalogAsset } from './catalog';
import { catalogById, type AssetCatalog } from './catalog';
import type { SceneryRecipe } from './recipes';
import type { PlannedPlacement, ScenePlan, Vec3 } from './planner';
import type { ValidationFinding } from './catalog';

function overlaps2d(
  a: { minX: number; maxX: number; minZ: number; maxZ: number },
  b: { minX: number; maxX: number; minZ: number; maxZ: number },
  pad = 0,
): boolean {
  return a.minX < b.maxX - pad && a.maxX > b.minX + pad && a.minZ < b.maxZ - pad && a.maxZ > b.minZ + pad;
}

function placementBounds(placement: PlannedPlacement, asset: CatalogAsset) {
  const hx = (asset.dimensionsMeters.x * placement.scale) / 2;
  const hz = (asset.dimensionsMeters.z * placement.scale) / 2;
  return {
    minX: placement.position.x - hx,
    maxX: placement.position.x + hx,
    minY: placement.position.y,
    maxY: placement.position.y + asset.dimensionsMeters.y * placement.scale,
    minZ: placement.position.z - hz,
    maxZ: placement.position.z + hz,
  };
}

function insideBox(point: Vec3, box: SceneryRecipe['characterPerformanceZone']): boolean {
  return (
    point.x >= box.minX &&
    point.x <= box.maxX &&
    point.y >= box.minY &&
    point.y <= box.maxY &&
    point.z >= box.minZ &&
    point.z <= box.maxZ
  );
}

const FACE_BAND = { minY: 0.9, maxY: 1.85 };

export function evaluateComposition(
  plan: ScenePlan,
  catalog: AssetCatalog,
  recipe: SceneryRecipe,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const byId = catalogById(catalog);
  const blocking = plan.placements.filter((item) => !['path', 'sky', 'hdri', 'grass', 'flower', 'butterfly', 'firefly'].includes(item.role));

  const hasCabin = plan.placements.some((item) => item.role === 'cabin');
  const hasPath = plan.placements.some((item) => item.role === 'path');
  const layers = new Set(plan.placements.map((item) => item.layer));
  if (recipe.requiredRoles.includes('cabin') && !hasCabin) {
    findings.push({
      code: 'MISSING_FOCAL_POINT',
      severity: 'error',
      message: 'Recipe requires a cabin focal point.',
    });
  }
  if (recipe.pathRequirements.length && !hasPath) {
    findings.push({
      code: 'MISSING_PATH',
      severity: 'error',
      message: 'Walkable path is required for this recipe.',
    });
  }
  if (!layers.has('foreground') || !layers.has('midground') || !layers.has('background') && !layers.has('sky')) {
    if (!layers.has('foreground') || !layers.has('midground')) {
      findings.push({
        code: 'MISSING_DEPTH_LAYERS',
        severity: 'error',
        message: 'Foreground and midground depth layers are required.',
      });
    }
  }

  for (const placement of plan.placements) {
    const asset = byId.get(placement.assetId);
    if (!asset) continue;
    const bounds = placementBounds(placement, asset);
    const halfW = recipe.stageDimensions.widthMeters / 2;
    const halfD = recipe.stageDimensions.depthMeters / 2;
    if (Math.abs(placement.position.x) > halfW || Math.abs(placement.position.z) > halfD) {
      findings.push({
        code: 'OBJECT_OUTSIDE_STAGE',
        severity: 'error',
        message: `${placement.assetId} sits outside the stage.`,
      });
    }
    if (asset.placementMode === 'grounded' && Math.abs(placement.position.y) > 0.001) {
      findings.push({
        code: 'FLOATING_ASSET',
        severity: 'error',
        message: `${placement.assetId} is grounded but not on the ground plane.`,
      });
    }
    if (placement.scale < asset.allowedScaleRange.min || placement.scale > asset.allowedScaleRange.max) {
      findings.push({
        code: 'INVALID_SCALE',
        severity: 'error',
        message: `${placement.assetId} scale ${placement.scale} is outside the allowed range.`,
      });
    }
    if (asset.assetType === 'building' && (Math.abs(placement.rotationEuler.x) > 0.01 || Math.abs(placement.rotationEuler.z) > 0.01)) {
      findings.push({
        code: 'BUILDING_NOT_LEVEL',
        severity: 'error',
        message: `${placement.assetId} must stay level.`,
      });
    }
    const blocksStage = ['cabin', 'tree_left', 'tree_right', 'tree', 'rock', 'creek', 'fence', 'table', 'chair'].includes(
      placement.role,
    );
    if (blocksStage && overlaps2d(bounds, recipe.characterPerformanceZone, 0.05)) {
      findings.push({
        code: 'CHARACTER_CLEARANCE',
        severity: 'error',
        message: `${placement.assetId} intersects the Pip and Goat performance zone.`,
      });
    }
    if (
      placement.layer === 'foreground' &&
      Math.abs(placement.position.x) < 1.35 &&
      bounds.maxY >= FACE_BAND.minY
    ) {
      findings.push({
        code: 'CAMERA_SAFE_9_16',
        severity: 'error',
        message: `${placement.assetId} crowds the vertical 9:16 dialogue frame.`,
      });
    }
    if (
      blocking.includes(placement) &&
      placement.position.z > 2 &&
      Math.abs(placement.position.x) < 1.2 &&
      bounds.maxY >= FACE_BAND.minY &&
      bounds.minY <= FACE_BAND.maxY
    ) {
      findings.push({
        code: 'CAMERA_OCCLUSION',
        severity: 'error',
        message: `${placement.assetId} is likely to cover Pip or Goat faces.`,
      });
    }
  }

  for (let i = 0; i < plan.placements.length; i += 1) {
    for (let j = i + 1; j < plan.placements.length; j += 1) {
      const a = plan.placements[i]!;
      const b = plan.placements[j]!;
      const assetA = byId.get(a.assetId);
      const assetB = byId.get(b.assetId);
      if (!assetA || !assetB) continue;
      if (
        ['path', 'sky', 'hdri', 'grass', 'butterfly', 'firefly'].includes(a.role) ||
        ['path', 'sky', 'hdri', 'grass', 'butterfly', 'firefly'].includes(b.role)
      ) {
        continue;
      }
      if (overlaps2d(placementBounds(a, assetA), placementBounds(b, assetB), 0.12)) {
        findings.push({
          code: 'EXCESSIVE_INTERSECTION',
          severity: 'error',
          message: `${a.assetId} intersects ${b.assetId}.`,
        });
      }
      if (
        a.role === b.role &&
        Math.abs(a.rotationEuler.y - b.rotationEuler.y) < 0.2 &&
        Math.abs(a.scale - b.scale) < 0.01
      ) {
        findings.push({
          code: 'REPEATED_ASSETS',
          severity: 'warning',
          message: `${a.role} placements share nearly identical rotation and scale.`,
        });
      }
    }
  }

  const path = plan.safeMovementPaths[0];
  if (path) {
    for (const point of path.points) {
      if (!insideBox({ ...point, y: 0.5 }, { ...recipe.characterPerformanceZone, minZ: recipe.characterPerformanceZone.minZ - 4, maxZ: recipe.characterPerformanceZone.maxZ + 6 })) {
        findings.push({
          code: 'PATH_NOT_CLEAR',
          severity: 'warning',
          message: 'A recorded movement point sits far from the reserved stage.',
        });
      }
    }
  }

  if (plan.camera.aspectRatio !== '9:16') {
    findings.push({
      code: 'CAMERA_SAFE_9_16',
      severity: 'error',
      message: 'Camera aspect must stay 9:16.',
    });
  }

  return findings;
}

export type { ValidationFinding };
