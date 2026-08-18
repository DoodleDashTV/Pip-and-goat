import { SceneryError } from '../types';
import { assertAllowedExtension, assertSafeRelativeArchivePath, fileExtension } from './keys';
import { SCENERY_PROHIBITED_EXTENSIONS } from './limits';
import type { SourceObjectManifest } from './manifest';
import type { ArchiveInventoryReport } from './archive';

export type QuarantineFinding = {
  code: string;
  severity: 'error' | 'warning';
  message: string;
};

export function evaluateQuarantine(input: {
  filename: string;
  collectionValid: boolean;
  byteSize: number;
  sha256: string | null;
  objectAvailable: boolean;
  sizeMatchesStored: boolean;
  archive?: ArchiveInventoryReport | null;
  unityPreservationOnly: boolean;
}): { state: 'not_quarantined' | 'quarantined'; findings: QuarantineFinding[]; eligibleForInspection: boolean } {
  const findings: QuarantineFinding[] = [];
  try {
    assertAllowedExtension(input.filename);
  } catch (error) {
    findings.push({
      code: error instanceof SceneryError ? error.code : 'UNSUPPORTED_EXTENSION',
      severity: 'error',
      message: error instanceof Error ? error.message : 'Unsupported extension.',
    });
  }
  if (!input.collectionValid) {
    findings.push({ code: 'UNEXPECTED_COLLECTION', severity: 'error', message: 'File is not mapped to an expected collection.' });
  }
  if (input.byteSize <= 0) {
    findings.push({ code: 'ZERO_BYTE_FILE', severity: 'error', message: 'Zero-byte files are quarantined.' });
  }
  if (!input.sha256) {
    findings.push({ code: 'MISSING_CHECKSUM', severity: 'error', message: 'SHA-256 has not been recorded.' });
  }
  if (!input.objectAvailable) {
    findings.push({ code: 'OBJECT_UNAVAILABLE', severity: 'error', message: 'Stored object is not available.' });
  }
  if (input.objectAvailable && !input.sizeMatchesStored) {
    findings.push({ code: 'SIZE_MISMATCH', severity: 'error', message: 'Stored byte size does not match the intake record.' });
  }
  if (input.unityPreservationOnly) {
    findings.push({
      code: 'UNITY_PRESERVATION_ONLY',
      severity: 'warning',
      message: 'Unity packages are preservation backups and are never imported into the Blender pipeline.',
    });
  }
  if (input.archive) {
    findings.push(...input.archive.findings);
  }
  const blocked = findings.some((item) => item.severity === 'error');
  return {
    state: blocked ? 'quarantined' : 'not_quarantined',
    findings,
    eligibleForInspection: !blocked && input.objectAvailable && input.sizeMatchesStored && Boolean(input.sha256),
  };
}

export function applyQuarantineToManifest(
  manifest: SourceObjectManifest,
  evaluation: ReturnType<typeof evaluateQuarantine>,
): SourceObjectManifest {
  return {
    ...manifest,
    quarantineState: evaluation.state,
    inspectionState: evaluation.eligibleForInspection ? 'inspection_ready' : evaluation.state === 'quarantined' ? 'not_eligible' : 'awaiting_verification',
    notes: [...manifest.notes, ...evaluation.findings.map((item) => `${item.code}: ${item.message}`)],
  };
}

export function rejectArchiveEntry(path: string): QuarantineFinding[] {
  const findings: QuarantineFinding[] = [];
  try {
    assertSafeRelativeArchivePath(path);
  } catch (error) {
    findings.push({
      code: error instanceof SceneryError ? error.code : 'ARCHIVE_PATH_TRAVERSAL',
      severity: 'error',
      message: error instanceof Error ? error.message : 'Unsafe archive path.',
    });
  }
  const ext = fileExtension(path);
  if ((SCENERY_PROHIBITED_EXTENSIONS as readonly string[]).includes(ext)) {
    findings.push({
      code: 'PROHIBITED_EXTENSION',
      severity: 'error',
      message: `Archive contains unsupported executable or script: ${path}`,
    });
  }
  return findings;
}
