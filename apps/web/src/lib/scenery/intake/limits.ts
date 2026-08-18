export const SCENERY_INTAKE_LIMITS = {
  maxUploadBytes: 2 * 1024 * 1024 * 1024,
  maxConcurrentParts: 4,
  maxConcurrentFiles: 2,
  multipartPartBytes: 16 * 1024 * 1024,
  minMultipartPartBytes: 5 * 1024 * 1024,
  maxParts: 400,
  maxRetries: 3,
  signedOperationTtlSeconds: 15 * 60,
  sessionTtlMs: 12 * 60 * 60 * 1000,
  maxJsonBodyBytes: 64 * 1024,
  maxTemporaryWorkspaceBytes: 2 * 1024 * 1024 * 1024,
  maxInspectionConcurrency: 1,
  maxMaterializedBytesPerJob: 2 * 1024 * 1024 * 1024,
  hashChunkBytes: 4 * 1024 * 1024,
  rateLimitWindowMs: 60_000,
  rateLimitMaxRequests: 40,
} as const;

export const SCENERY_INTAKE_SESSION_TTL_MS = SCENERY_INTAKE_LIMITS.sessionTtlMs;

export const SCENERY_ALLOWED_EXTENSIONS = [
  '.zip',
  '.blend',
  '.txt',
  '.unitypackage',
  '.hdr',
  '.exr',
  '.jpg',
  '.jpeg',
  '.png',
  '.fbx',
  '.obj',
  '.mtl',
  '.psd',
  '.tga',
] as const;

export const SCENERY_ALLOWED_MIME_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
  'application/x-blender',
  'text/plain',
  'image/vnd.radiance',
  'image/x-exr',
  'image/jpeg',
  'image/png',
  'image/tga',
  'image/x-tga',
  'image/vnd.adobe.photoshop',
] as const;

export const SCENERY_PROHIBITED_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.ps1',
  '.sh',
  '.msi',
  '.dll',
  '.so',
  '.dylib',
  '.jar',
  '.vbs',
  '.js',
  '.app',
  '.apk',
] as const;

export function envNumber(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
): number {
  const raw = env[name];
  if (!raw || !raw.trim()) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveIntakeLimits(env: Record<string, string | undefined> = process.env) {
  const multipartPartBytes = Math.max(
    SCENERY_INTAKE_LIMITS.minMultipartPartBytes,
    envNumber(
      env,
      'TIVVLEJOY_SCENERY_MULTIPART_PART_BYTES',
      SCENERY_INTAKE_LIMITS.multipartPartBytes,
    ),
  );
  return {
    maxUploadBytes: envNumber(
      env,
      'TIVVLEJOY_SCENERY_MAX_UPLOAD_BYTES',
      SCENERY_INTAKE_LIMITS.maxUploadBytes,
    ),
    maxConcurrentParts: envNumber(
      env,
      'TIVVLEJOY_SCENERY_MAX_CONCURRENT_PARTS',
      SCENERY_INTAKE_LIMITS.maxConcurrentParts,
    ),
    maxConcurrentFiles: SCENERY_INTAKE_LIMITS.maxConcurrentFiles,
    maxParts: SCENERY_INTAKE_LIMITS.maxParts,
    maxJsonBodyBytes: SCENERY_INTAKE_LIMITS.maxJsonBodyBytes,
    sessionTtlMs: SCENERY_INTAKE_LIMITS.sessionTtlMs,
    multipartPartBytes,
    minMultipartPartBytes: SCENERY_INTAKE_LIMITS.minMultipartPartBytes,
    maxRetries: envNumber(env, 'TIVVLEJOY_SCENERY_MAX_RETRIES', SCENERY_INTAKE_LIMITS.maxRetries),
    signedOperationTtlSeconds: envNumber(
      env,
      'TIVVLEJOY_SCENERY_SIGNED_TTL_SECONDS',
      SCENERY_INTAKE_LIMITS.signedOperationTtlSeconds,
    ),
    maxTemporaryWorkspaceBytes: envNumber(
      env,
      'TIVVLEJOY_SCENERY_MAX_TEMP_BYTES',
      SCENERY_INTAKE_LIMITS.maxTemporaryWorkspaceBytes,
    ),
    maxInspectionConcurrency: envNumber(
      env,
      'TIVVLEJOY_SCENERY_MAX_INSPECTION_CONCURRENCY',
      SCENERY_INTAKE_LIMITS.maxInspectionConcurrency,
    ),
    maxMaterializedBytesPerJob: envNumber(
      env,
      'TIVVLEJOY_SCENERY_MAX_MATERIALIZED_BYTES',
      SCENERY_INTAKE_LIMITS.maxMaterializedBytesPerJob,
    ),
    hashChunkBytes: envNumber(
      env,
      'TIVVLEJOY_SCENERY_HASH_CHUNK_BYTES',
      SCENERY_INTAKE_LIMITS.hashChunkBytes,
    ),
    rateLimitWindowMs: SCENERY_INTAKE_LIMITS.rateLimitWindowMs,
    rateLimitMaxRequests: SCENERY_INTAKE_LIMITS.rateLimitMaxRequests,
  };
}

export type SceneryIntakeLimits = ReturnType<typeof resolveIntakeLimits>;
