import { createHash, timingSafeEqual } from 'node:crypto';
import { isPublicWebsitePreview } from '../../public-preview';
import { SceneryError } from '../types';
import { resolveIntakeLimits } from './limits';

const RATE_WINDOW = new Map<string, number[]>();

export const SCENERY_INTAKE_TOKEN_ENV = 'TIVVLEJOY_SCENERY_INTAKE_TOKEN';
export const SCENERY_INTAKE_TOKEN_HEADER = 'x-tivvlejoy-scenery-intake-token';

export function isProductionRuntime(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return String(env.VERCEL_ENV ?? '').trim() === 'production';
}

export function sceneryIntakeTokenConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(String(env[SCENERY_INTAKE_TOKEN_ENV] ?? '').trim());
}

export function intakeTokensMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const left = createHash('sha256').update(provided).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
}

export function publicIntakeAuthorizationSnapshot(
  env: Record<string, string | undefined> = process.env,
) {
  const publicPreview = isPublicWebsitePreview(env);
  const tokenConfigured = sceneryIntakeTokenConfigured(env);
  const productionRefused = isProductionRuntime(env);
  return {
    mutationsRequireStudioSession: true,
    publicPreview,
    tokenConfigured,
    productionMutationsRefused: productionRefused,
    authorizedMutations: false,
    message: productionRefused
      ? 'Scenery intake mutations are refused on Production.'
      : !publicPreview
        ? 'Authorized TivvleJoy studio session can create intake sessions.'
        : tokenConfigured
          ? 'Unauthorized browsers cannot create, sign, complete, query, resume, or abort upload sessions.'
          : 'Preview intake token is not configured. Unauthorized browsers cannot mutate upload sessions.',
  };
}

export function assertStudioIntakeAccess(
  env: Record<string, string | undefined> = process.env,
  providedToken = '',
): void {
  if (isProductionRuntime(env)) {
    throw new SceneryError(
      'Scenery asset intake mutations are refused on Production.',
      'PRODUCTION_INTAKE_REFUSED',
    );
  }
  if (!isPublicWebsitePreview(env)) {
    return;
  }
  const expected = String(env[SCENERY_INTAKE_TOKEN_ENV] ?? '').trim();
  if (!expected) {
    throw new SceneryError(
      'Scenery asset intake mutations require the authorized TivvleJoy studio. The Preview intake token is not configured.',
      'INTAKE_UNAUTHORIZED',
    );
  }
  if (!intakeTokensMatch(providedToken, expected)) {
    throw new SceneryError(
      'Scenery asset intake mutations require the authorized TivvleJoy studio, not the public website preview.',
      'INTAKE_UNAUTHORIZED',
    );
  }
}

const TOKEN_BODY_KEYS = [
  'token',
  'studioToken',
  'intakeToken',
  'TIVVLEJOY_SCENERY_INTAKE_TOKEN',
  SCENERY_INTAKE_TOKEN_HEADER,
];

export function assertTokenOnlyFromApprovedHeader(body: Record<string, unknown>): void {
  for (const key of TOKEN_BODY_KEYS) {
    if (key in body) {
      throw new SceneryError(
        'The scenery intake token is accepted only through the approved studio header.',
        'TOKEN_LOCATION_REFUSED',
      );
    }
  }
}

export function redactSecretsFromText(text: string, secrets: readonly string[]): string {
  return secrets.reduce((current, secret) => {
    if (!secret) return current;
    return current.split(secret).join('[redacted]');
  }, text);
}

export function publicAuthorizationFailure(
  code: 'INTAKE_UNAUTHORIZED' | 'PRODUCTION_INTAKE_REFUSED' | 'TOKEN_LOCATION_REFUSED',
) {
  return {
    error:
      code === 'PRODUCTION_INTAKE_REFUSED'
        ? 'Scenery asset intake mutations are refused on Production.'
        : code === 'TOKEN_LOCATION_REFUSED'
          ? 'The scenery intake token is accepted only through the approved studio header.'
          : 'Scenery asset intake mutations require the authorized TivvleJoy studio, not the public website preview.',
    code,
    uploaded: false,
    approved: false,
  };
}

export function assertNoTokenReflection(payload: unknown, token: string): void {
  if (!token) return;
  if (JSON.stringify(payload).includes(token)) {
    throw new SceneryError(
      'Intake responses must not reflect the studio token.',
      'TOKEN_REFLECTION_REFUSED',
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
      throw new SceneryError(
        'Client-selected storage credentials or prefixes are refused.',
        'CLIENT_CREDENTIALS_REFUSED',
      );
    }
  }
}

export function assertIntakeRateLimit(
  key: string,
  env: Record<string, string | undefined> = process.env,
): void {
  const limits = resolveIntakeLimits(env);
  const now = Date.now();
  const recent = (RATE_WINDOW.get(key) ?? []).filter(
    (stamp) => now - stamp < limits.rateLimitWindowMs,
  );
  if (recent.length >= limits.rateLimitMaxRequests) {
    throw new SceneryError('Scenery intake rate limit reached. Retry later.', 'INTAKE_RATE_LIMIT');
  }
  recent.push(now);
  RATE_WINDOW.set(key, recent);
}

export function resetIntakeRateLimit(): void {
  RATE_WINDOW.clear();
}
