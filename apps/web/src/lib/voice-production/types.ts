export const VOICE_PRODUCTION_STORAGE_KEY = 'tivvlejoy.voice-production.v1';

export const PIP_CHARACTER_ID = 'CHAR_PIP_001' as const;
export const GOAT_CHARACTER_ID = 'CHAR_GOAT_001' as const;
export const PIP_VOICE_PROFILE = 'pip_default_v1' as const;
export const GOAT_VOICE_PROFILE = 'goat_default_v1' as const;

export const REGISTERED_CHARACTER_IDS = [PIP_CHARACTER_ID, GOAT_CHARACTER_ID] as const;
export type RegisteredCharacterId = (typeof REGISTERED_CHARACTER_IDS)[number];

export const DEFAULT_ELEVENLABS_MODEL = 'eleven_multilingual_v2';
export const SUPPORTED_ELEVENLABS_MODELS = [
  'eleven_multilingual_v2',
  'eleven_turbo_v2_5',
  'eleven_flash_v2_5',
] as const;
export type SupportedElevenLabsModel = (typeof SUPPORTED_ELEVENLABS_MODELS)[number];

export const DEFAULT_MAX_CHARS_PER_REQUEST = 280;
export const DEFAULT_MAX_CHARS_PER_EPISODE = 2000;
export const DEFAULT_MONTHLY_CHAR_LIMIT = 20_000;

export type VoiceGenerationStatus =
  | 'DRAFT_TEXT'
  | 'FIXTURE_GENERATED'
  | 'PROVIDER_GENERATED'
  | 'REJECTED'
  | 'APPROVED_FOR_LIPSYNC';

export type VoiceApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type VoiceLineRecord = {
  id: string;
  episodeId: string;
  sceneId: string;
  characterId: RegisteredCharacterId;
  voiceProfileVersion: string;
  dialogueText: string;
  performanceDirection: string;
  pronunciationNotes: string;
  emotion: string;
  provider: 'elevenlabs' | 'fixture';
  model: string;
  generationStatus: VoiceGenerationStatus;
  approvalStatus: VoiceApprovalStatus;
  audioObjectKey: string | null;
  fixtureRevision: string;
  characterCount: number;
  usagePaid: false | true;
  providerContacted: boolean;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};

export type VoiceUsageLedger = {
  month: string;
  paidCharactersUsed: number;
  fixtureCharactersUsed: number;
  paidRequests: number;
  fixtureRequests: number;
  hardStopped: boolean;
};

export type VoiceSafetySnapshot = {
  paidGenerationEnabled: false | true;
  paidGenerationAuthorized: false | true;
  apiKeyConfigured: boolean;
  providerContactedDefault: false;
  maxCharsPerRequest: number;
  maxCharsPerEpisode: number;
  monthlyCharLimit: number;
  ledger: VoiceUsageLedger;
};

export class VoiceProductionError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'VoiceProductionError';
  }
}
