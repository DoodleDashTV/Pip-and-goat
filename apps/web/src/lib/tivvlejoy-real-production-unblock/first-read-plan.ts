import type { ListedPrivateObject, PackageRole, PrivateObjectInventory } from '@/lib/tivvlejoy-real-input-convergence/types';
import {
  FIRST_READ_PLAN_SCHEMA,
  type Ep012SceneryRole,
  type FirstReadCandidate,
  type FirstReadPlan,
  type SourceFamily,
} from './types';

const HUGE_PACKAGE_BYTES = 900_000_000;
const AVOID_ROLES = new Set<PackageRole>([
  'BOTANIQ_ARCHIVE',
  'OPTIONAL_ADDON',
  'HISTORICAL_DUPLICATE',
  'WRAPPER',
  'RECEIPT_METADATA',
]);

const FAMILY_ROLES: Record<SourceFamily, Ep012SceneryRole[]> = {
  direct_glb: ['BUILDING_HERO', 'SIGNAGE', 'STREET_PROP'],
  tavern_fbx: ['BUILDING_HERO', 'INTERIOR_SHELL', 'SIGNAGE'],
  tavern_texture: ['BUILDING_HERO', 'SIGNAGE'],
  mountain: ['BACKGROUND_FILL', 'TERRAIN_SURFACE'],
  village: ['PATH', 'STREET_PROP', 'BACKGROUND_FILL'],
  forest: ['TREE_SUPPORT', 'PATH', 'FOREGROUND_FRAME'],
  sky_hdri: ['SKY'],
};

function reasons(family: SourceFamily): { selected: string; evidence: string[] } {
  switch (family) {
    case 'direct_glb':
      return {
        selected: 'Direct GLB is the smallest inspectable commercial mesh and can prove hero geometry without unpacking a huge archive.',
        evidence: ['mesh identity', 'object/node count', 'bakery or signage presence', 'whether a later Blender import is needed'],
      };
    case 'tavern_fbx':
      return {
        selected: 'Tavern FBX, or the smallest Tavern original if FBX is absent, is the only building-adjacent source that may satisfy bakery/hero roles if the GLB is insufficient.',
        evidence: ['whether bakery/tavern building geometry exists as native FBX', 'whether only a zip wrapper is present'],
      };
    case 'tavern_texture':
      return {
        selected: 'Standalone Tavern textures prove material readiness without downloading the full building package again.',
        evidence: ['albedo/roughness/normal presence', 'whether textures are packed only inside a huge archive'],
      };
    case 'mountain':
      return {
        selected: 'Smallest relevant mountain object can prove far-background / terrain fill for the bakery street without opening a multi-gigabyte landscape pack.',
        evidence: ['far-background fill viability', 'whether a small mountain original exists'],
      };
    case 'village':
      return {
        selected: 'Smallest useful Village source can prove path and street-prop coverage for the bakery exterior.',
        evidence: ['path continuity', 'street dressing presence'],
      };
    case 'forest':
      return {
        selected: 'Smallest useful Forest source can prove tree-support and forest-exit coverage for the EP012 closer.',
        evidence: ['tree-support presence', 'forest-exit path dressing'],
      };
    case 'sky_hdri':
      return {
        selected: 'One sky/HDRI source can prove EP012 sky/environment lighting if the listing contains a relevant object.',
        evidence: ['whether a discrete sky/HDRI exists outside addon caches'],
      };
  }
}

function isHuge(object: ListedPrivateObject): boolean {
  return object.size >= HUGE_PACKAGE_BYTES;
}

function isAvoided(object: ListedPrivateObject): boolean {
  return AVOID_ROLES.has(object.knownPackageRole) || isHuge(object);
}

function matchesFamily(object: ListedPrivateObject, family: SourceFamily): boolean {
  const ext = object.extension;
  const role = object.knownPackageRole;
  switch (family) {
    case 'direct_glb':
      return role === 'DIRECT_GLB' || ext === '.glb' || ext === '.gltf';
    case 'mountain':
      return role === 'MOUNTAIN_PACKAGE';
    case 'tavern_fbx':
      return role === 'DIRECT_FBX' || ext === '.fbx' || (role === 'TAVERN_PACKAGE' && ext === '.fbx');
    case 'tavern_texture':
      return role === 'TEXTURE_PACKAGE' || (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.tif' || ext === '.exr');
    case 'village':
      return role === 'VILLAGE_PACKAGE';
    case 'forest':
      return role === 'FOREST_PACKAGE';
    case 'sky_hdri':
      return role === 'SKY_HDRI_PACKAGE' || ext === '.hdr' || ext === '.exr';
  }
}

function pickSmallest(objects: readonly ListedPrivateObject[], family: SourceFamily, used: Set<string>): ListedPrivateObject | null {
  const matches = objects
    .filter((object) => !used.has(object.objectIdentity) && !isAvoided(object) && matchesFamily(object, family))
    .sort((a, b) => a.size - b.size || a.objectIdentity.localeCompare(b.objectIdentity));
  return matches[0] ?? null;
}

function toCandidate(object: ListedPrivateObject, family: SourceFamily): FirstReadCandidate {
  const copy = reasons(family);
  return {
    sourceId: `src_${object.objectIdentity.slice(0, 16)}`,
    objectIdentity: object.objectIdentity,
    operatorLabel: object.operatorLabel,
    size: object.size,
    format: object.extension.replace(/^\./, '') || 'unknown',
    family,
    reasonSelected: copy.selected,
    expectedEvidenceGained: copy.evidence,
    expectedSemanticRoles: FAMILY_ROLES[family],
    expectedDownloadBytes: object.size,
    expectedRequestCount: 1,
    estimatedStorageOperationCost: 'UNKNOWN',
    estimatedDataTransferCost: 'UNKNOWN',
    costConfidence: 'NONE',
    requiresUserAuthorization: true,
    avoided: false,
  };
}

function avoidReason(object: ListedPrivateObject): string {
  if (object.knownPackageRole === 'BOTANIQ_ARCHIVE') return 'Botaniq / scatter archive held; not first-episode scenery.';
  if (object.knownPackageRole === 'OPTIONAL_ADDON') return 'Historical or optional addon; not required for EP012.';
  if (object.knownPackageRole === 'HISTORICAL_DUPLICATE') return 'Historical addon or duplicate version.';
  if (object.knownPackageRole === 'WRAPPER') return 'Wrapper skipped because an original should be preferred.';
  if (object.knownPackageRole === 'RECEIPT_METADATA') return 'Receipt metadata is listing-only; it is not a commercial mesh.';
  if (isHuge(object)) return 'Huge package avoided to keep first-read bytes small.';
  return 'Not the smallest useful EP012-relevant original for this family.';
}

export function selectFirstRealSources(inventory: PrivateObjectInventory): FirstReadCandidate[] {
  const used = new Set<string>();
  const selected: FirstReadCandidate[] = [];
  const add = (family: SourceFamily, fallback?: (objects: readonly ListedPrivateObject[]) => ListedPrivateObject | null) => {
    const found = pickSmallest(inventory.objects, family, used);
    const object = found ?? fallback?.(inventory.objects) ?? null;
    if (!object || used.has(object.objectIdentity)) return;
    used.add(object.objectIdentity);
    selected.push(toCandidate(object, family));
  };

  add('direct_glb');
  add('mountain');
  add('tavern_fbx', (objects) => {
    const tavern = objects
      .filter((object) => !used.has(object.objectIdentity) && !isAvoided(object) && object.knownPackageRole === 'TAVERN_PACKAGE')
      .sort((a, b) => a.size - b.size || a.objectIdentity.localeCompare(b.objectIdentity));
    return tavern[0] ?? null;
  });
  add('tavern_texture');
  add('village');
  add('forest');
  add('sky_hdri');
  return selected;
}

export function compileFirstRealSourceReadPlan(inventory: PrivateObjectInventory): FirstReadPlan {
  const selected = selectFirstRealSources(inventory);
  const selectedIds = new Set(selected.map((item) => item.objectIdentity));
  const avoided = inventory.objects
    .filter((object) => !selectedIds.has(object.objectIdentity))
    .map((object) => ({
      objectIdentity: object.objectIdentity,
      operatorLabel: object.operatorLabel,
      reason: avoidReason(object),
    }));
  return {
    schemaVersion: FIRST_READ_PLAN_SCHEMA,
    listedObjectCount: inventory.objectCount,
    listedTotalBytes: inventory.totalBytes,
    hardcodedObjectTotal: false,
    selected,
    avoided,
    selectedObjectCount: selected.length,
    selectedTotalBytes: selected.reduce((sum, item) => sum + item.size, 0),
    commercialBytesDownloaded: 0,
    secretUrlsExposed: false,
  };
}
