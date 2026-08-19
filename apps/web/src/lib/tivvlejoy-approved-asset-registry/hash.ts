import { sha256Canonical } from '@/lib/tivvlejoy-storybook-environment';

export { sha256Canonical };

export const RESOLVER_VERSION = 'TIVVLEJOY_APPROVED_ASSET_REGISTRY_RESOLVER_V1' as const;

export function isValidSha256(value: string | null | undefined): boolean {
  return Boolean(value && /^[a-f0-9]{64}$/.test(value));
}

export function requireValidSha256(value: string | null | undefined): value is string {
  return isValidSha256(value);
}
