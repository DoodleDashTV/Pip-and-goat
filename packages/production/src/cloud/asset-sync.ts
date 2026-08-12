/**
 * Asset sync — upload/download only missing or checksum-changed assets (Phase 7).
 * Never regenerates Pip or Goat.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ObjectStorage } from '@doodle-dash/shared';
import { sha256Hex } from '@doodle-dash/shared';
import type { AssetRef } from './types';
import {
  characterAssetKey,
  contentAddressedVersionId,
  sha256OfBuffer,
} from './r2-layout';

export type SyncPlanItem = {
  asset: AssetRef;
  action: 'reuse' | 'upload' | 'download' | 'skip';
  remoteKey: string;
  reason: string;
};

export type SyncPlan = {
  items: SyncPlanItem[];
  uploads: number;
  downloads: number;
  reuses: number;
};

export function resolveRemoteKey(asset: AssetRef): string {
  if (asset.remoteKey) return asset.remoteKey;
  const version = contentAddressedVersionId(asset.checksum, asset.version || asset.assetId);
  if (asset.assetId === 'char_pip_v1' || asset.assetId.toLowerCase().includes('pip')) {
    return characterAssetKey('pip', version, path.basename(asset.localPath || `${asset.assetId}.blend`));
  }
  if (asset.assetId === 'char_goat_v1' || asset.assetId.toLowerCase().includes('goat')) {
    return characterAssetKey('goat', version, path.basename(asset.localPath || `${asset.assetId}.blend`));
  }
  const root =
    asset.role === 'environment'
      ? 'environments'
      : asset.role === 'prop'
        ? 'props'
        : asset.role === 'animation'
          ? 'animations'
          : asset.role === 'vfx'
            ? 'vfx'
            : asset.role === 'audio'
              ? 'audio'
              : 'cache';
  return `${root}/${asset.assetId}/${version}/${path.basename(asset.localPath || `${asset.assetId}.bin`)}`;
}

export async function planAssetSync(input: {
  assets: AssetRef[];
  storage: ObjectStorage;
  direction: 'upload' | 'download';
}): Promise<SyncPlan> {
  const items: SyncPlanItem[] = [];
  let uploads = 0;
  let downloads = 0;
  let reuses = 0;

  for (const asset of input.assets) {
    const remoteKey = resolveRemoteKey(asset);
    const exists = (await input.storage.exists?.(remoteKey)) ?? false;

    if (exists && input.storage.readObject) {
      try {
        const remoteBytes = await input.storage.readObject(remoteKey);
        const remoteHash = sha256OfBuffer(remoteBytes);
        if (remoteHash === asset.checksum) {
          items.push({
            asset,
            action: 'reuse',
            remoteKey,
            reason: 'Remote checksum matches — reuse without transfer.',
          });
          reuses += 1;
          continue;
        }
      } catch {
        // fall through to transfer
      }
    }

    if (input.direction === 'upload') {
      items.push({
        asset,
        action: exists ? 'upload' : 'upload',
        remoteKey,
        reason: exists
          ? 'Remote checksum differs — upload new version.'
          : 'Remote asset missing — upload required.',
      });
      uploads += 1;
    } else {
      if (!exists) {
        items.push({
          asset,
          action: 'skip',
          remoteKey,
          reason: 'Remote asset missing — cannot download.',
        });
        continue;
      }
      items.push({
        asset,
        action: 'download',
        remoteKey,
        reason: 'Local missing or changed — download from R2.',
      });
      downloads += 1;
    }
  }

  return { items, uploads, downloads, reuses };
}

export async function executeUploadPlan(input: {
  plan: SyncPlan;
  storage: ObjectStorage;
}): Promise<{ uploaded: string[]; reused: string[] }> {
  const uploaded: string[] = [];
  const reused: string[] = [];
  for (const item of input.plan.items) {
    if (item.action === 'reuse') {
      reused.push(item.remoteKey);
      continue;
    }
    if (item.action !== 'upload') continue;
    const localPath = item.asset.localPath;
    if (!localPath) {
      throw new Error(`Cannot upload ${item.asset.assetId}: localPath missing`);
    }
    const buf = await fs.readFile(localPath);
    const hash = sha256Hex(new Uint8Array(buf));
    if (hash !== item.asset.checksum) {
      throw new Error(
        `Checksum mismatch before upload for ${item.asset.assetId}: expected ${item.asset.checksum}, got ${hash}`,
      );
    }
    await input.storage.putObject(item.remoteKey, new Uint8Array(buf));
    // Optional sidecar checksum for remote verification
    await input.storage.putObject(
      `${item.remoteKey}.sha256`,
      new TextEncoder().encode(hash),
      'text/plain',
    );
    uploaded.push(item.remoteKey);
  }
  return { uploaded, reused };
}

export async function executeDownloadPlan(input: {
  plan: SyncPlan;
  storage: ObjectStorage;
  destDir: string;
}): Promise<{ downloaded: string[]; reused: string[] }> {
  const downloaded: string[] = [];
  const reused: string[] = [];
  await fs.mkdir(input.destDir, { recursive: true });
  for (const item of input.plan.items) {
    if (item.action === 'reuse') {
      reused.push(item.remoteKey);
      continue;
    }
    if (item.action !== 'download') continue;
    if (!input.storage.readObject) {
      throw new Error('Storage does not support readObject');
    }
    const bytes = await input.storage.readObject(item.remoteKey);
    const hash = sha256OfBuffer(bytes);
    if (hash !== item.asset.checksum) {
      throw new Error(`Downloaded checksum mismatch for ${item.asset.assetId}`);
    }
    const dest = path.join(input.destDir, path.basename(item.remoteKey));
    await fs.writeFile(dest, bytes);
    downloaded.push(dest);
  }
  return { downloaded, reused };
}

/** Founding character asset IDs — sync only, never regenerate. */
export const FOUNDING_CLOUD_ASSET_IDS = {
  pip: 'char_pip_v1',
  goat: 'char_goat_v1',
  meadow: 'env_meadow_v1',
  magicMap: 'vfx_magic_map_glow_v1',
} as const;
