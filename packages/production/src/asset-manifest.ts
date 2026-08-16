/**
 * Durable asset manifest — classification without promotion.
 *
 * Proposed, preserved, proxy, and locked prototype assets can be listed here.
 * Listing an asset does not approve it, bind it theatrically, or change the
 * production-library fingerprint.
 */
import { z } from 'zod';

export const ASSET_MANIFEST_CLASSES = [
  'production_library_locked',
  'preserved_comparison',
  'proposed_unapproved',
  'proxy_pipeline_only',
  'intake_candidate',
  'approved_visual_foundation',
  'superseded_archive',
] as const;

export const DurableAssetClassSchema = z.enum(ASSET_MANIFEST_CLASSES);
export type DurableAssetClass = z.infer<typeof DurableAssetClassSchema>;

export const DurableAssetRecordSchema = z.object({
  id: z.string().min(1),
  class: DurableAssetClassSchema,
  path: z.string().min(1),
  characterCode: z.string().nullable().optional(),
  quality: z.string().optional(),
  immutable: z.boolean().default(false),
  notes: z.string().optional(),
  sha256WhenReassembled: z.string().optional(),
});
export type DurableAssetRecord = z.infer<typeof DurableAssetRecordSchema>;

export const DurableAssetManifestSchema = z.object({
  schema: z.literal('tivvlejoy.durable_asset_manifest.v1'),
  studio: z.literal('TivvleJoy'),
  approved: z.literal(false),
  canonicalMutated: z.literal(false),
  theatricalBound: z.literal(false),
  productionLibraryFingerprint: z.string().min(16),
  assets: z.array(DurableAssetRecordSchema).min(1),
});
export type DurableAssetManifest = z.infer<typeof DurableAssetManifestSchema>;

export function parseDurableAssetManifest(raw: unknown): DurableAssetManifest {
  return DurableAssetManifestSchema.parse(raw);
}

export function assetsOfClass(manifest: DurableAssetManifest, assetClass: DurableAssetClass) {
  return manifest.assets.filter((asset) => asset.class === assetClass);
}

export function assertManifestDoesNotPromote(manifest: DurableAssetManifest) {
  if (manifest.approved || manifest.canonicalMutated || manifest.theatricalBound) {
    throw new Error('Durable asset manifest must not self-approve, mutate canon, or bind theatrically.');
  }
  return true;
}
