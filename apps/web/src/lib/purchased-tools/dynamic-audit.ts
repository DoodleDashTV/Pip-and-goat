import { createHash } from 'node:crypto';
import {
  PURCHASED_TOOL_PACKAGES,
  type PurchasedToolActivation,
  type PurchasedToolPackage,
  type PurchasedToolRole,
} from './catalog';

export const DYNAMIC_ASSET_AUDIT_SCHEMA = 'TIVVLEJOY_DYNAMIC_ASSET_AUDIT_V1' as const;

export const AUDIT_STATES = [
  'NOT_UPLOADED',
  'UPLOAD_INCOMPLETE',
  'STORED',
  'SIZE_VERIFIED',
  'HASH_VERIFIED',
  'AWAITING_INSPECTION',
  'INSPECTION_PASSED',
  'INSPECTION_FAILED',
  'USABLE',
  'ARCHIVAL_ONLY',
  'DUPLICATE',
  'BLOCKED',
] as const;
export type AuditState = (typeof AUDIT_STATES)[number];

export const AUDIT_INDICATORS = ['GREEN', 'YELLOW', 'GRAY', 'RED'] as const;
export type AuditIndicator = (typeof AUDIT_INDICATORS)[number];

export const SUPPORTED_SOURCE_FORMATS = [
  'zip',
  'paq',
  'paq.zip',
  'glb',
  'fbx',
  'blend',
  'blend.zip',
  'scatpack.zip',
] as const;
export type SourceFormat = (typeof SUPPORTED_SOURCE_FORMATS)[number] | 'unsupported';

export type PurchasedSourceReceipt = {
  sourceId: string;
  originalFilename?: string;
  byteSize?: number | null;
  stored?: boolean;
  clientSha256?: string | null;
  objectKey?: string | null;
  sourceImmutable?: boolean;
  uploadedAt?: string;
};

export type PurchasedUploadSessionSnapshot = {
  sourceId: string;
  state: 'created' | 'uploading' | 'paused' | 'completed' | 'aborted';
  filename?: string;
};

export type StoredObjectSnapshot = {
  sourceId?: string;
  objectKey?: string;
  exists: boolean;
  size: number | null;
};

export type InspectionSnapshot = {
  sourceId: string;
  state: 'AWAITING_INSPECTION' | 'INSPECTION_PASSED' | 'INSPECTION_FAILED';
};

export type DynamicAuditInput = {
  catalog?: readonly PurchasedToolPackage[];
  receipts?: readonly PurchasedSourceReceipt[];
  sessions?: readonly PurchasedUploadSessionSnapshot[];
  storedObjects?: readonly StoredObjectSnapshot[];
  inspections?: readonly InspectionSnapshot[];
};

export type AssetAuditReport = {
  sourceId: string;
  displayName: string;
  originalFilename: string;
  role: PurchasedToolRole | 'unknown';
  version: string;
  activation: PurchasedToolActivation | 'UNKNOWN';
  catalogPresent: boolean;
  receiptPresent: boolean;
  stored: boolean;
  expectedByteSize: number | null;
  storedByteSize: number | null;
  sizeVerified: boolean;
  clientSha256Present: boolean;
  sha256: string | null;
  inspectionState: 'NOT_APPLICABLE' | 'AWAITING_INSPECTION' | 'INSPECTION_PASSED' | 'INSPECTION_FAILED';
  format: SourceFormat;
  duplicateState: 'NONE' | 'DUPLICATE_SHA' | 'DUPLICATE_PACKAGE_VERSION';
  canonicalCandidate: boolean;
  worldBuilderEligible: boolean;
  productionUsable: boolean;
  blockers: string[];
  warnings: string[];
  auditState: AuditState;
  indicator: AuditIndicator;
  historical: boolean;
  storeOnly: boolean;
  installLater: boolean;
  optionalNotIntegrated: boolean;
  wrapper: boolean;
  geoScatterIntegrated: false;
  botaniqImmutable: boolean;
  awaitingProvenanceOrLicense: boolean;
};

export type DynamicAssetAuditCounts = {
  catalogAssetCount: number;
  uploadedCount: number;
  sizeVerifiedCount: number;
  hashVerifiedCount: number;
  inspectionPendingCount: number;
  inspectionPassedCount: number;
  usableCount: number;
  archivalCount: number;
  duplicateCount: number;
  blockedCount: number;
  missingCount: number;
};

export type DynamicAssetAudit = {
  schemaVersion: typeof DYNAMIC_ASSET_AUDIT_SCHEMA;
  counts: DynamicAssetAuditCounts;
  sources: AssetAuditReport[];
  unknownReceipts: AssetAuditReport[];
  incompleteSessions: PurchasedUploadSessionSnapshot[];
  worldBuilderEligibleSourceIds: string[];
  auditSha256: string;
  hardCodedAssetTotal: false;
  safety: {
    readOnly: true;
    blenderExecuted: false;
    addonsInstalled: false;
    commercialFilesExecuted: false;
    r2ObjectsModified: false;
    filesDeleted: false;
    filesRenamed: false;
    runPodContacted: false;
    gpuLaunched: false;
    paidCompute: false;
    assetsAutoApproved: false;
    productionMutation: false;
    pipGoatMutated: false;
    voiceMutated: false;
    botaniqProcessed: false;
    geoScatterIntegrated: false;
  };
};

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function familyKey(displayName: string): string {
  return displayName
    .replace(/\s*[—-].*$/u, '')
    .replace(/\s*\([^)]*\)\s*$/u, '')
    .trim()
    .toLowerCase();
}

function filenameStem(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/\s+\d+(\.[a-z0-9]+)$/i, '$1')
    .replace(/\s+copy(\.[a-z0-9]+)$/i, '$1');
}

function packageVersionKey(pkg: Pick<PurchasedToolPackage, 'displayName' | 'version' | 'role' | 'expectedFilename'>): string {
  return `${familyKey(pkg.displayName)}::${pkg.version}::${pkg.role}::${filenameStem(pkg.expectedFilename)}`;
}

export function detectSourceFormat(filename: string): SourceFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.scatpack.zip')) return 'scatpack.zip';
  if (lower.endsWith('.paq.zip')) return 'paq.zip';
  if (lower.endsWith('.paq')) return 'paq';
  if (lower.endsWith('.blend.zip')) return 'blend.zip';
  if (lower.endsWith('.blend')) return 'blend';
  if (lower.endsWith('.fbx')) return 'fbx';
  if (lower.endsWith('.glb')) return 'glb';
  if (lower.endsWith('.zip')) return 'zip';
  return 'unsupported';
}

export function isWrapperPackage(pkg: Pick<PurchasedToolPackage, 'sourceId' | 'version' | 'notes' | 'displayName'>): boolean {
  return /wrapper/i.test(`${pkg.sourceId} ${pkg.version} ${pkg.notes} ${pkg.displayName}`);
}

export function isHistoricalPackage(pkg: Pick<PurchasedToolPackage, 'displayName' | 'notes'>): boolean {
  return /historical|archival/i.test(`${pkg.displayName} ${pkg.notes}`);
}

export function isTexturePackage(pkg: Pick<PurchasedToolPackage, 'displayName' | 'expectedFilename'>): boolean {
  return /texture/i.test(`${pkg.displayName} ${pkg.expectedFilename}`);
}

function normalizeSha(value: string | null | undefined): string | null {
  const sha = String(value ?? '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(sha) ? sha : value ? String(value).trim() : null;
}

function storedObjectFor(input: DynamicAuditInput, receipt: PurchasedSourceReceipt | undefined, sourceId: string) {
  return (input.storedObjects ?? []).find(
    (item) => item.sourceId === sourceId || (receipt?.objectKey && item.objectKey === receipt.objectKey),
  );
}

function chooseAuditState(input: {
  blocked: boolean;
  missing: boolean;
  incomplete: boolean;
  duplicate: boolean;
  archival: boolean;
  inspectionFailed: boolean;
  usable: boolean;
  inspectionPassed: boolean;
  hashVerified: boolean;
  sizeVerified: boolean;
  stored: boolean;
  awaitingInspection: boolean;
}): AuditState {
  if (input.blocked) return 'BLOCKED';
  if (input.missing) return 'NOT_UPLOADED';
  if (input.incomplete) return 'UPLOAD_INCOMPLETE';
  if (input.inspectionFailed) return 'INSPECTION_FAILED';
  if (input.usable) return 'USABLE';
  if (input.duplicate && input.archival) return 'DUPLICATE';
  if (input.archival) return 'ARCHIVAL_ONLY';
  if (input.duplicate) return 'DUPLICATE';
  if (input.awaitingInspection) return 'AWAITING_INSPECTION';
  if (input.inspectionPassed) return 'INSPECTION_PASSED';
  if (input.hashVerified) return 'HASH_VERIFIED';
  if (input.sizeVerified) return 'SIZE_VERIFIED';
  if (input.stored) return 'STORED';
  return 'NOT_UPLOADED';
}

function chooseIndicator(state: AuditState, archival: boolean): AuditIndicator {
  if (state === 'USABLE' || state === 'INSPECTION_PASSED' || state === 'HASH_VERIFIED') return 'GREEN';
  if (state === 'BLOCKED' || state === 'NOT_UPLOADED' || state === 'INSPECTION_FAILED') return 'RED';
  if (state === 'ARCHIVAL_ONLY' || (archival && state !== 'AWAITING_INSPECTION')) return 'GRAY';
  if (state === 'DUPLICATE' && archival) return 'GRAY';
  return 'YELLOW';
}

function emptyUnknownPackage(sourceId: string): PurchasedToolPackage {
  return {
    sourceId,
    displayName: sourceId,
    expectedFilename: '',
    role: 'optional-companion',
    version: 'unknown',
    maxUploadBytes: 0,
    minimumReasonableBytes: 0,
    activation: 'STORE_ONLY',
    notes: 'Receipt has no catalog entry.',
  };
}

function buildReport(
  pkg: PurchasedToolPackage,
  catalogPresent: boolean,
  receipt: PurchasedSourceReceipt | undefined,
  input: DynamicAuditInput,
  shaOwners: Map<string, string[]>,
  duplicatePackageVersions: Set<string>,
): AssetAuditReport {
  const session = (input.sessions ?? []).find((item) => item.sourceId === pkg.sourceId);
  const inspection = (input.inspections ?? []).find((item) => item.sourceId === pkg.sourceId);
  const object = storedObjectFor(input, receipt, pkg.sourceId);
  const originalFilename = receipt?.originalFilename || pkg.expectedFilename;
  const format = detectSourceFormat(originalFilename);
  const wrapper = catalogPresent ? isWrapperPackage(pkg) : /wrapper/i.test(pkg.sourceId);
  const historical = catalogPresent ? isHistoricalPackage(pkg) : false;
  const sha256 = normalizeSha(receipt?.clientSha256);
  const clientSha256Present = Boolean(sha256);
  const validSha = Boolean(sha256 && /^[a-f0-9]{64}$/.test(sha256));
  const expectedByteSize = Number.isFinite(receipt?.byteSize) ? Number(receipt?.byteSize) : null;
  const storedByteSize = object?.exists ? object.size : expectedByteSize !== null && receipt?.stored ? expectedByteSize : object?.size ?? null;
  const stored = Boolean(receipt?.stored || object?.exists);
  const incomplete = Boolean(session && session.state !== 'completed' && session.state !== 'aborted' && !stored);
  const abortedIncomplete = Boolean(session && session.state === 'aborted' && !stored);
  const sizeMismatch = stored && expectedByteSize !== null && storedByteSize !== null && expectedByteSize !== storedByteSize;
  const sizeVerified = stored && expectedByteSize !== null && storedByteSize !== null && expectedByteSize === storedByteSize && !sizeMismatch;
  const hashVerified = stored && validSha;
  const shaMissing = stored && !clientSha256Present;
  const shaInvalid = stored && clientSha256Present && !validSha;
  const shaDup = Boolean(validSha && (shaOwners.get(sha256!)?.length ?? 0) > 1);
  const packageVersionDup = catalogPresent && duplicatePackageVersions.has(packageVersionKey(pkg));
  const inspectionState = !stored
    ? 'NOT_APPLICABLE'
    : inspection?.state ?? 'AWAITING_INSPECTION';
  const family = familyKey(pkg.displayName);
  const textureSibling = (input.catalog ?? PURCHASED_TOOL_PACKAGES).find(
    (item) => familyKey(item.displayName) === family && isTexturePackage(item) && item.sourceId !== pkg.sourceId,
  );
  const textureReceipt = textureSibling
    ? (input.receipts ?? []).find((item) => item.sourceId === textureSibling.sourceId && item.stored)
    : undefined;
  const missingPairedTexture =
    catalogPresent &&
    stored &&
    !isTexturePackage(pkg) &&
    !wrapper &&
    Boolean(textureSibling) &&
    !textureReceipt;
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!catalogPresent) blockers.push('receipt with no catalog entry');
  if (catalogPresent && !receipt) blockers.push('catalog entry with no R2 receipt');
  if (incomplete || abortedIncomplete) blockers.push('failed/incomplete multipart session');
  if (sizeMismatch) blockers.push('byte-size mismatch');
  if (shaMissing) warnings.push('completed object missing SHA receipt');
  if (shaInvalid) blockers.push('SHA receipt is not a valid SHA-256');
  if (format === 'unsupported') blockers.push('unsupported extension');
  if (shaDup) warnings.push('duplicate SHA-256 across different filenames');
  if (packageVersionDup) warnings.push('duplicate package/version');
  if (missingPairedTexture) warnings.push(`missing paired texture source ${textureSibling?.sourceId}`);
  if (pkg.activation === 'STORE_ONLY') warnings.push('STORE_ONLY is not production usable');
  if (pkg.activation === 'INSTALL_LATER') warnings.push('INSTALL_LATER is not automatically installed');
  if (pkg.activation === 'OPTIONAL_NOT_INTEGRATED') warnings.push('OPTIONAL_NOT_INTEGRATED remains unused');
  if (/geoscatter|geo-scatter/i.test(`${pkg.sourceId} ${pkg.displayName} ${pkg.expectedFilename}`)) {
    warnings.push('Geo-Scatter remains not integrated');
  }
  if (/botaniq/i.test(`${pkg.sourceId} ${pkg.displayName}`)) {
    warnings.push('Botaniq remains immutable and is not processed by this audit');
  }
  if (stored && inspectionState !== 'INSPECTION_PASSED') {
    warnings.push('awaiting provenance or license review');
  }
  if (wrapper) warnings.push('wrapper/archive copy; not the canonical source');

  const blocked =
    !catalogPresent ||
    sizeMismatch ||
    shaInvalid ||
    format === 'unsupported' ||
    inspectionState === 'INSPECTION_FAILED';
  const missing = catalogPresent && !stored && !incomplete;
  const archival = historical || (pkg.activation === 'STORE_ONLY' && (wrapper || historical));
  const awaitingInspection = stored && inspectionState === 'AWAITING_INSPECTION';
  const productionUsable =
    stored &&
    sizeVerified &&
    hashVerified &&
    inspectionState === 'INSPECTION_PASSED' &&
    !blocked &&
    !wrapper &&
    pkg.activation !== 'STORE_ONLY' &&
    pkg.activation !== 'OPTIONAL_NOT_INTEGRATED';
  const worldBuilderEligible = productionUsable && pkg.role === 'asset-library';
  const duplicateState: AssetAuditReport['duplicateState'] = shaDup
    ? 'DUPLICATE_SHA'
    : packageVersionDup
      ? 'DUPLICATE_PACKAGE_VERSION'
      : 'NONE';
  const auditState = chooseAuditState({
    blocked,
    missing,
    incomplete: incomplete || abortedIncomplete,
    duplicate: duplicateState !== 'NONE',
    archival,
    inspectionFailed: inspectionState === 'INSPECTION_FAILED',
    usable: productionUsable,
    inspectionPassed: inspectionState === 'INSPECTION_PASSED',
    hashVerified,
    sizeVerified,
    stored,
    awaitingInspection,
  });

  return {
    sourceId: pkg.sourceId,
    displayName: pkg.displayName,
    originalFilename,
    role: catalogPresent ? pkg.role : 'unknown',
    version: pkg.version,
    activation: catalogPresent ? pkg.activation : 'UNKNOWN',
    catalogPresent,
    receiptPresent: Boolean(receipt),
    stored,
    expectedByteSize,
    storedByteSize,
    sizeVerified,
    clientSha256Present,
    sha256,
    inspectionState,
    format,
    duplicateState,
    canonicalCandidate: catalogPresent && !wrapper && !historical,
    worldBuilderEligible,
    productionUsable,
    blockers,
    warnings,
    auditState,
    indicator: chooseIndicator(auditState, archival),
    historical,
    storeOnly: pkg.activation === 'STORE_ONLY',
    installLater: pkg.activation === 'INSTALL_LATER',
    optionalNotIntegrated: pkg.activation === 'OPTIONAL_NOT_INTEGRATED',
    wrapper,
    geoScatterIntegrated: false,
    botaniqImmutable: /botaniq/i.test(`${pkg.sourceId} ${pkg.displayName}`),
    awaitingProvenanceOrLicense: stored && inspectionState !== 'INSPECTION_PASSED',
  };
}

export function auditPurchasedAssets(input: DynamicAuditInput = {}): DynamicAssetAudit {
  const catalog = input.catalog ?? PURCHASED_TOOL_PACKAGES;
  const receipts = input.receipts ?? [];
  const receiptBySource = new Map(receipts.map((item) => [item.sourceId, item]));
  const shaOwners = new Map<string, string[]>();
  for (const receipt of receipts) {
    const sha = normalizeSha(receipt.clientSha256);
    if (!sha || !/^[a-f0-9]{64}$/.test(sha)) continue;
    const owners = shaOwners.get(sha) ?? [];
    owners.push(receipt.sourceId);
    shaOwners.set(sha, owners);
  }
  const versionGroups = new Map<string, string[]>();
  for (const pkg of catalog) {
    if (isWrapperPackage(pkg)) continue;
    const key = packageVersionKey(pkg);
    const group = versionGroups.get(key) ?? [];
    group.push(pkg.sourceId);
    versionGroups.set(key, group);
  }
  const duplicatePackageVersions = new Set(
    [...versionGroups.entries()].filter(([, ids]) => ids.length > 1).map(([key]) => key),
  );

  const sources = catalog.map((pkg) =>
    buildReport(pkg, true, receiptBySource.get(pkg.sourceId), input, shaOwners, duplicatePackageVersions),
  );
  const unknownReceipts = receipts
    .filter((receipt) => !catalog.some((pkg) => pkg.sourceId === receipt.sourceId))
    .map((receipt) =>
      buildReport(
        emptyUnknownPackage(receipt.sourceId),
        false,
        receipt,
        input,
        shaOwners,
        duplicatePackageVersions,
      ),
    );
  const incompleteSessions = (input.sessions ?? []).filter(
    (session) => session.state !== 'completed',
  );
  const catalogReports = sources;
  const counts: DynamicAssetAuditCounts = {
    catalogAssetCount: catalog.length,
    uploadedCount: catalogReports.filter((item) => item.stored).length,
    sizeVerifiedCount: catalogReports.filter((item) => item.sizeVerified).length,
    hashVerifiedCount: catalogReports.filter(
      (item) => item.clientSha256Present && item.sizeVerified && /^[a-f0-9]{64}$/.test(item.sha256 ?? ''),
    ).length,
    inspectionPendingCount: catalogReports.filter((item) => item.inspectionState === 'AWAITING_INSPECTION').length,
    inspectionPassedCount: catalogReports.filter((item) => item.inspectionState === 'INSPECTION_PASSED').length,
    usableCount: catalogReports.filter((item) => item.productionUsable).length,
    archivalCount: catalogReports.filter((item) => item.auditState === 'ARCHIVAL_ONLY' || item.historical).length,
    duplicateCount: catalogReports.filter((item) => item.duplicateState !== 'NONE').length,
    blockedCount: [...catalogReports, ...unknownReceipts].filter(
      (item) => item.auditState === 'BLOCKED' || !item.catalogPresent,
    ).length,
    missingCount: catalogReports.filter((item) => !item.stored && item.auditState !== 'UPLOAD_INCOMPLETE').length,
  };
  const machine = {
    schemaVersion: DYNAMIC_ASSET_AUDIT_SCHEMA,
    counts,
    sources: sources.map((item) => ({
      sourceId: item.sourceId,
      auditState: item.auditState,
      worldBuilderEligible: item.worldBuilderEligible,
      productionUsable: item.productionUsable,
      sha256: item.sha256,
    })),
    unknownReceiptIds: unknownReceipts.map((item) => item.sourceId),
  };
  return {
    schemaVersion: DYNAMIC_ASSET_AUDIT_SCHEMA,
    counts,
    sources,
    unknownReceipts,
    incompleteSessions,
    worldBuilderEligibleSourceIds: sources.filter((item) => item.worldBuilderEligible).map((item) => item.sourceId),
    auditSha256: sha256Canonical(machine),
    hardCodedAssetTotal: false,
    safety: {
      readOnly: true,
      blenderExecuted: false,
      addonsInstalled: false,
      commercialFilesExecuted: false,
      r2ObjectsModified: false,
      filesDeleted: false,
      filesRenamed: false,
      runPodContacted: false,
      gpuLaunched: false,
      paidCompute: false,
      assetsAutoApproved: false,
      productionMutation: false,
      pipGoatMutated: false,
      voiceMutated: false,
      botaniqProcessed: false,
      geoScatterIntegrated: false,
    },
  };
}

export function worldBuilderEligibleAssets(audit: DynamicAssetAudit): AssetAuditReport[] {
  return audit.sources.filter((item) => item.worldBuilderEligible);
}

export function sceneryCoverageFromAudit(audit: DynamicAssetAudit) {
  return {
    schemaVersion: DYNAMIC_ASSET_AUDIT_SCHEMA,
    catalogAssetCount: audit.counts.catalogAssetCount,
    worldBuilderEligibleCount: audit.worldBuilderEligibleSourceIds.length,
    usableCount: audit.counts.usableCount,
    missingCount: audit.counts.missingCount,
    uploadedIsNotUsable: audit.counts.uploadedCount !== audit.counts.usableCount || audit.counts.uploadedCount === 0,
    worldBuilderEligibleSourceIds: audit.worldBuilderEligibleSourceIds,
    hardCodedAssetTotal: false as const,
  };
}
