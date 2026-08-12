/**
 * Local vs cloud routing policy (Phase 16).
 * AUDIT_FAST → LOCAL
 * DRAFT_FAST → LOCAL by default, CLOUD optional
 * FINAL_1080P → CLOUD preferred if enabled and healthy
 * No silent spend on alternate provider when cloud unavailable.
 */
import type { CloudRenderProfile, RenderProviderId } from './types';
import { resolveCloudCostLimitsFromEnv } from './config';
import { localBlenderProvider, runpodBlenderProvider } from './render-provider';
import { AppError } from '@doodle-dash/shared';

export type FallbackPolicy = 'LOCAL_ONLY' | 'FAIL_CLOSED' | 'CLOUD_THEN_FAIL';

export type RouteDecision = {
  provider: RenderProviderId;
  profile: CloudRenderProfile;
  reason: string;
  cloudPreferred: boolean;
  fallbackPolicy: FallbackPolicy;
};

export async function chooseRenderProvider(input: {
  profile: CloudRenderProfile;
  explicitProvider?: RenderProviderId;
  cloudOptionalForDraft?: boolean;
  fallbackPolicy?: FallbackPolicy;
}): Promise<RouteDecision> {
  const limits = resolveCloudCostLimitsFromEnv();
  const fallbackPolicy = input.fallbackPolicy ?? 'FAIL_CLOSED';

  if (input.explicitProvider) {
    if (input.explicitProvider === 'RUNPOD_BLENDER' && !limits.cloudRenderEnabled) {
      throw new AppError(
        'Explicit cloud provider requested but CLOUD_RENDER_ENABLED=false.',
        'CLOUD_RENDER_DISABLED',
        403,
      );
    }
    return {
      provider: input.explicitProvider,
      profile: input.profile,
      reason: `Explicit provider ${input.explicitProvider}`,
      cloudPreferred: input.explicitProvider === 'RUNPOD_BLENDER',
      fallbackPolicy,
    };
  }

  if (input.profile === 'AUDIT_FAST') {
    return {
      provider: 'LOCAL_BLENDER',
      profile: input.profile,
      reason: 'AUDIT_FAST always routes to LOCAL.',
      cloudPreferred: false,
      fallbackPolicy: 'LOCAL_ONLY',
    };
  }

  if (input.profile === 'DRAFT_FAST' || input.profile === 'DRAFT_HD') {
    if (limits.cloudRenderEnabled && input.cloudOptionalForDraft) {
      const health = await runpodBlenderProvider.healthCheck();
      if (health.healthy) {
        return {
          provider: 'RUNPOD_BLENDER',
          profile: input.profile,
          reason: 'Draft cloud optional enabled and Runpod healthy.',
          cloudPreferred: true,
          fallbackPolicy,
        };
      }
      if (fallbackPolicy === 'FAIL_CLOSED') {
        throw new AppError(
          'Cloud draft requested but Runpod unhealthy — refusing silent alternate spend.',
          'CLOUD_UNAVAILABLE_NO_FALLBACK',
          409,
        );
      }
    }
    return {
      provider: 'LOCAL_BLENDER',
      profile: input.profile,
      reason: 'Draft defaults to LOCAL Blender.',
      cloudPreferred: false,
      fallbackPolicy: 'LOCAL_ONLY',
    };
  }

  // FINAL_1080P / PREMIUM
  if (limits.cloudRenderEnabled) {
    const health = await runpodBlenderProvider.healthCheck();
    if (health.healthy) {
      return {
        provider: 'RUNPOD_BLENDER',
        profile: input.profile,
        reason: 'FINAL prefers CLOUD when enabled and healthy.',
        cloudPreferred: true,
        fallbackPolicy,
      };
    }
    if (fallbackPolicy === 'FAIL_CLOSED') {
      throw new AppError(
        'Cloud preferred for FINAL but Runpod unhealthy — no silent fallback.',
        'CLOUD_UNAVAILABLE_NO_FALLBACK',
        409,
      );
    }
    if (fallbackPolicy === 'LOCAL_ONLY' || fallbackPolicy === 'CLOUD_THEN_FAIL') {
      const local = await localBlenderProvider.healthCheck();
      if (local.healthy && fallbackPolicy === 'LOCAL_ONLY') {
        return {
          provider: 'LOCAL_BLENDER',
          profile: input.profile,
          reason: 'Cloud unhealthy — configured LOCAL_ONLY fallback.',
          cloudPreferred: true,
          fallbackPolicy,
        };
      }
      throw new AppError('Cloud unavailable and fallback policy refuses spend.', 'CLOUD_UNAVAILABLE', 409);
    }
  }

  return {
    provider: 'LOCAL_BLENDER',
    profile: input.profile,
    reason: 'Cloud disabled — FINAL uses LOCAL Blender.',
    cloudPreferred: false,
    fallbackPolicy: 'LOCAL_ONLY',
  };
}
