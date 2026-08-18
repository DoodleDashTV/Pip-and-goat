export const EXPECTED_INSPECTION_CHECKS = [
  'scale',
  'units',
  'transforms',
  'materials',
  'textures',
  'missing_dependencies',
  'object_counts',
  'polygon_counts',
  'cameras',
  'lights',
  'rigs',
  'animations',
  'geometry_nodes',
  'unsupported_formats',
  'archive_structure',
] as const;

export type ExpectedInspectionCheck = (typeof EXPECTED_INSPECTION_CHECKS)[number];

export type NonExecutingInspectionJob = {
  jobId: string;
  sourceId: string;
  collectionId: string;
  originalFilename: string;
  objectKey: string;
  byteSize: number;
  sha256: string;
  queued: boolean;
  executing: false;
  autoApprove: false;
  executeEmbeddedScripts: false;
  extractUntrustedArchives: false;
  paidGpu: false;
  expectedChecks: readonly ExpectedInspectionCheck[];
  notes: string[];
};

export function createNonExecutingInspectionJob(input: {
  jobId: string;
  sourceId: string;
  collectionId: string;
  originalFilename: string;
  objectKey: string;
  byteSize: number;
  sha256: string;
  verified: boolean;
}): NonExecutingInspectionJob {
  return {
    jobId: input.jobId,
    sourceId: input.sourceId,
    collectionId: input.collectionId,
    originalFilename: input.originalFilename,
    objectKey: input.objectKey,
    byteSize: input.byteSize,
    sha256: input.sha256,
    queued: input.verified,
    executing: false,
    autoApprove: false,
    executeEmbeddedScripts: false,
    extractUntrustedArchives: false,
    paidGpu: false,
    expectedChecks: EXPECTED_INSPECTION_CHECKS,
    notes: [
      'Non-executing inspection job only. Blender scripts embedded in .blend files or archives are not run.',
      'Archive presence is not proof that contents are safe or usable.',
      'Upload does not mean asset approval.',
    ],
  };
}

export function inspectionReportIsDeterministic(job: NonExecutingInspectionJob): boolean {
  return (
    job.executing === false &&
    job.autoApprove === false &&
    job.executeEmbeddedScripts === false &&
    job.expectedChecks.join(',') === EXPECTED_INSPECTION_CHECKS.join(',')
  );
}
