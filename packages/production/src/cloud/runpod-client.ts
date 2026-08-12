/**
 * Runpod GraphQL client — auth + resource queries by default.
 * Pod creation is HARD-GATED behind allowPaidGpuLaunch.
 * Never logs API keys.
 */
import { AppError } from '@doodle-dash/shared';
import { PREFERRED_RUNPOD_GPU_TYPES, resolveCloudCostLimitsFromEnv } from './config';
import { redactSecrets, stripTrailingSecretNoise } from './secret-safety';

export type RunpodGpuType = {
  id: string;
  displayName: string;
  memoryInGb: number | null;
  secureCloud: boolean | null;
  communityCloud: boolean | null;
  uninterruptablePrice: number | null;
  minimumBidPrice: number | null;
};

export type RunpodAuthResult = {
  ok: boolean;
  myselfIdPresent: boolean;
  gpuTypes: RunpodGpuType[];
  preferred: RunpodGpuType[];
  message: string;
};

type GraphQlResponse = {
  data?: Record<string, unknown>;
  errors?: Array<{ message?: string }>;
};

export class RunpodClient {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly userAgent: string;

  constructor(options?: {
    apiKey?: string;
    endpoint?: string;
    userAgent?: string;
    env?: Record<string, string | undefined>;
  }) {
    const env = options?.env ?? process.env;
    this.apiKey = stripTrailingSecretNoise(options?.apiKey ?? env.RUNPOD_API_KEY);
    this.endpoint = options?.endpoint ?? env.RUNPOD_API_ENDPOINT ?? 'https://api.runpod.io/graphql';
    this.userAgent = options?.userAgent ?? 'DoodleDashProduction/1.0';
    if (!this.apiKey) {
      throw new AppError('RUNPOD_API_KEY is not configured.', 'RUNPOD_KEY_MISSING', 501);
    }
  }

  async graphql<T = Record<string, unknown>>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const body = JSON.stringify({ query, variables });
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'User-Agent': this.userAgent,
      },
      body,
    });
    const text = await res.text();
    let parsed: GraphQlResponse;
    try {
      parsed = JSON.parse(text) as GraphQlResponse;
    } catch {
      throw new AppError(
        redactSecrets(`Runpod non-JSON response HTTP ${res.status}`),
        'RUNPOD_BAD_RESPONSE',
        502,
      );
    }
    if (!res.ok) {
      throw new AppError(
        redactSecrets(`Runpod HTTP ${res.status}: ${(parsed.errors ?? []).map((e) => e.message).join('; ') || 'error'}`),
        'RUNPOD_HTTP_ERROR',
        502,
      );
    }
    if (parsed.errors?.length) {
      throw new AppError(
        redactSecrets(parsed.errors.map((e) => e.message ?? 'error').join('; ')),
        'RUNPOD_GRAPHQL_ERROR',
        502,
      );
    }
    return (parsed.data ?? {}) as T;
  }

  /** Non-billable auth + GPU catalog query. Never creates pods. */
  async verifyAuthAndListGpus(): Promise<RunpodAuthResult> {
    const data = await this.graphql<{
      myself?: { id?: string } | null;
      gpuTypes?: Array<{
        id?: string;
        displayName?: string;
        memoryInGb?: number;
        secureCloud?: boolean;
        communityCloud?: boolean;
        lowestPrice?: { minimumBidPrice?: number; uninterruptablePrice?: number } | null;
      }>;
    }>(
      `query {
        myself { id }
        gpuTypes {
          id
          displayName
          memoryInGb
          secureCloud
          communityCloud
          lowestPrice(input: { gpuCount: 1 }) {
            minimumBidPrice
            uninterruptablePrice
          }
        }
      }`,
    );

    const gpuTypes: RunpodGpuType[] = (data.gpuTypes ?? []).map((g) => ({
      id: g.id ?? g.displayName ?? 'unknown',
      displayName: g.displayName ?? g.id ?? 'unknown',
      memoryInGb: g.memoryInGb ?? null,
      secureCloud: g.secureCloud ?? null,
      communityCloud: g.communityCloud ?? null,
      uninterruptablePrice: g.lowestPrice?.uninterruptablePrice ?? null,
      minimumBidPrice: g.lowestPrice?.minimumBidPrice ?? null,
    }));

    const preferred = gpuTypes.filter((g) =>
      PREFERRED_RUNPOD_GPU_TYPES.some(
        (p) => g.id === p || g.displayName.toLowerCase().includes(p.toLowerCase().replace('nvidia ', '')),
      ),
    );

    const myselfIdPresent = Boolean(data.myself?.id);
    return {
      ok: myselfIdPresent && gpuTypes.length > 0,
      myselfIdPresent,
      gpuTypes,
      preferred,
      message: myselfIdPresent
        ? `Authenticated. ${gpuTypes.length} GPU types available. No pods created.`
        : 'Authentication failed or myself.id missing.',
    };
  }

  /**
   * HARD SAFETY GATE — refuses unless ALLOW_PAID_GPU_LAUNCH=true and caller opts in.
   * Uses REST API so dockerEntrypoint can override image start scripts.
   */
  async createPodForBenchmark(input: {
    name: string;
    imageName: string;
    gpuTypeId: string;
    confirmPaidLaunch: true;
    cloudType?: 'SECURE' | 'COMMUNITY' | 'ALL';
    containerDiskInGb?: number;
    volumeInGb?: number;
    dockerArgs?: string;
    dockerEntrypoint?: string[];
    dockerStartCmd?: string[];
    ports?: string;
    volumeMountPath?: string;
    env?: Record<string, string>;
  }): Promise<{ podId: string; costPerHr: number | null }> {
    const limits = resolveCloudCostLimitsFromEnv();
    if (!limits.allowPaidGpuLaunch) {
      throw new AppError(
        'Paid GPU launch blocked: ALLOW_PAID_GPU_LAUNCH is false. Waiting for explicit user approval.',
        'PAID_GPU_NOT_APPROVED',
        403,
      );
    }
    if (!limits.cloudRenderEnabled) {
      throw new AppError('CLOUD_RENDER_ENABLED is false.', 'CLOUD_RENDER_DISABLED', 403);
    }
    if (input.confirmPaidLaunch !== true) {
      throw new AppError('confirmPaidLaunch must be true.', 'PAID_GPU_NOT_CONFIRMED', 403);
    }

    const cloudType =
      input.cloudType === 'ALL' || !input.cloudType ? 'SECURE' : input.cloudType;
    const dockerEntrypoint = input.dockerEntrypoint ?? ['/bin/bash', '-lc'];
    const dockerStartCmd =
      input.dockerStartCmd ??
      (input.dockerArgs ? [input.dockerArgs.replace(/^bash -c\s+/, '').replace(/^'|'$/g, '')] : []);

    const body = {
      name: input.name,
      imageName: input.imageName,
      gpuTypeIds: [input.gpuTypeId],
      cloudType,
      computeType: 'GPU',
      gpuCount: 1,
      containerDiskInGb: input.containerDiskInGb ?? 40,
      volumeInGb: input.volumeInGb ?? 0,
      volumeMountPath: input.volumeMountPath ?? '/workspace',
      ports: [input.ports ?? '8080/http'],
      dockerEntrypoint,
      dockerStartCmd,
      env: input.env ?? {},
    };

    const res = await fetch('https://rest.runpod.io/v1/pods', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'User-Agent': this.userAgent,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: {
      id?: string;
      costPerHr?: number;
      message?: string;
      error?: string;
    };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      throw new AppError(
        redactSecrets(`Runpod REST non-JSON HTTP ${res.status}`),
        'RUNPOD_BAD_RESPONSE',
        502,
      );
    }
    if (!res.ok || !parsed.id) {
      throw new AppError(
        redactSecrets(
          `Runpod REST create failed HTTP ${res.status}: ${parsed.message || parsed.error || text.slice(0, 300)}`,
        ),
        'RUNPOD_POD_CREATE_FAILED',
        502,
      );
    }

    const costPerHr = parsed.costPerHr ?? null;
    if (costPerHr != null && costPerHr > limits.maxGpuHourlyPrice) {
      try {
        await this.terminatePod(parsed.id);
      } catch {
        /* still throw price error */
      }
      throw new AppError(
        `Pod hourly price $${costPerHr} exceeds MAX_GPU_HOURLY_PRICE $${limits.maxGpuHourlyPrice}; terminated immediately.`,
        'GPU_PRICE_EXCEEDED',
        402,
      );
    }

    return { podId: parsed.id, costPerHr };
  }

  async getPod(podId: string): Promise<{
    id: string;
    name: string | null;
    desiredStatus: string | null;
    runtime: { uptimeInSeconds?: number | null } | null;
    machine: { gpuDisplayName?: string | null } | null;
    costPerHr: number | null;
  } | null> {
    // Prefer REST get — GraphQL myself.pods can lag/omit Community pods mid-run.
    try {
      const res = await fetch(`https://rest.runpod.io/v1/pods/${encodeURIComponent(podId)}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': this.userAgent,
        },
      });
      if (res.status === 404) return null;
      if (res.ok) {
        const pod = (await res.json()) as {
          id?: string;
          name?: string;
          desiredStatus?: string;
          costPerHr?: number;
          runtime?: { uptimeInSeconds?: number } | null;
          machine?: { gpuDisplayName?: string } | null;
        };
        if (pod.id) {
          return {
            id: pod.id,
            name: pod.name ?? null,
            desiredStatus: pod.desiredStatus ?? null,
            runtime: pod.runtime ?? null,
            machine: pod.machine ?? null,
            costPerHr: pod.costPerHr ?? null,
          };
        }
      }
    } catch {
      /* fall through to GraphQL */
    }

    const data = await this.graphql<{
      myself?: {
        pods?: Array<{
          id?: string;
          name?: string;
          desiredStatus?: string;
          costPerHr?: number;
          runtime?: { uptimeInSeconds?: number } | null;
          machine?: { gpuDisplayName?: string } | null;
        }>;
      } | null;
    }>(
      `query {
        myself {
          pods {
            id
            name
            desiredStatus
            costPerHr
            runtime { uptimeInSeconds }
            machine { gpuDisplayName }
          }
        }
      }`,
    );
    const pod = (data.myself?.pods ?? []).find((p) => p.id === podId);
    if (!pod?.id) return null;
    return {
      id: pod.id,
      name: pod.name ?? null,
      desiredStatus: pod.desiredStatus ?? null,
      runtime: pod.runtime ?? null,
      machine: pod.machine ?? null,
      costPerHr: pod.costPerHr ?? null,
    };
  }

  async terminatePod(podId: string): Promise<void> {
    // Prefer REST delete; fall back to GraphQL terminate.
    const res = await fetch(`https://rest.runpod.io/v1/pods/${encodeURIComponent(podId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'User-Agent': this.userAgent,
      },
    });
    if (res.ok || res.status === 404) return;
    await this.graphql(
      `mutation ($podId: String!) {
        podTerminate(input: { podId: $podId })
      }`,
      { podId },
    );
  }

  async stopPod(podId: string): Promise<void> {
    await this.graphql(
      `mutation ($podId: String!) {
        podStop(input: { podId: $podId }) { id }
      }`,
      { podId },
    );
  }
}

export async function runpodAuthSelfTest(
  env: Record<string, string | undefined> = process.env,
): Promise<RunpodAuthResult> {
  try {
    const client = new RunpodClient({ env });
    return await client.verifyAuthAndListGpus();
  } catch (error) {
    return {
      ok: false,
      myselfIdPresent: false,
      gpuTypes: [],
      preferred: [],
      message: redactSecrets((error as Error).message),
    };
  }
}
