import { SceneryError } from '../types';
import { DEFAULT_SCENERY_ASSET_PREFIX } from './config';
import { assertObjectKeyWithinPrefix } from './keys';

export function isPrefixEscapeAttempt(key: string, prefix = DEFAULT_SCENERY_ASSET_PREFIX): boolean {
  const normalizedPrefix = prefix.replace(/^\/+|\/+$/g, '');
  const decoded = decodeURIComponentSafe(key);
  if (decoded.includes('..') || decoded.includes('\\') || decoded.startsWith('/')) {
    return true;
  }
  if (!decoded.startsWith(`${normalizedPrefix}/`)) {
    return true;
  }
  if (decoded.startsWith(`${normalizedPrefix}/../`) || decoded.includes(`/${normalizedPrefix}/../`)) {
    return true;
  }
  return false;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function assertWriteStaysInApprovedNamespace(
  key: string,
  prefix = DEFAULT_SCENERY_ASSET_PREFIX,
  kind?: 'source' | 'quarantine' | 'catalogs',
): void {
  if (isPrefixEscapeAttempt(key, prefix)) {
    throw new SceneryError('Object key escapes the approved TivvleJoy scenery namespace.', 'UNSAFE_OBJECT_KEY');
  }
  assertObjectKeyWithinPrefix(key, prefix, kind);
}

export function purchasedSourceNamespace(prefix = DEFAULT_SCENERY_ASSET_PREFIX): string {
  return `${prefix.replace(/^\/+|\/+$/g, '')}/source/`;
}
