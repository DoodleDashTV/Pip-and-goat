import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RunpodClient,
  resolveRunpodWorkerImage,
  validateRunpodWorkerImageRef,
} from '@doodle-dash/production';

const VALID_DIGEST = 'sha256:' + 'a'.repeat(64);
const VALID_IMAGE = `ghcr.io/example-org/ddp-runpod-blender@${VALID_DIGEST}`;

function paidEnv(overrides: Record<string, string> = {}): Record<string, string | undefined> {
  return {
    ...process.env,
    ALLOW_PAID_GPU_LAUNCH: 'true',
    CLOUD_RENDER_ENABLED: 'true',
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('validateRunpodWorkerImageRef (fail-closed image gate)', () => {
  it('rejects an empty / unconfigured image', () => {
    const res = validateRunpodWorkerImageRef('');
    expect(res.ok).toBe(false);
    expect(res.code).toBe('WORKER_IMAGE_MISSING');
  });

  it('rejects a tag-only (unpinned) image', () => {
    const res = validateRunpodWorkerImageRef('ghcr.io/example-org/ddp-runpod-blender:30605cf');
    expect(res.ok).toBe(false);
    expect(res.code).toBe('WORKER_IMAGE_NOT_PINNED');
  });

  it('rejects a mutable :latest tag (no digest)', () => {
    const res = validateRunpodWorkerImageRef('ghcr.io/example-org/ddp-runpod-blender:latest');
    expect(res.ok).toBe(false);
    expect(res.code).toBe('WORKER_IMAGE_MUTABLE_TAG');
  });

  it('rejects a mutable :latest tag even when a digest is appended', () => {
    const res = validateRunpodWorkerImageRef(
      `ghcr.io/example-org/ddp-runpod-blender:latest@${VALID_DIGEST}`,
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe('WORKER_IMAGE_MUTABLE_TAG');
  });

  it('rejects a malformed (non-sha256) digest', () => {
    const res = validateRunpodWorkerImageRef('ghcr.io/example-org/ddp-runpod-blender@sha256:zzzz');
    expect(res.ok).toBe(false);
    expect(res.code).toBe('WORKER_IMAGE_BAD_DIGEST');
  });

  it('rejects an untrusted (non-ghcr.io) registry', () => {
    const res = validateRunpodWorkerImageRef(`docker.io/example-org/ddp-runpod-blender@${VALID_DIGEST}`);
    expect(res.ok).toBe(false);
    expect(res.code).toBe('WORKER_IMAGE_UNTRUSTED_REGISTRY');
  });

  it('accepts an immutable ghcr.io reference pinned by @sha256 digest', () => {
    const res = validateRunpodWorkerImageRef(VALID_IMAGE);
    expect(res.ok).toBe(true);
    expect(res.code).toBe('OK');
    expect(res.registry).toBe('ghcr.io');
    expect(res.repository).toBe('example-org/ddp-runpod-blender');
    expect(res.digest).toBe(VALID_DIGEST);
  });

  it('resolveRunpodWorkerImage reads RUNPOD_WORKER_IMAGE from env', () => {
    expect(resolveRunpodWorkerImage({ RUNPOD_WORKER_IMAGE: VALID_IMAGE })).toBe(VALID_IMAGE);
    expect(resolveRunpodWorkerImage({})).toBe('');
  });
});

describe('createPodForBenchmark image gate (no network on failure)', () => {
  it('rejects a missing/malformed image BEFORE any create-pod network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const client = new RunpodClient({ apiKey: 'rpa_fake_test_key', env: paidEnv() });
    await expect(
      client.createPodForBenchmark({
        name: 'ddp-benchmark',
        imageName: 'ghcr.io/example-org/ddp-runpod-blender:latest',
        gpuTypeId: 'NVIDIA GeForce RTX 4090',
        confirmPaidLaunch: true,
      }),
    ).rejects.toMatchObject({ code: 'WORKER_IMAGE_MUTABLE_TAG' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an unconfigured image BEFORE any create-pod network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const client = new RunpodClient({ apiKey: 'rpa_fake_test_key', env: paidEnv() });
    await expect(
      client.createPodForBenchmark({
        name: 'ddp-benchmark',
        imageName: '',
        gpuTypeId: 'NVIDIA GeForce RTX 4090',
        confirmPaidLaunch: true,
      }),
    ).rejects.toMatchObject({ code: 'WORKER_IMAGE_MISSING' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('paid-GPU guard takes precedence over the image gate when launch is not approved', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const client = new RunpodClient({
      apiKey: 'rpa_fake_test_key',
      env: { ...process.env, ALLOW_PAID_GPU_LAUNCH: 'false', CLOUD_RENDER_ENABLED: 'false' },
    });
    await expect(
      client.createPodForBenchmark({
        name: 'ddp-benchmark',
        // Even a bad image must not change the code — the paid-GPU gate wins.
        imageName: 'ghcr.io/example-org/ddp-runpod-blender:latest',
        gpuTypeId: 'NVIDIA GeForce RTX 4090',
        confirmPaidLaunch: true,
      }),
    ).rejects.toMatchObject({ code: 'PAID_GPU_NOT_APPROVED' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts a digest-pinned image and proceeds to the create-pod request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { podFindAndDeployOnDemand: { id: 'pod_unit_test' } } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = new RunpodClient({ apiKey: 'rpa_fake_test_key', env: paidEnv() });
    const res = await client.createPodForBenchmark({
      name: 'ddp-benchmark',
      imageName: VALID_IMAGE,
      gpuTypeId: 'NVIDIA GeForce RTX 4090',
      confirmPaidLaunch: true,
    });
    expect(res.podId).toBe('pod_unit_test');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // The immutable digest must be forwarded verbatim as the pod image.
    const body = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit)?.body ?? '{}'));
    expect(body.variables.input.imageName).toBe(VALID_IMAGE);
  });
});
