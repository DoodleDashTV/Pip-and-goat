export const PURCHASED_TOOL_UPLOAD_VERSION = 'TIVVLEJOY_IPHONE_LARGE_PURCHASED_ASSETS_UPLOAD_V1';

export type PurchasedToolRole = 'asset-library' | 'addon' | 'optional-companion';

export type PurchasedToolPackage = {
  sourceId: string;
  displayName: string;
  expectedFilename: string;
  role: PurchasedToolRole;
  version: string;
  maxUploadBytes: number;
  minimumReasonableBytes: number;
  activation: 'STORE_ONLY' | 'INSTALL_LATER' | 'OPTIONAL_NOT_INTEGRATED';
  notes: string;
};

const GIB = 1024 * 1024 * 1024;
const MIB = 1024 * 1024;

export const PURCHASED_TOOL_PACKAGES: readonly PurchasedToolPackage[] = [
  {
    sourceId: 'SRC_BOTANIQ_FULL_7_2_0',
    displayName: 'Botaniq Full',
    expectedFilename: 'botaniq_full-7.2.0.paq',
    role: 'asset-library',
    version: '7.2.0',
    maxUploadBytes: 8 * GIB,
    minimumReasonableBytes: 1 * GIB,
    activation: 'STORE_ONLY',
    notes: 'Main Botaniq Full asset library. Store privately first; do not install or redistribute raw source bytes.',
  },
  {
    sourceId: 'SRC_GAFFER_3_2_10',
    displayName: 'Gaffer',
    expectedFilename: 'Gaffer 3.2.10 (for b3.4+) - latest.zip',
    role: 'addon',
    version: '3.2.10',
    maxUploadBytes: 128 * MIB,
    minimumReasonableBytes: 32 * 1024,
    activation: 'INSTALL_LATER',
    notes: 'Selected Gaffer candidate for the TivvleJoy Blender 4.2+ path.',
  },
  {
    sourceId: 'SRC_PHYSICAL_STARLIGHT_1_9_4',
    displayName: 'Physical Starlight and Atmosphere',
    expectedFilename: 'physical_starlight_atmosphere-1.9.4.zip',
    role: 'addon',
    version: '1.9.4',
    maxUploadBytes: 2 * GIB,
    minimumReasonableBytes: 64 * 1024,
    activation: 'INSTALL_LATER',
    notes: 'Selected Physical Starlight and Atmosphere candidate; package metadata requires Blender 4.2+.',
  },
  {
    sourceId: 'SRC_BOTANIQ_GEOSCATTER_BIOMES_7_1_1',
    displayName: 'Botaniq Geo-Scatter Biomes',
    expectedFilename: 'botaniq_full_geoscatter_biomes-7.1.1.scatpack.zip',
    role: 'optional-companion',
    version: '7.1.1',
    maxUploadBytes: 4 * GIB,
    minimumReasonableBytes: 64 * 1024,
    activation: 'OPTIONAL_NOT_INTEGRATED',
    notes: 'Optional companion only. Geo-Scatter remains disabled until separately approved.',
  },
] as const;

export function findPurchasedToolPackageByFilename(filename: string): PurchasedToolPackage | null {
  return PURCHASED_TOOL_PACKAGES.find((item) => item.expectedFilename === filename) ?? null;
}

export function getPurchasedToolPackage(sourceId: string): PurchasedToolPackage {
  const found = PURCHASED_TOOL_PACKAGES.find((item) => item.sourceId === sourceId);
  if (!found) throw new Error(`Unknown purchased tool source: ${sourceId}`);
  return found;
}

export function validatePurchasedToolSelection(input: {
  sourceId?: string;
  filename: string;
  byteSize: number;
}): { ok: true; package: PurchasedToolPackage } | { ok: false; reason: string } {
  const pkg = findPurchasedToolPackageByFilename(input.filename);
  if (!pkg) return { ok: false, reason: 'Filename is not in the approved purchased-tools intake catalog.' };
  if (input.sourceId && input.sourceId !== pkg.sourceId) {
    return { ok: false, reason: 'Source id does not match the approved filename.' };
  }
  if (!Number.isFinite(input.byteSize) || input.byteSize < pkg.minimumReasonableBytes) {
    return {
      ok: false,
      reason: `${pkg.displayName} is implausibly small and is refused. Re-download the original package.`,
    };
  }
  if (input.byteSize > pkg.maxUploadBytes) {
    return { ok: false, reason: `${pkg.displayName} exceeds its approved upload cap.` };
  }
  return { ok: true, package: pkg };
}
