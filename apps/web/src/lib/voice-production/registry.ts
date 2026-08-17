import { FOUNDING_CODES } from '@doodle-dash/domain';
import {
  GOAT_CHARACTER_ID,
  GOAT_VOICE_PROFILE,
  PIP_CHARACTER_ID,
  PIP_VOICE_PROFILE,
  VoiceProductionError,
  type RegisteredCharacterId,
} from './types';
import { assertExclusiveVoiceAssignment, lockedVoiceIdFor } from './voice-identity';

/**
 * Server-side voice registry. Provider Voice IDs are resolved here only.
 * Browser clients submit character IDs, never Voice IDs.
 */

export type VoiceRegistryEntry = {
  characterId: RegisteredCharacterId;
  displayName: string;
  profile: string;
  provider: 'elevenlabs';
  providerVoiceId: string;
};

const REGISTRY: Record<RegisteredCharacterId, VoiceRegistryEntry> = {
  [PIP_CHARACTER_ID]: {
    characterId: PIP_CHARACTER_ID,
    displayName: 'Pip',
    profile: PIP_VOICE_PROFILE,
    provider: 'elevenlabs',
    providerVoiceId: lockedVoiceIdFor(PIP_CHARACTER_ID),
  },
  [GOAT_CHARACTER_ID]: {
    characterId: GOAT_CHARACTER_ID,
    displayName: 'Goat',
    profile: GOAT_VOICE_PROFILE,
    provider: 'elevenlabs',
    providerVoiceId: lockedVoiceIdFor(GOAT_CHARACTER_ID),
  },
};

export function isRegisteredCharacterId(value: string): value is RegisteredCharacterId {
  return value === PIP_CHARACTER_ID || value === GOAT_CHARACTER_ID;
}

export function resolveVoiceAssignment(characterId: string): VoiceRegistryEntry {
  if (!isRegisteredCharacterId(characterId)) {
    throw new VoiceProductionError('Unknown character. Voice generation refused.', 'UNKNOWN_CHARACTER');
  }
  const entry = REGISTRY[characterId];
  assertExclusiveVoiceAssignment(entry.characterId, entry.providerVoiceId);
  return entry;
}

export function assertNoClientVoiceId(input: {
  voiceId?: unknown;
  providerVoiceId?: unknown;
  elevenLabsVoiceId?: unknown;
}): void {
  if (input.voiceId || input.providerVoiceId || input.elevenLabsVoiceId) {
    throw new VoiceProductionError(
      'Browser-supplied Voice IDs are rejected. Submit a registered character ID only.',
      'BROWSER_VOICE_ID_REJECTED',
    );
  }
}

export function publicVoiceDirectory(): Array<{
  characterId: RegisteredCharacterId;
  displayName: string;
  profile: string;
}> {
  return [
    { characterId: PIP_CHARACTER_ID, displayName: 'Pip', profile: PIP_VOICE_PROFILE },
    { characterId: GOAT_CHARACTER_ID, displayName: 'Goat', profile: GOAT_VOICE_PROFILE },
  ];
}

export function foundingCodesMatchRegistry(): boolean {
  return FOUNDING_CODES.PIP === PIP_CHARACTER_ID && FOUNDING_CODES.GOAT === GOAT_CHARACTER_ID;
}
