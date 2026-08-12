/**
 * Runpod GraphQL client — auth + resource queries by default.
 * Pod creation is HARD-GATED behind allowPaidGpuLaunch.
 * Never logs API keys.
 */
import { AppError } from '@doodle-dash/shared';
import {
  PREFERRED_RUNPOD_GPU_TYPES,
  resolveCloudCostLimitsFromEnv,
  validateRunpodWorkerImageRef,
} from './config';
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
  private readonly env: Record<string, string | undefined>;

  constructor(options?: {
    apiKey?: string;
    endpoint?: string;
    userAgent?: string;
    env?: Record<string, string | undefined>;
  }) {
    const env = options?.env ?? process.env;
    this.env = env;
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
   * Do not call from automatic flows after coding.
   */
  async createPodForBenchmark(input: {
    name: string;
    imageName: string;
    gpuTypeId: string;
    confirmPaidLaunch: true;
    cloudType?: 'SECURE' | 'COMMUNITY';
    /**
     * Number of GPUs for the on-demand finder. RunPod's
     * `podFindAndDeployOnDemand` matches nothing (and returns the generic
     * "no longer any instances available with the requested specifications"
     * error, even when aggregate stockStatus is High) unless a positive
     * gpuCount is supplied. Defaults to 1.
     */
    gpuCount?: number;
    containerDiskInGb?: number;
    volumeInGb?: number;
    env?: Record<string, string>;
    /**
     * Optional container command override (Runpod `dockerArgs`). Used by the
     * single-pod benchmark to run the worker's single-shot mode twice in
     * sequence (DRAFT_HD then one FINAL_1080P shot) on ONE pod. Must never
     * contain secret values — secrets are passed via `env` only.
     */
    dockerArgs?: string;
  }): Promise<{ podId: string }> {
    const limits = resolveCloudCostLimitsFromEnv(this.env);
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

    // Fail-closed image gate: refuse to boot a paid pod unless the worker image
    // is a trusted, immutable ghcr.io reference pinned by @sha256 digest. This
    // check runs BEFORE any create-pod network request so a missing / malformed
    // / mutable (:latest) image can never launch billable hardware.
    const imageCheck = validateRunpodWorkerImageRef(input.imageName);
    if (!imageCheck.ok) {
      throw new AppError(
        `Worker image rejected before pod creation: ${imageCheck.reason}`,
        imageCheck.code,
        403,
      );
    }

    // Intentionally not auto-invoked. Mutation included for Phase 22 only after approval.
    const data = await this.graphql<{
      podFindAndDeployOnDemand?: { id?: string } | null;
    }>(
      `mutation ($input: PodFindAndDeployOnDemandInput!) {
        podFindAndDeployOnDemand(input: $input) { id }
      }`,
      {
        input: {
          name: input.name,
          imageName: input.imageName,
          gpuTypeId: input.gpuTypeId,
          gpuCount: input.gpuCount && input.gpuCount > 0 ? Math.floor(input.gpuCount) : 1,
          cloudType: input.cloudType ?? 'SECURE',
          containerDiskInGb: input.containerDiskInGb ?? 40,
          volumeInGb: input.volumeInGb ?? 20,
          env: Object.entries(input.env ?? {}).map(([key, value]) => ({ key, value })),
          ...(input.dockerArgs ? { dockerArgs: input.dockerArgs } : {}),
        },
      },
    );

    const podId = data.podFindAndDeployOnDemand?.id;
    if (!podId) {
      throw new AppError('Runpod pod create returned no id.', 'RUNPOD_POD_CREATE_FAILED', 502);
    }
    return { podId };
  }

  async terminatePod(podId: string): Promise<void> {
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
