import { NextResponse } from 'next/server';
import { z } from 'zod';
import { defaultCandidateTransport } from '@/lib/voice-production/candidate-provider';
import { createCandidateVoiceService } from '@/lib/voice-production/candidate-service';
import { sanitizeVoiceErrorMessage } from '@/lib/voice-production/candidate-gates';
import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID, VoiceProductionError } from '@/lib/voice-production/types';

const service = createCandidateVoiceService(process.env, defaultCandidateTransport);

const GenerateSchema = z.object({
  action: z.literal('generate-candidate'),
  characterId: z.enum([PIP_CHARACTER_ID, GOAT_CHARACTER_ID]),
  candidateSlot: z.enum(['pip-1', 'pip-2', 'pip-3', 'goat-1', 'goat-2', 'goat-3']),
  text: z.string().min(1).max(300),
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

export async function GET() {
  return NextResponse.json({
    ...service.snapshot(),
    providerContacted: false,
  });
}

export async function POST(request: Request) {
  try {
    const body = GenerateSchema.parse(await request.json());
    const result = await service.generate(body, {
      origin: request.headers.get('origin'),
      host: request.headers.get('host'),
    });
    return NextResponse.json({
      ...result,
      testToken: undefined,
      voiceId: undefined,
      providerVoiceId: undefined,
    });
  } catch (error) {
    return publicError(error);
  }
}
