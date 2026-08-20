import { createHash } from 'node:crypto';
import { sha256Canonical } from '@/lib/tivvlejoy-storybook-environment';

export { sha256Canonical };

export function isValidSha256(value: string | null | undefined): value is string {
  return Boolean(value && /^[a-f0-9]{64}$/.test(value));
}

export function sha256Bytes(bytes: Uint8Array | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256Text(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function stableId(parts: Array<string | number | null | undefined>): string {
  return sha256Canonical(parts.map((part) => (part == null ? '' : String(part)))).slice(0, 32);
}
