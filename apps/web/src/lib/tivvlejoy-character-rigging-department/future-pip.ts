import { PIP_FUTURE_MANIFEST_VERSION } from './types';

export const FUTURE_PIP_REQUIREMENTS = [
  'eyes',
  'eyelids',
  'upper/lower beak',
  'long layered wings',
  'wing expressive controls',
  'legs',
  'feet',
  'three toes',
  'planted rear hallux',
  'three crest feathers',
  'scarf',
  'two backpack straps',
  'backpack body',
  'copper spiral accessory',
] as const;

export function buildFuturePipCharacterManifestStub() {
  return {
    schema: PIP_FUTURE_MANIFEST_VERSION,
    canonicalId: 'CHAR_PIP_001' as const,
    rigNow: false,
    reason: 'Do not rig Pip until her final returned animation mesh is attached.',
    futureRequirements: FUTURE_PIP_REQUIREMENTS,
    genericFrameworkSupportsPip: true,
  };
}
