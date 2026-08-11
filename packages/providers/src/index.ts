import { z } from 'zod';

/**
 * Optional video provider interface. Native 3D production must not depend on
 * these providers, and stubs intentionally never fall back to another system.
 */
export interface VideoProvider {
  generateScene(input: unknown): Promise<unknown>;
  getCapabilities(): Promise<unknown>;
  estimateCost(input: unknown): Promise<unknown>;
  checkStatus(jobId: string): Promise<unknown>;
  downloadResult(jobId: string): Promise<unknown>;
  supportsReferenceImages(): boolean;
  supportsAudio(): boolean;
}

export const ProviderSafeErrorSchema = z.object({
  status: z.number().int().min(100).max(599).optional(),
  message: z.string(),
  type: z.string().optional(),
  code: z.string().optional(),
  param: z.string().optional(),
  requestId: z.string().optional(),
  retryAfter: z.number().nonnegative().optional(),
  model: z.string().optional(),
  endpoint: z.string().optional(),
});
export type ProviderSafeError = z.infer<typeof ProviderSafeErrorSchema>;

export type VideoProviderCapabilities = {
  provider: 'sora' | 'seedance';
  available: false;
  models: string[];
  supportsReferenceImages: boolean;
  supportsAudio: boolean;
};

export class ProviderStubError extends Error {
  readonly safe: ProviderSafeError;

  constructor(error: ProviderSafeError) {
    const parsed = ProviderSafeErrorSchema.parse(error);
    super(parsed.message);
    this.name = 'ProviderStubError';
    this.safe = parsed;
  }

  toJSON(): ProviderSafeError {
    return this.safe;
  }
}

export abstract class BaseVideoProviderStub implements VideoProvider {
  protected abstract readonly providerName: 'sora' | 'seedance';
  protected abstract readonly model: string;
  protected abstract readonly referenceImages: boolean;
  protected readonly endpoint = 'stub://video-provider';

  async generateScene(input: unknown): Promise<unknown> {
    throw this.unavailable('generateScene', input);
  }

  async getCapabilities(): Promise<VideoProviderCapabilities> {
    return {
      provider: this.providerName,
      available: false,
      models: [this.model],
      supportsReferenceImages: this.supportsReferenceImages(),
      supportsAudio: this.supportsAudio(),
    };
  }

  async estimateCost(input: unknown): Promise<unknown> {
    throw this.unavailable('estimateCost', input);
  }

  async checkStatus(jobId: string): Promise<unknown> {
    throw this.unavailable('checkStatus', { jobId });
  }

  async downloadResult(jobId: string): Promise<unknown> {
    throw this.unavailable('downloadResult', { jobId });
  }

  supportsReferenceImages(): boolean {
    return this.referenceImages;
  }

  supportsAudio(): boolean {
    return false;
  }

  captureError(error: unknown, context: { endpoint?: string; model?: string } = {}): ProviderSafeError {
    return sanitizeProviderError(error, {
      endpoint: context.endpoint ?? this.endpoint,
      model: context.model ?? this.model,
    });
  }

  protected unavailable(operation: string, input: unknown): ProviderStubError {
    return new ProviderStubError({
      status: 501,
      message: `${this.providerName} provider is a stub; ${operation} is not implemented and no fallback was attempted.`,
      type: 'provider_stub',
      code: 'PROVIDER_STUB_NOT_IMPLEMENTED',
      param: summarizeInputParam(input),
      model: this.model,
      endpoint: this.endpoint,
    });
  }
}

export class SoraProviderStub extends BaseVideoProviderStub {
  protected readonly providerName = 'sora' as const;
  protected readonly model = 'sora';
  protected readonly referenceImages = true;
}

export class SeedanceProviderStub extends BaseVideoProviderStub {
  protected readonly providerName = 'seedance' as const;
  protected readonly model = 'seedance';
  protected readonly referenceImages = false;
}

export function sanitizeProviderError(
  error: unknown,
  defaults: Pick<ProviderSafeError, 'endpoint' | 'model'> = {},
): ProviderSafeError {
  const source = extractErrorSource(error);
  const headers = extractHeaders(source.headers);
  return ProviderSafeErrorSchema.parse({
    status: asStatus(source.status),
    message: asString(source.message) ?? 'Provider request failed.',
    type: asString(source.type),
    code: asString(source.code),
    param: asString(source.param),
    requestId:
      asString(source.requestId) ??
      asString(source.request_id) ??
      asString(headers['x-request-id']) ??
      asString(headers['request-id']),
    retryAfter: asRetryAfter(source.retryAfter ?? source.retry_after ?? headers['retry-after']),
    model: asString(source.model) ?? defaults.model,
    endpoint: asString(source.endpoint) ?? defaults.endpoint,
  });
}

function extractErrorSource(error: unknown): Record<string, unknown> {
  if (typeof error !== 'object' || error === null) {
    return { message: String(error) };
  }
  const record = error as Record<string, unknown>;
  const nested = record.error;
  if (typeof nested === 'object' && nested !== null) {
    return { ...record, ...(nested as Record<string, unknown>) };
  }
  return record;
}

function extractHeaders(headers: unknown): Record<string, unknown> {
  return typeof headers === 'object' && headers !== null ? (headers as Record<string, unknown>) : {};
}

function asStatus(value: unknown): number | undefined {
  const numeric = typeof value === 'string' ? Number(value) : value;
  return typeof numeric === 'number' && Number.isInteger(numeric) && numeric >= 100 && numeric <= 599
    ? numeric
    : undefined;
}

function asRetryAfter(value: unknown): number | undefined {
  const numeric = typeof value === 'string' ? Number(value) : value;
  return typeof numeric === 'number' && Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function summarizeInputParam(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const record = input as Record<string, unknown>;
  return asString(record.param) ?? (Array.isArray(record.referenceImages) ? 'referenceImages' : undefined);
}
