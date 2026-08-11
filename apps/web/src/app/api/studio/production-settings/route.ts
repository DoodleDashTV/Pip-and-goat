import { NextResponse } from 'next/server';
import {
  DEFAULT_PRODUCTION_SETTINGS,
  productionSettingsService,
} from '@doodle-dash/production';
import { z } from 'zod';

const BodySchema = z.object({
  defaultDraftProfile: z.enum(['DRAFT_FAST', 'DRAFT_HD']).optional(),
  defaultFinalEngine: z.enum(['EEVEE', 'CYCLES']).optional(),
  aiVideoEnabled: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true')),
  paidGenerationApprovalThresholdUsd: z.coerce.number().positive().optional(),
  animationReuseAggressiveness: z.enum(['LOW', 'MEDIUM', 'HIGH', 'OFF']).optional(),
  qualityTarget: z
    .enum(['BEST_QUALITY_PER_DOLLAR', 'MAXIMUM_QUALITY', 'MINIMUM_COST'])
    .optional(),
  localComputeUsdPerMinute: z.coerce.number().nonnegative().optional(),
});

export async function GET() {
  const settings = await productionSettingsService.ensureDefaults();
  return NextResponse.json({ settings });
}

export async function POST(request: Request) {
  const body = BodySchema.parse(await request.json());
  const settings = await productionSettingsService.update({
    ...DEFAULT_PRODUCTION_SETTINGS,
    ...(await productionSettingsService.ensureDefaults()),
    ...body,
    aiVideoEnabled: body.aiVideoEnabled ?? (await productionSettingsService.ensureDefaults()).aiVideoEnabled,
  });
  return NextResponse.json({ settings, message: 'Production settings saved' });
}
