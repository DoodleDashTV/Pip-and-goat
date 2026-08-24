import {
  resolveRunpodWorkerImage,
  validateRunpodWorkerImageRef,
} from '@doodle-dash/production';
import {
  FORBIDDEN_STALE_WORKER_DIGESTS,
  readCharacterWorkerPin,
} from './character-worker-pin-record';

export const RUNPOD_WORKER_IMAGE_PIN_BLOCKED = 'RUNPOD_WORKER_IMAGE_PIN_BLOCKED' as const;

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
    if (validation.digest && FORBIDDEN_STALE_WORKER_DIGESTS.includes(validation.digest)) {
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
