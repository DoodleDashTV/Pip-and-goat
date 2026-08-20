import { sha256Canonical } from '@/lib/tivvlejoy-production-studio/hash';

export { sha256Canonical };

export function recordSha256(record: unknown): string {
  return sha256Canonical(record);
}
