import { SCENERY_INTAKE_LIMITS } from './limits';

export const SCENERY_INTAKE_MAX_CONCURRENT_FILES = SCENERY_INTAKE_LIMITS.maxConcurrentFiles;

export async function runWithBoundedConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const bounded = Math.max(1, Math.min(limit, SCENERY_INTAKE_LIMITS.maxConcurrentFiles));
  let cursor = 0;
  const runners = Array.from({ length: Math.min(bounded, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item !== undefined) {
        await worker(item, index);
      }
    }
  });
  await Promise.all(runners);
}

export function assertNotHoldingAllFilesInFlight(inFlight: number, selected: number): boolean {
  if (selected <= SCENERY_INTAKE_LIMITS.maxConcurrentFiles) {
    return inFlight <= selected;
  }
  return inFlight <= SCENERY_INTAKE_LIMITS.maxConcurrentFiles;
}
