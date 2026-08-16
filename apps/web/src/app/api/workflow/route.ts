/**
 * Episode-production workflow API (Studio Milestone 5).
 *
 * GET  /api/workflow — run the bundled proxy workflow fixture
 * POST /api/workflow — advance a brief, compile assembly argv, probe launch
 *                      safety, or persist a run
 *
 * Nothing here starts a paid render, writes production-library, or opens
 * Steps 9–16. Proxy fixtures cannot emit a ScenePlan or call generate-final.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readProviderStatus, persistPreproductionRun } from '@doodle-dash/production';
import {
  CANONICAL_STORY_BRIEF,
  FORBIDDEN_FINAL_INTENT,
  PROXY_PIPELINE_BRIEF,
  advanceWorkflow,
  compileAnimaticAssembly,
  compileAudioMix,
  evaluateEpisodeLaunchSafety,
  summarizeWorkflow,
} from '@doodle-dash/preproduction';

export const dynamic = 'force-dynamic';

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('proxy-fixture') }),
  z.object({ action: z.literal('canonical-fixture') }),
  z.object({ action: z.literal('advance'), brief: z.unknown() }),
  z.object({ action: z.literal('probe-launch-safety') }),
  z.object({
    action: z.literal('compile-assembly'),
    fixture: z.enum(['proxy', 'canonical']).default('proxy'),
  }),
  z.object({
    action: z.literal('persist'),
    fixture: z.enum(['proxy', 'canonical']).default('proxy'),
    episodeId: z.string().optional(),
    durableRequired: z.boolean().optional(),
    ephemeralTestOnly: z.boolean().optional(),
  }),
]);

function paidEnvelope() {
  return {
    cloudRenderEnabled: false,
    allowPaidGpuLaunch: false,
    provider: readProviderStatus(),
  };
}

export async function GET() {
  const run = advanceWorkflow(PROXY_PIPELINE_BRIEF);
  return NextResponse.json({
    fixture: 'PROXY_PIPELINE_BRIEF',
    summary: summarizeWorkflow(run),
    paid: paidEnvelope(),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.action === 'probe-launch-safety') {
    const safety = evaluateEpisodeLaunchSafety({
      command: 'generate-final',
      intent: 'FINAL',
      characterMode: 'PROXY',
      occupants: FORBIDDEN_FINAL_INTENT.occupants,
      allowPaidGpu: true,
      writeProductionLibrary: true,
    });
    return NextResponse.json({ safety, refused: !safety.allowed, paid: paidEnvelope() });
  }

  if (parsed.data.action === 'compile-assembly') {
    const run = advanceWorkflow(
      parsed.data.fixture === 'canonical' ? CANONICAL_STORY_BRIEF : PROXY_PIPELINE_BRIEF,
    );
    const durationSeconds = run.bundle.animatic.totalFrames / run.bundle.animatic.fps;
    const animatic = compileAnimaticAssembly({
      animatic: run.bundle.animatic,
      audio: run.bundle.audio,
      outputPath: 'artifacts/milestone-5-workflow/animatic-preview.mp4',
    });
    const mix = compileAudioMix({
      audio: run.bundle.audio,
      durationSeconds,
      outputPath: 'artifacts/milestone-5-workflow/audio-preview.wav',
    });
    return NextResponse.json({
      summary: summarizeWorkflow(run),
      animatic,
      mix,
      executed: false,
      paid: paidEnvelope(),
    });
  }

  const brief =
    parsed.data.action === 'proxy-fixture'
      ? PROXY_PIPELINE_BRIEF
      : parsed.data.action === 'canonical-fixture'
        ? CANONICAL_STORY_BRIEF
        : parsed.data.action === 'persist'
          ? parsed.data.fixture === 'canonical'
            ? CANONICAL_STORY_BRIEF
            : PROXY_PIPELINE_BRIEF
          : parsed.data.brief;

  try {
    const run = advanceWorkflow(brief);
    const summary = summarizeWorkflow(run);
    if (parsed.data.action === 'persist') {
      const proxyFixture = parsed.data.fixture === 'proxy';
      const persisted = await persistPreproductionRun({
        episodeId: parsed.data.episodeId ?? run.episodeId,
        workflow: run,
        durableRequired: parsed.data.durableRequired === true,
        ephemeralTestOnly: parsed.data.ephemeralTestOnly ?? proxyFixture,
      });
      return NextResponse.json({
        summary,
        persisted,
        persistenceStatus: persisted.status,
        paid: paidEnvelope(),
      });
    }
    return NextResponse.json({ summary, paid: paidEnvelope() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'workflow failed' },
      { status: 400 },
    );
  }
}
