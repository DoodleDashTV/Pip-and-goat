import { sha256Canonical } from '@/lib/tivvlejoy-production-studio/hash';

export { sha256Canonical };

export function stableSorted<T extends string>(values: readonly T[] | undefined): T[] {
  return [...(values ?? [])].sort((left, right) => left.localeCompare(right));
}

export function hashWithoutLabels<T extends Record<string, unknown>>(value: T, drop: string[] = ['label', 'displayLabel', 'directorNotes']): string {
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    if (drop.includes(key)) continue;
    next[key] = item;
  }
  return sha256Canonical(next);
}
