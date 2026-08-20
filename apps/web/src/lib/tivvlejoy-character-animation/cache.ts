import { sha256Canonical } from './hash';
import type { CacheStatus } from './types';

export type ReusableCategory =
  | 'BLINK_PATTERN'
  | 'IDLE_FOUNDATION'
  | 'WALK_CYCLE_SEMANTIC'
  | 'RUN_CYCLE_SEMANTIC'
  | 'LOOK_TRANSITION'
  | 'REACTION_FOUNDATION';

export interface AnimationCacheKey {
  category: ReusableCategory;
  characterId: string;
  rigVersion: string;
  rigDependencySha256: string;
  semanticContextSha256: string;
}

export interface AnimationCacheEntry {
  key: AnimationCacheKey;
  identitySha256: string;
  payloadSha256: string;
}

export function cacheIdentitySha256(key: AnimationCacheKey): string {
  return sha256Canonical(key);
}

export function evaluateCache(args: {
  requested: AnimationCacheKey;
  stored: AnimationCacheEntry | null;
  allowFullPerformanceReuse?: boolean;
}): CacheStatus {
  if (args.allowFullPerformanceReuse) {
    return 'CACHE_CONTEXT_MISMATCH';
  }
  if (!args.stored) return 'CACHE_MISS';
  if (args.stored.key.rigVersion !== args.requested.rigVersion) {
    return 'CACHE_RIG_VERSION_MISMATCH';
  }
  if (args.stored.key.rigDependencySha256 !== args.requested.rigDependencySha256) {
    return 'CACHE_STALE';
  }
  if (args.stored.key.semanticContextSha256 !== args.requested.semanticContextSha256) {
    return 'CACHE_CONTEXT_MISMATCH';
  }
  if (args.stored.identitySha256 !== cacheIdentitySha256(args.requested)) {
    return 'CACHE_STALE';
  }
  return 'CACHE_REUSABLE';
}

export function reusableSemanticContext(input: {
  emotionFamily: string;
  speedClass: string;
  speaking: boolean;
}): string {
  return sha256Canonical({
    emotionFamily: input.emotionFamily,
    speedClass: input.speedClass,
    speaking: input.speaking,
  });
}
