import type { LightEvidence } from './types';

const PRODUCTION_OWNERS = new Set(['DDP', 'DoodleDash Production', 'production']);

export function normalizeLightKey(light: LightEvidence): string {
  const owner = (light.productionOwner || '').trim().toLowerCase();
  const type = light.type.trim().toLowerCase();
  const name = light.name.trim().toLowerCase();
  return `${owner}|${type}|${name}`;
}

/** Reject duplicate production lights (same owner+type+name or cloned production pairs). */
export function findDuplicateProductionLights(lights: LightEvidence[]): string[] {
  const seen = new Map<string, number>();
  const duplicates: string[] = [];
  for (const light of lights) {
    const key = normalizeLightKey(light);
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    if (count > 1) {
      duplicates.push(light.name);
    }
  }
  // Also catch common clone suffixes of production lights
  const baseNames = new Map<string, string[]>();
  for (const light of lights) {
    const base = light.name.replace(/\.\d{3}$/, '');
    const list = baseNames.get(base) || [];
    list.push(light.name);
    baseNames.set(base, list);
  }
  for (const [base, names] of baseNames) {
    if (names.length > 1 && /sun|key|fill|rim|area|ddp/i.test(base)) {
      for (const n of names) {
        if (!duplicates.includes(n)) duplicates.push(n);
      }
    }
  }
  return duplicates;
}

export function evaluateLightingState(input: {
  lights: LightEvidence[];
  lightingState: Record<string, unknown>;
}): { ok: boolean; reason: string; ownershipOk: boolean } {
  const preset = input.lightingState.preset;
  if (preset === undefined || preset === null || String(preset).trim() === '') {
    return {
      ok: false,
      reason: 'lightingState.preset missing — fail closed',
      ownershipOk: false,
    };
  }
  if (!input.lights.length) {
    return { ok: false, reason: 'no lights present in evidence', ownershipOk: false };
  }
  const owned = input.lights.filter(
    (l) => l.productionOwner && PRODUCTION_OWNERS.has(String(l.productionOwner)),
  );
  if (!owned.length) {
    return {
      ok: false,
      reason: 'no deterministic production light ownership tags',
      ownershipOk: false,
    };
  }
  return {
    ok: true,
    reason: `lightingState preset=${String(preset)}; ownedLights=${owned.length}`,
    ownershipOk: true,
  };
}
