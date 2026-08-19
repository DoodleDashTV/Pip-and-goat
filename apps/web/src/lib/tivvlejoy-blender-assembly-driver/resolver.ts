import { UNRESOLVED, UNRESOLVED_PRODUCTION_RIG } from '@/lib/tivvlejoy-shot-assembly-manifest';
import {
  ASSET_RESOLVER_SCHEMA,
  BOTANIQ_PROVIDER_SCHEMA,
  type AssetResolverResult,
  type ResolverStatus,
} from './types';

export type ResolverSlot = {
  slotId?: string;
  characterId?: string;
  propId?: string;
  semanticRole?: string;
  sourceReceiptRef?: string;
  sourceSha256?: string;
  sourceVersion?: string;
  derivativeReceiptRef?: string;
  derivativeSha256?: string;
  dependencyStatus?: string;
  providerPreference?: string;
  qualityTier?: string;
  required?: boolean;
};

function syntheticRef(id: string) {
  return `SYNTHETIC://${id}`;
}

export function resolveAssemblySlot(slot: ResolverSlot): AssetResolverResult {
  if (slot.characterId) {
    return {
      schemaVersion: ASSET_RESOLVER_SCHEMA,
      status: 'UNRESOLVED',
      sourceReceiptRef: UNRESOLVED,
      sourceSha256: UNRESOLVED,
      derivativeReceiptRef: UNRESOLVED,
      derivativeSha256: UNRESOLVED,
      approvedObjectName: UNRESOLVED_PRODUCTION_RIG,
      approvedCollectionName: UNRESOLVED_PRODUCTION_RIG,
      localMaterializationRef: UNRESOLVED,
      provenanceStatus: UNRESOLVED_PRODUCTION_RIG,
    };
  }
  if (slot.providerPreference === 'BOTANIQ_IF_APPROVED') {
    return {
      schemaVersion: ASSET_RESOLVER_SCHEMA,
      status: 'UNRESOLVED',
      sourceReceiptRef: UNRESOLVED,
      sourceSha256: UNRESOLVED,
      derivativeReceiptRef: UNRESOLVED,
      derivativeSha256: UNRESOLVED,
      approvedObjectName: UNRESOLVED,
      approvedCollectionName: UNRESOLVED,
      localMaterializationRef: UNRESOLVED,
      provenanceStatus: 'UNRESOLVED_SOURCE',
    };
  }
  const receipt = slot.sourceReceiptRef ?? UNRESOLVED;
  const synthetic = receipt.startsWith('SYN_') || receipt.startsWith('SYNTHETIC://');
  if (String(slot.dependencyStatus ?? '').startsWith('BLOCKED')) {
    return {
      schemaVersion: ASSET_RESOLVER_SCHEMA,
      status: 'BLOCKED',
      sourceReceiptRef: receipt,
      sourceSha256: slot.sourceSha256 ?? UNRESOLVED,
      derivativeReceiptRef: slot.derivativeReceiptRef ?? UNRESOLVED,
      derivativeSha256: slot.derivativeSha256 ?? UNRESOLVED,
      approvedObjectName: UNRESOLVED,
      approvedCollectionName: UNRESOLVED,
      localMaterializationRef: UNRESOLVED,
      provenanceStatus: slot.dependencyStatus ?? 'BLOCKED',
    };
  }
  if (!synthetic || receipt === UNRESOLVED) {
    return {
      schemaVersion: ASSET_RESOLVER_SCHEMA,
      status: 'UNRESOLVED',
      sourceReceiptRef: receipt,
      sourceSha256: slot.sourceSha256 ?? UNRESOLVED,
      derivativeReceiptRef: slot.derivativeReceiptRef ?? UNRESOLVED,
      derivativeSha256: slot.derivativeSha256 ?? UNRESOLVED,
      approvedObjectName: UNRESOLVED,
      approvedCollectionName: UNRESOLVED,
      localMaterializationRef: UNRESOLVED,
      provenanceStatus: slot.dependencyStatus ?? 'UNRESOLVED_SOURCE',
    };
  }
  const restricted = slot.dependencyStatus === 'RESOLVED_RESTRICTED';
  const status: ResolverStatus = restricted ? 'RESOLVED_RESTRICTED' : 'RESOLVED_APPROVED';
  const id = slot.slotId ?? slot.propId ?? 'ASSET';
  return {
    schemaVersion: ASSET_RESOLVER_SCHEMA,
    status,
    sourceReceiptRef: receipt,
    sourceSha256: slot.sourceSha256 ?? UNRESOLVED,
    derivativeReceiptRef: slot.derivativeReceiptRef ?? UNRESOLVED,
    derivativeSha256: slot.derivativeSha256 ?? UNRESOLVED,
    approvedObjectName: `TJ_SYN_${id}`,
    approvedCollectionName: `TJ_SYN_COL_${id}`,
    localMaterializationRef: syntheticRef(id),
    provenanceStatus: slot.dependencyStatus ?? status,
  };
}

export function botaniqProviderBoundary() {
  return {
    schemaVersion: BOTANIQ_PROVIDER_SCHEMA,
    providerName: 'BOTANIQ' as const,
    status: 'NOT_ACTIVATED' as const,
    sourceReceiptRequired: true as const,
    derivativeReceiptRequired: true as const,
    commercialSourceAccessAllowed: false as const,
    geoScatterIntegrated: false as const,
    supportedLookups: ['TREE_HERO', 'TREE_SUPPORT', 'TREE_BACKGROUND', 'GRASS', 'FLOWERS', 'SHRUBS'] as const,
    inspected: false as const,
    queried: false as const,
    materialized: false as const,
  };
}

export function characterProviderBoundary(characterId: 'PIP' | 'GOAT') {
  return {
    providerName: characterId,
    status: 'NOT_ACTIVATED' as const,
    requiredBeforeExecution: [
      'approved character receipt',
      'approved rig receipt',
      'compatible animation receipt',
      'exact version',
      'exact hash',
    ] as const,
    operationType: 'INSTANCE_CHARACTER' as const,
    operationStatus: 'BLOCKED_UNRESOLVED_PRODUCTION_RIG' as const,
  };
}

export function assertSyntheticMaterialization(ref: string) {
  if (ref !== UNRESOLVED && !ref.startsWith('SYNTHETIC://')) {
    throw new Error('Commercial localMaterializationRef is not allowed in this milestone');
  }
}
