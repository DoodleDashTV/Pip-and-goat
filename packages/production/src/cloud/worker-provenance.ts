/**
 * Fail-closed provenance verification for the digest-pinned Runpod worker image.
 *
 * The worker runs Blender scene-assembly code that is baked into the image at
 * build time, so image identity alone says nothing about render behaviour: a
 * stale image is still pullable, still digest-pinned, and still passes every
 * "does this image exist" check while rendering months-old code. That is exactly
 * how a FINAL_1080P acceptance render shipped the pre-repair 8-light assembly.
 *
 * The guard here is content-based. The build stamps the image with a fingerprint
 * over every baked render file (and the build fails if the stamp disagrees with
 * the code actually copied in), so comparing that published label against the
 * repository's current render code proves the image would render TODAY's code.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { validateRunpodWorkerImageRef } from './config';

/** Mirrors `workers/runpod-blender/src/provenance.js` — parity is asserted by tests. */
const IGNORED_ENTRIES = new Set(['__pycache__', '.pytest_cache', '.DS_Store']);

/** Repo directories baked into the image, with the prefix they get inside it. */
export const RENDER_CODE_ROOTS: ReadonlyArray<{ prefix: string; repoDir: string }> = [
  { prefix: 'src', repoDir: 'workers/runpod-blender/src' },
  { prefix: 'blender', repoDir: 'scripts/blender' },
];

export const LABEL_SOURCE_COMMIT = 'ddp.source.commit';
export const LABEL_RENDER_CODE_SHA256 = 'ddp.render.code.sha256';
export const LABEL_BUILD_TIME = 'ddp.worker.build.time';

export type RegistryImageFacts = {
  ok: boolean;
  detail: string;
  /** Digest the image was requested by, echoed back for mismatch reporting. */
  digest: string | null;
  amd64: boolean;
  labels: Record<string, string>;
  env: Record<string, string>;
};

export type ProvenanceCode =
  | 'OK'
  | 'IMAGE_REF_INVALID'
  | 'IMAGE_UNREACHABLE'
  | 'IMAGE_ARCH_UNSUPPORTED'
  | 'IMAGE_DIGEST_MISMATCH'
  | 'PROVENANCE_MISSING'
  | 'SOURCE_COMMIT_MISMATCH'
  | 'BUILD_TIME_MISSING'
  | 'RENDER_CODE_MISMATCH';

export type ProvenanceVerification = {
  ok: boolean;
  code: ProvenanceCode;
  reasons: string[];
  facts: {
    imageDigest: string | null;
    imageSourceCommit: string | null;
    imageRenderCodeSha256: string | null;
    imageBuildTime: string | null;
    expectedSourceCommit: string;
    expectedRenderCodeSha256: string;
    localRenderCodeSha256: string;
  };
};

function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

function walk(dir: string, prefix: string, out: Array<{ path: string; sha256: string }>): void {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    if (IGNORED_ENTRIES.has(entry.name) || entry.name.endsWith('.pyc')) continue;
    const abs = path.join(dir, entry.name);
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) walk(abs, rel, out);
    else if (entry.isFile()) out.push({ path: rel, sha256: sha256(readFileSync(abs)) });
  }
}

/**
 * Content hash over the repository's current render code, computed exactly as
 * the image build computes it over the baked copies.
 */
export function computeRenderCodeFingerprint(repoRoot: string): {
  fingerprint: string;
  files: Array<{ path: string; sha256: string }>;
} {
  const files: Array<{ path: string; sha256: string }> = [];
  for (const root of RENDER_CODE_ROOTS) {
    const dir = path.join(repoRoot, root.repoDir);
    if (!existsSync(dir)) continue;
    walk(dir, root.prefix, files);
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = createHash('sha256');
  for (const f of files) hash.update(`${f.path}\u0000${f.sha256}\n`);
  return { fingerprint: hash.digest('hex'), files };
}

/**
 * Read an image's labels/env straight from the registry config blob by digest.
 * Anonymous, read-only, and free: no pull, no pod, no billing.
 */
export async function inspectGhcrImage(
  imageRef: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RegistryImageFacts> {
  const empty: RegistryImageFacts = { ok: false, detail: '', digest: null, amd64: false, labels: {}, env: {} };
  const at = imageRef.indexOf('@');
  if (at < 0) return { ...empty, detail: 'image reference is not digest-pinned' };
  const repoPart = imageRef.slice(imageRef.indexOf('/') + 1, at);
  const digest = imageRef.slice(at + 1);
  try {
    const tokRes = await fetchImpl(`https://ghcr.io/token?scope=repository:${repoPart}:pull&service=ghcr.io`);
    const tok = (await tokRes.json()) as { token?: string };
    if (!tok.token) return { ...empty, digest, detail: 'no anonymous registry token' };
    const auth = { Authorization: `Bearer ${tok.token}` };
    const accept = [
      'application/vnd.oci.image.index.v1+json',
      'application/vnd.docker.distribution.manifest.list.v2+json',
      'application/vnd.oci.image.manifest.v1+json',
      'application/vnd.docker.distribution.manifest.v2+json',
    ].join(', ');

    let manRes = await fetchImpl(`https://ghcr.io/v2/${repoPart}/manifests/${digest}`, {
      headers: { ...auth, Accept: accept },
    });
    if (!manRes.ok) return { ...empty, digest, detail: `manifest HTTP ${manRes.status}` };
    let man = (await manRes.json()) as any;

    // Multi-arch index: descend into the linux/amd64 child manifest.
    let amd64 = false;
    if (Array.isArray(man.manifests)) {
      const child = man.manifests.find(
        (m: any) => m?.platform?.architecture === 'amd64' && m?.platform?.os === 'linux',
      );
      if (!child?.digest) return { ...empty, digest, detail: 'index has no linux/amd64 manifest' };
      amd64 = true;
      manRes = await fetchImpl(`https://ghcr.io/v2/${repoPart}/manifests/${child.digest}`, {
        headers: { ...auth, Accept: accept },
      });
      if (!manRes.ok) return { ...empty, digest, detail: `child manifest HTTP ${manRes.status}` };
      man = (await manRes.json()) as any;
    }
    if (!man.config?.digest) return { ...empty, digest, amd64, detail: 'manifest has no config descriptor' };

    const cfgRes = await fetchImpl(`https://ghcr.io/v2/${repoPart}/blobs/${man.config.digest}`, { headers: auth });
    if (!cfgRes.ok) return { ...empty, digest, amd64, detail: `config blob HTTP ${cfgRes.status}` };
    const cfg = (await cfgRes.json()) as any;
    if (!amd64) amd64 = cfg.architecture === 'amd64' && cfg.os === 'linux';

    const labels: Record<string, string> = { ...(cfg.config?.Labels ?? {}) };
    const env: Record<string, string> = {};
    for (const line of (cfg.config?.Env ?? []) as string[]) {
      const eq = line.indexOf('=');
      if (eq > 0) env[line.slice(0, eq)] = line.slice(eq + 1);
    }
    return { ok: true, detail: `config blob read; linux/amd64=${amd64}`, digest, amd64, labels, env };
  } catch (e) {
    return { ...empty, digest, detail: (e as Error).message };
  }
}

/**
 * Fail-closed gate. Refuses a paid launch unless the pinned image demonstrably
 * contains the repository's current render code.
 */
export function verifyWorkerProvenance(input: {
  imageRef: string;
  expectedSourceCommit: string;
  expectedRenderCodeSha256: string;
  localRenderCodeSha256: string;
  registry: RegistryImageFacts;
}): ProvenanceVerification {
  const { imageRef, expectedSourceCommit, expectedRenderCodeSha256, localRenderCodeSha256, registry } = input;

  const imageSourceCommit =
    registry.labels[LABEL_SOURCE_COMMIT] ||
    registry.env.DDP_SOURCE_COMMIT ||
    registry.labels['org.opencontainers.image.revision'] ||
    null;
  const imageRenderCodeSha256 =
    registry.labels[LABEL_RENDER_CODE_SHA256] || registry.env.DDP_RENDER_CODE_SHA256 || null;
  const imageBuildTime =
    registry.labels[LABEL_BUILD_TIME] ||
    registry.env.DDP_WORKER_BUILD_TIME ||
    registry.labels['org.opencontainers.image.created'] ||
    null;

  const facts = {
    imageDigest: registry.digest,
    imageSourceCommit,
    imageRenderCodeSha256,
    imageBuildTime,
    expectedSourceCommit,
    expectedRenderCodeSha256,
    localRenderCodeSha256,
  };
  const fail = (code: ProvenanceCode, reason: string): ProvenanceVerification => ({
    ok: false,
    code,
    reasons: [reason],
    facts,
  });

  const refCheck = validateRunpodWorkerImageRef(imageRef);
  if (!refCheck.ok) return fail('IMAGE_REF_INVALID', `image reference rejected: ${refCheck.reason}`);
  if (!registry.ok) return fail('IMAGE_UNREACHABLE', `cannot read image provenance from registry: ${registry.detail}`);
  if (!registry.amd64) return fail('IMAGE_ARCH_UNSUPPORTED', 'image has no linux/amd64 manifest');

  const pinnedDigest = imageRef.slice(imageRef.indexOf('@') + 1);
  if (!registry.digest) return fail('IMAGE_DIGEST_MISMATCH', 'registry returned no digest for the pinned reference');
  if (registry.digest !== pinnedDigest) {
    return fail('IMAGE_DIGEST_MISMATCH', `registry digest ${registry.digest} != pinned digest ${pinnedDigest}`);
  }
  if (!imageSourceCommit || !imageRenderCodeSha256) {
    return fail(
      'PROVENANCE_MISSING',
      `image carries no build provenance (${LABEL_SOURCE_COMMIT}=${imageSourceCommit ?? 'absent'}, ${LABEL_RENDER_CODE_SHA256}=${imageRenderCodeSha256 ?? 'absent'}); it predates provenance stamping and its render code cannot be established`,
    );
  }
  if (!imageBuildTime) return fail('BUILD_TIME_MISSING', 'image carries no build timestamp');
  if (imageSourceCommit !== expectedSourceCommit) {
    return fail(
      'SOURCE_COMMIT_MISMATCH',
      `image was built from ${imageSourceCommit} but this production build expects ${expectedSourceCommit}`,
    );
  }
  if (imageRenderCodeSha256 !== expectedRenderCodeSha256) {
    return fail(
      'RENDER_CODE_MISMATCH',
      `image render code ${imageRenderCodeSha256} != pinned render code ${expectedRenderCodeSha256}`,
    );
  }
  if (localRenderCodeSha256 !== expectedRenderCodeSha256) {
    return fail(
      'RENDER_CODE_MISMATCH',
      `working tree render code ${localRenderCodeSha256} != image render code ${expectedRenderCodeSha256} — the image is stale and would render different code than this checkout`,
    );
  }
  return {
    ok: true,
    code: 'OK',
    reasons: [`image ${pinnedDigest.slice(0, 19)}… contains this checkout's render code (${localRenderCodeSha256.slice(0, 12)}…)`],
    facts,
  };
}
