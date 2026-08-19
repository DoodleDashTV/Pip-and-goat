import { StreamingSha256 } from '@/lib/scenery/intake/sha256-stream';

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Hex(input: string | Uint8Array): string {
  const hash = new StreamingSha256();
  if (typeof input === 'string') {
    hash.update(new TextEncoder().encode(input));
  } else {
    hash.update(input);
  }
  return hash.digestHex();
}

export function sha256Canonical(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

export function sha256ExactBytes(bytes: Uint8Array): string {
  return sha256Hex(bytes);
}
