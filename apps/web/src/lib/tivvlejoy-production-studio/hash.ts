import { sha256Canonical } from '@/lib/tivvlejoy-storybook-environment';

export { sha256Canonical };

export function stableSorted<T extends string>(values: readonly T[] | undefined): T[] {
  return [...(values ?? [])].sort((left, right) => left.localeCompare(right));
}

export function sha256Hex(value: string): string {
  return sha256Canonical({ value });
}
