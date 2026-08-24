import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type CORSRule,
} from '@aws-sdk/client-s3';
import { resolveObjectStorageConfig } from '@doodle-dash/shared';
import { SceneryError } from '../types';
import { sceneryStorageEnvForResolver } from './config';
import { ConnectionReadyMultipartStorage, type MultipartStoragePort } from './multipart';

export type BrowserUploadCorsRule = {
  ID?: string;
  AllowedOrigins?: string[];
  AllowedMethods?: string[];
  AllowedHeaders?: string[];
  ExposeHeaders?: string[];
  MaxAgeSeconds?: number;
};

export type BrowserUploadCorsPolicy = {
  CORSRules: BrowserUploadCorsRule[];
};

type S3CommandClient = {
  // Real S3Client.send is generic; tests inject a command recorder with the same call shape.
  send: S3Client['send'] | ((command: unknown) => Promise<unknown>);
};

export function browserUploadCorsRule(origin: string): BrowserUploadCorsRule {
  return {
    AllowedOrigins: [origin],
    AllowedMethods: ['PUT'],
    AllowedHeaders: ['*'],
    ExposeHeaders: ['ETag'],
    MaxAgeSeconds: 3600,
  };
}

export function sceneryUploadCorsConfiguration(origin: string): BrowserUploadCorsPolicy {
  return {
    CORSRules: [browserUploadCorsRule(origin)],
  };
}

export function resolveConfiguredBrowserUploadOrigin(
  env: Record<string, string | undefined>,
): string | null {
  const raw = String(env.TIVVLEJOY_SCENERY_CORS_ORIGIN ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (!url.hostname.endsWith('.vercel.app')) return null;
    if (url.pathname !== '/' || url.search || url.hash) return null;
    if (url.origin !== raw) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function corsRuleSatisfiesBrowserUpload(
  rule: BrowserUploadCorsRule,
  origin: string,
): boolean {
  const origins = rule.AllowedOrigins ?? [];
  const methods = (rule.AllowedMethods ?? []).map((method) => method.toUpperCase());
  const headers = rule.AllowedHeaders ?? [];
  const expose = rule.ExposeHeaders ?? [];
  const maxAge = Number(rule.MaxAgeSeconds ?? 0);
  return (
    origins.includes(origin) &&
    methods.includes('PUT') &&
    headers.includes('*') &&
    expose.some((header) => header.toLowerCase() === 'etag') &&
    maxAge >= 3600
  );
}

export function mergeBrowserUploadCorsRules(
  existing: readonly BrowserUploadCorsRule[] | undefined,
  origin: string,
): { CORSRules: BrowserUploadCorsRule[]; changed: boolean } {
  const current = (existing ?? []).map((rule) => ({ ...rule }));
  if (current.some((rule) => corsRuleSatisfiesBrowserUpload(rule, origin))) {
    return { CORSRules: current, changed: false };
  }
  return {
    CORSRules: [...current, browserUploadCorsRule(origin)],
    changed: true,
  };
}

export function isMissingBucketCorsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as {
    name?: string;
    code?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const name = String(record.name ?? '');
  const code = String(record.Code ?? record.code ?? '');
  return name === 'NoSuchCORSConfiguration' || code === 'NoSuchCORSConfiguration';
}

export async function ensureBrowserUploadCorsPolicy(input: {
  origin: string | null;
  getRules: () => Promise<BrowserUploadCorsRule[]>;
  putRules: (rules: BrowserUploadCorsRule[]) => Promise<void>;
}): Promise<{ updated: boolean }> {
  if (!input.origin) return { updated: false };
  let existing: BrowserUploadCorsRule[];
  try {
    existing = await input.getRules();
  } catch (error) {
    if (isMissingBucketCorsError(error)) {
      existing = [];
    } else {
      throw new SceneryError(
        'Private storage rejected a TivvleJoy Preview CORS read. The R2 access token must allow GetBucketCors.',
        'R2_CORS_CONFIGURATION_FAILED',
      );
    }
  }
  const merged = mergeBrowserUploadCorsRules(existing, input.origin);
  if (!merged.changed) return { updated: false };
  try {
    await input.putRules(merged.CORSRules);
  } catch {
    throw new SceneryError(
      'Private storage rejected the TivvleJoy Preview CORS policy. The R2 access token must allow bucket CORS updates.',
      'R2_CORS_CONFIGURATION_FAILED',
    );
  }
  return { updated: true };
}

export function createR2MultipartStorage(input: {
  client: S3CommandClient;
  bucket: string;
  corsOrigin: string | null;
  signPartUrl?: (
    client: S3CommandClient,
    command: UploadPartCommand,
    options: { expiresIn: number },
  ) => Promise<string>;
}): MultipartStoragePort {
  const { client, bucket, corsOrigin } = input;
  let corsVerified = false;

  async function ensureBrowserUploadCors(): Promise<void> {
    if (!corsOrigin || corsVerified) return;
    const result = await ensureBrowserUploadCorsPolicy({
      origin: corsOrigin,
      async getRules() {
        const response = (await client.send(new GetBucketCorsCommand({ Bucket: bucket }))) as {
          CORSRules?: BrowserUploadCorsRule[];
        };
        return response.CORSRules ?? [];
      },
      async putRules(rules) {
        await client.send(
          new PutBucketCorsCommand({
            Bucket: bucket,
            CORSConfiguration: { CORSRules: rules as CORSRule[] },
          }),
        );
      },
    });
    corsVerified = true;
    void result;
  }

  return {
    async createMultipartUpload(createInput) {
      await ensureBrowserUploadCors();
      const created = (await client.send(
        new CreateMultipartUploadCommand({
          Bucket: bucket,
          Key: createInput.key,
          ContentType: createInput.contentType,
          ACL: undefined,
        }),
      )) as { UploadId?: string };
      if (!created.UploadId) {
        throw new SceneryError(
          'R2 did not return a multipart upload id.',
          'MULTIPART_CREATE_FAILED',
        );
      }
      return { uploadId: created.UploadId };
    },
    async signPart(signInput) {
      await ensureBrowserUploadCors();
      const expiresAt = new Date(Date.now() + signInput.ttlSeconds * 1000).toISOString();
      const command = new UploadPartCommand({
        Bucket: bucket,
        Key: signInput.key,
        UploadId: signInput.uploadId,
        PartNumber: signInput.partNumber,
      });
      const url = input.signPartUrl
        ? await input.signPartUrl(client, command, { expiresIn: signInput.ttlSeconds })
        : await (
            await import('@aws-sdk/s3-request-presigner')
          ).getSignedUrl(client as S3Client, command, { expiresIn: signInput.ttlSeconds });
      return { url, expiresAt };
    },
    async completeMultipartUpload(completeInput) {
      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: completeInput.key,
          UploadId: completeInput.uploadId,
          MultipartUpload: {
            Parts: completeInput.parts.map((part) => ({
              ETag: part.etag,
              PartNumber: part.partNumber,
            })),
          },
        }),
      );
      const head = (await client.send(new HeadObjectCommand({ Bucket: bucket, Key: completeInput.key }))) as {
        ContentLength?: number;
      };
      return { size: Number(head.ContentLength ?? 0) };
    },
    async abortMultipartUpload(abortInput) {
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: abortInput.key,
          UploadId: abortInput.uploadId,
        }),
      );
    },
    async headObject(key) {
      try {
        const head = (await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))) as {
          ContentLength?: number;
        };
        return { exists: true, size: Number(head.ContentLength ?? 0) };
      } catch {
        return { exists: false, size: null };
      }
    },
    async putObject(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType ?? 'application/octet-stream',
        }),
      );
    },
    async getObject(key) {
      try {
        const result = (await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))) as {
          Body?: { transformToByteArray?: () => Promise<Uint8Array> };
        };
        const bytes = await result.Body?.transformToByteArray?.();
        return bytes ? new Uint8Array(bytes) : null;
      } catch {
        return null;
      }
    },
    async getObjectRange(key, offset, length) {
      try {
        const end = offset + length - 1;
        const result = (await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
            Range: `bytes=${offset}-${end}`,
          }),
        )) as { Body?: { transformToByteArray?: () => Promise<Uint8Array> } };
        const bytes = await result.Body?.transformToByteArray?.();
        return bytes ? new Uint8Array(bytes) : null;
      } catch {
        return null;
      }
    },
    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async listPrefix(prefix) {
      const items: Array<{ key: string; size: number }> = [];
      let token: string | undefined;
      do {
        const page = (await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        )) as {
          Contents?: Array<{ Key?: string; Size?: number }>;
          IsTruncated?: boolean;
          NextContinuationToken?: string;
        };
        for (const object of page.Contents ?? []) {
          if (object.Key) items.push({ key: object.Key, size: Number(object.Size ?? 0) });
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return items;
    },
  };
}

export async function createConfiguredMultipartStorage(
  env: Record<string, string | undefined> = process.env,
): Promise<MultipartStoragePort> {
  let config;
  try {
    config = resolveObjectStorageConfig(sceneryStorageEnvForResolver(env));
  } catch {
    return new ConnectionReadyMultipartStorage();
  }
  if (config.provider !== 's3') {
    return new ConnectionReadyMultipartStorage();
  }
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return createR2MultipartStorage({
    client,
    bucket: config.bucket,
    corsOrigin: resolveConfiguredBrowserUploadOrigin(env),
  });
}
