import { z } from 'zod';

/** Cloud render UI / worker progress stages (Phase 17). */
export const CloudRenderStageSchema = z.enum([
  'QUEUED',
  'PREPARING_ASSETS',
  'STARTING_GPU',
  'WORKER_READY',
  'DOWNLOADING_ASSETS',
  'LOADING_BLENDER',
  'RENDERING',
  'FRAME_PROGRESS',
  'ENCODING',
  'QC',
  'UPLOADING',
  'COMPLETE',
  'FAILED',
]);
export type CloudRenderStage = z.infer<typeof CloudRenderStageSchema>;

export const RenderProviderIdSchema = z.enum(['LOCAL_BLENDER', 'RUNPOD_BLENDER']);
export type RenderProviderId = z.infer<typeof RenderProviderIdSchema>;

export const CloudRenderProfileSchema = z.enum([
  'AUDIT_FAST',
  'DRAFT_FAST',
  'DRAFT_HD',
  'FINAL_1080P',
  'PREMIUM',
]);
export type CloudRenderProfile = z.infer<typeof CloudRenderProfileSchema>;

export const AssetRefSchema = z.object({
  assetId: z.string().min(1),
  version: z.string().min(1),
  checksum: z.string().min(8),
  role: z.enum([
    'character',
    'environment',
    'prop',
    'animation',
    'vfx',
    'audio',
    'texture',
    'other',
  ]),
  localPath: z.string().optional(),
  remoteKey: z.string().optional(),
  required: z.boolean().default(true),
});
export type AssetRef = z.infer<typeof AssetRefSchema>;

export const CloudJobManifestSchema = z.object({
  schemaVersion: z.literal('ddp-cloud-job-manifest-v1'),
  jobId: z.string().min(1),
  episodeId: z.string().min(1),
  seasonId: z.string().optional().nullable(),
  episodeNumber: z.number().int().positive().optional(),
  renderMode: CloudRenderProfileSchema,
  resolution: z.string().min(3),
  fps: z.number().int().positive(),
  blenderVersionRequirement: z.string().default('4.2'),
  provider: RenderProviderIdSchema.default('RUNPOD_BLENDER'),
  characters: z.object({
    pip: AssetRefSchema.optional(),
    goat: AssetRefSchema.optional(),
  }),
  environments: z.array(AssetRefSchema).default([]),
  props: z.array(AssetRefSchema).default([]),
  animations: z.array(AssetRefSchema).default([]),
  expressionStates: z.record(z.unknown()).default({}),
  visemeData: z.record(z.unknown()).default({}),
  cameraState: z.record(z.unknown()).default({}),
  lightingState: z.record(z.unknown()).default({}),
  vfxState: z.record(z.unknown()).default({}),
  audioReferences: z.array(AssetRefSchema).default([]),
  outputPath: z.string().min(1),
  cacheKeys: z.array(z.string()).default([]),
  renderSettings: z.record(z.unknown()).default({}),
  estimatedFrameCount: z.number().int().nonnegative(),
  batchSessionId: z.string().optional(),
  createdAt: z.string(),
  /** Never include permanent secrets. Short-lived upload tokens may appear only if scoped. */
  credentialsPolicy: z
    .object({
      secretsInManifest: z.literal(false),
      r2Scoped: z.boolean().default(true),
      runpodServerSideOnly: z.literal(true),
    })
    .default({
      secretsInManifest: false,
      r2Scoped: true,
      runpodServerSideOnly: true,
    }),
});
export type CloudJobManifest = z.infer<typeof CloudJobManifestSchema>;

export type CostEstimate = {
  estimatedGpuHours: number;
  estimatedCostUsd: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  gpuType: string;
  gpuHourlyPriceUsd: number;
  estimatedRuntimeMinutes: number;
  frameCount: number;
  assumptions: Record<string, unknown>;
};

export type CostGuardDecision = {
  allowed: boolean;
  reason: string;
  code:
    | 'OK'
    | 'CLOUD_RENDER_DISABLED'
    | 'HOURLY_PRICE_EXCEEDED'
    | 'JOB_COST_EXCEEDED'
    | 'DAILY_COST_EXCEEDED'
    | 'MONTHLY_COST_EXCEEDED'
    | 'PAID_GPU_NOT_APPROVED';
  limits: CloudCostLimits;
  estimate?: CostEstimate;
};

export type CloudCostLimits = {
  cloudRenderEnabled: boolean;
  maxGpuHourlyPrice: number;
  maxSingleJobCost: number;
  maxDailyGpuCost: number;
  maxMonthlyGpuCost: number;
  idleShutdownMinutes: number;
  maxJobRuntimeMinutes: number;
  allowPaidGpuLaunch: boolean;
};

export type RenderProviderHealth = {
  provider: RenderProviderId;
  healthy: boolean;
  message: string;
  details?: Record<string, unknown>;
};

export type CloudRenderStatusView = {
  jobId: string;
  stage: CloudRenderStage;
  progress: number;
  frame?: number;
  totalFrames?: number;
  estimatedCostUsd?: number | null;
  actualCostUsd?: number | null;
  gpuType?: string | null;
  elapsedSeconds?: number | null;
  estimatedRemainingSeconds?: number | null;
  outputLocation?: string | null;
  message?: string | null;
  error?: string | null;
};

export type GpuHardwareReport = {
  gpuModel: string;
  vramGb: number | null;
  blenderVersion: string | null;
  eeveeVersion: string | null;
  os: string;
  renderBackend: string;
  hardwareAcceleration: boolean;
  benchmarkOk: boolean;
  benchmarkMs?: number;
  details?: Record<string, unknown>;
};
