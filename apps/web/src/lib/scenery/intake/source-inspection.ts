import {
  getExpectedSourceFile,
  type ExpectedSourceFile,
} from './inventory';
import type { SourceObjectManifest } from './manifest';
import {
  derivePipelineState,
  type InspectionState,
  type PipelineState,
} from './pipeline-states';
import {
  inspectUnityPackageGzHeader,
  inspectZipByteSource,
  memoryByteSource,
  type ByteSource,
  type SafeArchiveInspection,
} from './safe-archive-inspect';
import { describeBlenderAvailability } from './blender-contract';

export const SOURCE_INSPECTION_SCHEMA = 'TIVVLEJOY_SCENERY_14_FILE_INSPECTION_V1';

export type BlenderInspectionRecord = {
  available: boolean;
  executed: false;
  factoryStartup: boolean;
  autoExecutionDisabled: true;
  networkAccess: false;
  state: 'not_applicable' | 'inspection_blocked' | 'recorded';
  scenes: number | null;
  collections: number | null;
  objects: number | null;
  meshes: number | null;
  materials: number | null;
  images: number | null;
  cameras: number | null;
  lights: number | null;
  armatures: number | null;
  animations: number | null;
  geometryNodes: number | null;
  linkedOrMissingLibraries: string[];
  notes: string[];
};

export type SourceInspectionReport = {
  schemaVersion: typeof SOURCE_INSPECTION_SCHEMA;
  originalFilename: string;
  sourceId: string;
  collection: string;
  collectionName: string;
  byteSize: number;
  sha256RecordedByIntake: string | null;
  storageVerificationState: string;
  archiveType: string;
  archiveFileCount: number | null;
  totalUncompressedSize: number | null;
  directoryStructure: string[];
  containedExtensions: string[];
  modelFiles: string[];
  textures: string[];
  materials: string[];
  hdriOrSkyImages: string[];
  unityPackages: string[];
  blenderFiles: string[];
  fbxFiles: string[];
  glbFiles: string[];
  objFiles: string[];
  mtlFiles: string[];
  documentationAndLicenseFiles: string[];
  suspiciousOrUnsupported: string[];
  missingReferencedDependencies: string[];
  duplicateInternalFilenames: string[];
  exactDuplicateInternalContent: Array<{ sha256: string; paths: string[] }>;
  inspectionReadiness: InspectionState;
  pipelineState: PipelineState;
  recommendedNextAction: string;
  blender: BlenderInspectionRecord;
  findings: Array<{ code: string; severity: string; message: string }>;
  executedEmbeddedScripts: false;
  extractedIntoRepository: false;
  originalSourceOverwritten: false;
  automaticallyApproved: false;
  storageRead: boolean;
  notes: string[];
};

function emptyBlender(state: BlenderInspectionRecord['state'], notes: string[]): BlenderInspectionRecord {
  return {
    available: false,
    executed: false,
    factoryStartup: false,
    autoExecutionDisabled: true,
    networkAccess: false,
    state,
    scenes: null,
    collections: null,
    objects: null,
    meshes: null,
    materials: null,
    images: null,
    cameras: null,
    lights: null,
    armatures: null,
    animations: null,
    geometryNodes: null,
    linkedOrMissingLibraries: [],
    notes,
  };
}

export function recommendedNextAction(input: {
  expected: ExpectedSourceFile;
  report: SafeArchiveInspection | null;
  storageRead: boolean;
  blenderBlocked: boolean;
}): string {
  if (!input.storageRead) {
    return 'Keep the stored original unchanged. Preview storage could not be read safely from this environment.';
  }
  if (input.expected.unityPreservationOnly) {
    return 'Keep this Unity package as preservation-only. Do not import it into the Blender pipeline.';
  }
  if (input.report?.refused) {
    return 'Leave the original quarantined or blocked. Do not extract or execute archive contents.';
  }
  if (input.blenderBlocked) {
    return 'Archive listing is complete. Blender-specific metadata stays blocked until an isolated Blender 4.2 worker is available.';
  }
  return 'Review the inspection catalog, then queue a later Blender-import pass without automatic approval.';
}

export function inspectBlenderMetadataSafely(input: {
  hasBlendFiles: boolean;
  unityPreservationOnly: boolean;
}): BlenderInspectionRecord {
  if (input.unityPreservationOnly || !input.hasBlendFiles) {
    return emptyBlender('not_applicable', [
      'No Blender execution was required or attempted for this source.',
    ]);
  }
  const availability = describeBlenderAvailability();
  return emptyBlender('inspection_blocked', [
    availability.message,
    'Factory startup, disabled auto-execution, no network, bounded temp storage, and a strict timeout would be required.',
    'Blender results were not invented.',
  ]);
}

function applyArchive(report: SourceInspectionReport, archive: SafeArchiveInspection): void {
  report.archiveType = archive.archiveType;
  report.archiveFileCount = archive.fileCount;
  report.totalUncompressedSize = archive.totalUncompressedSize;
  report.directoryStructure = archive.directoryStructure;
  report.containedExtensions = archive.containedExtensions;
  report.modelFiles = archive.modelFiles;
  report.textures = archive.textures;
  report.materials = archive.materials;
  report.hdriOrSkyImages = archive.hdriOrSkyImages;
  report.unityPackages = archive.unityPackages;
  report.blenderFiles = archive.blenderFiles;
  report.fbxFiles = archive.fbxFiles;
  report.glbFiles = archive.glbFiles;
  report.objFiles = archive.objFiles;
  report.mtlFiles = archive.mtlFiles;
  report.documentationAndLicenseFiles = archive.documentationAndLicenseFiles;
  report.suspiciousOrUnsupported = archive.suspiciousOrUnsupported;
  report.duplicateInternalFilenames = archive.duplicateInternalFilenames;
  report.exactDuplicateInternalContent = archive.exactDuplicateInternalContent;
  report.findings = archive.findings;
  report.notes.push(...archive.notes);
}

export function createSourceInspectionSkeleton(
  expected: ExpectedSourceFile,
  manifest?: Partial<SourceObjectManifest>,
): SourceInspectionReport {
  const inspectionState = (manifest?.inspectionState ?? 'inspection_pending') as InspectionState;
  const pipelineState = derivePipelineState({
    uploadState: manifest?.uploadState ?? 'completed',
    verificationState: manifest?.verificationState ?? 'size_verified',
    quarantineState: manifest?.quarantineState ?? 'not_quarantined',
    inspectionState,
    unityPreservationOnly: expected.unityPreservationOnly,
  });
  return {
    schemaVersion: SOURCE_INSPECTION_SCHEMA,
    originalFilename: manifest?.originalFilename ?? expected.expectedFilename,
    sourceId: expected.sourceId,
    collection: expected.collectionId,
    collectionName: expected.collectionName,
    byteSize: manifest?.byteSize ?? 0,
    sha256RecordedByIntake: manifest?.sha256 ? manifest.sha256 : null,
    storageVerificationState: manifest?.verificationState ?? 'size_verified',
    archiveType: expected.extension === '.unitypackage.gz' ? 'unitypackage.gz' : expected.extension.replace('.', ''),
    archiveFileCount: null,
    totalUncompressedSize: null,
    directoryStructure: [],
    containedExtensions: [],
    modelFiles: [],
    textures: [],
    materials: [],
    hdriOrSkyImages: [],
    unityPackages: expected.unityPreservationOnly ? [expected.expectedFilename] : [],
    blenderFiles: [],
    fbxFiles: [],
    glbFiles: [],
    objFiles: [],
    mtlFiles: [],
    documentationAndLicenseFiles: [],
    suspiciousOrUnsupported: [],
    missingReferencedDependencies: [],
    duplicateInternalFilenames: [],
    exactDuplicateInternalContent: [],
    inspectionReadiness: inspectionState,
    pipelineState,
    recommendedNextAction: recommendedNextAction({
      expected,
      report: null,
      storageRead: false,
      blenderBlocked: true,
    }),
    blender: emptyBlender('not_applicable', []),
    findings: [],
    executedEmbeddedScripts: false,
    extractedIntoRepository: false,
    originalSourceOverwritten: false,
    automaticallyApproved: false,
    storageRead: false,
    notes: [],
  };
}

export async function inspectOfficialSource(input: {
  expected: ExpectedSourceFile;
  manifest?: Partial<SourceObjectManifest>;
  source?: ByteSource | Uint8Array | null;
  storageReadable: boolean;
}): Promise<SourceInspectionReport> {
  const report = createSourceInspectionSkeleton(input.expected, input.manifest);
  if (!input.storageReadable || !input.source) {
    report.inspectionReadiness = 'inspection_blocked';
    report.pipelineState = 'inspection_blocked';
    report.notes.push(
      'Private storage could not be read safely or the source bytes were not provided. Results were not invented.',
    );
    report.blender = inspectBlenderMetadataSafely({
      hasBlendFiles: !input.expected.unityPreservationOnly,
      unityPreservationOnly: input.expected.unityPreservationOnly,
    });
    report.recommendedNextAction = recommendedNextAction({
      expected: input.expected,
      report: null,
      storageRead: false,
      blenderBlocked: true,
    });
    return report;
  }

  const source = input.source instanceof Uint8Array ? memoryByteSource(input.source) : input.source;
  report.storageRead = true;
  report.byteSize = source.byteLength || report.byteSize;

  if (input.expected.unityPreservationOnly || input.expected.extension === '.unitypackage.gz') {
    const header = await source.read(0, Math.min(64, source.byteLength));
    const archive = inspectUnityPackageGzHeader(header);
    applyArchive(report, archive);
    report.inspectionReadiness = archive.refused ? 'inspection_blocked' : 'preservation_only';
    report.pipelineState = archive.refused ? 'inspection_blocked' : 'preservation_only';
    report.blender = inspectBlenderMetadataSafely({
      hasBlendFiles: false,
      unityPreservationOnly: true,
    });
  } else {
    const archive = await inspectZipByteSource(source);
    applyArchive(report, archive);
    report.blender = inspectBlenderMetadataSafely({
      hasBlendFiles: archive.blenderFiles.length > 0,
      unityPreservationOnly: false,
    });
    if (archive.refused) {
      report.inspectionReadiness = 'inspection_blocked';
      report.pipelineState = 'quarantined';
    } else if (report.blender.state === 'inspection_blocked') {
      report.inspectionReadiness = 'inspection_complete';
      report.pipelineState = 'inspection_complete';
      report.notes.push('Container inspection completed. Blend-file script execution was not performed.');
    } else {
      report.inspectionReadiness = 'inspection_complete';
      report.pipelineState = 'inspection_complete';
    }
  }

  report.recommendedNextAction = recommendedNextAction({
    expected: input.expected,
    report: {
      refused: report.findings.some((item) => item.severity === 'error'),
      archiveType: report.archiveType as SafeArchiveInspection['archiveType'],
    } as SafeArchiveInspection,
    storageRead: true,
    blenderBlocked: report.blender.state === 'inspection_blocked',
  });
  return report;
}

export function inspectOfficialSourceById(
  sourceId: string,
  manifest?: Partial<SourceObjectManifest>,
): Promise<SourceInspectionReport> {
  return inspectOfficialSource({
    expected: getExpectedSourceFile(sourceId),
    manifest,
    source: null,
    storageReadable: false,
  });
}
