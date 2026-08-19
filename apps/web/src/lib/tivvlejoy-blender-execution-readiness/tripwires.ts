import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', 'tivvlejoy-blender-execution-readiness');

const FORBIDDEN = [
  /from ['"]child_process['"]/,
  /require\(['"]child_process['"]\)/,
  /\bspawn\s*\(/,
  /\bexecFile\s*\(/,
  /os\.system/,
  /bpy\./,
  /\/v1\/pods/,
  /issued:\s*true/,
  /allowCommercialSources:\s*true/,
  /allowCharacterAssets:\s*true/,
];

export function readinessSourceFiles() {
  return [
    'adapter.ts',
    'evaluate.ts',
    'fixtures.ts',
    'from-plan.ts',
    'hash-chain.ts',
    'index.ts',
    'tripwires.ts',
    'types.ts',
  ].map((file) => path.join(ROOT, file));
}

export function scanReadinessTripwires() {
  const hits: string[] = [];
  for (const file of readinessSourceFiles()) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const pattern of FORBIDDEN) {
      if (pattern.test(text)) hits.push(`${path.basename(file)}:${String(pattern)}`);
    }
  }
  return hits;
}

export function purchasedWorkstreamUntouched(repoRoot: string) {
  return [
    'apps/web/src/app/purchased-assets',
    'apps/web/src/app/api/purchased-tools',
    'apps/web/src/components/preview/PurchasedToolsIphoneIntake.tsx',
    'apps/web/src/lib/purchased-tools',
  ].every((relative) => !existsSync(path.join(repoRoot, relative)));
}
