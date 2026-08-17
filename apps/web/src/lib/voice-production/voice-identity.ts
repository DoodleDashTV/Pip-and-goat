import { APPROVED_ELEVENLABS_MODEL } from './approved-voice-settings';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID, VoiceProductionError, type RegisteredCharacterId } from './types';

/** Server-only. Never import this file from a client component. */
const PIP_LOCKED_VOICE_ID = '93w5H37WdqeS6HoyL5cV';
const GOAT_LOCKED_VOICE_ID = 'SbxjwBKw2PefbSupcoXV';

const LOCKED_VOICE_IDS: Record<RegisteredCharacterId, string> = {
  [PIP_CHARACTER_ID]: PIP_LOCKED_VOICE_ID,
  [GOAT_CHARACTER_ID]: GOAT_LOCKED_VOICE_ID,
};

export function lockedVoiceIdFor(characterId: RegisteredCharacterId): string {
  return LOCKED_VOICE_IDS[characterId];
}

export function assertExclusiveVoiceAssignment(
  characterId: RegisteredCharacterId,
  voiceId: string,
): void {
  const expected = lockedVoiceIdFor(characterId);
  const otherId = characterId === PIP_CHARACTER_ID ? GOAT_LOCKED_VOICE_ID : PIP_LOCKED_VOICE_ID;
  if (voiceId === otherId || voiceId !== expected) {
    throw new VoiceProductionError(
      'Voice assignment is locked. Pip and Goat cannot share or swap voices. Provider was not contacted.',
      'VOICE_ASSIGNMENT_LOCKED',
    );
  }
}

export function assertApprovedModel(model: string): void {
  if (model !== APPROVED_ELEVENLABS_MODEL) {
    throw new VoiceProductionError(
      'Only the approved ElevenLabs model may be used for Pip and Goat. Provider was not contacted.',
      'VOICE_MODEL_LOCKED',
    );
  }
}

export function lockedVoiceIdsAreDistinct(): boolean {
  return PIP_LOCKED_VOICE_ID !== GOAT_LOCKED_VOICE_ID;
}
