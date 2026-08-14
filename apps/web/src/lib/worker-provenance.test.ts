import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  LABEL_BUILD_TIME,
  LABEL_RENDER_CODE_SHA256,
  LABEL_SOURCE_COMMIT,
  computeRenderAssetFingerprint,
  computeRenderCodeFingerprint,
  inspectGhcrImage,
  verifyWorkerProvenance,
  type RegistryImageFacts,
} from '../../../../packages/production/src/cloud/worker-provenance';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const IMAGE = 'ghcr.io/doodledashtv/ddp-runpod-blender@sha256:' + 'a'.repeat(64);
const COMMIT = '1234567890abcdef1234567890abcdef12345678';
const RENDER_CODE = 'f'.repeat(64);
const RENDER_ASSETS = 'e'.repeat(64);

function registry(overrides: Partial<RegistryImageFacts> = {}): RegistryImageFacts {
  return {
    ok: true,
    detail: 'config blob read; linux/amd64=true',
    digest: 'sha256:' + 'a'.repeat(64),
    amd64: true,
    labels: {
      [LABEL_SOURCE_COMMIT]: COMMIT,
      [LABEL_RENDER_CODE_SHA256]: RENDER_CODE,
      [LABEL_BUILD_TIME]: '2026-08-12T22:00:00Z',
    },
    env: {},
    ...overrides,
  };
}

function verify(overrides: {
  imageRef?: string;
  expectedSourceCommit?: string;
  expectedRenderCodeSha256?: string;
  localRenderCodeSha256?: string;
  expectedRenderAssetSha256?: string;
  localRenderAssetSha256?: string;
  registry?: RegistryImageFacts;
} = {}) {
  return verifyWorkerProvenance({
    imageRef: overrides.imageRef ?? IMAGE,
    expectedSourceCommit: overrides.expectedSourceCommit ?? COMMIT,
    expectedRenderCodeSha256: overrides.expectedRenderCodeSha256 ?? RENDER_CODE,
    localRenderCodeSha256: overrides.localRenderCodeSha256 ?? RENDER_CODE,
    expectedRenderAssetSha256: overrides.expectedRenderAssetSha256,
    localRenderAssetSha256: overrides.localRenderAssetSha256,
    registry: overrides.registry ?? registry(),
  });
}

describe('worker image provenance gate', () => {
  it('accepts an image stamped with the expected commit and this checkout’s render code', () => {
    const result = verify();
    expect(result.ok).toBe(true);
    expect(result.code).toBe('OK');
  });

  it('reads provenance from image env when labels are absent', () => {
    const result = verify({
      registry: registry({
        labels: {},
        env: {
          DDP_SOURCE_COMMIT: COMMIT,
          DDP_RENDER_CODE_SHA256: RENDER_CODE,
          DDP_WORKER_BUILD_TIME: '2026-08-12T22:00:00Z',
        },
      }),
    });
    expect(result.ok).toBe(true);
  });

  // The exact regression that shipped a bad FINAL_1080P render: the pinned image
  // was pullable and digest-valid but predated the lighting repair, so it carried
  // no provenance stamps at all.
  it('fails closed on an image with no provenance stamps (pre-provenance stale image)', () => {
    const result = verify({ registry: registry({ labels: {}, env: {} }) });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('PROVENANCE_MISSING');
    expect(result.reasons.join(' ')).toContain('render code cannot be established');
  });

  it('fails closed when the image render code differs from the pinned render code', () => {
    const result = verify({
      registry: registry({
        labels: {
          [LABEL_SOURCE_COMMIT]: COMMIT,
          [LABEL_RENDER_CODE_SHA256]: 'b'.repeat(64),
          [LABEL_BUILD_TIME]: '2026-08-12T22:00:00Z',
        },
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('RENDER_CODE_MISMATCH');
  });

  // Repairs landed in the working tree after the image was built: the image is
  // now stale relative to the code that would be tested locally.
  it('fails closed when the working tree render code drifts from the image', () => {
    const result = verify({ localRenderCodeSha256: 'c'.repeat(64) });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('RENDER_CODE_MISMATCH');
    expect(result.reasons.join(' ')).toContain('stale');
  });

  it('fails closed when the image was built from a different commit', () => {
    const result = verify({ expectedSourceCommit: 'a'.repeat(40) });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('SOURCE_COMMIT_MISMATCH');
  });

  it('fails closed when the image carries no build timestamp', () => {
    const result = verify({
      registry: registry({
        labels: { [LABEL_SOURCE_COMMIT]: COMMIT, [LABEL_RENDER_CODE_SHA256]: RENDER_CODE },
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('BUILD_TIME_MISSING');
  });

  it('fails closed when the registry digest differs from the pinned digest', () => {
    const result = verify({ registry: registry({ digest: 'sha256:' + 'd'.repeat(64) }) });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('IMAGE_DIGEST_MISMATCH');
  });

  it('fails closed on a mutable tag reference instead of a digest', () => {
    const result = verify({ imageRef: 'ghcr.io/doodledashtv/ddp-runpod-blender:latest' });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('IMAGE_REF_INVALID');
  });

  it('fails closed when the registry cannot be read', () => {
    const result = verify({ registry: registry({ ok: false, detail: 'manifest HTTP 404' }) });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('IMAGE_UNREACHABLE');
  });

  it('fails closed when the image has no linux/amd64 manifest', () => {
    const result = verify({ registry: registry({ amd64: false }) });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('IMAGE_ARCH_UNSUPPORTED');
  });

  it('never returns ok for the placeholder pins used before a rebuild', () => {
    const result = verify({
      expectedSourceCommit: 'PENDING_REBUILD',
      expectedRenderCodeSha256: 'PENDING_REBUILD',
      localRenderCodeSha256: RENDER_CODE,
    });
    expect(result.ok).toBe(false);
  });
});

describe('render code fingerprint', () => {
  it('is stable, non-empty, and covers the Blender scene scripts and worker sources', () => {
    const a = computeRenderCodeFingerprint(REPO_ROOT);
    const b = computeRenderCodeFingerprint(REPO_ROOT);
    expect(a.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.files.some((f) => f.path === 'blender/assemble_scene.py')).toBe(true);
    expect(a.files.some((f) => f.path === 'src/single-shot.js')).toBe(true);
    expect(a.files.every((f) => !f.path.includes('__pycache__'))).toBe(true);
  });

  // The image stamps itself using the worker's own JS implementation, so the two
  // must agree exactly or every future preflight would fail on a phantom drift.
  it('matches the worker-side implementation baked into the image', () => {
    const require_ = createRequire(__filename);
    const workerProvenance = require_(path.join(REPO_ROOT, 'workers/runpod-blender/src/provenance.js')) as {
      computeRenderCodeFingerprint: (roots: Array<{ prefix: string; dir: string }>) => {
        fingerprint: string;
        files: Array<{ path: string; sha256: string }>;
      };
    };
    const workerSide = workerProvenance.computeRenderCodeFingerprint([
      { prefix: 'src', dir: path.join(REPO_ROOT, 'workers/runpod-blender/src') },
      { prefix: 'blender', dir: path.join(REPO_ROOT, 'scripts/blender') },
    ]);
    const repoSide = computeRenderCodeFingerprint(REPO_ROOT);
    expect(workerSide.fingerprint).toBe(repoSide.fingerprint);
    expect(workerSide.files.length).toBe(repoSide.files.length);
  });
});

describe('render asset fingerprint', () => {
  it('covers every approved .blend the render can load', () => {
    const a = computeRenderAssetFingerprint(REPO_ROOT);
    const b = computeRenderAssetFingerprint(REPO_ROOT);
    expect(a.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(a.fingerprint).toBe(b.fingerprint);
    const paths = a.files.map((f) => f.path);
    expect(paths).toContain('assets/characters/pip_production.blend');
    expect(paths).toContain('assets/characters/goat_production.blend');
    expect(paths).toContain('assets/environments/meadow_production.blend');
    expect(paths).toContain('assets/props/adventure_map.blend');
  });

  // Blender rewrites a .blend1 backup whenever anyone opens a file, and the .png
  // contact sheets are not render inputs. Including either would make the pin
  // depend on who last opened what.
  it('ignores Blender backups and contact sheets', () => {
    const files = computeRenderAssetFingerprint(REPO_ROOT).files;
    expect(files.every((f) => !f.path.endsWith('.blend1'))).toBe(true);
    expect(files.every((f) => !f.path.endsWith('.png'))).toBe(true);
  });

  it('is not the same fingerprint as the render code', () => {
    expect(computeRenderAssetFingerprint(REPO_ROOT).fingerprint).not.toBe(
      computeRenderCodeFingerprint(REPO_ROOT).fingerprint,
    );
  });
});

describe('changing a character model invalidates preflight', () => {
  // Pip's model is downloaded from R2 rather than baked into the image, so the
  // image's labels can say nothing about it: preflight has to hold the asset
  // fingerprint itself. Edit Pip and the launch must stop until someone re-pins.
  it('fails closed when the working tree assets differ from the pin', () => {
    const result = verify({
      expectedRenderAssetSha256: RENDER_ASSETS,
      localRenderAssetSha256: 'd'.repeat(64),
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('RENDER_ASSET_MISMATCH');
    expect(result.reasons.join(' ')).toContain('re-pinned');
  });

  it('fails closed when a pin exists but nothing was measured', () => {
    const result = verify({ expectedRenderAssetSha256: RENDER_ASSETS });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('RENDER_ASSET_MISMATCH');
  });

  it('accepts the launch when the assets match the pin', () => {
    const result = verify({
      expectedRenderAssetSha256: RENDER_ASSETS,
      localRenderAssetSha256: RENDER_ASSETS,
    });
    expect(result.ok).toBe(true);
    expect(result.facts.localRenderAssetSha256).toBe(RENDER_ASSETS);
  });

  it('reports the real fingerprint of Pip’s current model, and a different one after an edit', () => {
    const before = computeRenderAssetFingerprint(REPO_ROOT);
    const pip = before.files.find((f) => f.path === 'assets/characters/pip_production.blend');
    expect(pip?.sha256).toMatch(/^[0-9a-f]{64}$/);

    // Simulate the edit by hashing the same file list with one byte changed, using
    // the same aggregation the fingerprint uses, rather than writing to the asset.
    const mutated = before.files.map((f) =>
      f.path === 'assets/characters/pip_production.blend' ? { ...f, sha256: 'c'.repeat(64) } : f,
    );
    const hash = createHash('sha256');
    for (const f of mutated) hash.update(`${f.path}\u0000${f.sha256}\n`);
    const after = hash.digest('hex');
    expect(after).not.toBe(before.fingerprint);

    const result = verify({
      expectedRenderAssetSha256: before.fingerprint,
      localRenderAssetSha256: after,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('RENDER_ASSET_MISMATCH');
  });
});

describe('registry inspection', () => {
  it('refuses a non-digest reference without touching the network', async () => {
    let called = false;
    const facts = await inspectGhcrImage('ghcr.io/x/y:latest', (async () => {
      called = true;
      return new Response('{}');
    }) as unknown as typeof fetch);
    expect(called).toBe(false);
    expect(facts.ok).toBe(false);
    expect(facts.detail).toContain('not digest-pinned');
  });

  it('parses labels and env from the image config blob', async () => {
    const digest = 'sha256:' + 'a'.repeat(64);
    const fetchImpl = (async (url: string) => {
      if (String(url).includes('/token')) return new Response(JSON.stringify({ token: 't' }));
      if (String(url).includes('/manifests/')) {
        return new Response(JSON.stringify({ config: { digest: 'sha256:' + 'c'.repeat(64) } }));
      }
      return new Response(
        JSON.stringify({
          architecture: 'amd64',
          os: 'linux',
          config: {
            Labels: { [LABEL_SOURCE_COMMIT]: COMMIT },
            Env: ['PATH=/usr/bin', `DDP_RENDER_CODE_SHA256=${RENDER_CODE}`],
          },
        }),
      );
    }) as unknown as typeof fetch;
    const facts = await inspectGhcrImage(`ghcr.io/o/r@${digest}`, fetchImpl);
    expect(facts.ok).toBe(true);
    expect(facts.amd64).toBe(true);
    expect(facts.digest).toBe(digest);
    expect(facts.labels[LABEL_SOURCE_COMMIT]).toBe(COMMIT);
    expect(facts.env.DDP_RENDER_CODE_SHA256).toBe(RENDER_CODE);
  });

  it('descends a multi-arch index into the linux/amd64 child manifest', async () => {
    const digest = 'sha256:' + 'a'.repeat(64);
    const seen: string[] = [];
    const fetchImpl = (async (url: string) => {
      seen.push(String(url));
      if (String(url).includes('/token')) return new Response(JSON.stringify({ token: 't' }));
      if (String(url).includes(`/manifests/${digest}`)) {
        return new Response(
          JSON.stringify({
            manifests: [
              { digest: 'sha256:' + 'e'.repeat(64), platform: { architecture: 'arm64', os: 'linux' } },
              { digest: 'sha256:' + 'f'.repeat(64), platform: { architecture: 'amd64', os: 'linux' } },
            ],
          }),
        );
      }
      if (String(url).includes('/manifests/')) {
        return new Response(JSON.stringify({ config: { digest: 'sha256:' + 'c'.repeat(64) } }));
      }
      return new Response(
        JSON.stringify({ architecture: 'amd64', os: 'linux', config: { Labels: {}, Env: [] } }),
      );
    }) as unknown as typeof fetch;
    const facts = await inspectGhcrImage(`ghcr.io/o/r@${digest}`, fetchImpl);
    expect(facts.ok).toBe(true);
    expect(facts.amd64).toBe(true);
    expect(seen.some((u) => u.includes('f'.repeat(64)))).toBe(true);
  });
});
