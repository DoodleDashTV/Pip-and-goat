import { z } from 'zod';
import { SCENERY_SCHEMA_VERSION, SceneryError } from './types';
import type { ScenePlan } from './planner';

export const AssemblyRequestSchema = z.object({
  planPath: z.string().min(1),
  outputBlendPath: z.string().min(1),
  reportPath: z.string().min(1),
  dryRun: z.boolean().default(true),
  approvedSceneOverwrite: z.boolean().default(false),
});

export type AssemblyRequest = z.infer<typeof AssemblyRequestSchema>;

export const AssemblyReportSchema = z.object({
  schemaVersion: z.literal(SCENERY_SCHEMA_VERSION),
  kind: z.literal('tivvlejoy_scenery_assemble'),
  blenderExecuted: z.boolean(),
  dryRun: z.boolean(),
  sourceModified: z.literal(false),
  sceneWritten: z.boolean(),
  outputBlendPath: z.string().nullable(),
  normalizedAssetsLoaded: z.array(z.string()),
  blockedReasons: z.array(z.string()),
  rendered: z.literal(false),
  realExecution: z.enum(['not_run', 'completed']),
  notes: z.array(z.string()),
});

export type AssemblyReport = z.infer<typeof AssemblyReportSchema>;

export function buildBlenderAssembleArgv(request: AssemblyRequest): string[] {
  const parsed = AssemblyRequestSchema.parse(request);
  return [
    'blender',
    '-b',
    '-noaudio',
    '--python',
    'scripts/blender/scenery_assemble.py',
    '--',
    '--plan',
    parsed.planPath,
    '--output',
    parsed.outputBlendPath,
    '--report',
    parsed.reportPath,
    ...(parsed.dryRun ? ['--dry-run'] : []),
    ...(parsed.approvedSceneOverwrite ? ['--allow-overwrite'] : []),
  ];
}

export function createDryRunAssemblyReport(plan: ScenePlan, request: AssemblyRequest): AssemblyReport {
  const parsed = AssemblyRequestSchema.parse(request);
  const missingNormalized = plan.placements
    .filter((item) => !item.assetId.startsWith('SCN_FIXTURE_'))
    .map((item) => item.assetId);
  const blockedReasons = [
    'Normalized purchased assets are unavailable.',
    'Real Blender execution was not run.',
    'Assembly stays blocked until inspected normalized assets exist.',
  ];
  if (!parsed.dryRun) {
    blockedReasons.unshift('Real assembly refused because dry-run is required while sources are unavailable.');
  }
  return {
    schemaVersion: SCENERY_SCHEMA_VERSION,
    kind: 'tivvlejoy_scenery_assemble',
    blenderExecuted: false,
    dryRun: true,
    sourceModified: false,
    sceneWritten: false,
    outputBlendPath: null,
    normalizedAssetsLoaded: [],
    blockedReasons,
    rendered: false,
    realExecution: 'not_run',
    notes: [
      'Dry-run assembly only. No scene file was written.',
      'Purchased source archives were not opened.',
      `Plan seed ${plan.seed} was recorded. Nothing was rendered.`,
      missingNormalized.length
        ? `Purchased placements remain unloaded: ${missingNormalized.join(', ')}.`
        : 'Fixture placements are planning records only and were not assembled in Blender.',
    ],
  };
}

export function parseAssemblyReport(value: unknown): AssemblyReport {
  const parsed = AssemblyReportSchema.safeParse(value);
  if (!parsed.success) {
    throw new SceneryError(
      `Invalid assembly report. ${parsed.error.issues[0]?.message ?? ''}`.trim(),
      'INVALID_REPORT',
    );
  }
  return parsed.data;
}

export function serializeAssemblyReport(report: AssemblyReport): string {
  return `${JSON.stringify(report, Object.keys(report).sort(), 2)}\n`;
}
