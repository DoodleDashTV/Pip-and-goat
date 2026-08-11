import { NextResponse } from 'next/server';
import {
  facialMappingService,
  referenceApprovalService,
  characterPreviewService,
  voiceOnboardingService,
  blenderWorkerHealthService,
  shotInspectorService,
  episodeReadinessAggregator,
  draftFinalOrchestrator,
  propOnboardingService,
  environmentOnboardingService,
  SEMANTIC_FACIAL_CONTROLS,
  REQUIRED_MOUTH_CONTROLS,
  CANONICAL_AUDITION_SCRIPT,
  VERTICAL_SLICE_EPISODE_ID,
} from '@doodle-dash/production';
import { AppError } from '@doodle-dash/shared';
import { prisma } from '@doodle-dash/database';
import { z } from 'zod';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  try {
    if (action === 'blender-status') {
      return NextResponse.json(await blenderWorkerHealthService.status());
    }
    if (action === 'episode-checklist') {
      const episodeId = searchParams.get('episodeId') || VERTICAL_SLICE_EPISODE_ID;
      return NextResponse.json(await episodeReadinessAggregator.buildChecklist(episodeId));
    }
    if (action === 'shot-inspector') {
      const shotId = searchParams.get('shotId');
      if (!shotId) return NextResponse.json({ error: 'shotId required' }, { status: 400 });
      return NextResponse.json(await shotInspectorService.inspectShot(shotId));
    }
    if (action === 'facial-map') {
      const characterId = searchParams.get('characterId');
      if (!characterId) return NextResponse.json({ error: 'characterId required' }, { status: 400 });
      const map = await facialMappingService.getOrCreate(characterId);
      return NextResponse.json({
        map,
        semanticControls: SEMANTIC_FACIAL_CONTROLS,
        requiredMouth: REQUIRED_MOUTH_CONTROLS,
      });
    }
    if (action === 'audition-script') {
      return NextResponse.json({ script: CANONICAL_AUDITION_SCRIPT });
    }
    if (action === 'draft-review') {
      const episodeId = searchParams.get('episodeId') || VERTICAL_SLICE_EPISODE_ID;
      const review = await prisma.draftReview.findFirst({
        where: { episodeId },
        include: { notes: true },
        orderBy: { createdAt: 'desc' },
      });
      return NextResponse.json({ review });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}

const BodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save-facial-map'),
    characterId: z.string().uuid(),
    assetVersion: z.number().int().optional(),
    controlType: z.enum(['SHAPE_KEY', 'BONE']).optional(),
    mappings: z.record(z.string().nullable()),
  }),
  z.object({
    action: z.literal('approve-facial-map'),
    characterId: z.string().uuid(),
    assetVersion: z.number().int(),
    approvedBy: z.string(),
  }),
  z.object({
    action: z.literal('approve-reference-version'),
    characterId: z.string().uuid(),
    primaryImageId: z.string().uuid(),
    additionalImageIds: z.array(z.string().uuid()).optional(),
    palette: z.record(z.unknown()).optional(),
    silhouetteNotes: z.string().optional(),
    proportionNotes: z.string().optional(),
    lockedTraits: z.record(z.unknown()).optional(),
    approvedBy: z.string(),
  }),
  z.object({
    action: z.literal('queue-character-previews'),
    characterId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('voice-version'),
    characterId: z.string().uuid(),
    provider: z.string().nullable().optional(),
    voiceId: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    speed: z.number().nullable().optional(),
    pitch: z.number().nullable().optional(),
    stability: z.number().nullable().optional(),
  }),
  z.object({ action: z.literal('generate-audition'), characterId: z.string().uuid() }),
  z.object({
    action: z.literal('voice-decision'),
    characterId: z.string().uuid(),
    versionNumber: z.number().int(),
    decision: z.enum(['APPROVE', 'REJECT']),
    by: z.string(),
    reason: z.string().optional(),
  }),
  z.object({ action: z.literal('blender-self-test') }),
  z.object({
    action: z.literal('configure-prop'),
    propId: z.string().uuid(),
    scale: z.number().optional(),
    originNotes: z.string().optional(),
    approve: z.boolean().optional(),
  }),
  z.object({ action: z.literal('validate-environment'), locationId: z.string().uuid() }),
  z.object({
    action: z.literal('generate-first-draft'),
    episodeId: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal('approve-draft'),
    draftReviewId: z.string().uuid(),
    approvedBy: z.string(),
  }),
  z.object({
    action: z.literal('request-draft-changes'),
    draftReviewId: z.string().uuid(),
    shotId: z.string().uuid().optional(),
    note: z.string(),
    createdBy: z.string().optional(),
  }),
  z.object({
    action: z.literal('generate-final'),
    episodeId: z.string().uuid().optional(),
  }),
]);

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    switch (body.action) {
      case 'save-facial-map':
        return NextResponse.json({ map: await facialMappingService.saveMappings(body) });
      case 'approve-facial-map':
        return NextResponse.json({
          map: await facialMappingService.approve(body.characterId, body.assetVersion, body.approvedBy),
        });
      case 'approve-reference-version':
        return NextResponse.json({
          version: await referenceApprovalService.approveVersion(body),
        });
      case 'queue-character-previews':
        return NextResponse.json({
          jobs: await characterPreviewService.queuePoseTests(body.characterId),
        });
      case 'voice-version':
        return NextResponse.json(await voiceOnboardingService.configureAndVersion(body));
      case 'generate-audition':
        return NextResponse.json({
          version: await voiceOnboardingService.generateAudition(body.characterId),
        });
      case 'voice-decision':
        return NextResponse.json({ version: await voiceOnboardingService.decide(body) });
      case 'blender-self-test':
        return NextResponse.json({ test: await blenderWorkerHealthService.runSelfTest() });
      case 'configure-prop':
        return NextResponse.json({ profile: await propOnboardingService.configure(body) });
      case 'validate-environment':
        return NextResponse.json({
          report: await environmentOnboardingService.validate(body.locationId),
        });
      case 'generate-first-draft':
        return NextResponse.json({
          run: await draftFinalOrchestrator.generateFirstDraft(
            body.episodeId || VERTICAL_SLICE_EPISODE_ID,
          ),
        });
      case 'approve-draft':
        return NextResponse.json({
          review: await draftFinalOrchestrator.approveDraft(body),
        });
      case 'request-draft-changes':
        return NextResponse.json({ note: await draftFinalOrchestrator.requestChanges(body) });
      case 'generate-final':
        return NextResponse.json(
          await draftFinalOrchestrator.generateFinal(body.episodeId || VERTICAL_SLICE_EPISODE_ID),
        );
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}
