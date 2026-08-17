import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createVoiceProductionService } from '@/lib/voice-production/service';
import { createMemoryVoiceStore } from '@/lib/voice-production/store';
import { VoiceProductionError } from '@/lib/voice-production/types';

const store = createMemoryVoiceStore();
const service = createVoiceProductionService(store, process.env);

const DraftSchema = z.object({
  action: z.literal('draft-dialogue'),
  characterId: z.string(),
  episodeId: z.string().min(1),
  sceneId: z.string().min(1),
  premise: z.string().optional(),
  voiceId: z.unknown().optional(),
  providerVoiceId: z.unknown().optional(),
  elevenLabsVoiceId: z.unknown().optional(),
});

const EstimateSchema = z.object({
  action: z.literal('estimate'),
  text: z.string(),
});

const GenerateSchema = z.object({
  action: z.literal('generate-draft-audio'),
  episodeId: z.string().min(1),
  sceneId: z.string().min(1),
  characterId: z.string(),
  dialogueText: z.string().min(1),
  performanceDirection: z.string().optional(),
  pronunciationNotes: z.string().optional(),
  emotion: z.string().optional(),
  voiceId: z.unknown().optional(),
  providerVoiceId: z.unknown().optional(),
  elevenLabsVoiceId: z.unknown().optional(),
  model: z.string().optional(),
  forceNew: z.boolean().optional(),
  fixtureRevision: z.string().optional(),
});

const DecideSchema = z.object({
  action: z.literal('decide'),
  lineId: z.string().min(1),
  decision: z.enum(['APPROVE', 'REJECT']),
});

const RegenerateSchema = z.object({
  action: z.literal('regenerate'),
  lineId: z.string().min(1),
  dialogueText: z.string().optional(),
  performanceDirection: z.string().optional(),
  pronunciationNotes: z.string().optional(),
  emotion: z.string().optional(),
});

const PackageSchema = z.object({
  action: z.literal('package'),
  episodeId: z.string().min(1),
});

const SampleSchema = z.object({
  action: z.literal('create-sample-scene'),
  episodeId: z.string().min(1),
  voiceId: z.unknown().optional(),
  providerVoiceId: z.unknown().optional(),
  elevenLabsVoiceId: z.unknown().optional(),
});

const UpdateSchema = z.object({
  action: z.literal('update-line'),
  lineId: z.string().min(1),
  dialogueText: z.string().optional(),
  performanceDirection: z.string().optional(),
  pronunciationNotes: z.string().optional(),
  emotion: z.string().optional(),
});

const BodySchema = z.discriminatedUnion('action', [
  DraftSchema,
  EstimateSchema,
  GenerateSchema,
  DecideSchema,
  RegenerateSchema,
  PackageSchema,
  SampleSchema,
  UpdateSchema,
]);

function fail(error: unknown) {
  if (error instanceof VoiceProductionError) {
    return NextResponse.json(
      { error: error.message, code: error.code, providerContacted: false },
      { status: 400 },
    );
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: 'Malformed voice-production request.', providerContacted: false }, { status: 400 });
  }
  return NextResponse.json({ error: 'Voice production refused.', providerContacted: false }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    ...service.snapshot(),
    providerContacted: false,
  });
}

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    if (body.action === 'draft-dialogue') {
      return NextResponse.json({ draft: service.draftDialogue(body), providerContacted: false });
    }
    if (body.action === 'estimate') {
      return NextResponse.json({ estimate: service.estimate(body.text), providerContacted: false });
    }
    if (body.action === 'generate-draft-audio') {
      const result = service.generateDraftAudio(body);
      return NextResponse.json({ ...result, providerContacted: result.line.providerContacted });
    }
    if (body.action === 'decide') {
      return NextResponse.json({ line: service.decide(body.lineId, body.decision), providerContacted: false });
    }
    if (body.action === 'regenerate') {
      const result = service.regenerate(body.lineId, body);
      return NextResponse.json({ ...result, providerContacted: result.line.providerContacted });
    }
    if (body.action === 'create-sample-scene') {
      const result = service.createSampleScene(body.episodeId, body);
      return NextResponse.json({ ...result, providerContacted: result.providerContacted });
    }
    if (body.action === 'update-line') {
      return NextResponse.json({ line: service.updateLine(body.lineId, body), providerContacted: false });
    }
    return NextResponse.json({ pack: service.packageApproved(body.episodeId), providerContacted: false });
  } catch (error) {
    return fail(error);
  }
}
