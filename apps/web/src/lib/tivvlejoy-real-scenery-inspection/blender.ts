import { spawnSync } from 'node:child_process';
import type { ScriptState } from './types';

export type DeepBlenderInspection = {
  available: boolean;
  state: 'DEEP_BLENDER_INSPECTED' | 'DEEP_BLENDER_INSPECTION_PENDING' | 'DEEP_BLENDER_INSPECTION_TIMEOUT' | 'DEEP_BLENDER_INSPECTION_REFUSED';
  factoryStartup: boolean;
  background: boolean;
  autoExecutionDisabled: true;
  networkDisabled: true;
  sourceSaved: false;
  addonsActivated: false;
  sceneCount: number | null;
  collectionCount: number | null;
  objectCount: number | null;
  meshCount: number | null;
  vertices: number | null;
  edges: number | null;
  polygons: number | null;
  triangles: number | null;
  materials: number | null;
  images: number | null;
  armatures: number | null;
  animations: number | null;
  lights: number | null;
  cameras: number | null;
  worlds: number | null;
  linkedLibraries: string[];
  missingFiles: string[];
  externalFileRefs: string[];
  drivers: string[];
  scriptTextBlocks: string[];
  modifiers: string[];
  geometryNodesPresent: boolean;
  unsupportedAddons: string[];
  notes: string[];
};

export function detectLocalBlender(): { available: boolean; path: string | null } {
  const which = spawnSync('which', ['blender'], { encoding: 'utf8' });
  const path = which.status === 0 ? which.stdout.trim() : '';
  return { available: Boolean(path), path: path || null };
}

export function inspectWithIsolatedBlender(input: {
  sourcePath?: string;
  timeoutMs?: number;
}): DeepBlenderInspection {
  const detected = detectLocalBlender();
  if (!detected.available) {
    return pending(['DEEP_BLENDER_INSPECTION_PENDING: Blender is not available locally.']);
  }
  if (!input.sourcePath) {
    return pending(['A temporary source copy is required before isolated Blender inspection.']);
  }
  return {
    ...pending([
      'Local Blender was detected, but this marathon refuses addon activation and untrusted script evaluation.',
      'Deep inspection remains pending until an isolated factory-startup worker records actual counts.',
    ]),
    available: true,
    state: 'DEEP_BLENDER_INSPECTION_PENDING',
    factoryStartup: true,
    background: true,
  };
}

function pending(notes: string[]): DeepBlenderInspection {
  return {
    available: false,
    state: 'DEEP_BLENDER_INSPECTION_PENDING',
    factoryStartup: true,
    background: true,
    autoExecutionDisabled: true,
    networkDisabled: true,
    sourceSaved: false,
    addonsActivated: false,
    sceneCount: null,
    collectionCount: null,
    objectCount: null,
    meshCount: null,
    vertices: null,
    edges: null,
    polygons: null,
    triangles: null,
    materials: null,
    images: null,
    armatures: null,
    animations: null,
    lights: null,
    cameras: null,
    worlds: null,
    linkedLibraries: [],
    missingFiles: [],
    externalFileRefs: [],
    drivers: [],
    scriptTextBlocks: [],
    modifiers: [],
    geometryNodesPresent: false,
    unsupportedAddons: [],
    notes,
  };
}

export function scriptStateFromBlender(inspection: DeepBlenderInspection): ScriptState {
  if (inspection.scriptTextBlocks.length || inspection.drivers.length) {
    return inspection.externalFileRefs.some((ref) => /https?:|\/bin\/|cmd\.exe|powershell/i.test(ref))
      ? 'UNSAFE_EXECUTION_DEPENDENCY'
      : 'SCRIPT_REVIEW_REQUIRED';
  }
  return 'NO_SCRIPT_EVIDENCE';
}
