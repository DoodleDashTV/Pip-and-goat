import { STUDIO_BLENDER_PIN } from './types';

export type BlenderVersion = {
  major: number;
  minor: number;
  patch?: number;
  label: string;
};

export type BlenderCompatibilityReport = {
  studioPin: typeof STUDIO_BLENDER_PIN;
  sourceVersion: BlenderVersion | null;
  status:
    | 'COMPATIBLE'
    | 'CONVERSION_COPY_REQUIRED'
    | 'UNSUPPORTED_NEWER'
    | 'UNKNOWN_SOURCE_VERSION'
    | 'BLOCKED_REAL_EXECUTION_REQUIRED';
  silentDowngradeForbidden: true;
  sourceOverwriteForbidden: true;
  detail: string;
};

export function parseBlenderVersion(label: string | null | undefined): BlenderVersion | null {
  if (!label) return null;
  const match = label.trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: match[3] ? Number(match[3]) : 0,
    label: label.trim(),
  };
}

export function evaluateBlenderCompatibility(sourceLabel: string | null): BlenderCompatibilityReport {
  const sourceVersion = parseBlenderVersion(sourceLabel);
  if (!sourceVersion) {
    return {
      studioPin: STUDIO_BLENDER_PIN,
      sourceVersion: null,
      status: 'UNKNOWN_SOURCE_VERSION',
      silentDowngradeForbidden: true,
      sourceOverwriteForbidden: true,
      detail: 'Source Blender version is unknown until the immutable Goat package is inspected.',
    };
  }
  const newer =
    sourceVersion.major > STUDIO_BLENDER_PIN.major ||
    (sourceVersion.major === STUDIO_BLENDER_PIN.major && sourceVersion.minor > STUDIO_BLENDER_PIN.minor);
  if (newer) {
    return {
      studioPin: STUDIO_BLENDER_PIN,
      sourceVersion,
      status: 'CONVERSION_COPY_REQUIRED',
      silentDowngradeForbidden: true,
      sourceOverwriteForbidden: true,
      detail: `Source was authored in ${sourceVersion.label}. Studio pin is ${STUDIO_BLENDER_PIN.label}. Open a WORKING conversion copy; never overwrite SOURCE.`,
    };
  }
  return {
    studioPin: STUDIO_BLENDER_PIN,
    sourceVersion,
    status: 'COMPATIBLE',
    silentDowngradeForbidden: true,
    sourceOverwriteForbidden: true,
    detail: `Source ${sourceVersion.label} is compatible with studio pin ${STUDIO_BLENDER_PIN.label}.`,
  };
}
