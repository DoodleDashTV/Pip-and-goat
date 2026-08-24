import { createHash, timingSafeEqual } from 'node:crypto';
import { isPublicWebsitePreview } from '@/lib/public-preview';
import {
  SCENERY_INTAKE_TOKEN_ENV,
  SCENERY_INTAKE_TOKEN_HEADER,
  isProductionRuntime,
  sceneryIntakeTokenConfigured,
} from '@/lib/scenery/intake/access';
import { SceneryError } from '@/lib/scenery/types';

export type AssetIntakeSurface = 'scenery' | 'goat-source';

export type AssetIntakeAuthFailure = {
  error: string;
  code: 'INTAKE_UNAUTHORIZED' | 'PRODUCTION_INTAKE_REFUSED' | 'TOKEN_LOCATION_REFUSED';
  uploaded: false;
  approved: false;
  tokenPresented: boolean;
  previewRuntime: boolean;
  publicPreview: boolean;
  tokenConfigured: boolean;
  nextUserAction: string;
  goatProductionReady: false;
};

const SCENERY_MESSAGES = {
  production: 'Scenery asset intake mutations are refused on Production.',
  missingConfig:
    'Scenery asset intake mutations require the authorized TivvleJoy studio. The Preview intake token is not configured.',
  mismatch:
    'Scenery asset intake mutations require the authorized TivvleJoy studio, not the public website preview.',
  tokenLocation: 'The scenery intake token is accepted only through the approved studio header.',
} as const;

const GOAT_MESSAGES = {
  production: 'Goat source intake mutations are refused on Production.',
  missingConfig:
    'Goat source intake requires the authorized TivvleJoy studio session. The Preview intake token is not configured.',
  mismatch:
    'Goat source intake requires the Studio session token in the approved header. The token was missing or did not match.',
  tokenLocation: 'The studio session token is accepted only through the approved header, not the JSON body.',
} as const;

export function isPreviewRuntime(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.VERCEL_ENV ?? '').trim() === 'preview';
}

export function approvedIntakeTokenFromHeaders(headers: Headers): string {
  return String(headers.get(SCENERY_INTAKE_TOKEN_HEADER) ?? '').trim();
}

export function intakeTokensMatchTrimmed(provided: string, expected: string): boolean {
  const leftValue = provided.trim();
  const rightValue = expected.trim();
  if (!leftValue || !rightValue) return false;
  const left = createHash('sha256').update(leftValue).digest();
  const right = createHash('sha256').update(rightValue).digest();
  return timingSafeEqual(left, right);
}

export function assertAssetIntakeAccess(input: {
  env?: Record<string, string | undefined>;
  providedToken?: string;
  surface: AssetIntakeSurface;
}): void {
  const env = input.env ?? process.env;
  const messages = input.surface === 'goat-source' ? GOAT_MESSAGES : SCENERY_MESSAGES;
  if (isProductionRuntime(env)) {
    throw new SceneryError(messages.production, 'PRODUCTION_INTAKE_REFUSED');
  }
  const publicPreview = isPublicWebsitePreview(env);
  const previewRuntime = isPreviewRuntime(env);
  if (!publicPreview && !previewRuntime) {
    return;
  }
  if (!publicPreview) {
    return;
  }
  const expected = String(env[SCENERY_INTAKE_TOKEN_ENV] ?? '').trim();
  if (!expected) {
    throw new SceneryError(messages.missingConfig, 'INTAKE_UNAUTHORIZED');
  }
  if (!intakeTokensMatchTrimmed(input.providedToken ?? '', expected)) {
    throw new SceneryError(messages.mismatch, 'INTAKE_UNAUTHORIZED');
  }
}

export function publicAssetIntakeAuthorizationFailure(input: {
  code: AssetIntakeAuthFailure['code'];
  surface: AssetIntakeSurface;
  providedToken?: string;
  env?: Record<string, string | undefined>;
}): AssetIntakeAuthFailure {
  const env = input.env ?? process.env;
  const messages = input.surface === 'goat-source' ? GOAT_MESSAGES : SCENERY_MESSAGES;
  const tokenPresented = Boolean(input.providedToken?.trim());
  const nextUserAction =
    input.code === 'PRODUCTION_INTAKE_REFUSED'
      ? 'Use the Preview host. Production Goat source intake stays closed.'
      : tokenPresented
        ? 'Re-enter the Studio session token, then tap Upload Goat Source again. Keep the same Goat_FINN.zip.'
        : 'Enter the Studio session token, then tap Upload Goat Source. Keep the same Goat_FINN.zip.';
  const error =
    input.code === 'PRODUCTION_INTAKE_REFUSED'
      ? messages.production
      : input.code === 'TOKEN_LOCATION_REFUSED'
        ? messages.tokenLocation
        : tokenPresented
          ? messages.mismatch
          : messages.mismatch;
  return {
    error,
    code: input.code,
    uploaded: false,
    approved: false,
    tokenPresented,
    previewRuntime: isPreviewRuntime(env),
    publicPreview: isPublicWebsitePreview(env),
    tokenConfigured: sceneryIntakeTokenConfigured(env),
    nextUserAction,
    goatProductionReady: false,
  };
}
