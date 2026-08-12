/**
 * R2 / cloud production storage layout (Phase 6).
 * Uses hashes/version IDs — does not blindly duplicate files.
 */
import { createHash } from 'node:crypto';
import { storageKeyFor } from '@doodle-dash/shared';

export const R2_LAYOUT_ROOTS = [
  'characters',
  'environments',
  'props',
  'animations',
  'vfx',
  'audio',
  'episodes',
  'renders',
  'logs',
  'qc',
  'cache',
] as const;

export type R2LayoutRoot = (typeof R2_LAYOUT_ROOTS)[number];

export function characterAssetKey(code: 'pip' | 'goat', versionId: string, filename: string): string {
  return `characters/${code}/${sanitize(versionId)}/${sanitize(filename)}`;
}

export function environmentAssetKey(envId: string, versionId: string, filename: string): string {
  return `environments/${sanitize(envId)}/${sanitize(versionId)}/${sanitize(filename)}`;
}

export function propAssetKey(propId: string, versionId: string, filename: string): string {
  return `props/${sanitize(propId)}/${sanitize(versionId)}/${sanitize(filename)}`;
}

export function animationAssetKey(animId: string, versionId: string, filename: string): string {
  return `animations/${sanitize(animId)}/${sanitize(versionId)}/${sanitize(filename)}`;
}

export function vfxAssetKey(vfxId: string, versionId: string, filename: string): string {
  return `vfx/${sanitize(vfxId)}/${sanitize(versionId)}/${sanitize(filename)}`;
}

export function audioAssetKey(audioId: string, versionId: string, filename: string): string {
  return `audio/${sanitize(audioId)}/${sanitize(versionId)}/${sanitize(filename)}`;
}

export function episodePath(seasonId: string, episodeNumber: number): string {
  const season = sanitize(seasonId.startsWith('season_') ? seasonId : `season_${seasonId}`);
  const ep = `episode_${String(episodeNumber).padStart(3, '0')}`;
  return `episodes/${season}/${ep}`;
}

export function renderDraftKey(episodeId: string, jobId: string, filename: string): string {
  return `renders/drafts/${sanitize(episodeId)}/${sanitize(jobId)}/${sanitize(filename)}`;
}

export function renderFinalKey(episodeId: string, jobId: string, filename: string): string {
  return `renders/finals/${sanitize(episodeId)}/${sanitize(jobId)}/${sanitize(filename)}`;
}

export function logKey(jobId: string, filename: string): string {
  return `logs/${sanitize(jobId)}/${sanitize(filename)}`;
}

export function qcKey(jobId: string, filename: string): string {
  return `qc/${sanitize(jobId)}/${sanitize(filename)}`;
}

export function cacheKeyPath(cacheFingerprint: string, filename: string): string {
  return `cache/${sanitize(cacheFingerprint.slice(0, 32))}/${sanitize(filename)}`;
}

/** Map legacy durable categories onto cloud production layout when useful. */
export function cloudKeyForLegacyCategory(
  category: string,
  parts: Array<string | number>,
): string {
  if (category === 'character-models' || category === 'canonical-references') {
    return ['characters', ...parts.map((p) => sanitize(String(p)))].join('/');
  }
  if (category === 'draft-renders' || category === 'draft_renders') {
    return ['renders', 'drafts', ...parts.map((p) => sanitize(String(p)))].join('/');
  }
  if (category === 'final-renders' || category === 'final_renders') {
    return ['renders', 'finals', ...parts.map((p) => sanitize(String(p)))].join('/');
  }
  return storageKeyFor(category, parts);
}

export function contentAddressedVersionId(checksum: string, logicalId: string): string {
  const short = checksum.slice(0, 12);
  return `${sanitize(logicalId)}_${short}`;
}

export function sha256OfBuffer(buf: Uint8Array | Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function sanitize(value: string): string {
  return String(value).replace(/[^A-Za-z0-9._@+-]+/g, '_');
}
