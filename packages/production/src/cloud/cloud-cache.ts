/**
 * Cloud cache extension — reuse validated identical keys (Phase 15).
 * Correctness over speed; does not weaken local shot cache.
 */
import { createHash } from 'node:crypto';
import type { CloudJobManifest } from './types';
import { cacheKeyPath } from './r2-layout';

export type CloudCacheLookup = {
  cacheKey: string;
  remoteKey: string;
  hit: boolean;
  outputUri?: string;
  reason: string;
};

export function buildCloudCacheKey(manifest: CloudJobManifest): string {
  const material = {
    schemaVersion: manifest.schemaVersion,
    renderMode: manifest.renderMode,
    resolution: manifest.resolution,
    fps: manifest.fps,
    blenderVersionRequirement: manifest.blenderVersionRequirement,
    characters: manifest.characters,
    environments: manifest.environments.map(compactAsset),
    props: manifest.props.map(compactAsset),
    animations: manifest.animations.map(compactAsset),
    expressionStates: manifest.expressionStates,
    visemeData: manifest.visemeData,
    cameraState: manifest.cameraState,
    lightingState: manifest.lightingState,
    vfxState: manifest.vfxState,
    audio: manifest.audioReferences.map(compactAsset),
    renderSettings: manifest.renderSettings,
    cacheKeys: manifest.cacheKeys,
  };
  return createHash('sha256').update(stableStringify(material)).digest('hex');
}

function compactAsset(a: { assetId: string; version: string; checksum: string }) {
  return { assetId: a.assetId, version: a.version, checksum: a.checksum };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeys(obj[key]);
    }
    return out;
  }
  return value;
}

export async function lookupCloudCache(input: {
  manifest: CloudJobManifest;
  exists: (key: string) => Promise<boolean>;
  resolveUri?: (key: string) => Promise<string>;
}): Promise<CloudCacheLookup> {
  const cacheKey = buildCloudCacheKey(input.manifest);
  const remoteKey = cacheKeyPath(cacheKey, 'final.mp4');
  const hit = await input.exists(remoteKey);
  if (!hit) {
    return {
      cacheKey,
      remoteKey,
      hit: false,
      reason: 'No validated cloud cache entry for identical dependency key.',
    };
  }
  const outputUri = input.resolveUri ? await input.resolveUri(remoteKey) : remoteKey;
  return {
    cacheKey,
    remoteKey,
    hit: true,
    outputUri,
    reason: 'Identical validated cache key — reuse without re-render.',
  };
}
