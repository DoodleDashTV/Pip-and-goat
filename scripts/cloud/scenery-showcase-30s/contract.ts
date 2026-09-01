export const SCENERY_SHOWCASE_EXECUTION_ID = 'scenery-showcase-30s-v1-20260827';
export const SCENERY_SHOWCASE_POD_NAME = 'tivvlejoy-scenery-showcase-30s-v1';
export const SCENERY_SHOWCASE_AUTHORIZATION = 'TIVVLEJOY_SCENERY_SHOWCASE_30S_PAID_EXECUTION_AUTHORIZATION_V1';
export const SCENERY_SHOWCASE_GPU_TYPE = 'NVIDIA GeForce RTX 4090';
export const SCENERY_SHOWCASE_HARD_COST_USD = 2.0;
export const SCENERY_SHOWCASE_MAX_RUNTIME_MINUTES = 120;
export const SCENERY_SHOWCASE_STARTUP_WATCHDOG_MINUTES = 15;
export const SCENERY_SHOWCASE_POLL_MS = 15_000;
export const SCENERY_SHOWCASE_OUTPUT_KEY = `tivvlejoy-assets/showcases/${SCENERY_SHOWCASE_EXECUTION_ID}/tivvlejoy-scenery-showcase-30s.mp4`;
export const SCENERY_SHOWCASE_STATUS_KEY = `jobs/${SCENERY_SHOWCASE_EXECUTION_ID}/status.json`;
export const SCENERY_SHOWCASE_REMOTE_LEDGER_KEY = `tivvlejoy-assets/showcases/${SCENERY_SHOWCASE_EXECUTION_ID}/launcher/consumption-ledger.json`;

export type SceneryShowcaseWorkerPin = {
  schema: 'TIVVLEJOY_SCENERY_SHOWCASE_WORKER_IMAGE_V1';
  status: 'PUBLISHED_IMMUTABLE_DIGEST';
  sourceCommit: string;
  baseDigest: string;
  imageRepository: string;
  digest: string;
  ref: string;
  blenderVersion: '4.2.2';
  resolution: '1080x1920';
  fps: 30;
  frameCount: 900;
  commercialAssetsBaked: false;
  paidGpuLaunchCount: 0;
  runpodContacted: false;
  credentialsIncluded: false;
};

export function exactAuthorizationPresent(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.SCENERY_SHOWCASE_PAID_AUTHORIZATION || '').trim() === SCENERY_SHOWCASE_AUTHORIZATION;
}
