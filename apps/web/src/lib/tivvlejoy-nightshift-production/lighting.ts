import { LIGHTING_PRESETS, type LightingPresetId } from '@/lib/tivvlejoy-storybook-environment/types';
import { sha256Canonical } from './hash';
import { LIGHTING_DIRECTION_SCHEMA, LIGHTING_INTENTS, type LightingIntent } from './types';

export type LightingDirection = {
  schemaVersion: typeof LIGHTING_DIRECTION_SCHEMA;
  shotId: string;
  intent: LightingIntent;
  storybookPreset: LightingPresetId;
  faceReadability: true;
  eyeReadability: true;
  propReadability: boolean;
  backgroundSeparation: true;
  storybookLook: true;
  gafferRequired: false;
  physicalStarlightRequired: false;
  nativeBlenderBaseline: true;
  lightingSha256: string;
};

export type LightingContinuityFinding = {
  fromShotId: string;
  toShotId: string;
  codes: Array<'KEY_DIRECTION_FLIP' | 'TIME_OF_DAY_JUMP' | 'COLOR_TEMPERATURE_JUMP' | 'EXPOSURE_JUMP' | 'BACKGROUND_LIGHT_MISMATCH'>;
  allowed: boolean;
};

const PRESET_FOR: Record<LightingIntent, LightingPresetId> = {
  WARM_INVITING: 'TJ_MORNING_WARM',
  BRIGHT_ADVENTURE: 'TJ_DAY_ADVENTURE',
  SOFT_MYSTERY: 'TJ_OVERCAST_SOFT',
  RAINY_COZY: 'TJ_RAINY_COZY',
  GOLDEN_DISCOVERY: 'TJ_GOLDEN_HOUR',
  EVENING_FESTIVAL: 'TJ_EVENING_FESTIVAL',
  MAGICAL_NIGHT: 'TJ_MAGICAL_NIGHT',
  TENSION_COOL: 'TJ_OVERCAST_SOFT',
  REVEAL_ACCENT: 'TJ_GOLDEN_HOUR',
};

export function planLightingDirection(input: {
  shotId: string;
  intent: LightingIntent;
  heroProp?: boolean;
}): LightingDirection {
  const body = {
    schemaVersion: LIGHTING_DIRECTION_SCHEMA,
    shotId: input.shotId,
    intent: input.intent,
    storybookPreset: PRESET_FOR[input.intent],
    faceReadability: true as const,
    eyeReadability: true as const,
    propReadability: input.heroProp === true,
    backgroundSeparation: true as const,
    storybookLook: true as const,
    gafferRequired: false as const,
    physicalStarlightRequired: false as const,
    nativeBlenderBaseline: true as const,
  };
  return { ...body, lightingSha256: sha256Canonical(body) };
}

export function lightingIntentFor(input: { weather?: string; timeOfDay?: string; beatType?: string }): LightingIntent {
  if (input.weather === 'RAIN') return 'RAINY_COZY';
  if (input.weather === 'SNOW' || input.timeOfDay === 'NIGHT_COZY') return 'MAGICAL_NIGHT';
  if (input.timeOfDay === 'GOLDEN_HOUR') return 'GOLDEN_DISCOVERY';
  if (input.beatType === 'TENSION') return 'TENSION_COOL';
  if (input.beatType === 'REVEAL') return 'REVEAL_ACCENT';
  if (input.beatType === 'HOOK') return 'WARM_INVITING';
  return 'BRIGHT_ADVENTURE';
}

export function evaluateLightingContinuity(shots: LightingDirection[]): LightingContinuityFinding[] {
  const findings: LightingContinuityFinding[] = [];
  for (let index = 1; index < shots.length; index += 1) {
    const prev = shots[index - 1]!;
    const next = shots[index]!;
    const codes: LightingContinuityFinding['codes'] = [];
    if (prev.intent === 'WARM_INVITING' && next.intent === 'TENSION_COOL') codes.push('KEY_DIRECTION_FLIP');
    if (prev.storybookPreset === 'TJ_MORNING_WARM' && next.storybookPreset === 'TJ_MAGICAL_NIGHT') codes.push('TIME_OF_DAY_JUMP');
    if (prev.intent === 'RAINY_COZY' && next.intent === 'GOLDEN_DISCOVERY') codes.push('COLOR_TEMPERATURE_JUMP');
    if (prev.intent === 'MAGICAL_NIGHT' && next.intent === 'BRIGHT_ADVENTURE') codes.push('EXPOSURE_JUMP');
    if (prev.storybookPreset !== next.storybookPreset && prev.intent !== next.intent) codes.push('BACKGROUND_LIGHT_MISMATCH');
    const allowed = codes.includes('TIME_OF_DAY_JUMP') || codes.includes('EXPOSURE_JUMP') ? next.intent === 'REVEAL_ACCENT' || next.intent === 'MAGICAL_NIGHT' || prev.intent === 'REVEAL_ACCENT' : codes.length === 0 || next.intent === 'REVEAL_ACCENT';
    if (codes.length) findings.push({ fromShotId: prev.shotId, toShotId: next.shotId, codes, allowed });
  }
  return findings;
}

export function lightingIntents(): readonly LightingIntent[] {
  return LIGHTING_INTENTS;
}

export function storybookPresets(): readonly LightingPresetId[] {
  return LIGHTING_PRESETS;
}
