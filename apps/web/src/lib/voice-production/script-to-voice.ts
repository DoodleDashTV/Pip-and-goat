import { assertAudienceFacingContent } from '../brand-canon';
import {
  APPROVED_ELEVENLABS_MODEL,
  APPROVED_OUTPUT_FORMAT,
  publicApprovedVoiceSettings,
  VOICE_IDENTITY_CHECKPOINT,
} from './approved-voice-settings';
import {
  assertCandidateOriginAllowed,
  assertLiveApprovedSampleGates,
  publicLiveTestSnapshot,
  sanitizeVoiceErrorMessage,
} from './candidate-gates';
import { convertCandidateSpeech, type CandidateTransport } from './candidate-provider';
import {
  assertDurableGenerateReady,
  maybeImportPriorUsageFromEnv,
  publicDurableLedgerView,
  readDeploymentId,
  resetDurableVoiceLedgerForTests,
  resolvePreviewVoiceLedgerStore,
  speakerFromCharacterId,
} from './durable-voice-ledger';
import {
  assertPreviewVoiceAllowance,
  previewMonthlyCharLimit,
  publicPreviewVoiceAllowance,
  recordFailedVoiceAttempt,
  resetPreviewPaidLedger,
} from './preview-paid-ledger';
import { assertNoClientVoiceId, resolveVoiceAssignment } from './registry';
import { estimateUsage, type VoiceEnv } from './safety';
import {
  assertSingleDialogueLine,
  publicScriptCharacters,
  SCRIPT_TO_VOICE_AUDIO_LABEL,
  SCRIPT_TO_VOICE_LOCKED_MESSAGE,
  SCRIPT_TO_VOICE_READY_MESSAGE,
  SCRIPT_TO_VOICE_MAX_CHARS,
  SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS,
  SCRIPT_TO_VOICE_MAX_PAID_REQUESTS,
} from './script-line';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID, VoiceProductionError, type RegisteredCharacterId } from './types';

export type ScriptToVoiceInput = {
  characterId: string;
  text: string;
  requestId?: string;
  testToken?: string;
  confirmed?: boolean;
  title?: string;
  description?: string;
  caption?: string;
  narration?: string;
  metadata?: string;
  voiceId?: unknown;
  providerVoiceId?: unknown;
  elevenLabsVoiceId?: unknown;
  lines?: unknown;
  script?: unknown;
  queue?: unknown;
  model?: unknown;
  model_id?: unknown;
  outputFormat?: unknown;
  output_format?: unknown;
  voice_settings?: unknown;
  stability?: unknown;
  similarity?: unknown;
  similarity_boost?: unknown;
  style?: unknown;
  speed?: unknown;
  speakerBoost?: unknown;
  use_speaker_boost?: unknown;
};

export type ScriptToVoiceContext = {
  origin?: string | null;
  host?: string | null;
};

export type ScriptLinePreview = {
  characterId: RegisteredCharacterId;
  displayName: string;
  text: string;
  characterCount: number;
  maxCharacters: number;
  model: typeof APPROVED_ELEVENLABS_MODEL;
  outputFormat: typeof APPROVED_OUTPUT_FORMAT;
  settings: ReturnType<typeof publicApprovedVoiceSettings>;
  checkpoint: typeof VOICE_IDENTITY_CHECKPOINT;
  providerContacted: false;
  productionEnabled: false;
};

export type ScriptToVoiceReceipt = {
  kind: 'ELEVENLABS_CONFIRMED_LINE';
  characterId: RegisteredCharacterId;
  displayName: string;
  text: string;
  characterCount: number;
  model: typeof APPROVED_ELEVENLABS_MODEL;
  outputFormat: typeof APPROVED_OUTPUT_FORMAT;
  settings: ReturnType<typeof publicApprovedVoiceSettings>;
  requestId: string;
  audioContentType: string;
  audioDataUrl: string;
  label: typeof SCRIPT_TO_VOICE_AUDIO_LABEL;
  checkpoint: typeof VOICE_IDENTITY_CHECKPOINT;
  providerContacted: true;
  usagePaid: true;
  persistedAsCanon: false;
  productionEnabled: false;
  createdAt: string;
  paidCharactersCharged: number;
  ledger: {
    paidCharactersUsed: number;
    paidRequests: number;
    monthlyCharLimit: number;
    remainingRequests: number;
    remainingCharacters: number;
    failedAttempts: number;
  };
  durableLedger: ReturnType<typeof publicDurableLedgerView>;
};

const successCache = new Map<string, ScriptToVoiceReceipt>();
const failedIds = new Set<string>();
const inFlightIds = new Set<string>();
let sessionInFlight = false;

export function resetScriptToVoiceState() {
  successCache.clear();
  failedIds.clear();
  inFlightIds.clear();
  sessionInFlight = false;
  resetPreviewPaidLedger();
  resetDurableVoiceLedgerForTests();
}

function assertRegisteredCharacter(characterId: string): RegisteredCharacterId {
  if (characterId !== PIP_CHARACTER_ID && characterId !== GOAT_CHARACTER_ID) {
    throw new VoiceProductionError('Unknown character. Voice generation refused.', 'UNKNOWN_CHARACTER');
  }
  return characterId;
}

function assertNoBatchPayload(input: ScriptToVoiceInput) {
  if (Array.isArray(input.lines) || Array.isArray(input.script) || Array.isArray(input.queue)) {
    throw new VoiceProductionError(
      'Only one confirmed dialogue line is accepted. Whole scripts, batches, and multi-line text are refused.',
      'SINGLE_LINE_REQUIRED',
    );
  }
}

function assertNoClientOverrides(input: ScriptToVoiceInput) {
  const overrideKeys = [
    'model',
    'model_id',
    'outputFormat',
    'output_format',
    'voice_settings',
    'stability',
    'similarity',
    'similarity_boost',
    'style',
    'speed',
    'speakerBoost',
    'use_speaker_boost',
  ] as const;
  for (const key of overrideKeys) {
    if (input[key] !== undefined) {
      throw new VoiceProductionError(
        'Locked model, settings, and output format cannot be overridden. Provider was not contacted.',
        'VOICE_SETTINGS_LOCKED',
      );
    }
  }
}

export function validateConfirmedScriptLine(input: ScriptToVoiceInput): ScriptLinePreview {
  assertNoClientVoiceId(input);
  assertNoBatchPayload(input);
  assertNoClientOverrides(input);
  const characterId = assertRegisteredCharacter(input.characterId);
  const text = assertSingleDialogueLine(input.text);
  assertAudienceFacingContent({
    dialogue: text,
    text,
    title: input.title,
    description: input.description,
    caption: input.caption,
    narration: input.narration,
    metadata: input.metadata,
  });
  const assignment = resolveVoiceAssignment(characterId);
  const { characterCount } = estimateUsage(text);
  assertPreviewVoiceAllowance(characterCount);
  return {
    characterId,
    displayName: assignment.displayName,
    text,
    characterCount,
    maxCharacters: SCRIPT_TO_VOICE_MAX_CHARS,
    model: APPROVED_ELEVENLABS_MODEL,
    outputFormat: APPROVED_OUTPUT_FORMAT,
    settings: publicApprovedVoiceSettings(),
    checkpoint: VOICE_IDENTITY_CHECKPOINT,
    providerContacted: false,
    productionEnabled: false,
  };
}

export function publicScriptToVoiceSnapshot(env: VoiceEnv = process.env) {
  const liveTest = publicLiveTestSnapshot(env);
  const allowance = publicPreviewVoiceAllowance();
  return {
    status: liveTest.status,
    locked: liveTest.locked,
    message: liveTest.locked ? SCRIPT_TO_VOICE_LOCKED_MESSAGE : SCRIPT_TO_VOICE_READY_MESSAGE,
    characters: publicScriptCharacters(),
    voiceIdentity: liveTest.voiceIdentity,
    maxCharacters: SCRIPT_TO_VOICE_MAX_CHARS,
    maxPaidRequests: SCRIPT_TO_VOICE_MAX_PAID_REQUESTS,
    maxPaidCharacters: SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS,
    monthlyCharLimit: previewMonthlyCharLimit(),
    ledger: {
      paidCharactersUsed: allowance.paidCharactersUsed,
      paidRequests: allowance.paidRequests,
      monthlyCharLimit: previewMonthlyCharLimit(),
      remainingRequests: allowance.remainingRequests,
      remainingCharacters: allowance.remainingCharacters,
      failedAttempts: allowance.failedAttempts,
    },
    durableLedger: publicDurableLedgerView(env),
    productionEnabled: false,
    providerContacted: false,
  };
}

export function createScriptToVoiceService(env: VoiceEnv = process.env, transport?: CandidateTransport) {
  return {
    snapshot() {
      return publicScriptToVoiceSnapshot(env);
    },

    validate(input: ScriptToVoiceInput) {
      return validateConfirmedScriptLine(input);
    },

    async generate(input: ScriptToVoiceInput, context: ScriptToVoiceContext = {}): Promise<ScriptToVoiceReceipt> {
      assertNoClientVoiceId(input);
      assertCandidateOriginAllowed(context, env);
      const preview = validateConfirmedScriptLine(input);
      if (input.confirmed !== true) {
        throw new VoiceProductionError(
          'Preview voice generation requires a deliberate confirmation.',
          'CONFIRMATION_REQUIRED',
        );
      }
      const requestId = String(input.requestId ?? '').trim();
      if (!requestId) {
        throw new VoiceProductionError('A unique request id is required. The provider was not contacted.', 'DUPLICATE_REQUEST');
      }
      const cached = successCache.get(requestId);
      if (cached) {
        return cached;
      }
      if (failedIds.has(requestId) || inFlightIds.has(requestId)) {
        throw new VoiceProductionError(
          'This confirmed line was already submitted. It was not retried and was not billed again.',
          'DUPLICATE_REQUEST',
        );
      }
      if (sessionInFlight) {
        throw new VoiceProductionError(
          'Only one Preview voice generation can run at a time. Provider was not contacted.',
          'GENERATION_ALREADY_RUNNING',
        );
      }

      assertLiveApprovedSampleGates(env, String(input.testToken ?? ''));
      resolveVoiceAssignment(preview.characterId);

      if (!transport) {
        throw new VoiceProductionError(
          'Paid ElevenLabs transport is not attached. Provider was not contacted.',
          'PROVIDER_TRANSPORT_UNAVAILABLE',
        );
      }

      const store = resolvePreviewVoiceLedgerStore(env);
      await maybeImportPriorUsageFromEnv(store, env);
      assertDurableGenerateReady(await store.read());

      sessionInFlight = true;
      inFlightIds.add(requestId);
      let reserved = false;
      let providerReached = false;
      try {
        const reservation = await store.reserve({
          requestId,
          character: speakerFromCharacterId(preview.characterId),
          characterCount: preview.characterCount,
          deploymentId: readDeploymentId(env),
        });
        reserved = true;
        if (reservation.replay) {
          const replayed = successCache.get(requestId);
          if (replayed) return replayed;
          const allowance = publicPreviewVoiceAllowance();
          return {
            kind: 'ELEVENLABS_CONFIRMED_LINE',
            characterId: preview.characterId,
            displayName: preview.displayName,
            text: preview.text,
            characterCount: preview.characterCount,
            model: APPROVED_ELEVENLABS_MODEL,
            outputFormat: APPROVED_OUTPUT_FORMAT,
            settings: publicApprovedVoiceSettings(),
            requestId,
            audioContentType: 'audio/mpeg',
            audioDataUrl: '',
            label: SCRIPT_TO_VOICE_AUDIO_LABEL,
            checkpoint: VOICE_IDENTITY_CHECKPOINT,
            providerContacted: true,
            usagePaid: true,
            persistedAsCanon: false,
            productionEnabled: false,
            createdAt: reservation.replay.createdAt,
            paidCharactersCharged: reservation.replay.characterCount,
            ledger: {
              paidCharactersUsed: allowance.paidCharactersUsed,
              paidRequests: allowance.paidRequests,
              monthlyCharLimit: previewMonthlyCharLimit(),
              remainingRequests: allowance.remainingRequests,
              remainingCharacters: allowance.remainingCharacters,
              failedAttempts: allowance.failedAttempts,
            },
            durableLedger: publicDurableLedgerView(env, await store.read()),
          };
        }

        const converted = await convertCandidateSpeech(
          { characterId: preview.characterId, text: preview.text },
          env,
          transport,
        );
        providerReached = true;
        let finalized;
        try {
          finalized = await store.finalize({
            requestId,
            receiptRef: requestId,
            createdAt: new Date().toISOString(),
          });
        } catch (finalizeError) {
          reserved = false;
          await store.fail({ requestId, providerContacted: true });
          throw finalizeError;
        }
        const allowance = publicPreviewVoiceAllowance();
        const receipt: ScriptToVoiceReceipt = {
          kind: 'ELEVENLABS_CONFIRMED_LINE',
          characterId: preview.characterId,
          displayName: preview.displayName,
          text: preview.text,
          characterCount: preview.characterCount,
          model: APPROVED_ELEVENLABS_MODEL,
          outputFormat: APPROVED_OUTPUT_FORMAT,
          settings: publicApprovedVoiceSettings(),
          requestId,
          audioContentType: converted.contentType,
          audioDataUrl: `data:${converted.contentType};base64,${converted.audioBase64}`,
          label: SCRIPT_TO_VOICE_AUDIO_LABEL,
          checkpoint: VOICE_IDENTITY_CHECKPOINT,
          providerContacted: true,
          usagePaid: true,
          persistedAsCanon: false,
          productionEnabled: false,
          createdAt: finalized.receipt.createdAt,
          paidCharactersCharged: preview.characterCount,
          ledger: {
            paidCharactersUsed: finalized.record.paidCharactersUsed,
            paidRequests: finalized.record.paidRequests,
            monthlyCharLimit: previewMonthlyCharLimit(),
            remainingRequests: Math.max(0, SCRIPT_TO_VOICE_MAX_PAID_REQUESTS - finalized.record.paidRequests),
            remainingCharacters: Math.max(0, SCRIPT_TO_VOICE_MAX_PAID_CHARACTERS - finalized.record.paidCharactersUsed),
            failedAttempts: finalized.record.failedAttempts,
          },
          durableLedger: publicDurableLedgerView(env, finalized.record),
        };
        void allowance;
        successCache.set(requestId, receipt);
        return receipt;
      } catch (error) {
        failedIds.add(requestId);
        const code = error instanceof VoiceProductionError ? error.code : 'PROVIDER_UNSUPPORTED';
        const providerContacted = providerReached || (code.startsWith('PROVIDER_') && code !== 'PROVIDER_TRANSPORT_UNAVAILABLE');
        if (reserved && code !== 'DUPLICATE_REQUEST') {
          await store.fail({ requestId, providerContacted }).catch(() => undefined);
        }
        recordFailedVoiceAttempt({
          requestId,
          characterId: preview.characterId,
          code,
          providerContacted,
        });
        if (error instanceof VoiceProductionError) {
          throw new VoiceProductionError(sanitizeVoiceErrorMessage(error.message), error.code);
        }
        throw new VoiceProductionError(
          sanitizeVoiceErrorMessage('Preview voice generation refused. Provider details were not shown.'),
          'PROVIDER_UNSUPPORTED',
        );
      } finally {
        inFlightIds.delete(requestId);
        sessionInFlight = false;
      }
    },
  };
}

export type ScriptToVoiceService = ReturnType<typeof createScriptToVoiceService>;
