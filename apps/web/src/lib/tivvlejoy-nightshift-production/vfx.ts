import { sha256Canonical } from './hash';
import { VFX_DIRECTION_SCHEMA, VFX_INTENTS, type VfxIntent } from './types';

export type VfxDirection = {
  schemaVersion: typeof VFX_DIRECTION_SCHEMA;
  vfxId: string;
  shotId: string;
  semanticType: VfxIntent;
  storyPurpose: string;
  qualityTier: 'HERO' | 'SUPPORTING' | 'BACKGROUND';
  layer: 'FOREGROUND' | 'BACKGROUND';
  duration: number;
  density: 'SPARSE' | 'MEDIUM' | 'DENSE';
  characterInteraction: 'NONE' | 'NEAR' | 'CONTACT';
  safety: 'CHILD_SAFE_CARTOON';
  renderCostClass: 'LOW' | 'MEDIUM' | 'HIGH';
  executed: false;
  vfxDependencySha256: string;
};

const PURPOSE: Record<VfxIntent, string> = {
  DUST_PUFF: 'Mark a foot or hoof contact.',
  LEAF_FALL: 'Keep a forest alive without motion in every shot.',
  LIGHT_RAYS: 'Accent a discovery without changing exposure policy.',
  RAIN: 'Support rainy-cozy lighting.',
  SNOW: 'Support winter atmosphere.',
  SPLASH: 'Mark a water contact.',
  MAGIC_SPARKLE: 'A rare wonder beat, never default glitter.',
  FOG: 'Soften distant depth.',
  STEAM: 'A bakery or tavern interior cue.',
  SMOKE_SAFE_CARTOON: 'Safe cartoon smoke only, never realistic fire.',
  CONFETTI: 'Festival payoff only.',
  FIREFLY: 'Magical night punctuation.',
  WATER_RIPPLE: 'River or puddle readability.',
};

export function planVfxDirection(input: {
  shotId: string;
  type: VfxIntent;
  qualityTier?: VfxDirection['qualityTier'];
}): VfxDirection {
  const layer = input.type === 'LIGHT_RAYS' || input.type === 'FOG' || input.type === 'FIREFLY' ? 'BACKGROUND' : 'FOREGROUND';
  const body = {
    schemaVersion: VFX_DIRECTION_SCHEMA,
    vfxId: `${input.shotId}_${input.type}`,
    shotId: input.shotId,
    semanticType: input.type,
    storyPurpose: PURPOSE[input.type],
    qualityTier: input.qualityTier ?? 'SUPPORTING',
    layer,
    duration: input.type === 'MAGIC_SPARKLE' || input.type === 'CONFETTI' ? 36 : 90,
    density: input.type === 'RAIN' || input.type === 'SNOW' ? 'MEDIUM' : 'SPARSE',
    characterInteraction: input.type === 'DUST_PUFF' || input.type === 'SPLASH' ? 'CONTACT' : 'NONE',
    safety: 'CHILD_SAFE_CARTOON' as const,
    renderCostClass: input.type === 'RAIN' || input.type === 'SNOW' || input.type === 'FOG' ? 'MEDIUM' : 'LOW',
    executed: false as const,
  };
  return { ...body, vfxDependencySha256: sha256Canonical(body) };
}

export function vfxForShot(input: { shotId: string; weather?: string; location?: string; beatType?: string }): VfxDirection[] {
  const items: VfxDirection[] = [];
  if (input.weather === 'RAIN') items.push(planVfxDirection({ shotId: input.shotId, type: 'RAIN' }));
  if (input.weather === 'SNOW') items.push(planVfxDirection({ shotId: input.shotId, type: 'SNOW' }));
  if (input.location?.includes('forest')) items.push(planVfxDirection({ shotId: input.shotId, type: 'LEAF_FALL' }));
  if (input.location?.includes('river')) items.push(planVfxDirection({ shotId: input.shotId, type: 'WATER_RIPPLE' }));
  if (input.location?.includes('bakery') || input.location?.includes('tavern')) items.push(planVfxDirection({ shotId: input.shotId, type: 'STEAM' }));
  if (input.beatType === 'REVEAL') items.push(planVfxDirection({ shotId: input.shotId, type: 'LIGHT_RAYS', qualityTier: 'HERO' }));
  if (input.beatType === 'PAYOFF' && input.location?.includes('festival')) items.push(planVfxDirection({ shotId: input.shotId, type: 'CONFETTI' }));
  return items;
}

export function vfxIntents(): readonly VfxIntent[] {
  return VFX_INTENTS;
}
