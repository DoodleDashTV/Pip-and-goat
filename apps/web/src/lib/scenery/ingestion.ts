import { z } from 'zod';
import { SCENERY_SCHEMA_VERSION, SUPPORTED_BLENDER_VERSION, SceneryError } from './types';

export const IngestionInspectRequestSchema = z.object({
  sourceId: z.string().min(1),
  sourceBlendPath: z.string().min(1),
  reportPath: z.string().min(1),
  textureSearchRoots: z.array(z.string()).default([]),
  normalizeOutputPath: z.string().min(1),
  dryRun: z.boolean().default(true),
});

export type IngestionInspectRequest = z.infer<typeof IngestionInspectRequestSchema>;

export const IngestionReportSchema = z.object({
  schemaVersion: z.literal(SCENERY_SCHEMA_VERSION),
  kind: z.literal('tivvlejoy_scenery_inspect'),
  sourceId: z.string(),
  blenderExecuted: z.boolean(),
  blenderVersionDetected: z.string().nullable(),
  supportedBlenderVersion: z.literal(SUPPORTED_BLENDER_VERSION),
  dryRun: z.boolean(),
  sourceModified: z.literal(false),
  normalizedWritten: z.boolean(),
  objects: z.array(z.string()),
  collections: z.array(z.string()),
  materials: z.array(z.string()),
  images: z.array(z.string()),
  nodeGroups: z.array(z.string()),
  missingExternalFiles: z.array(z.string()),
  packedTextures: z.array(z.string()),
  externalTextures: z.array(z.string()),
  geometryNodes: z.array(z.string()),
  unsupportedNodes: z.array(z.string()),
  duplicateMaterials: z.array(z.string()),
  duplicateImages: z.array(z.string()),
  dimensions: z.record(z.string()),
  triangleCounts: z.record(z.number()),
  origins: z.record(z.string()),
  proxyRecords: z.array(z.string()),
  deterministicAssetIds: z.array(z.string()),
  realExecution: z.enum(['not_run', 'completed']),
  notes: z.array(z.string()),
});

export type IngestionReport = z.infer<typeof IngestionReportSchema>;

export function buildBlenderInspectArgv(request: IngestionInspectRequest): string[] {
  const parsed = IngestionInspectRequestSchema.parse(request);
  return [
    'blender',
    '-b',
    '-noaudio',
    '--python',
    'scripts/blender/scenery_inspect.py',
    '--',
    '--source-id',
    parsed.sourceId,
    '--source',
    parsed.sourceBlendPath,
    '--report',
    parsed.reportPath,
    '--normalize-out',
    parsed.normalizeOutputPath,
    ...(parsed.dryRun ? ['--dry-run'] : []),
    ...parsed.textureSearchRoots.flatMap((root) => ['--texture-root', root]),
  ];
}

export function createDryRunInspectReport(request: IngestionInspectRequest): IngestionReport {
  const parsed = IngestionInspectRequestSchema.parse(request);
  return {
    schemaVersion: SCENERY_SCHEMA_VERSION,
    kind: 'tivvlejoy_scenery_inspect',
    sourceId: parsed.sourceId,
    blenderExecuted: false,
    blenderVersionDetected: null,
    supportedBlenderVersion: SUPPORTED_BLENDER_VERSION,
    dryRun: true,
    sourceModified: false,
    normalizedWritten: false,
    objects: [],
    collections: [],
    materials: [],
    images: [],
    nodeGroups: [],
    missingExternalFiles: [],
    packedTextures: [],
    externalTextures: [],
    geometryNodes: [],
    unsupportedNodes: [],
    duplicateMaterials: [],
    duplicateImages: [],
    dimensions: {},
    triangleCounts: {},
    origins: {},
    proxyRecords: [],
    deterministicAssetIds: [],
    realExecution: 'not_run',
    notes: [
      'Dry-run only. Purchased source files were not opened.',
      'Real Blender execution was not run.',
      'Normalization writes only to a separate output path and never overwrites source.',
    ],
  };
}

export function parseInspectReport(value: unknown): IngestionReport {
  const parsed = IngestionReportSchema.safeParse(value);
  if (!parsed.success) {
    throw new SceneryError(
      `Invalid ingestion report. ${parsed.error.issues[0]?.message ?? ''}`.trim(),
      'INVALID_REPORT',
    );
  }
  return parsed.data;
}

export function serializeInspectReport(report: IngestionReport): string {
  return `${JSON.stringify(report, Object.keys(report).sort(), 2)}\n`;
}
