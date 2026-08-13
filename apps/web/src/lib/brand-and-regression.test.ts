/**
 * Two claims that Steps 1-8 has to earn rather than assert.
 *
 * The first is that renaming the studio to TivvleJoy Studios changed only what a
 * human reads. The internal DDP name is load-bearing — it sits in database rows,
 * storage prefixes, worker image names and closed acceptance evidence — so the test
 * of a safe rebrand is that legacy values still load and still resolve.
 *
 * The second is that adding a planning layer did not disturb the accepted
 * FINAL_1080P render. That render is historical evidence: it cannot be improved by
 * this branch, only damaged. The gates below are the ones that would notice damage.
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';

import {
  BRAND_PROVENANCE,
  CHANNEL_DISPLAY_NAME,
  FOUNDING_CODES,
  INTERNAL_BRAND_ABBREVIATION,
  INTERNAL_BRAND_NAME,
  LEGACY_BRAND_ALIASES,
  PRESERVED_INTERNAL_DDP_NAMES,
  PRODUCT_DISPLAY_NAME,
  STUDIO_DISPLAY_NAME,
  STUDIO_SHORT_NAME,
  UNIVERSE_CANON_NAME,
  isKnownBrandName,
  resolveStudioDisplayName,
} from '@doodle-dash/domain';
import {
  FINAL_1080P_ACCEPTANCE,
  SHADOW_CASTER_CONSTANTS,
  VALIDATION_SCENE_PLAN,
  direct,
  projectBlueprintForRender,
} from '@doodle-dash/direction';
import {
  computeRenderAssetFingerprint,
  computeRenderCodeFingerprint,
  verifyWorkerProvenance,
  LABEL_BUILD_TIME,
  LABEL_RENDER_CODE_SHA256,
  LABEL_SOURCE_COMMIT,
} from '../../../../packages/production/src/cloud/worker-provenance';
import {
  CloudJobManifestSchema,
  buildCloudCacheKey,
} from '@doodle-dash/production';
import { readProviderStatus } from '@doodle-dash/production';
import { redactSecrets, assertNoSecretsInManifest } from '../../../../packages/production/src/cloud/secret-safety';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

function readRepoFile(relative: string): string {
  return readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

describe('TivvleJoy Studios rebrand is a presentation change', () => {
  it('shows the new studio name and keeps the internal name intact', () => {
    expect(STUDIO_DISPLAY_NAME).toBe('TivvleJoy Studios');
    expect(STUDIO_SHORT_NAME).toBe('TivvleJoy');
    expect(INTERNAL_BRAND_NAME).toBe('Doodle Dash Production');
    expect(INTERNAL_BRAND_ABBREVIATION).toBe('DDP');
  });

  // The one that matters for existing data: PRODUCT_DISPLAY_NAME is what
  // cost-optimized-production reconciles into universe.brandName, and existing
  // tests query rows by that literal. Moving it would orphan every seeded row.
  it('leaves the persisted brand identifier untouched', () => {
    expect(PRODUCT_DISPLAY_NAME).toBe(INTERNAL_BRAND_NAME);
    expect(readRepoFile('packages/database/prisma/seed.ts')).toContain(INTERNAL_BRAND_NAME);
  });

  it('does not rebrand the channel or the in-fiction universe', () => {
    expect(CHANNEL_DISPLAY_NAME).toBe('Doodle Dash TV');
    expect(UNIVERSE_CANON_NAME).toBe('Doodle Dash Universe');
  });

  it('resolves every legacy brand spelling onto the current display name', () => {
    for (const alias of LEGACY_BRAND_ALIASES) {
      expect(isKnownBrandName(alias)).toBe(true);
      expect(resolveStudioDisplayName(alias)).toBe(STUDIO_DISPLAY_NAME);
    }
    expect(resolveStudioDisplayName('  doodle dash production  ')).toBe(STUDIO_DISPLAY_NAME);
    expect(resolveStudioDisplayName(null)).toBe(STUDIO_DISPLAY_NAME);
    expect(resolveStudioDisplayName('')).toBe(STUDIO_DISPLAY_NAME);
  });

  // A universe someone deliberately named something else is their name, not a
  // legacy value to be overwritten by ours.
  it('passes an unrecognised brand name through unchanged', () => {
    expect(resolveStudioDisplayName('Someone Else Studios')).toBe('Someone Else Studios');
    expect(isKnownBrandName('Someone Else Studios')).toBe(false);
  });

  it('records why each internal DDP name stays, and keeps the list from shrinking', () => {
    const names = PRESERVED_INTERNAL_DDP_NAMES.map((e) => e.name);
    for (const required of [
      'Doodle Dash Production',
      'Doodle Dash Universe',
      'Doodle Dash TV',
      'DDP',
      'DDP_ShadowShrink',
      '@doodle-dash/*',
      'ddp-runpod-blender',
    ]) {
      expect(names).toContain(required);
    }
    expect(PRESERVED_INTERNAL_DDP_NAMES.every((e) => e.reason.length > 20)).toBe(true);
  });

  it('carries both names in artifact provenance so the rename is legible later', () => {
    expect(BRAND_PROVENANCE.studio).toBe(STUDIO_DISPLAY_NAME);
    expect(BRAND_PROVENANCE.internalBrand).toBe(INTERNAL_BRAND_NAME);
    expect(BRAND_PROVENANCE.channel).toBe(CHANNEL_DISPLAY_NAME);
  });
});

describe('legacy manifests and identifiers still load', () => {
  /**
   * A manifest as it was written before this tranche: it names none of the state
   * bags the eight systems fill, because they did not exist. Nothing about the
   * direction layer may make it unreadable, and nothing may change the cache key
   * it hashes to — every cached render already in R2 is reachable only by that key.
   */
  const legacyManifest = {
    schemaVersion: 'ddp-cloud-job-manifest-v1' as const,
    jobId: 'legacy-job-1',
    episodeId: 'meadow-map-mystery',
    renderMode: 'FINAL_1080P' as const,
    resolution: '1080x1920',
    fps: 30,
    characters: {},
    outputPath: 'renders/meadow-map-mystery/final_1080p.mp4',
    estimatedFrameCount: 90,
    createdAt: '2026-08-13T00:00:00.000Z',
  };

  it('parses a manifest written before the direction layer existed', () => {
    const parsed = CloudJobManifestSchema.safeParse(legacyManifest);
    expect(parsed.success).toBe(true);
  });

  // The new bags default to empty rather than becoming required, which is what
  // makes the migration additive instead of destructive.
  it('defaults the new state bags to empty instead of demanding them', () => {
    const parsed = CloudJobManifestSchema.parse(legacyManifest);
    expect(parsed.cameraState).toEqual({});
    expect(parsed.lightingState).toEqual({});
    expect(parsed.vfxState).toEqual({});
    expect(parsed.expressionStates).toEqual({});
    expect(parsed.visemeData).toEqual({});
    expect(parsed.credentialsPolicy.secretsInManifest).toBe(false);
  });

  it('produces a stable cache key for a legacy manifest', () => {
    const parsed = CloudJobManifestSchema.parse(legacyManifest);
    const before = buildCloudCacheKey(parsed);
    const again = buildCloudCacheKey(CloudJobManifestSchema.parse(legacyManifest));
    expect(before).toBe(again);
    expect(before).toMatch(/^[0-9a-f]{16,}$/);
  });

  it('keeps the founding character codes exactly as seeded', () => {
    expect(FOUNDING_CODES.PIP).toBe('CHAR_PIP_001');
    expect(FOUNDING_CODES.GOAT).toBe('CHAR_GOAT_001');
  });
});

describe('the accepted FINAL_1080P evidence is still intact', () => {
  it('still describes the render that was accepted', () => {
    expect(FINAL_1080P_ACCEPTANCE.resolution).toBe('1080x1920');
    expect(FINAL_1080P_ACCEPTANCE.frames).toBe(90);
    expect(FINAL_1080P_ACCEPTANCE.fps).toBe(30);
    expect(FINAL_1080P_ACCEPTANCE.codec).toBe('H.264');
    expect(FINAL_1080P_ACCEPTANCE.chestSeamRepair).toBe('PASS');
    expect(FINAL_1080P_ACCEPTANCE.prNumber).toBe(10);
  });

  // The single most important regression in this branch: the approved .blend files
  // are byte-identical to the ones the accepted render used. Everything else in
  // Steps 1-8 is planning; if this drifts, the acceptance is void.
  it('measures the approved assets at exactly the accepted fingerprint', () => {
    const assets = computeRenderAssetFingerprint(REPO_ROOT);
    expect(assets.fingerprint).toBe(FINAL_1080P_ACCEPTANCE.approvedCharacterAssetsFingerprint);
    const paths = assets.files.map((f) => f.path);
    expect(paths).toContain('assets/characters/pip_production.blend');
    expect(paths).toContain('assets/characters/goat_production.blend');
  });

  it('still holds the accepted artifact hash and the merge commit that closed it', () => {
    expect(FINAL_1080P_ACCEPTANCE.acceptedArtifactSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(FINAL_1080P_ACCEPTANCE.workerImageDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(FINAL_1080P_ACCEPTANCE.mergeCommit).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('the chest seam repair is still in the render path', () => {
  const assembleScene = readRepoFile('scripts/blender/assemble_scene.py');

  it('still installs the shadow proxy with the accepted constants', () => {
    expect(assembleScene).toContain('def install_shadow_proxy');
    for (const [name, value] of Object.entries(SHADOW_CASTER_CONSTANTS)) {
      expect(assembleScene).toContain(name);
      if (typeof value === 'string') expect(assembleScene).toContain(value);
    }
  });

  it('still seals the proxy rather than shrinking it past the surface', () => {
    expect(assembleScene).toContain('SHADOW_PROXY_SEALED_CLEARANCE');
    expect(assembleScene).toContain('DDP_ShadowShrink');
  });

  // Every lighting state must still declare the corrected transform. AgX appears
  // only in the comment explaining why it was abandoned, never as a value.
  it('still applies the approved colour management transform in every lighting state', () => {
    const viewTransforms = [...assembleScene.matchAll(/"viewTransform":\s*"([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(viewTransforms.length).toBeGreaterThanOrEqual(4);
    for (const transform of viewTransforms) {
      expect(transform).toBe('Khronos PBR Neutral');
    }
  });

  // The new camera hook is the only thing this tranche added to the render path,
  // and it has to be strictly additive: a shot_meta without a `direction` block
  // must take exactly the path it took before.
  it('applies the direction camera only when a direction block is present', () => {
    expect(assembleScene).toContain('def apply_direction_camera');
    const fn = assembleScene.slice(assembleScene.indexOf('def apply_direction_camera'));
    const body = fn.slice(0, fn.indexOf('\ndef ', 4));
    expect(body).toMatch(/direction[^\n]*\)\s*(or|if)|if not direction/);
    expect(body).toContain('return');
  });
});

describe('cloud spend stays fail-closed', () => {
  it('reports that a paid GPU requires authorization with the default environment', () => {
    const status = readProviderStatus({} as NodeJS.ProcessEnv);
    expect(status.cloudRenderEnabled).toBe(false);
    expect(status.paidGpuLaunchAllowed).toBe(false);
    expect(status.requiresAuthorization).toBe(true);
    expect(status.localAvailable).toBe(true);
    expect(status.explanation).toContain('requires authorization');
  });

  it('treats anything other than the exact string "true" as not authorized', () => {
    for (const value of ['1', 'yes', 'TRUE', 'True', '']) {
      const status = readProviderStatus({
        CLOUD_RENDER_ENABLED: value,
        ALLOW_PAID_GPU_LAUNCH: value,
      } as NodeJS.ProcessEnv);
      expect(status.requiresAuthorization).toBe(true);
    }
  });

  it('is not authorized in the environment these tests are running in', () => {
    expect(process.env.CLOUD_RENDER_ENABLED === 'true').toBe(false);
    expect(process.env.ALLOW_PAID_GPU_LAUNCH === 'true').toBe(false);
    expect(readProviderStatus().requiresAuthorization).toBe(true);
  });

  /**
   * This tranche moved the render code (the opt-in camera hook in
   * assemble_scene.py) without rebuilding the worker image, and it deliberately
   * did not re-pin the constant: re-pinning would claim the published image
   * contains code it does not. The correct consequence is that the next paid
   * launch is blocked until someone rebuilds. Asserted here so that the blocked
   * state is an intentional, tested position rather than a surprise at launch.
   */
  it('refuses a paid launch because the pinned image predates the camera hook', () => {
    const localCode = computeRenderCodeFingerprint(REPO_ROOT).fingerprint;
    expect(localCode).not.toBe(FINAL_1080P_ACCEPTANCE.renderCodeFingerprint);

    const result = verifyWorkerProvenance({
      imageRef: `ghcr.io/doodledash/ddp-runpod-blender@${FINAL_1080P_ACCEPTANCE.workerImageDigest}`,
      expectedSourceCommit: FINAL_1080P_ACCEPTANCE.workerSourceCommit,
      expectedRenderCodeSha256: FINAL_1080P_ACCEPTANCE.renderCodeFingerprint,
      localRenderCodeSha256: localCode,
      registry: {
        ok: true,
        detail: 'pinned image as published',
        digest: FINAL_1080P_ACCEPTANCE.workerImageDigest,
        amd64: true,
        labels: {
          [LABEL_SOURCE_COMMIT]: FINAL_1080P_ACCEPTANCE.workerSourceCommit,
          [LABEL_RENDER_CODE_SHA256]: FINAL_1080P_ACCEPTANCE.renderCodeFingerprint,
          [LABEL_BUILD_TIME]: '2026-08-13T00:00:00Z',
        },
        env: {},
      },
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('RENDER_CODE_MISMATCH');
    expect(result.reasons.join(' ')).toContain('stale');
  });

  it('still accepts the approved assets against the accepted pin', () => {
    const result = verifyWorkerProvenance({
      imageRef: `ghcr.io/doodledash/ddp-runpod-blender@${FINAL_1080P_ACCEPTANCE.workerImageDigest}`,
      expectedSourceCommit: FINAL_1080P_ACCEPTANCE.workerSourceCommit,
      expectedRenderCodeSha256: FINAL_1080P_ACCEPTANCE.renderCodeFingerprint,
      localRenderCodeSha256: FINAL_1080P_ACCEPTANCE.renderCodeFingerprint,
      expectedRenderAssetSha256: FINAL_1080P_ACCEPTANCE.approvedCharacterAssetsFingerprint,
      localRenderAssetSha256: computeRenderAssetFingerprint(REPO_ROOT).fingerprint,
      registry: {
        ok: true,
        detail: 'pinned image as published',
        digest: FINAL_1080P_ACCEPTANCE.workerImageDigest,
        amd64: true,
        labels: {
          [LABEL_SOURCE_COMMIT]: FINAL_1080P_ACCEPTANCE.workerSourceCommit,
          [LABEL_RENDER_CODE_SHA256]: FINAL_1080P_ACCEPTANCE.renderCodeFingerprint,
          [LABEL_BUILD_TIME]: '2026-08-13T00:00:00Z',
        },
        env: {},
      },
    });
    expect(result.ok).toBe(true);
  });
});

describe('nothing the direction layer emits carries a secret', () => {
  const { blueprint } = direct(VALIDATION_SCENE_PLAN);

  it('redacts credential values out of a structured log line', () => {
    const env = {
      RUNPOD_API_KEY: 'rpa_liveabcdefghijklmnop',
      R2_SECRET_ACCESS_KEY: 'deadbeefdeadbeefdeadbeef',
    };
    const line = JSON.stringify({
      episodeId: 'VALIDATION_STEPS_1_8',
      authorization: `Bearer ${env.RUNPOD_API_KEY}`,
      storageKey: env.R2_SECRET_ACCESS_KEY,
    });
    const redacted = redactSecrets(line, env);
    expect(redacted).not.toContain(env.RUNPOD_API_KEY);
    expect(redacted).not.toContain(env.R2_SECRET_ACCESS_KEY);
    expect(redacted).toContain('[REDACTED]');
    expect(redacted).toContain('VALIDATION_STEPS_1_8');
  });

  it('passes the blueprint and its render projection through the manifest secret gate', () => {
    expect(() => assertNoSecretsInManifest(blueprint)).not.toThrow();
    const projection = projectBlueprintForRender(blueprint);
    expect(() => assertNoSecretsInManifest(projection)).not.toThrow();
  });

  // Voice identities are permanent public identifiers, not credentials, and the
  // planner must never reach for a key: the whole sound plan is offline.
  it('names voices without naming a provider credential', () => {
    const serialised = JSON.stringify(blueprint);
    expect(serialised).toContain('pip_default_v1');
    expect(serialised).toContain('goat_default_v1');
    for (const forbidden of ['API_KEY', 'SECRET', 'Bearer ', 'ACCESS_KEY', 'sk-', 'rp_']) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});
