import { NextResponse } from 'next/server';
import { z } from 'zod';
import { defaultCandidateTransport } from '@/lib/voice-production/candidate-provider';
import { createCandidateVoiceService } from '@/lib/voice-production/candidate-service';
import { sanitizeVoiceErrorMessage } from '@/lib/voice-production/candidate-gates';
import { REQUIRED_VOICE_TEST_MAX_CHARACTERS } from '@/lib/voice-production/candidates';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID, VoiceProductionError } from '@/lib/voice-production/types';

const service = createCandidateVoiceService(process.env, defaultCandidateTransport);

const GenerateSchema = z.object({
  action: z.literal('generate-approved-sample'),
  characterId: z.enum([PIP_CHARACTER_ID, GOAT_CHARACTER_ID]),
  text: z.string().min(1).max(REQUIRED_VOICE_TEST_MAX_CHARACTERS),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/),
  testToken: z.string().min(1).max(200),
  confirmed: z.literal(true),
  voiceId: z.unknown().optional(),
  providerVoiceId: z.unknown().optional(),
  elevenLabsVoiceId: z.unknown().optional(),
});

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
    return NextResponse.json({ error: 'Malformed live voice-test request.', providerContacted: false }, { status: 400 });
  }
  return NextResponse.json({ error: 'Live voice test refused.', providerContacted: false }, { status: 400 });
}

function stripSecrets<T extends Record<string, unknown>>(payload: T) {
  return {
    ...payload,
    testToken: undefined,
    voiceId: undefined,
    providerVoiceId: undefined,
    elevenLabsVoiceId: undefined,
  };
}

export async function GET() {
  return NextResponse.json(stripSecrets({
    ...service.snapshot(),
    providerContacted: false,
  }));
}

export async function POST(request: Request) {
  try {
    const body = GenerateSchema.parse(await request.json());
    const result = await service.generate(body, {
      origin: request.headers.get('origin'),
      host: request.headers.get('host'),
    });
    return NextResponse.json(stripSecrets(result));
  } catch (error) {
    return publicError(error);
  }
}
