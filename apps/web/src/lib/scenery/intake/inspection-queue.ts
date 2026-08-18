import { createDryRunInspectReport, type IngestionReport } from '../ingestion';
import { sceneryStorageUri } from '../storage-policy';
import { listExpectedSourceFiles } from './inventory';
import {
  createNonExecutingInspectionJob,
  type NonExecutingInspectionJob,
} from './inspection-checks';
import type { SourceObjectManifest } from './manifest';

export const SCENERY_INSPECTION_JOBS = listExpectedSourceFiles().map((item) => ({
  jobId: item.inspectionJobId ?? `INSPECT_${item.sourceId.replace(/^SRC_/, '')}`,
  displayName: item.expectedFilename,
  sourceId: item.sourceId,
  collectionId: item.collectionId,
  blenderRequired: !item.unityPreservationOnly,
  preservationOnly: item.unityPreservationOnly,
}));

export type InspectionEligibility = {
  ready: boolean;
  reasons: string[];
};

export function evaluateInspectionEligibility(
  manifest: SourceObjectManifest,
): InspectionEligibility {
  const reasons: string[] = [];
  if (
    manifest.sourceId === 'SRC_PREVIEW_SYNTHETIC' ||
    manifest.storageObjectKey.includes('/quarantine/preview-tests/')
  ) {
    reasons.push('synthetic preview fixture is not a purchased scenery source');
  }
  if (!manifest.storageObjectKey) reasons.push('storage object key is missing');
  if (manifest.uploadState !== 'completed' && manifest.uploadState !== 'already_present') {
    reasons.push('storage object has not completed upload');
  }
  if (
    manifest.verificationState !== 'size_verified' &&
    manifest.verificationState !== 'independently_verified'
  ) {
    reasons.push('stored byte size is not verified');
  }
  if (!manifest.sha256) reasons.push('checksum is not recorded');
  if (manifest.quarantineState === 'quarantined') reasons.push('archive validation did not pass');
  if (!manifest.provenanceLicenseRef) reasons.push('provenance placeholder is missing');
  if (!manifest.collectionId) reasons.push('collection mapping is invalid');
  if (
    manifest.independentServerSha256 === 'unavailable_in_this_environment' &&
    manifest.verificationState !== 'size_verified'
  ) {
    reasons.push(
      'independent checksum verification is unavailable; record stays awaiting_verification',
    );
  }
  return { ready: reasons.length === 0, reasons };
}

export function markInspectionReady(manifest: SourceObjectManifest): SourceObjectManifest {
  const eligibility = evaluateInspectionEligibility({
    ...manifest,
    verificationState:
      manifest.verificationState === 'not_verified' ? 'size_verified' : manifest.verificationState,
  });
  return {
    ...manifest,
    inspectionState: eligibility.ready ? 'inspection_ready' : 'awaiting_verification',
    notes: eligibility.ready
      ? [...manifest.notes, 'Source is inspection_ready. Blender has not been executed.']
      : [...manifest.notes, ...eligibility.reasons],
  };
}

export function createQueuedInspectionJobs(manifests: SourceObjectManifest[]): Array<{
  jobId: string;
  displayName: string;
  sourceId: string;
  ready: boolean;
  queued: boolean;
  autoApprove: false;
  executing: false;
  inspectionJob: NonExecutingInspectionJob | null;
  dryRunReport: IngestionReport | null;
}> {
  return SCENERY_INSPECTION_JOBS.map((job) => {
    const manifest = manifests.find((item) => item.sourceId === job.sourceId);
    const ready = manifest ? evaluateInspectionEligibility(manifest).ready : false;
    return {
      jobId: job.jobId,
      displayName: job.displayName,
      sourceId: job.sourceId,
      ready,
      queued: ready,
      autoApprove: false as const,
      executing: false as const,
      inspectionJob:
        ready && manifest
          ? createNonExecutingInspectionJob({
              jobId: job.jobId,
              sourceId: job.sourceId,
              collectionId: job.collectionId,
              originalFilename: manifest.originalFilename,
              objectKey: manifest.storageObjectKey,
              byteSize: manifest.byteSize,
              sha256: manifest.sha256,
              verified: true,
            })
          : null,
      dryRunReport: ready
        ? createDryRunInspectReport({
            sourceId: job.sourceId,
            sourceBlendPath:
              manifest?.storageObjectKey ?? sceneryStorageUri('source', job.collectionId),
            reportPath: sceneryStorageUri('inspection', `${job.jobId}.json`),
            normalizeOutputPath: sceneryStorageUri('normalized', job.collectionId),
            dryRun: true,
          })
        : null,
    };
  });
}
