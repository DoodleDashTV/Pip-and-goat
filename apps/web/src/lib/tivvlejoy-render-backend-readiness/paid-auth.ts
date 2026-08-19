import { PAID_RENDER_AUTHORIZATION_SCHEMA, type PaidRenderAuthorization } from './types';
import { PINNED_CLOUD_TYPE, PINNED_GPU_COUNT, PINNED_GPU_TYPE, PROVEN_TEMPLATE_ID, PROVEN_WORKER_IMAGE_DIGEST } from './identity';
import { MAX_COMPUTE_USD, MAX_HOURLY_USD, MAX_RUNTIME_MINUTES } from './identity';

export const PAID_AUTHORIZATION_DISABLED = 'PAID_AUTHORIZATION_DISABLED' as const;

export function definePaidRenderAuthorizationContract(input: {
  jobId: string;
  launchIntentSha256: string;
  authorizedBy?: string;
  now?: string;
}): PaidRenderAuthorization {
  return {
    schemaVersion: PAID_RENDER_AUTHORIZATION_SCHEMA,
    authorizationId: `defined-not-issued-${input.jobId}`,
    jobId: input.jobId,
    launchIntentSha256: input.launchIntentSha256,
    templateId: PROVEN_TEMPLATE_ID,
    workerImageDigest: PROVEN_WORKER_IMAGE_DIGEST,
    gpuType: PINNED_GPU_TYPE,
    cloudType: PINNED_CLOUD_TYPE,
    gpuCount: PINNED_GPU_COUNT,
    maximumHourlyUsd: MAX_HOURLY_USD,
    maximumComputeUsd: MAX_COMPUTE_USD,
    maximumRuntimeMinutes: MAX_RUNTIME_MINUTES,
    authorizedBy: input.authorizedBy ?? 'UNISSUED',
    authorizedAt: input.now ?? '1970-01-01T00:00:00.000Z',
    expiresAt: input.now ?? '1970-01-01T00:00:15.000Z',
    maxPodCreates: 1,
    issued: false,
  };
}

export function issuePaidRenderAuthorization(): never {
  throw new Error(PAID_AUTHORIZATION_DISABLED);
}

export function createBrowserPaidAuthorization(): never {
  throw new Error('Preview cannot fabricate paid render authorization.');
}
