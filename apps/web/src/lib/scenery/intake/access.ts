import { isPublicWebsitePreview } from '../../public-preview';
import { SceneryError } from '../types';
import { resolveIntakeLimits } from './limits';

const RATE_WINDOW = new Map<string, number[]>();

export function assertStudioIntakeAccess(env: Record<string, string | undefined> = process.env): void {
  if (isPublicWebsitePreview(env)) {
    throw new SceneryError(
      'Scenery asset intake mutations require the authorized TivvleJoy studio, not the public website preview.',
      'INTAKE_UNAUTHORIZED',
    );
  }
}

export function assertNoClientStorageCredentials(body: Record<string, unknown>): void {
  const banned = [
    'accessKeyId',
    'secretAccessKey',
    'R2_SECRET_ACCESS_KEY',
    'OBJECT_STORAGE_SECRET_ACCESS_KEY',
    'credentials',
    'bucketOverride',
    'prefixOverride',
  ];
  for (const key of banned) {
    if (key in body) {
      throw new SceneryError('Client-selected storage credentials or prefixes are refused.', 'CLIENT_CREDENTIALS_REFUSED');
    }
  }
}

export function assertIntakeRateLimit(key: string, env: Record<string, string | undefined> = process.env): void {
  const limits = resolveIntakeLimits(env);
  const now = Date.now();
  const recent = (RATE_WINDOW.get(key) ?? []).filter((stamp) => now - stamp < limits.rateLimitWindowMs);
  if (recent.length >= limits.rateLimitMaxRequests) {
    throw new SceneryError('Scenery intake rate limit reached. Retry later.', 'INTAKE_RATE_LIMIT');
  }
  recent.push(now);
  RATE_WINDOW.set(key, recent);
}

export function resetIntakeRateLimit(): void {
  RATE_WINDOW.clear();
}
