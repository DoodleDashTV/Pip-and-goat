import { z } from 'zod';
import { existsSync } from 'node:fs';
import { localMaterializationPath } from './storage-policy';
import {
  COMPATIBILITY_STATUSES,
  SCENERY_SCHEMA_VERSION,
  SUPPORTED_BLENDER_VERSION,
  SourceStatusSchema,
  SceneryError,
} from './types';

export const SourceExpectedFileSchema = z.object({
  filename: z.string().min(1),
  fileType: z.string().min(1),
  approximateBytes: z.number().int().nonnegative().nullable(),
  notes: z.string().default(''),
});

export const SourceRecordSchema = z.object({
  sourceId: z.string().regex(/^SRC_[A-Z0-9_]+$/),
  collectionName: z.string().min(1),
  provider: z.string().min(1),
  licenseProvenancePlaceholder: z.string().min(1),
  expectedFiles: z.array(SourceExpectedFileSchema).min(1),
  expectedFileTypes: z.array(z.string().min(1)).min(1),
  supportedBlenderVersion: z.string().min(1),
  sourceStorageUri: z.string().min(1),
  localMaterializationPath: z.string().min(1),
  sha256: z.string().nullable(),
  ingestionStatus: SourceStatusSchema,
  compatibilityStatus: z.enum(COMPATIBILITY_STATUSES),
  textureDependencies: z.array(z.string()),
  notes: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  bytesInspected: z.boolean(),
});

export type SourceRecord = z.infer<typeof SourceRecordSchema>;

const REGISTERED_AT = '2026-08-18T00:00:00.000Z';

function source(partial: Omit<SourceRecord, 'createdAt' | 'updatedAt' | 'bytesInspected' | 'sha256'>): SourceRecord {
  return SourceRecordSchema.parse({
    ...partial,
    sha256: null,
    bytesInspected: false,
    createdAt: REGISTERED_AT,
    updatedAt: REGISTERED_AT,
  });
}

export const REGISTERED_SOURCES: SourceRecord[] = [
  source({
    sourceId: 'SRC_VILLAGE_ENV',
    collectionName: 'Village Environment',
    provider: 'Purchased village environment package',
    licenseProvenancePlaceholder: 'LICENSE_PENDING — attach the purchased license before approval',
    expectedFiles: [
      { filename: 'Assembled Project File.blend', fileType: 'blend', approximateBytes: null, notes: 'Village assembled project' },
      { filename: 'Village Blender 4.2.2 assets', fileType: 'blend-package', approximateBytes: null, notes: '' },
      { filename: 'Village texture package', fileType: 'textures', approximateBytes: null, notes: '' },
      { filename: 'Village FBX package', fileType: 'fbx-package', approximateBytes: null, notes: '' },
      { filename: 'Unity Built-in backup', fileType: 'unity-package', approximateBytes: null, notes: 'Backup only. Not a TivvleJoy runtime.' },
      { filename: 'Unity URP backup', fileType: 'unity-package', approximateBytes: null, notes: 'Backup only. Not a TivvleJoy runtime.' },
      { filename: 'Unity HDRP backup', fileType: 'unity-package', approximateBytes: null, notes: 'Backup only. Not a TivvleJoy runtime.' },
    ],
    expectedFileTypes: ['blend', 'fbx', 'textures', 'unity-package'],
    supportedBlenderVersion: SUPPORTED_BLENDER_VERSION,
    sourceStorageUri: 'tivvlejoy-assets/source/village/',
    localMaterializationPath: localMaterializationPath('source', 'village'),
    ingestionStatus: 'source_unavailable',
    compatibilityStatus: 'unknown',
    textureDependencies: ['Village texture package'],
    notes:
      'Expected contents include five cabin families with A/B variants, barrel, bed, books, bookcase, bucket, candles, cart, chairs, crate, fence, gate, firewood, grass, nightstand, rack, shelf, tables, and three trees. Not inspected in this workspace.',
  }),
  source({
    sourceId: 'SRC_SKY_HDRI',
    collectionName: 'Sky and HDRI Lighting',
    provider: 'Purchased SkyMachine and HDRI package',
    licenseProvenancePlaceholder: 'LICENSE_PENDING — attach the purchased license before approval',
    expectedFiles: [
      { filename: 'SkyMachine V1', fileType: 'blend-or-archive', approximateBytes: null, notes: '' },
      { filename: 'SkyMachine V2', fileType: 'blend-or-archive', approximateBytes: null, notes: '' },
      { filename: 'Extra sky update', fileType: 'archive', approximateBytes: null, notes: '' },
      { filename: 'HDRI/JPG archive parts (4)', fileType: 'archive-parts', approximateBytes: null, notes: '' },
      { filename: 'HDR environment maps (20+)', fileType: 'hdr', approximateBytes: null, notes: '' },
      { filename: 'JPG preview images', fileType: 'jpg', approximateBytes: null, notes: '' },
    ],
    expectedFileTypes: ['blend', 'hdr', 'jpg', 'archive'],
    supportedBlenderVersion: SUPPORTED_BLENDER_VERSION,
    sourceStorageUri: 'tivvlejoy-assets/source/sky-hdri/',
    localMaterializationPath: localMaterializationPath('source', 'sky-hdri'),
    ingestionStatus: 'source_unavailable',
    compatibilityStatus: 'unknown',
    textureDependencies: ['HDRI archive', 'JPG previews'],
    notes: 'SkyMachine V1/V2 plus twenty-plus HDR maps. Not inspected in this workspace.',
  }),
  source({
    sourceId: 'SRC_STYLIZED_FOREST',
    collectionName: 'Stylized Forest',
    provider: 'Purchased stylized forest nature kit',
    licenseProvenancePlaceholder: 'LICENSE_PENDING — attach the purchased license before approval',
    expectedFiles: [
      { filename: 'Stylized_Forest_Nature_Kit.blend', fileType: 'blend', approximateBytes: null, notes: '' },
      { filename: 'FBX', fileType: 'fbx', approximateBytes: null, notes: '' },
      { filename: 'OBJ', fileType: 'obj', approximateBytes: null, notes: '' },
      { filename: 'MTL', fileType: 'mtl', approximateBytes: null, notes: '' },
      { filename: '1024 texture tier', fileType: 'textures', approximateBytes: null, notes: '' },
      { filename: '2048 texture tier', fileType: 'textures', approximateBytes: null, notes: '' },
      { filename: '4096 texture tier', fileType: 'textures', approximateBytes: null, notes: '' },
    ],
    expectedFileTypes: ['blend', 'fbx', 'obj', 'mtl', 'textures'],
    supportedBlenderVersion: SUPPORTED_BLENDER_VERSION,
    sourceStorageUri: 'tivvlejoy-assets/source/stylized-forest/',
    localMaterializationPath: localMaterializationPath('source', 'stylized-forest'),
    ingestionStatus: 'source_unavailable',
    compatibilityStatus: 'unknown',
    textureDependencies: ['Rocks A/B', 'Foliage 01/02', 'Tree trunks', 'Leaves', 'Base color', 'Normal', 'Roughness', 'AO', 'ORM', 'Opacity', 'Subsurface'],
    notes: 'Texture tiers 1024/2048/4096 are registered only. Not inspected in this workspace.',
  }),
  source({
    sourceId: 'SRC_PROCEDURAL_NATURE',
    collectionName: 'Procedural Nature Library',
    provider: 'Purchased stylised EcoKit / Geometry Nodes library',
    licenseProvenancePlaceholder: 'LICENSE_PENDING — attach the purchased license before approval',
    expectedFiles: [
      { filename: 'Flora_Mat&GN&Models.blend', fileType: 'blend', approximateBytes: null, notes: '' },
      { filename: 'Rock_Models.blend', fileType: 'blend', approximateBytes: null, notes: '' },
      { filename: 'Rock_Mat.blend', fileType: 'blend', approximateBytes: null, notes: '' },
      { filename: 'Rock_GN.blend', fileType: 'blend', approximateBytes: null, notes: '' },
      { filename: 'Water_Mat&GN.blend', fileType: 'blend', approximateBytes: null, notes: '' },
      { filename: 'Swarm.blend', fileType: 'blend', approximateBytes: null, notes: '' },
      { filename: 'Textures.zip', fileType: 'zip', approximateBytes: null, notes: '' },
      { filename: 'Asset preview library', fileType: 'previews', approximateBytes: null, notes: '' },
      { filename: 'blender_assets.cats.txt', fileType: 'txt', approximateBytes: null, notes: '' },
    ],
    expectedFileTypes: ['blend', 'zip', 'txt', 'previews'],
    supportedBlenderVersion: SUPPORTED_BLENDER_VERSION,
    sourceStorageUri: 'tivvlejoy-assets/source/procedural-nature/',
    localMaterializationPath: localMaterializationPath('source', 'procedural-nature'),
    ingestionStatus: 'source_unavailable',
    compatibilityStatus: 'unknown',
    textureDependencies: ['Textures.zip'],
    notes:
      'Trees, grass, ferns, bushes, flowers, vines, moss, fallen leaves, rocks, procedural water, butterflies, fireflies, and Geometry Nodes scatter systems. Not inspected in this workspace.',
  }),
];

export function validateSourceRecord(input: unknown): SourceRecord {
  const parsed = SourceRecordSchema.safeParse(input);
  if (!parsed.success) {
    throw new SceneryError(`Invalid source record. ${parsed.error.issues[0]?.message ?? ''}`.trim(), 'INVALID_SOURCE');
  }
  return parsed.data;
}

export function listRegisteredSources(): SourceRecord[] {
  return REGISTERED_SOURCES.map((item) => ({ ...item }));
}

export function resolveSourcePresence(record: SourceRecord): SourceRecord {
  const present = existsSync(record.localMaterializationPath);
  if (!present) {
    return {
      ...record,
      ingestionStatus: 'source_unavailable',
      compatibilityStatus: 'unknown',
      sha256: null,
      bytesInspected: false,
      notes: `${record.notes} Local path is empty; status remains source_unavailable.`,
    };
  }
  return {
    ...record,
    ingestionStatus: 'awaiting_inspection',
    notes: `${record.notes} Local files exist but have not been inspected in this increment.`,
  };
}

export function publicSourceSnapshot() {
  return listRegisteredSources().map(resolveSourcePresence).map((item) => ({
    sourceId: item.sourceId,
    collectionName: item.collectionName,
    ingestionStatus: item.ingestionStatus,
    compatibilityStatus: item.compatibilityStatus,
    supportedBlenderVersion: item.supportedBlenderVersion,
    bytesInspected: item.bytesInspected,
    schemaVersion: SCENERY_SCHEMA_VERSION,
  }));
}
