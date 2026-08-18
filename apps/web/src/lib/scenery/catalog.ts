import { z } from 'zod';
import {
  APPROVAL_STATUSES,
  ASSET_TYPES,
  BIOMES,
  COMPATIBILITY_STATUSES,
  ORIGIN_POLICIES,
  PLACEMENT_MODES,
  ROTATION_POLICIES,
  SCENERY_SCHEMA_VERSION,
  SceneryError,
} from './types';

export const DimensionMetersSchema = z.object({
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
  z: z.number().finite().nonnegative(),
});

export const BoundsMetersSchema = z.object({
  minX: z.number().finite(),
  maxX: z.number().finite(),
  minY: z.number().finite(),
  maxY: z.number().finite(),
  minZ: z.number().finite(),
  maxZ: z.number().finite(),
});

export const ScaleRangeSchema = z
  .object({
    min: z.number().positive(),
    max: z.number().positive(),
  })
  .refine((range) => range.min <= range.max, {
    message: 'allowedScaleRange.min must be <= max',
  });

export const TextureTierAvailabilitySchema = z.object({
  '1024': z.boolean(),
  '2048': z.boolean(),
  '4096': z.boolean(),
});

export const ValidationFindingSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(['info', 'warning', 'error']),
  message: z.string().min(1),
});

export const CatalogAssetSchema = z
  .object({
    schemaVersion: z.literal(SCENERY_SCHEMA_VERSION),
    assetId: z.string().min(1).regex(/^SCN_[A-Z0-9_]+$/),
    displayName: z.string().min(1),
    collection: z.string().min(1),
    assetType: z.enum(ASSET_TYPES),
    biome: z.enum(BIOMES),
    style: z.string().min(1),
    tags: z.array(z.string().min(1)).min(1),
    sourceId: z.string().min(1),
    sourceObjectName: z.string().min(1),
    normalizedBlendPath: z.string().nullable(),
    proxyPath: z.string().nullable(),
    previewPath: z.string().nullable(),
    dimensionsMeters: DimensionMetersSchema,
    originPolicy: z.enum(ORIGIN_POLICIES),
    placementMode: z.enum(PLACEMENT_MODES),
    surfaceRequirements: z.array(z.string().min(1)),
    allowedScaleRange: ScaleRangeSchema,
    rotationPolicy: z.enum(ROTATION_POLICIES),
    materials: z.array(z.string().min(1)),
    textureTierAvailability: TextureTierAvailabilitySchema,
    triangleCount: z.number().int().nonnegative(),
    estimatedMemoryMb: z.number().nonnegative(),
    heroSafe: z.boolean(),
    backgroundSafe: z.boolean(),
    clearanceBounds: BoundsMetersSchema,
    animationCapable: z.boolean(),
    geometryNodesCapable: z.boolean(),
    licensingProvenanceRef: z.string().min(1),
    compatibilityStatus: z.enum(COMPATIBILITY_STATUSES),
    validationFindings: z.array(ValidationFindingSchema),
    approvalStatus: z.enum(APPROVAL_STATUSES),
    bytesInspected: z.boolean(),
  })
  .superRefine((asset, ctx) => {
    if (
      asset.approvalStatus === 'approved' &&
      !asset.bytesInspected &&
      !asset.sourceId.startsWith('SRC_FIXTURE')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Purchased assets cannot be approved until real bytes are inspected.',
        path: ['approvalStatus'],
      });
    }
    if (asset.approvalStatus === 'approved' && !asset.licensingProvenanceRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Approved assets require a licensing/provenance reference.',
        path: ['licensingProvenanceRef'],
      });
    }
    if (asset.clearanceBounds.minX > asset.clearanceBounds.maxX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'clearanceBounds.minX must be <= maxX.',
        path: ['clearanceBounds'],
      });
    }
  });

export type CatalogAsset = z.infer<typeof CatalogAssetSchema>;
export type ValidationFinding = z.infer<typeof ValidationFindingSchema>;

export interface AssetCatalog {
  schemaVersion: typeof SCENERY_SCHEMA_VERSION;
  generatedAt: string;
  assets: CatalogAsset[];
}

export function parseCatalogAsset(value: unknown): CatalogAsset {
  const parsed = CatalogAssetSchema.safeParse(value);
  if (!parsed.success) {
    throw new SceneryError(
      `Invalid catalog record. ${parsed.error.issues[0]?.message ?? ''}`.trim(),
      'INVALID_CATALOG',
    );
  }
  return parsed.data;
}

export function parseAssetCatalog(value: unknown): AssetCatalog {
  return z
    .object({
      schemaVersion: z.literal(SCENERY_SCHEMA_VERSION),
      generatedAt: z.string().min(1),
      assets: z.array(CatalogAssetSchema),
    })
    .parse(value);
}

export function catalogById(catalog: AssetCatalog): Map<string, CatalogAsset> {
  return new Map(catalog.assets.map((asset) => [asset.assetId, asset]));
}

export function assetsForRole(catalog: AssetCatalog, role: string): CatalogAsset[] {
  return catalog.assets.filter(
    (asset) =>
      asset.tags.includes(role) &&
      (asset.approvalStatus === 'approved' || asset.approvalStatus === 'fixture_only'),
  );
}
