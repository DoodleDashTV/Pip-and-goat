/**
 * Character-independent pre-production API.
 *
 * GET  /api/preproduction — run the bundled proxy pipeline fixture
 * POST /api/preproduction — plan a brief (`proxy-fixture` | `canonical-fixture` | custom)
 *
 * Nothing here can start a paid render, write production-library, or approve a
 * theatrical look. Proxy fixtures cannot emit a ScenePlan.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readProviderStatus } from '@doodle-dash/production';
import {
  CANONICAL_STORY_BRIEF,
  PROXY_PIPELINE_BRIEF,
  evaluateProductionOutputGate,
  runPreproduction,
} from '@doodle-dash/preproduction';

export const dynamic = 'force-dynamic';

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('proxy-fixture') }),
  z.object({ action: z.literal('canonical-fixture') }),
  z.object({
    action: z.literal('plan'),
    brief: z.unknown(),
  }),
  z.object({
    action: z.literal('probe-final-gate'),
  }),
]);

function summarize(bundle: ReturnType<typeof runPreproduction>) {
  return {
    episodeId: bundle.draft.episodeId,
    title: bundle.draft.title,
    outputClass: bundle.outputClass,
    characterMode: bundle.draft.characterMode,
    occupants: bundle.draft.occupants,
    status: bundle.status,
    issueCount: bundle.issues.length,
    errors: bundle.issues.filter((issue) => issue.severity === 'ERROR'),
    storyApproved: bundle.draft.storyApproved,
    scenePlanEmitted: bundle.scenePlan !== null,
    animaticFrames: bundle.animatic.totalFrames,
    shotCount: bundle.shotPlan.shots.length,
    qc: bundle.qc.technical,
    gateAllowed: bundle.gate.allowed,
    gateCodes: bundle.gate.codes,
    cacheKey: bundle.cacheKey,
    paid: {
      cloudRenderEnabled: false,
      allowPaidGpuLaunch: false,
      provider: readProviderStatus(),
    },
  };
}

export async function GET() {
  const bundle = runPreproduction(PROXY_PIPELINE_BRIEF);
  return NextResponse.json({
    fixture: 'PROXY_PIPELINE_BRIEF',
    summary: summarize(bundle),
    lesson: bundle.draft.lesson,
    watermarkedPanels: bundle.storyboard.panels.filter((panel) => panel.proxyLabeled).length,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.action === 'probe-final-gate') {
    const gate = evaluateProductionOutputGate({
      outputClass: 'FINAL_PRODUCTION',
      renderTier: 'FINAL',
      assetQuality: 'THEATRICAL',
      occupants: ['PROXY_NONCANONICAL_BIRD_A'],
      writeProductionLibrary: true,
      claimMaster: true,
      launchPaidGpu: true,
      emitScenePlan: true,
      storyApproved: true,
    });
    return NextResponse.json({ gate, refused: !gate.allowed });
  }

  const brief =
    parsed.data.action === 'proxy-fixture'
      ? PROXY_PIPELINE_BRIEF
      : parsed.data.action === 'canonical-fixture'
        ? CANONICAL_STORY_BRIEF
        : parsed.data.brief;

  try {
    const bundle = runPreproduction(brief);
    return NextResponse.json({ summary: summarize(bundle), lesson: bundle.draft.lesson });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'preproduction failed' },
      { status: 400 },
    );
  }
}
