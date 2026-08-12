import { describe, expect, it } from 'vitest';
import {
  CloudCostGuardrails,
  RunpodClient,
  LocalBlenderProvider,
  localBlenderProvider,
  getRenderProvider,
  type CostEstimate,
} from '@doodle-dash/production';

function estimate(overrides: Partial<CostEstimate> = {}): CostEstimate {
  return {
    estimatedGpuHours: 0.5,
    estimatedCostUsd: 0.15,
    confidence: 'MEDIUM',
    gpuType: 'NVIDIA GeForce RTX 4090',
    gpuHourlyPriceUsd: 0.34,
    estimatedRuntimeMinutes: 15,
    frameCount: 210,
    assumptions: {},
    ...overrides,
  };
}

describe('Cloud Cost Guardian', () => {
  const enabled = () =>
    CloudCostGuardrails.fromPartial({
      cloudRenderEnabled: true,
      allowPaidGpuLaunch: true,
      maxGpuHourlyPrice: 0.8,
      maxSingleJobCost: 2.0,
      maxDailyGpuCost: 10.0,
      maxMonthlyGpuCost: 50.0,
    });

  it('allows a benchmark within all guardrails', () => {
    const decision = enabled().evaluate({ estimate: estimate() });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('OK');
  });

  it('blocks when cloud rendering is disabled (default)', () => {
    const decision = CloudCostGuardrails.fromPartial({ allowPaidGpuLaunch: true }).evaluate({ estimate: estimate() });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('CLOUD_RENDER_DISABLED');
  });

  it('blocks when paid GPU launch is not approved', () => {
    const decision = enabled().evaluate({ estimate: estimate(), paidGpuApproved: false });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('PAID_GPU_NOT_APPROVED');
  });

  it('blocks when GPU hourly price exceeds the cap', () => {
    const decision = enabled().evaluate({ estimate: estimate({ gpuHourlyPriceUsd: 1.5 }) });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('HOURLY_PRICE_EXCEEDED');
  });

  it('blocks when single-job cost exceeds the cap', () => {
    const decision = enabled().evaluate({ estimate: estimate({ estimatedCostUsd: 3.0 }) });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('JOB_COST_EXCEEDED');
  });

  it('blocks when projected daily spend exceeds the cap', () => {
    const decision = enabled().evaluate({ estimate: estimate({ estimatedCostUsd: 0.2 }), spend: { dailySpentUsd: 9.95, monthlySpentUsd: 0 } });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('DAILY_COST_EXCEEDED');
  });
});

describe('Paid GPU launch guard', () => {
  it('createPodForBenchmark refuses when ALLOW_PAID_GPU_LAUNCH is false', async () => {
    // Provide a fake key so the constructor passes; the gate must still block.
    const client = new RunpodClient({ apiKey: 'rpa_fake_test_key', env: { ...process.env, ALLOW_PAID_GPU_LAUNCH: 'false', CLOUD_RENDER_ENABLED: 'false' } });
    await expect(
      client.createPodForBenchmark({
        name: 'ddp-benchmark',
        imageName: 'example/ddp-runpod-blender:test',
        gpuTypeId: 'NVIDIA GeForce RTX 4090',
        confirmPaidLaunch: true,
      }),
    ).rejects.toMatchObject({ code: 'PAID_GPU_NOT_APPROVED' });
  });
});

describe('Local fallback remains functional', () => {
  it('local Blender provider is available and resolvable', () => {
    expect(localBlenderProvider).toBeInstanceOf(LocalBlenderProvider);
    expect(localBlenderProvider.id).toBe('LOCAL_BLENDER');
    const provider = getRenderProvider('LOCAL_BLENDER');
    expect(provider.id).toBe('LOCAL_BLENDER');
  });
});
