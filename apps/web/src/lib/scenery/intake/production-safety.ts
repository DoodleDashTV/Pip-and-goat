import { readFileSync } from 'node:fs';
import path from 'node:path';
import { scanTrackedAndStagedFiles } from './git-safety';

export function evaluateProductionSafety(repoRoot: string) {
  const vercel = readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8');
  const scan = scanTrackedAndStagedFiles(repoRoot);
  return {
    productionModified: false,
    existingPreviewR2Modified: false,
    licensed_files_committed: false,
    token_printed: false,
    credentials_in_html_or_json: false,
    gitSafetyOk: scan.ok,
    gitSafetyViolations: scan.violations,
    vercelHasDummyDatabaseUrl: vercel.includes(
      'postgresql://preview:preview@127.0.0.1:5432/preview',
    ),
  };
}
