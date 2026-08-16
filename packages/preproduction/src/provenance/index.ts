/**
 * Deterministic provenance for generated plans, media commands and QC.
 *
 * Records source commit, workflow versions, inputs and hashes. Does not add
 * Pip or Goat assets. Dataset / reference entries are planning labels only.
 */
import { stableHash } from '@doodle-dash/direction';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS, PREPRODUCTION_SCHEMA_VERSION } from '../versions';

export const DRAFT_DATASET_LABEL = 'DRAFT_NONCANONICAL_REFERENCE' as const;

export function buildProvenance(input: {
  sourceCommit: string;
  episodeId: string;
  cacheKey: string;
  inputs: Record<string, unknown>;
  mediaCommandHash?: string;
  qcHash?: string;
}): {
  sourceCommit: string;
  schemaVersion: typeof PREPRODUCTION_SCHEMA_VERSION;
  workflowVersions: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS;
  episodeId: string;
  inputHash: string;
  cacheKey: string;
  mediaCommandHash: string | null;
  qcHash: string | null;
  datasetLabel: typeof DRAFT_DATASET_LABEL;
  includesPipGoatAssets: false;
  provenanceHash: string;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.provenance;
} {
  const inputHash = stableHash(input.inputs);
  const record = {
    sourceCommit: input.sourceCommit,
    schemaVersion: PREPRODUCTION_SCHEMA_VERSION,
    workflowVersions: PREPRODUCTION_SUBSYSTEM_VERSIONS,
    episodeId: input.episodeId,
    inputHash,
    cacheKey: input.cacheKey,
    mediaCommandHash: input.mediaCommandHash ?? null,
    qcHash: input.qcHash ?? null,
    datasetLabel: DRAFT_DATASET_LABEL,
    includesPipGoatAssets: false as const,
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.provenance,
  };
  return {
    ...record,
    provenanceHash: stableHash(record),
  };
}

export function listDraftReferenceProvenance(): Array<{
  id: string;
  kind: 'ENVIRONMENT' | 'PROP' | 'LIGHTING' | 'VFX';
  label: typeof DRAFT_DATASET_LABEL;
  productionLibraryPath: null;
}> {
  return [
    { id: 'env_meadow_edge_v1', kind: 'ENVIRONMENT', label: DRAFT_DATASET_LABEL, productionLibraryPath: null },
    { id: 'prop_map_glow_v1', kind: 'PROP', label: DRAFT_DATASET_LABEL, productionLibraryPath: null },
    { id: 'MEADOW_DAY_KEY', kind: 'LIGHTING', label: DRAFT_DATASET_LABEL, productionLibraryPath: null },
    { id: 'vfx_map_glow_v1', kind: 'VFX', label: DRAFT_DATASET_LABEL, productionLibraryPath: null },
  ];
}
