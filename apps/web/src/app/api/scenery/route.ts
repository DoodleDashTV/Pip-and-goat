import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createDryRunAssemblyReport, parseAssemblyReport } from '@/lib/scenery/assembly';
import { SYNTHETIC_SCENERY_CATALOG } from '@/lib/scenery/fixtures';
import { createDryRunInspectReport, parseInspectReport } from '@/lib/scenery/ingestion';
import { SceneBriefSchema, planSceneryScene } from '@/lib/scenery/planner';
import { buildPublicScenerySnapshot } from '@/lib/scenery/snapshot';
import { SceneryError } from '@/lib/scenery/types';
import { validateScenePlan } from '@/lib/scenery/validation';

const PlanSchema = z.object({
  action: z.literal('plan'),
  brief: SceneBriefSchema,
});

const IngestSchema = z.object({
  action: z.literal('dry-run-ingest'),
  sourceId: z.string().min(1),
});

const AssembleSchema = z.object({
  action: z.literal('dry-run-assemble'),
  brief: SceneBriefSchema,
});

const BodySchema = z.discriminatedUnion('action', [PlanSchema, IngestSchema, AssembleSchema]);

function fail(error: unknown) {
  if (error instanceof SceneryError) {
    return NextResponse.json({ error: error.message, code: error.code, rendered: false }, { status: 400 });
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: 'Malformed scenery request.', rendered: false }, { status: 400 });
  }
  return NextResponse.json({ error: 'Scenery request refused.', rendered: false }, { status: 400 });
}

export async function GET() {
  return NextResponse.json({
    ...buildPublicScenerySnapshot(),
    rendered: false,
  });
}

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    if (body.action === 'plan') {
      const plan = planSceneryScene(SYNTHETIC_SCENERY_CATALOG, body.brief);
      const validation = validateScenePlan(plan, SYNTHETIC_SCENERY_CATALOG, body.brief);
      return NextResponse.json({
        plan,
        validation,
        rendered: false,
        previewOnly: true,
      });
    }
    if (body.action === 'dry-run-ingest') {
      const report = parseInspectReport(
        createDryRunInspectReport({
          sourceId: body.sourceId,
          sourceBlendPath: `tivvlejoy-assets/source/${body.sourceId}`,
          reportPath: `tivvlejoy-assets/validation/${body.sourceId}-inspect.json`,
          normalizeOutputPath: `tivvlejoy-assets/normalized/${body.sourceId}`,
          dryRun: true,
        }),
      );
      return NextResponse.json({ report, rendered: false, blenderExecuted: false });
    }
    const plan = planSceneryScene(SYNTHETIC_SCENERY_CATALOG, body.brief);
    const report = parseAssemblyReport(
      createDryRunAssemblyReport(plan, {
        planPath: 'tivvlejoy-assets/catalogs/acceptance-plan.json',
        outputBlendPath: 'tivvlejoy-assets/scenes/acceptance-v1.blend',
        reportPath: 'tivvlejoy-assets/validation/acceptance-assemble.json',
        dryRun: true,
      }),
    );
    return NextResponse.json({ plan, report, rendered: false, blenderExecuted: false });
  } catch (error) {
    return fail(error);
  }
}
