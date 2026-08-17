import { NextResponse } from 'next/server';
import { z } from 'zod';
import { defaultCandidateTransport } from '@/lib/voice-production/candidate-provider';
import { sanitizeVoiceErrorMessage } from '@/lib/voice-production/candidate-gates';
import { createEpisodeLineVoiceService } from '@/lib/voice-production/episode-line-voice';
import { SCRIPT_TO_VOICE_MAX_CHARS } from '@/lib/voice-production/script-line';
import { VoiceProductionError } from '@/lib/voice-production/types';

const service = createEpisodeLineVoiceService(process.env, defaultCandidateTransport);

const SharedFields = {
  episodeId: z.string().min(1).max(80),
  sceneId: z.string().min(1).max(80),
  lineId: z.string().min(1).max(80),
  lineNumber: z.number().int().min(1).max(200),
  character: z.enum(['pip', 'goat']),
  dialogue: z.string().min(1).max(SCRIPT_TO_VOICE_MAX_CHARS),
  title: z.string().max(200).optional(),
  description: z.string().max(400).optional(),
  caption: z.string().max(280).optional(),
  narration: z.string().max(280).optional(),
  metadata: z.string().max(200).optional(),
  voiceId: z.unknown().optional(),
  providerVoiceId: z.unknown().optional(),
  elevenLabsVoiceId: z.unknown().optional(),
  lines: z.unknown().optional(),
  script: z.unknown().optional(),
  queue: z.unknown().optional(),
  generateAll: z.unknown().optional(),
  generate_all: z.unknown().optional(),
  model: z.unknown().optional(),
  model_id: z.unknown().optional(),
  outputFormat: z.unknown().optional(),
  output_format: z.unknown().optional(),
  voice_settings: z.unknown().optional(),
  stability: z.unknown().optional(),
  similarity: z.unknown().optional(),
  similarity_boost: z.unknown().optional(),
  style: z.unknown().optional(),
  speed: z.unknown().optional(),
  speakerBoost: z.unknown().optional(),
  use_speaker_boost: z.unknown().optional(),
};

const ParseSchema = z.object({
  action: z.literal('parse-episode-script'),
  script: z.string().min(1).max(4000),
  episodeId: z.string().min(1).max(80),
  sceneId: z.string().min(1).max(80),
});

const ValidateSchema = z.object({
  action: z.literal('validate-episode-line'),
  ...SharedFields,
});

const GenerateSchema = z.object({
  action: z.literal('generate-confirmed-episode-line'),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
  testToken: z.string().min(1).max(200),
  confirmed: z.literal(true),
  confirmationKey: z.string().min(1).max(400),
  ...SharedFields,
});

const BodySchema = z.discriminatedUnion('action', [ParseSchema, ValidateSchema, GenerateSchema]);

function publicError(error: unknown) {
  if (error instanceof VoiceProductionError) {
    return NextResponse.json(
      {
        error: sanitizeVoiceErrorMessage(error.message),
        code: error.code,
        providerContacted: false,
      },
      { status: 400 },
    );
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: 'Malformed episode voice-line request.', providerContacted: false },
      { status: 400 },
    );
  }
  return NextResponse.json({ error: 'Episode voice-line request refused.', providerContacted: false }, { status: 400 });
}

function stripSecrets<T extends Record<string, unknown>>(payload: T) {
  return {
    ...payload,
    testToken: undefined,
    voiceId: undefined,
    providerVoiceId: undefined,
    elevenLabsVoiceId: undefined,
    model: undefined,
    model_id: undefined,
    outputFormat: undefined,
    output_format: undefined,
    voice_settings: undefined,
    stability: undefined,
    similarity: undefined,
    similarity_boost: undefined,
    style: undefined,
    speed: undefined,
    speakerBoost: undefined,
    use_speaker_boost: undefined,
  };
}

export async function GET() {
  return NextResponse.json(
    stripSecrets({
      ...service.snapshot(),
      providerContacted: false,
    }),
  );
}

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    if (body.action === 'parse-episode-script') {
      return NextResponse.json(
        stripSecrets({
          ...service.parse(body.script, { episodeId: body.episodeId, sceneId: body.sceneId }),
          providerContacted: false,
        }),
      );
    }
    if (body.action === 'validate-episode-line') {
      return NextResponse.json(
        stripSecrets({
          ...service.validate(body),
          providerContacted: false,
        }),
      );
    }
    const result = await service.generate(body, {
      origin: request.headers.get('origin'),
      host: request.headers.get('host'),
    });
    return NextResponse.json(stripSecrets(result));
  } catch (error) {
    return publicError(error);
  }
}
