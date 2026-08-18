import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { resolveObjectStorageConfig } from '@doodle-dash/shared';
import { SceneryError } from '../types';
import { sceneryStorageEnvForResolver } from './config';
import { ConnectionReadyMultipartStorage, type MultipartStoragePort } from './multipart';

export function sceneryUploadCorsConfiguration(origin: string) {
  return {
    CORSRules: [
      {
        AllowedOrigins: [origin],
        AllowedMethods: ['PUT'],
        AllowedHeaders: ['*'],
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3600,
      },
    ],
  };
}

function configuredCorsOrigin(env: Record<string, string | undefined>): string | null {
  const raw = String(env.TIVVLEJOY_SCENERY_CORS_ORIGIN ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (
      url.protocol !== 'https:' ||
      !url.hostname.endsWith('.vercel.app') ||
      url.pathname !== '/'
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
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
  const bucket = config.bucket;
  const corsOrigin = configuredCorsOrigin(env);
  let corsConfigured = false;

  async function ensureBrowserUploadCors(): Promise<void> {
    if (!corsOrigin || corsConfigured) return;
    try {
      await client.send(
        new PutBucketCorsCommand({
          Bucket: bucket,
          CORSConfiguration: sceneryUploadCorsConfiguration(corsOrigin),
        }),
      );
      corsConfigured = true;
    } catch {
      throw new SceneryError(
        'Private storage rejected the TivvleJoy Preview CORS policy. The R2 access token must allow bucket CORS updates.',
        'R2_CORS_CONFIGURATION_FAILED',
      );
    }
  }
  return {
    async createMultipartUpload(input) {
      await ensureBrowserUploadCors();
      const created = await client.send(
        new CreateMultipartUploadCommand({
          Bucket: bucket,
          Key: input.key,
          ContentType: input.contentType,
          ACL: undefined,
        }),
      );
      if (!created.UploadId) {
        throw new SceneryError(
          'R2 did not return a multipart upload id.',
          'MULTIPART_CREATE_FAILED',
        );
      }
      return { uploadId: created.UploadId };
    },
    async signPart(input) {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000).toISOString();
      const url = await getSignedUrl(
        client,
        new UploadPartCommand({
          Bucket: bucket,
          Key: input.key,
          UploadId: input.uploadId,
          PartNumber: input.partNumber,
        }),
        { expiresIn: input.ttlSeconds },
      );
      return { url, expiresAt };
    },
    async completeMultipartUpload(input) {
      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: input.key,
          UploadId: input.uploadId,
          MultipartUpload: {
            Parts: input.parts.map((part) => ({ ETag: part.etag, PartNumber: part.partNumber })),
          },
        }),
      );
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: input.key }));
      return { size: Number(head.ContentLength ?? 0) };
    },
    async abortMultipartUpload(input) {
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: input.key,
          UploadId: input.uploadId,
        }),
      );
    },
    async headObject(key) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
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
        const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const bytes = await result.Body?.transformToByteArray();
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
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );
        for (const object of page.Contents ?? []) {
          if (object.Key) items.push({ key: object.Key, size: Number(object.Size ?? 0) });
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return items;
    },
  };
}
