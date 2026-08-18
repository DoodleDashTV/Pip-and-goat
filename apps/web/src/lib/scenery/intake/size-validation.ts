function extname(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot).toLowerCase() : '';
}

export const MINIMUM_SOURCE_BYTES_BY_EXTENSION: Readonly<Record<string, number>> = {
  '.zip': 22,
  '.unitypackage': 64,
  '.hdr': 64,
  '.exr': 64,
  '.blend': 64,
  '.fbx': 32,
};

export type SourceSizeIssue =
  | 'zero_byte'
  | 'negative_size'
  | 'declared_mismatch'
  | 'below_format_minimum'
  | 'truncated_transfer'
  | 'stored_size_mismatch';

export type SourceSizeAssessment = {
  declaredBytes: number;
  observedBytes: number | null;
  storedBytes: number | null;
  minimumBytes: number;
  ok: boolean;
  issues: SourceSizeIssue[];
};

export function minimumBytesForFilename(filename: string): number {
  const extension = extname(filename).toLowerCase();
  return MINIMUM_SOURCE_BYTES_BY_EXTENSION[extension] ?? 1;
}

export function assessSourceSize(input: {
  filename: string;
  declaredBytes: number;
  observedBytes?: number | null;
  storedBytes?: number | null;
}): SourceSizeAssessment {
  const issues: SourceSizeIssue[] = [];
  const declaredBytes = Number(input.declaredBytes);
  const observedBytes =
    input.observedBytes === undefined || input.observedBytes === null
      ? null
      : Number(input.observedBytes);
  const storedBytes =
    input.storedBytes === undefined || input.storedBytes === null
      ? null
      : Number(input.storedBytes);
  const minimumBytes = minimumBytesForFilename(input.filename);

  if (!Number.isFinite(declaredBytes) || declaredBytes < 0) {
    issues.push('negative_size');
  } else if (declaredBytes === 0) {
    issues.push('zero_byte');
  } else if (declaredBytes < minimumBytes) {
    issues.push('below_format_minimum');
  }

  if (observedBytes !== null) {
    if (observedBytes === 0 && declaredBytes > 0) {
      issues.push('zero_byte');
    }
    if (observedBytes !== declaredBytes) {
      issues.push('declared_mismatch');
    }
  }

  if (storedBytes !== null) {
    if (storedBytes === 0) {
      issues.push('zero_byte');
    }
    if (declaredBytes > 0 && storedBytes < declaredBytes) {
      issues.push('truncated_transfer');
    }
    if (declaredBytes > 0 && storedBytes !== declaredBytes) {
      issues.push('stored_size_mismatch');
    }
  }

  return {
    declaredBytes,
    observedBytes,
    storedBytes,
    minimumBytes,
    ok: issues.length === 0,
    issues: Array.from(new Set(issues)),
  };
}
