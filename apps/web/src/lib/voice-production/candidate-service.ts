import { assertNoProhibitedLegacyBrand } from '../brand-canon';
import {
  assertCandidateOriginAllowed,
  assertLiveApprovedSampleGates,
  publicLiveTestSnapshot,
  readVoiceTestMaxCharacters,
} from './candidate-gates';
import {
  APPROVED_SAMPLE_AUDIO_LABEL,
  REQUIRED_VOICE_TEST_MAX_CHARACTERS,
  fixedLineFor,
  isExactFixedLine,
} from './candidates';
import { convertCandidateSpeech, type CandidateTransport } from './candidate-provider';
import {
  assertDurableGenerateReady,
  maybeImportPriorUsageFromEnv,
  readDeploymentId,
  resetDurableVoiceLedgerForTests,
  resolvePreviewVoiceLedgerStore,
  speakerFromCharacterId,
} from './durable-voice-ledger';
import { assertNoClientVoiceId, resolveVoiceAssignment } from './registry';
import { estimateUsage, type VoiceEnv } from './safety';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID, VoiceProductionError, type RegisteredCharacterId } from './types';

export type ApprovedSampleGenerateInput = {
  characterId: string;
  text: string;
  requestId: string;
  testToken: string;
  confirmed: boolean;
  voiceId?: unknown;
  providerVoiceId?: unknown;
  elevenLabsVoiceId?: unknown;
};

export type CandidateGenerateInput = ApprovedSampleGenerateInput;

export type CandidateRequestContext = {
  origin?: string | null;
  host?: string | null;
};

const seenRequestIds = new Set<string>();
let inFlight = false;

export function resetCandidateRequestState() {
  seenRequestIds.clear();
  inFlight = false;
  resetDurableVoiceLedgerForTests();
}

export function createCandidateVoiceService(
  env: VoiceEnv = process.env,
  transport?: CandidateTransport,
) {
  return {
    snapshot() {
      return {
        liveTest: publicLiveTestSnapshot(env),
        fixedLines: {
          [PIP_CHARACTER_ID]: fixedLineFor(PIP_CHARACTER_ID),
          [GOAT_CHARACTER_ID]: fixedLineFor(GOAT_CHARACTER_ID),
        },
        providerContacted: false,
      };
    },

    async generate(input: ApprovedSampleGenerateInput, context: CandidateRequestContext = {}) {
      assertNoClientVoiceId(input);
      assertCandidateOriginAllowed(context, env);
      if (inFlight) {
        throw new VoiceProductionError('A live voice test is already running.', 'GENERATION_ALREADY_RUNNING');
      }
      if (!input.requestId || seenRequestIds.has(input.requestId)) {
        throw new VoiceProductionError('This live voice request was already submitted. It was not retried.', 'DUPLICATE_REQUEST');
      }
      if (input.confirmed !== true) {
        throw new VoiceProductionError('Live voice test requires a deliberate confirmation.', 'CONFIRMATION_REQUIRED');
      }
      if (input.characterId !== PIP_CHARACTER_ID && input.characterId !== GOAT_CHARACTER_ID) {
        throw new VoiceProductionError('Unknown character. Voice generation refused.', 'UNKNOWN_CHARACTER');
      }
      const characterId = input.characterId as RegisteredCharacterId;
      assertNoProhibitedLegacyBrand(input.text);
      const { characterCount } = estimateUsage(input.text);
      const previewLimit = Math.min(readVoiceTestMaxCharacters(env), REQUIRED_VOICE_TEST_MAX_CHARACTERS);
      if (characterCount > previewLimit) {
        throw new VoiceProductionError('Line exceeds the live-test character limit.', 'REQUEST_LIMIT');
      }
      if (!isExactFixedLine(characterId, input.text)) {
        throw new VoiceProductionError('Arbitrary paid dialogue is refused for this test.', 'ARBITRARY_DIALOGUE_REFUSED');
      }

      assertLiveApprovedSampleGates(env, input.testToken);
      const assignment = resolveVoiceAssignment(characterId);

      if (!transport) {
        throw new VoiceProductionError(
          'Paid ElevenLabs transport is not attached. Provider was not contacted.',
          'PROVIDER_TRANSPORT_UNAVAILABLE',
        );
      }

      const store = resolvePreviewVoiceLedgerStore(env);
      await maybeImportPriorUsageFromEnv(store, env);
      assertDurableGenerateReady(await store.read());
      const reservation = await store.reserve({
        requestId: input.requestId,
        character: speakerFromCharacterId(characterId),
        characterCount,
        deploymentId: readDeploymentId(env),
      });
      if (reservation.replay) {
        return {
          kind: 'ELEVENLABS_APPROVED_SAMPLE',
          characterId,
          displayName: assignment.displayName,
          characterCount,
          audioContentType: 'audio/mpeg',
          audioDataUrl: '',
          label: APPROVED_SAMPLE_AUDIO_LABEL,
          providerContacted: true,
          usagePaid: true,
          persistedAsCanon: false,
        };
      }

      seenRequestIds.add(input.requestId);
      inFlight = true;
      try {
        const converted = await convertCandidateSpeech(
          { characterId, text: input.text },
          env,
          transport,
        );
        try {
          await store.finalize({
            requestId: input.requestId,
            receiptRef: input.requestId,
            createdAt: new Date().toISOString(),
          });
        } catch (finalizeError) {
          await store.fail({ requestId: input.requestId, providerContacted: true });
          throw finalizeError;
        }
        return {
          kind: 'ELEVENLABS_APPROVED_SAMPLE',
          characterId,
          displayName: assignment.displayName,
          characterCount,
          audioContentType: converted.contentType,
          audioDataUrl: `data:${converted.contentType};base64,${converted.audioBase64}`,
          label: APPROVED_SAMPLE_AUDIO_LABEL,
          providerContacted: true,
          usagePaid: true,
          persistedAsCanon: false,
        };
      } catch (error) {
        await store.fail({ requestId: input.requestId, providerContacted: true }).catch(() => undefined);
        throw error;
      } finally {
        inFlight = false;
      }
    },
  };
}

export type CandidateVoiceService = ReturnType<typeof createCandidateVoiceService>;
