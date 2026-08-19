import {
  PROVEN_TEMPLATE_ID,
  PROVEN_WORKER_IMAGE_DIGEST,
  REQUIRED_BLENDER_VERSION,
} from './identity';
import { hashShotDependency } from './contracts';
import { SHOT_VISUAL_APPROVAL_SCHEMA, type AssetRenderReceipt, type JobPackageInput, type ShotDependencyInput, type ShotVisualApprovalReceipt } from './types';
import { PAID_SMOKE_ATTEMPT_2_TELEMETRY } from './cost';
import type { CostEstimateInput } from './types';

export const LOCKED_CHARACTER_VERSIONS = Object.freeze({
  pipAssetVersion: 'char_pip_v1',
  pipRigVersion: 'pip_production_rig_v1',
  goatAssetVersion: 'char_goat_v1',
  goatRigVersion: 'goat_production_rig_v1',
});

function asset(
  assetId: string,
  assetRole: AssetRenderReceipt['assetRole'],
  sha: string,
  extras: Partial<AssetRenderReceipt> = {},
): AssetRenderReceipt {
  return {
    assetId,
    assetVersion: extras.assetVersion ?? `${assetId}-v1`,
    assetRole,
    objectKey: extras.objectKey ?? `library/${assetId}.blend`,
    sha256: sha,
    bytes: extras.bytes ?? 1024,
    sourceVerified: extras.sourceVerified ?? true,
    hashVerified: extras.hashVerified ?? true,
    approvalStatus: extras.approvalStatus ?? 'approved',
    quarantined: extras.quarantined ?? false,
    provenanceValid: extras.provenanceValid ?? true,
    heroSafe: extras.heroSafe ?? assetRole === 'CHARACTER',
    backgroundSafe: extras.backgroundSafe ?? true,
    stylizationApproval: extras.stylizationApproval ?? (assetRole === 'CHARACTER' ? 'approved' : 'not_required'),
    receiptId: extras.receiptId ?? `rcpt-${assetId}`,
  };
}

export const FIXTURE_ASSETS: AssetRenderReceipt[] = [
  asset('CHAR_PIP_001', 'CHARACTER', '11'.repeat(32), { assetVersion: LOCKED_CHARACTER_VERSIONS.pipAssetVersion, heroSafe: true }),
  asset('CHAR_GOAT_001', 'CHARACTER', '22'.repeat(32), { assetVersion: LOCKED_CHARACTER_VERSIONS.goatAssetVersion, heroSafe: true }),
  asset('ENV_MEADOW_001', 'ENVIRONMENT', '33'.repeat(32)),
  asset('PROP_MAP_001', 'PROP', '44'.repeat(32)),
  asset('ANIM_MEADOW_SMOKE', 'ANIMATION', '55'.repeat(32)),
  asset('CAM_9X16_001', 'CAMERA', '66'.repeat(32)),
  asset('LIGHT_DAY_001', 'LIGHTING', '77'.repeat(32)),
  asset('STYLE_STORYBOOK_001', 'STYLE_PROFILE', '88'.repeat(32)),
];

export function fixtureShot(overrides: Partial<ShotDependencyInput> = {}): ShotDependencyInput {
  return {
    ...LOCKED_CHARACTER_VERSIONS,
    camera: 'CAM_9X16_001',
    frameStart: 1,
    frameEnd: 8,
    animation: 'ANIM_MEADOW_SMOKE',
    visibleGeometry: ['ENV_MEADOW_001', 'CHAR_PIP_001', 'CHAR_GOAT_001'],
    environmentPreset: 'meadow-map',
    visibleProps: ['PROP_MAP_001'],
    materials: ['storybook-meadow'],
    styleProfile: 'TIVVLEJOY_STORYBOOK_ENVIRONMENT_V1',
    lighting: 'TJ_DAY_ADVENTURE',
    worldHdri: 'meadow-day',
    renderSettings: 'EEVEE-24',
    resolution: '1080x1920',
    fps: 30,
    blenderVersion: REQUIRED_BLENDER_VERSION,
    ...overrides,
  };
}

export function fixtureJob(shot = fixtureShot(), assets = FIXTURE_ASSETS): JobPackageInput {
  return {
    ...LOCKED_CHARACTER_VERSIONS,
    productionId: 'prd-tivvlejoy',
    episodeId: 'EP012',
    shotId: 'SH030',
    frameStart: shot.frameStart,
    frameEnd: shot.frameEnd,
    fps: shot.fps,
    resolution: shot.resolution,
    renderEngine: 'EEVEE',
    renderProfile: 'FINAL',
    blenderVersion: shot.blenderVersion,
    templateId: PROVEN_TEMPLATE_ID,
    workerImageDigest: PROVEN_WORKER_IMAGE_DIGEST,
    assetReceipts: assets,
    shotDependencySha256: hashShotDependency(shot),
    outputDestinationIdentity: 'renders/finals/meadow-map-mystery/preview-admission/final_1080p.mp4',
  };
}

export function fixtureVisualApproval(
  shotDependencySha256: string,
  overrides: Partial<ShotVisualApprovalReceipt> = {},
): ShotVisualApprovalReceipt {
  return {
    schemaVersion: SHOT_VISUAL_APPROVAL_SCHEMA,
    visualApprovalVersion: 'TIVVLEJOY_SHOT_VISUAL_APPROVAL_V1',
    shotId: 'SH030',
    shotDependencySha256,
    score: 96,
    result: 'VISUALLY_EXCELLENT',
    hardBlockers: [],
    approvedAt: '2026-08-19T00:00:00.000Z',
    reviewerMode: 'FIXTURE',
    ...overrides,
  };
}

export function fixtureCost(overrides: Partial<CostEstimateInput> = {}): CostEstimateInput {
  return {
    frameCount: 8,
    resolution: '1080x1920',
    samples: 24,
    renderEngine: 'EEVEE',
    renderProfile: 'FINAL',
    hourlyRateUsd: PAID_SMOKE_ATTEMPT_2_TELEMETRY.hourlyRateUsd,
    ...overrides,
  };
}
