import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { sha256Canonical } from './hash';

export const GOAT_PACKAGE_NAME = 'Goat_FINN.zip' as const;

export type SourceSlot = {
  copyClass: 'SOURCE' | 'WORKING' | 'PRODUCTION';
  relativePath: string;
  immutable: boolean;
};

export const GOAT_WORKING_DEPARTMENT_PATH =
  'production-library/characters/goat/WORKING/CHAR_GOAT_001_working.blend' as const;
export const GOAT_WORKING_CONVERSION_PATH =
  'production-library/characters/goat/WORKING/goat_working_4_2_2.blend' as const;

export const GOAT_SOURCE_SLOTS: readonly SourceSlot[] = [
  { copyClass: 'SOURCE', relativePath: 'production-library/characters/goat/SOURCE/Goat_FINN.zip', immutable: true },
  { copyClass: 'WORKING', relativePath: GOAT_WORKING_DEPARTMENT_PATH, immutable: false },
  { copyClass: 'PRODUCTION', relativePath: 'production-library/characters/goat/PRODUCTION/CHAR_GOAT_001_master.blend', immutable: true },
  { copyClass: 'WORKING', relativePath: GOAT_WORKING_CONVERSION_PATH, immutable: false },
];

export type SourceIntakeReport = {
  packageName: typeof GOAT_PACKAGE_NAME;
  present: boolean;
  resolvedPath: string | null;
  byteSize: number | null;
  sha256: string | null;
  sourceLocked: false | true;
  workingCopyCreated: false;
  productionMasterCreated: false;
  substitutedPlaceholder: false;
  inspectionFaked: false;
  status: 'BLOCKED_REAL_EXECUTION_REQUIRED' | 'HASH_LOCKED';
  nextInputRequired: string;
  reportSha256: string;
};

function fileSha256IfPresent(filePath: string): { sha256: string; byteSize: number } | null {
  if (!existsSync(filePath)) return null;
  const stat = statSync(filePath);
  if (!stat.isFile()) return null;
  const hash = createHash('sha256');
  hash.update(readFileSync(filePath));
  return { sha256: hash.digest('hex'), byteSize: stat.size };
}

export function resolveRepoRoot(start = process.cwd()): string {
  let current = start;
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(path.join(current, 'scripts/blender')) && existsSync(path.join(current, 'apps/web'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return start;
}

export function inspectGoatSourcePackage(repoRoot = resolveRepoRoot(), searchPaths: readonly string[] = []): SourceIntakeReport {
  const candidates = [
    ...searchPaths,
    path.join(repoRoot, 'incoming', GOAT_PACKAGE_NAME),
    path.join(repoRoot, 'production-library/characters/goat/SOURCE', GOAT_PACKAGE_NAME),
    path.join(repoRoot, GOAT_PACKAGE_NAME),
  ];
  const found = candidates.find((item) => existsSync(item));
  if (!found) {
    const body = {
      packageName: GOAT_PACKAGE_NAME,
      present: false,
      resolvedPath: null,
      byteSize: null,
      sha256: null,
      sourceLocked: false as const,
      workingCopyCreated: false as const,
      productionMasterCreated: false as const,
      substitutedPlaceholder: false as const,
      inspectionFaked: false as const,
      status: 'BLOCKED_REAL_EXECUTION_REQUIRED' as const,
      nextInputRequired: `Place the immutable ${GOAT_PACKAGE_NAME} at production-library/characters/goat/SOURCE/${GOAT_PACKAGE_NAME} and rerun SOURCE_INTAKE.`,
    };
    return { ...body, reportSha256: sha256Canonical(body) };
  }
  const hashed = fileSha256IfPresent(found);
  const body = {
    packageName: GOAT_PACKAGE_NAME,
    present: true,
    resolvedPath: found,
    byteSize: hashed?.byteSize ?? null,
    sha256: hashed?.sha256 ?? null,
    sourceLocked: Boolean(hashed),
    workingCopyCreated: false as const,
    productionMasterCreated: false as const,
    substitutedPlaceholder: false as const,
    inspectionFaked: false as const,
    status: hashed ? ('HASH_LOCKED' as const) : ('BLOCKED_REAL_EXECUTION_REQUIRED' as const),
    nextInputRequired: hashed
      ? 'Create a WORKING conversion copy without overwriting SOURCE, then continue the stage pipeline.'
      : `Unable to hash ${GOAT_PACKAGE_NAME}.`,
  };
  return { ...body, reportSha256: sha256Canonical(body) };
}
