import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLOUD_COST_LIMITS,
  CloudCostGuardrails,
  buildCloudJobManifest,
  buildCloudCacheKey,
  planAssetSync,
  executeUploadPlan,
  estimateCloudRenderCost,
  actualCostFromRuntime,
  IdleShutdownController,
  RunawayRenderGuard,
  evaluateGpuHealth,
  chooseRenderProvider,
  batchProductionOrchestrator,
  seasonProductionQueue,
  assertNoSecretsInManifest,
  resolveCloudCostLimitsFromEnv,
  characterAssetKey,
  FOUNDING_CLOUD_ASSET_IDS,
  localBlenderProvider,
  getRenderProvider,
} from '@doodle-dash/production';
import { InMemoryObjectStorage, resolveObjectStorageConfig, sha256Hex } from '@doodle-dash/shared';

describe('DDP cloud production engine', () => {
  it('defaults cloud render off with conservative cost limits', () => {
    expect(DEFAULT_CLOUD_COST_LIMITS.cloudRenderEnabled).toBe(false);
    expect(DEFAULT_CLOUD_COST_LIMITS.maxGpuHourlyPrice).toBe(0.8);
    expect(DEFAULT_CLOUD_COST_LIMITS.maxSingleJobCost).toBe(2.0);
    expect(DEFAULT_CLOUD_COST_LIMITS.maxDailyGpuCost).toBe(10.0);
    expect(DEFAULT_CLOUD_COST_LIMITS.maxMonthlyGpuCost).toBe(50.0);
    expect(DEFAULT_CLOUD_COST_LIMITS.idleShutdownMinutes).toBe(5);
    expect(DEFAULT_CLOUD_COST_LIMITS.allowPaidGpuLaunch).toBe(false);
  });

  it('resolves R2_* aliases into S3-compatible config', () => {
    const cfg = resolveObjectStorageConfig({
      R2_BUCKET: 'ddp-prod',
      R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
      R2_ACCESS_KEY_ID: 'akid',
      R2_SECRET_ACCESS_KEY: 'secret',
    });
    expect(cfg.provider).toBe('s3');
    if (cfg.provider === 's3') {
      expect(cfg.bucket).toBe('ddp-prod');
      expect(cfg.endpoint).toContain('r2');
      expect(cfg.forcePathStyle).toBe(true);
    }
  });

  it('builds a secret-free cloud job manifest with Pip/Goat asset refs', () => {
    const pipChecksum = sha256Hex(new TextEncoder().encode('pip'));
    const goatChecksum = sha256Hex(new TextEncoder().encode('goat'));
    const manifest = buildCloudJobManifest({
      jobId: '11111111-1111-4111-8111-111111111111',
      episodeId: '22222222-2222-4222-8222-222222222222',
      seasonId: 'season_01',
      episodeNumber: 1,
      renderMode: 'FINAL_1080P',
      resolution: '1080x1920',
      fps: 30,
      estimatedFrameCount: 1800,
      pip: {
        assetId: FOUNDING_CLOUD_ASSET_IDS.pip,
        version: 'v1',
        checksum: pipChecksum,
        role: 'character',
        required: true,
      },
      goat: {
        assetId: FOUNDING_CLOUD_ASSET_IDS.goat,
        version: 'v1',
        checksum: goatChecksum,
        role: 'character',
        required: true,
      },
    });
    expect(manifest.schemaVersion).toBe('ddp-cloud-job-manifest-v1');
    expect(manifest.credentialsPolicy.secretsInManifest).toBe(false);
    expect(manifest.outputPath.startsWith('renders/finals/')).toBe(true);
    expect(() => assertNoSecretsInManifest(manifest)).not.toThrow();
    expect(buildCloudCacheKey(manifest)).toHaveLength(64);
  });

  it('syncs assets by checksum — reuse when remote matches', async () => {
    const storage = new InMemoryObjectStorage();
    const bytes = new TextEncoder().encode('char-pip-bytes');
    const checksum = sha256Hex(bytes);
    const asset = {
      assetId: FOUNDING_CLOUD_ASSET_IDS.pip,
      version: 'v1',
      checksum,
      role: 'character' as const,
      required: true,
      localPath: '/tmp/does-not-matter-on-reuse',
    };
    const key = characterAssetKey('pip', `${asset.version}_${checksum.slice(0, 12)}`, 'char_pip_v1.bin');
    // Put with the resolver key path used by planAssetSync
    const plan1 = await planAssetSync({ assets: [asset], storage, direction: 'upload' });
    expect(plan1.uploads).toBe(1);
    await storage.putObject(plan1.items[0]!.remoteKey, bytes);
    const plan2 = await planAssetSync({ assets: [asset], storage, direction: 'upload' });
    expect(plan2.reuses).toBe(1);
    expect(plan2.uploads).toBe(0);
    void key;
  });

  it('enforces hourly/job/daily/monthly cost guards', () => {
    const base = {
      ...DEFAULT_CLOUD_COST_LIMITS,
      cloudRenderEnabled: true,
      allowPaidGpuLaunch: true,
    };
    const estimate = estimateCloudRenderCost({
      frameCount: 100,
      resolution: '1080x1920',
      profile: 'FINAL_1080P',
      gpuType: 'NVIDIA GeForce RTX 4090',
      gpuHourlyPriceUsd: 0.34,
    });
    expect(
      new CloudCostGuardrails({ ...base, maxGpuHourlyPrice: 0.2 }).evaluate({
        estimate: { ...estimate, gpuHourlyPriceUsd: 0.34 },
        paidGpuApproved: true,
      }).code,
    ).toBe('HOURLY_PRICE_EXCEEDED');
    expect(
      new CloudCostGuardrails(base).evaluate({
        estimate: { ...estimate, estimatedCostUsd: 5 },
        paidGpuApproved: true,
      }).code,
    ).toBe('JOB_COST_EXCEEDED');
    expect(
      new CloudCostGuardrails({ ...base, maxDailyGpuCost: 1 }).evaluate({
        estimate: { ...estimate, estimatedCostUsd: 0.8 },
        spend: { dailySpentUsd: 0.5, monthlySpentUsd: 0 },
        paidGpuApproved: true,
      }).code,
    ).toBe('DAILY_COST_EXCEEDED');
    expect(
      new CloudCostGuardrails({ ...base, maxMonthlyGpuCost: 1 }).evaluate({
        estimate: { ...estimate, estimatedCostUsd: 0.8 },
        spend: { dailySpentUsd: 0, monthlySpentUsd: 0.5 },
        paidGpuApproved: true,
      }).code,
    ).toBe('MONTHLY_COST_EXCEEDED');
    expect(actualCostFromRuntime({ runtimeMinutes: 30, gpuHourlyPriceUsd: 0.34 }).actualCostUsd).toBeCloseTo(
      0.17,
      4,
    );
  });

  it('idle-shutdowns after queue empty timeout', async () => {
    let terminated = false;
    const ctl = new IdleShutdownController(0.00005, async () => {
      terminated = true;
    });
    ctl.markQueueEmpty();
    await new Promise((r) => setTimeout(r, 20));
    const res = await ctl.tick();
    expect(res.shutdown).toBe(true);
    expect(terminated).toBe(true);
    expect(ctl.getState().log.map((l) => l.event)).toEqual(
      expect.arrayContaining(['worker_started', 'queue_empty', 'shutdown_requested', 'shutdown_confirmed']),
    );
  });

  it('detects runaway when frames stall', async () => {
    const guard = new RunawayRenderGuard({
      maxSecondsWithoutFrameProgress: 0.01,
      maxSecondsPerFrame: 1,
      maxJobRuntimeMinutes: 180,
      maxSecondsWithoutHeartbeat: 999,
      maxFfmpegSeconds: 999,
    });
    await new Promise((r) => setTimeout(r, 20));
    const result = guard.evaluate();
    expect(result.stalled).toBe(true);
    expect(result.shouldCancel).toBe(true);
    expect(result.shouldTerminateGpu).toBe(true);
  });

  it('fails GPU health without hardware acceleration', () => {
    const bad = evaluateGpuHealth({
      gpuModel: 'UNKNOWN',
      hardwareAcceleration: false,
      benchmarkOk: true,
    });
    expect(bad.ok).toBe(false);
    const good = evaluateGpuHealth({
      gpuModel: 'NVIDIA GeForce RTX 4090',
      vramGb: 24,
      blenderVersion: '4.2.0',
      eeveeVersion: 'EEVEE',
      renderBackend: 'CUDA',
      hardwareAcceleration: true,
      benchmarkOk: true,
      benchmarkMs: 50,
    });
    expect(good.ok).toBe(true);
  });

  it('routes AUDIT_FAST to local and keeps LocalBlenderProvider', async () => {
    const decision = await chooseRenderProvider({ profile: 'AUDIT_FAST' });
    expect(decision.provider).toBe('LOCAL_BLENDER');
    expect(getRenderProvider('LOCAL_BLENDER').id).toBe('LOCAL_BLENDER');
    expect(localBlenderProvider.id).toBe('LOCAL_BLENDER');
  });

  it('plans batch episodes on one GPU then shutdown', () => {
    const session = batchProductionOrchestrator.createSession({
      episodeIds: ['ep1', 'ep2', 'ep3', 'ep4', 'ep5'],
      seasonId: 'season_01',
    });
    const plan = batchProductionOrchestrator.plan(session);
    expect(plan[0]).toBe('start_one_gpu');
    expect(plan).toContain('render_episode:ep3');
    expect(plan[plan.length - 1]).toBe('shutdown_gpu');
    seasonProductionQueue.upsert({
      seasonId: 'season_01',
      episodeId: 'ep1',
      episodeNumber: 1,
      priority: 80,
      draftApproved: true,
      finalApproved: true,
      renderStatus: 'PENDING',
      qcStatus: 'PENDING',
      cloudCost: null,
      finalOutput: null,
    });
    expect(seasonProductionQueue.readyForFinal('season_01')).toHaveLength(1);
  });

  it('does not enable cloud from env by default', () => {
    const limits = resolveCloudCostLimitsFromEnv({});
    expect(limits.cloudRenderEnabled).toBe(false);
    expect(limits.allowPaidGpuLaunch).toBe(false);
  });

  it('upload plan writes checksum sidecars into memory storage', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const os = await import('node:os');
    const storage = new InMemoryObjectStorage();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ddp-asset-'));
    const file = path.join(dir, 'pip.blend');
    const bytes = new TextEncoder().encode('pip-blend-bytes');
    await fs.writeFile(file, bytes);
    const checksum = sha256Hex(bytes);
    const plan = await planAssetSync({
      assets: [
        {
          assetId: FOUNDING_CLOUD_ASSET_IDS.pip,
          version: 'v1',
          checksum,
          role: 'character',
          required: true,
          localPath: file,
        },
      ],
      storage,
      direction: 'upload',
    });
    const result = await executeUploadPlan({ plan, storage });
    expect(result.uploaded).toHaveLength(1);
    expect(await storage.exists!(`${result.uploaded[0]}.sha256`)).toBe(true);
  });
});
