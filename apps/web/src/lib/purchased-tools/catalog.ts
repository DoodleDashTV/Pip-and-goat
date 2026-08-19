export const PURCHASED_TOOL_UPLOAD_VERSION = 'TIVVLEJOY_IPHONE_LARGE_PURCHASED_ASSETS_UPLOAD_V1';

export type PurchasedToolRole = 'asset-library' | 'addon' | 'optional-companion';

export type PurchasedToolPackage = {
  sourceId: string;
  displayName: string;
  expectedFilename: string;
  acceptedFilenameAliases?: readonly string[];
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
    expectedFilename: 'botaniq_full-7.2.0.paq.zip',
    acceptedFilenameAliases: ['botaniq_full-7.2.0.paq'],
    role: 'asset-library',
    version: '7.2.0',
    maxUploadBytes: 8 * GIB,
    minimumReasonableBytes: 1 * GIB,
    activation: 'STORE_ONLY',
    notes:
      'Main Botaniq Full asset library. The exact Superhive/iPhone .paq.zip wrapper is the visible approved intake filename; the unwrapped .paq name remains an approved alias. Store privately first; do not install or redistribute raw source bytes.',
  },

  // Gaffer: current candidate plus exact historical downloads supplied by the user.
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
    sourceId: 'SRC_GAFFER_3_1_18',
    displayName: 'Gaffer (historical)',
    expectedFilename: 'Gaffer 3.1.18 (for b3.2).zip',
    role: 'addon',
    version: '3.1.18',
    maxUploadBytes: 128 * MIB,
    minimumReasonableBytes: 32 * 1024,
    activation: 'STORE_ONLY',
    notes: 'Historical user-supplied Gaffer download. Approved for private archival intake only; not the active runtime candidate.',
  },
  {
    sourceId: 'SRC_GAFFER_3_1_5',
    displayName: 'Gaffer (historical)',
    expectedFilename: 'Gaffer 3.1.5 (for b2.8).zip',
    role: 'addon',
    version: '3.1.5',
    maxUploadBytes: 128 * MIB,
    minimumReasonableBytes: 32 * 1024,
    activation: 'STORE_ONLY',
    notes: 'Historical user-supplied Gaffer download. Approved for private archival intake only; not the active runtime candidate.',
  },
  {
    sourceId: 'SRC_GAFFER_3_0_4',
    displayName: 'Gaffer (historical)',
    expectedFilename: 'Gaffer 3.0.4 (for b2.79).zip',
    role: 'addon',
    version: '3.0.4',
    maxUploadBytes: 128 * MIB,
    minimumReasonableBytes: 32 * 1024,
    activation: 'STORE_ONLY',
    notes: 'Historical user-supplied Gaffer download. Approved for private archival intake only; not the active runtime candidate.',
  },

  // Physical Starlight & Atmosphere: current candidate plus exact historical downloads supplied today.
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
    sourceId: 'SRC_PHYSICAL_STARLIGHT_1_9_2',
    displayName: 'Physical Starlight and Atmosphere (historical)',
    expectedFilename: 'physical-starlight-atmosphere-1.9.2.zip',
    role: 'addon',
    version: '1.9.2',
    maxUploadBytes: 2 * GIB,
    minimumReasonableBytes: 64 * 1024,
    activation: 'STORE_ONLY',
    notes: 'Historical user-supplied PSA download. Approved for private archival intake only; not the active runtime candidate.',
  },
  {
    sourceId: 'SRC_PHYSICAL_STARLIGHT_1_8_3',
    displayName: 'Physical Starlight and Atmosphere (historical)',
    expectedFilename: 'physical-starlight-atmosphere-1.8.3.zip',
    role: 'addon',
    version: '1.8.3',
    maxUploadBytes: 2 * GIB,
    minimumReasonableBytes: 64 * 1024,
    activation: 'STORE_ONLY',
    notes: 'Historical user-supplied PSA download. Approved for private archival intake only; not the active runtime candidate.',
  },
  {
    sourceId: 'SRC_PHYSICAL_STARLIGHT_1_8_3_DUPLICATE_2',
    displayName: 'Physical Starlight and Atmosphere (historical duplicate)',
    expectedFilename: 'physical-starlight-atmosphere-1.8.3 2.zip',
    role: 'addon',
    version: '1.8.3',
    maxUploadBytes: 2 * GIB,
    minimumReasonableBytes: 64 * 1024,
    activation: 'STORE_ONLY',
    notes: 'Exact user-supplied duplicate filename retained for private archival intake. It must not become an active runtime dependency.',
  },
  {
    sourceId: 'SRC_PHYSICAL_STARLIGHT_1_7_1',
    displayName: 'Physical Starlight and Atmosphere (historical)',
    expectedFilename: 'physical-starlight-atmosphere-1.7.1.zip',
    role: 'addon',
    version: '1.7.1',
    maxUploadBytes: 2 * GIB,
    minimumReasonableBytes: 64 * 1024,
    activation: 'STORE_ONLY',
    notes: 'Historical user-supplied PSA download. Approved for private archival intake only; not the active runtime candidate.',
  },
  {
    sourceId: 'SRC_PHYSICAL_STARLIGHT_1_6_1',
    displayName: 'Physical Starlight and Atmosphere (historical)',
    expectedFilename: 'physical-starlight-atmosphere-1.6.1.zip',
    role: 'addon',
    version: '1.6.1',
    maxUploadBytes: 2 * GIB,
    minimumReasonableBytes: 64 * 1024,
    activation: 'STORE_ONLY',
    notes: 'Historical user-supplied PSA download. Approved for private archival intake only; not the active runtime candidate.',
  },
  {
    sourceId: 'SRC_PHYSICAL_STARLIGHT_LEGACY_ASSETS_1_6_1_AND_BELOW_2',
    displayName: 'Physical Starlight legacy assets (historical companion)',
    expectedFilename: 'assets-for-v1.6.1-and-below 2.blend.zip',
    role: 'optional-companion',
    version: '1.6.1-and-below',
    maxUploadBytes: 512 * MIB,
    minimumReasonableBytes: 64 * 1024,
    activation: 'STORE_ONLY',
    notes: 'Exact legacy companion asset bundle selected on iPhone. Approved for private archival intake only; do not install, execute, or treat it as a current Physical Starlight runtime dependency.',
  },
  {
    sourceId: 'SRC_PHYSICAL_STARLIGHT_1_5_3',
    displayName: 'Physical Starlight and Atmosphere (historical)',
    expectedFilename: 'physical-starlight-atmosphere-1.5.3.zip',
    role: 'addon',
    version: '1.5.3',
    maxUploadBytes: 2 * GIB,
    minimumReasonableBytes: 64 * 1024,
    activation: 'STORE_ONLY',
    notes: 'Historical user-supplied PSA download. Approved for private archival intake only; not the active runtime candidate.',
  },
  {
    sourceId: 'SRC_PHYSICAL_STARLIGHT_1_4_4_BETA',
    displayName: 'Physical Starlight and Atmosphere (historical beta)',
    expectedFilename: 'physical-starlight-atmosphere-1.4.4beta.zip',
    role: 'addon',
    version: '1.4.4beta',
    maxUploadBytes: 2 * GIB,
    minimumReasonableBytes: 64 * 1024,
    activation: 'STORE_ONLY',
    notes: 'Historical user-supplied PSA beta download. Approved for private archival intake only; not the active runtime candidate.',
  },
  {
    sourceId: 'SRC_PHYSICAL_STARLIGHT_1_3_2',
    displayName: 'Physical Starlight and Atmosphere (historical)',
    expectedFilename: 'physical-starlight-atmosphere-1.3.2.zip',
    role: 'addon',
    version: '1.3.2',
    maxUploadBytes: 2 * GIB,
    minimumReasonableBytes: 64 * 1024,
    activation: 'STORE_ONLY',
    notes: 'Historical user-supplied PSA download. Approved for private archival intake only; not the active runtime candidate.',
  },
  {
    sourceId: 'SRC_PHYSICAL_STARLIGHT_1_2_3',
    displayName: 'Physical Starlight and Atmosphere (historical)',
    expectedFilename: 'physical-starlight-atmosphere-1.2.3.zip',
    role: 'addon',
    version: '1.2.3',
    maxUploadBytes: 2 * GIB,
    minimumReasonableBytes: 64 * 1024,
    activation: 'STORE_ONLY',
    notes: 'Historical user-supplied PSA download. Approved for private archival intake only; not the active runtime candidate.',
  },
  {
    sourceId: 'SRC_PHYSICAL_STARLIGHT_1_1',
    displayName: 'Physical Starlight and Atmosphere (historical)',
    expectedFilename: 'physical-starlight-atmosphere-1.1.zip',
    role: 'addon',
    version: '1.1',
    maxUploadBytes: 2 * GIB,
    minimumReasonableBytes: 64 * 1024,
    activation: 'STORE_ONLY',
    notes: 'Historical user-supplied PSA download. Approved for private archival intake only; not the active runtime candidate.',
  },

  // Botaniq Geo-Scatter biome companions remain storage-only/not integrated.
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
  {
    sourceId: 'SRC_BOTANIQ_GEOSCATTER_BIOMES_7_0_0',
    displayName: 'Botaniq Geo-Scatter Biomes (historical)',
    expectedFilename: 'botaniq_full_geoscatter_biomes-7.0.0.scatpack.zip',
    role: 'optional-companion',
    version: '7.0.0',
    maxUploadBytes: 4 * GIB,
    minimumReasonableBytes: 64 * 1024,
    activation: 'OPTIONAL_NOT_INTEGRATED',
    notes: 'Historical optional companion. Approved for private archival intake only; Geo-Scatter remains disabled.',
  },
] as const;

export function findPurchasedToolPackageByFilename(filename: string): PurchasedToolPackage | null {
  return (
    PURCHASED_TOOL_PACKAGES.find(
      (item) =>
        item.expectedFilename === filename ||
        (item.acceptedFilenameAliases ?? []).includes(filename),
    ) ?? null
  );
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
