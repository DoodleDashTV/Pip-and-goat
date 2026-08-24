import {
  resolveRunpodWorkerImage,
  validateRunpodWorkerImageRef,
} from '@doodle-dash/production';
import {
  FORBIDDEN_STALE_WORKER_DIGESTS,
  REJECTED_LIVE_CHARACTER_EXECUTION_DIGESTS,
  REJECTED_LIVE_CAPABILITY_SCHEMA,
  REQUIRED_LIVE_CAPABILITY_SCHEMA,
  readCharacterWorkerPin,
} from './character-worker-pin-record';

export const RUNPOD_WORKER_IMAGE_PIN_BLOCKED = 'RUNPOD_WORKER_IMAGE_PIN_BLOCKED' as const;
export const REJECTED_LIVE_EXECUTION_DIGEST = 'REJECTED_LIVE_EXECUTION_DIGEST' as const;
export const WORKER_CAPABILITY_V1_FORBIDDEN_FOR_LIVE = 'WORKER_CAPABILITY_V1_FORBIDDEN_FOR_LIVE' as const;

export function resolveAuthorizedCharacterWorkerImage(
  env: Record<string, string | undefined> = process.env,
) {
  const pin = readCharacterWorkerPin();
  const envRef = resolveRunpodWorkerImage(env);
  if (envRef) {
    const validation = validateRunpodWorkerImageRef(envRef);
    if (!validation.ok) {
      return {
        ok: false as const,
        code: RUNPOD_WORKER_IMAGE_PIN_BLOCKED,
        reason: validation.reason,
        digest: validation.digest,
        ref: envRef,
        source: 'env' as const,
      };
    }
    if (
      validation.digest &&
      (FORBIDDEN_STALE_WORKER_DIGESTS as readonly string[]).includes(validation.digest)
    ) {
      return {
        ok: false as const,
        code: RUNPOD_WORKER_IMAGE_PIN_BLOCKED,
        reason: 'Stale 1080p or render-only digest is forbidden for the character worker.',
        digest: validation.digest,
        ref: envRef,
        source: 'env' as const,
      };
    }
    if (pin.digest && validation.digest !== pin.digest) {
      return {
        ok: false as const,
        code: RUNPOD_WORKER_IMAGE_PIN_BLOCKED,
        reason: 'RUNPOD_WORKER_IMAGE does not match the authoritative character-worker pin.',
        digest: validation.digest,
        ref: envRef,
        source: 'env' as const,
      };
    }
    return {
      ok: true as const,
      code: 'OK' as const,
      reason: 'RUNPOD_WORKER_IMAGE matches the immutable character-worker digest.',
      digest: validation.digest,
      ref: envRef,
      source: 'env' as const,
    };
  }
  if (pin.digest && pin.ref) {
    const validation = validateRunpodWorkerImageRef(pin.ref);
    if (!validation.ok) {
      return {
        ok: false as const,
        code: RUNPOD_WORKER_IMAGE_PIN_BLOCKED,
        reason: validation.reason,
        digest: pin.digest,
        ref: pin.ref,
        source: 'authoritative-pin' as const,
      };
    }
    return {
      ok: true as const,
      code: 'OK' as const,
      reason: 'Authoritative character-worker pin resolves the immutable digest.',
      digest: validation.digest,
      ref: pin.ref,
      source: 'authoritative-pin' as const,
    };
  }
  return {
    ok: false as const,
    code: RUNPOD_WORKER_IMAGE_PIN_BLOCKED,
    reason: 'Character-worker digest is not pinned yet. Do not launch or substitute another image.',
    digest: null,
    ref: '',
    source: 'missing' as const,
  };
}

export function resolveLiveCharacterWorkerImage(
  env: Record<string, string | undefined> = process.env,
  capability?: { schema?: string; liveCharacterDepartmentCapable?: boolean; mandatoryDryRun?: boolean },
) {
  const resolved = resolveAuthorizedCharacterWorkerImage(env);
  if (!resolved.ok) return resolved;
  if (
    resolved.digest &&
    (REJECTED_LIVE_CHARACTER_EXECUTION_DIGESTS as readonly string[]).includes(resolved.digest)
  ) {
    return {
      ok: false as const,
      code: REJECTED_LIVE_EXECUTION_DIGEST,
      reason:
        'This digest is rejected for live character execution. Rebuild and pin a Capability V2 live-capable worker.',
      digest: resolved.digest,
      ref: resolved.ref,
      source: resolved.source,
    };
  }
  if (!capability || capability.schema === REJECTED_LIVE_CAPABILITY_SCHEMA) {
    return {
      ok: false as const,
      code: WORKER_CAPABILITY_V1_FORBIDDEN_FOR_LIVE,
      reason: 'Capability V1 is not live-execution capable. Live character execution requires Capability V2.',
      digest: resolved.digest,
      ref: resolved.ref,
      source: resolved.source,
    };
  }
  if (
    capability.schema !== REQUIRED_LIVE_CAPABILITY_SCHEMA ||
    capability.liveCharacterDepartmentCapable !== true ||
    capability.mandatoryDryRun === true
  ) {
    return {
      ok: false as const,
      code: WORKER_CAPABILITY_V1_FORBIDDEN_FOR_LIVE,
      reason: 'Pinned worker capability is not live character-department capable.',
      digest: resolved.digest,
      ref: resolved.ref,
      source: resolved.source,
    };
  }
  return resolved;
}
