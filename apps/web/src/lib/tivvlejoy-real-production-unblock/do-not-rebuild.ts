import { DO_NOT_REBUILD_SCHEMA, type DoNotRebuildRow } from './types';

export const DO_NOT_REBUILD_MATRIX: DoNotRebuildRow[] = [
  {
    system: 'persistence',
    alreadySufficient: true,
    rebuildOnlyIf: 'A real defect appears in durable write/restart/backup behavior. Do not add another studio persistence stack.',
  },
  {
    system: 'orchestration',
    alreadySufficient: true,
    rebuildOnlyIf: 'A real defect appears in the production state graph, packet, or scheduler. Do not invent a second orchestrator.',
  },
  {
    system: 'animation planning',
    alreadySufficient: true,
    rebuildOnlyIf: 'A real defect appears in performance intent, dialogue animation, or continuity once real rigs exist.',
  },
  {
    system: 'director',
    alreadySufficient: true,
    rebuildOnlyIf: 'A real defect appears in showrunner, cinematography, staging, lighting, or the director package.',
  },
  {
    system: 'editorial',
    alreadySufficient: true,
    rebuildOnlyIf: 'A real defect appears in edit rhythm, dialogue edit, master timeline, captions, or dailies.',
  },
  {
    system: 'asset registry',
    alreadySufficient: true,
    rebuildOnlyIf: 'A real defect appears in approved-asset identity or world-builder resolution. Do not rebuild the registry for scenery browsing.',
  },
  {
    system: 'scenery audit',
    alreadySufficient: true,
    rebuildOnlyIf: 'A real defect appears in listing, matching, or static inspection. Do not rebuild another scenery classifier to avoid a GET.',
  },
];

export function compileDoNotRebuildMatrix(): {
  schemaVersion: typeof DO_NOT_REBUILD_SCHEMA;
  rows: DoNotRebuildRow[];
} {
  return { schemaVersion: DO_NOT_REBUILD_SCHEMA, rows: DO_NOT_REBUILD_MATRIX };
}

export function shouldRebuildStudioSystem(system: string, realDefect: boolean): boolean {
  const known = DO_NOT_REBUILD_MATRIX.some((row) => row.system === system);
  return known ? realDefect : false;
}
