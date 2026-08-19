import { ASSEMBLY_HASH_CHAIN_SCHEMA, type HashSet } from './types';

export function validateHashChain(observed: HashSet, expected: HashSet) {
  const mismatches = (['shotHash', 'assemblyHash', 'planHash', 'scriptHash'] as const).filter(
    (key) => !observed[key] || !expected[key] || observed[key] !== expected[key],
  );
  return {
    schemaVersion: ASSEMBLY_HASH_CHAIN_SCHEMA,
    shotHash: observed.shotHash,
    assemblyHash: observed.assemblyHash,
    planHash: observed.planHash,
    scriptHash: observed.scriptHash,
    allExact: mismatches.length === 0,
    mismatches,
  };
}
