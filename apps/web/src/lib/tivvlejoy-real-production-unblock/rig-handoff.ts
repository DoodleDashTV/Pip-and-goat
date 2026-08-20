import type { RigHandoffFile } from './types';

function characterFiles(character: 'Pip' | 'Goat'): RigHandoffFile[] {
  return [
    {
      label: `${character} Blender source`,
      required: true,
      reason: 'The production contract admits a .blend as the canonical rig source. One hashed source is enough.',
    },
    {
      label: `${character} FBX`,
      required: false,
      reason: 'FBX is an allowed alternative source, not a second required file, when the Blender source is present.',
    },
    {
      label: `${character} GLB`,
      required: false,
      reason: 'GLB is an allowed alternative source, not a second required file, when the Blender source is present.',
    },
    {
      label: `${character} textures`,
      required: false,
      reason: 'Send textures only if they are not packed inside the Blender source. Do not duplicate packed maps.',
    },
    {
      label: `${character} test-pose evidence`,
      required: false,
      reason: 'Test-pose stills or a short turnaround help review, but they are not required to receive the file. They become required before human approval.',
    },
    {
      label: `${character} version note or readme`,
      required: false,
      reason: 'A short version note helps, but identity is the file hash, not the filename or readme.',
    },
  ];
}

export function compileRigHandoffPackage(): {
  pip: RigHandoffFile[];
  goat: RigHandoffFile[];
  operatorHandoffReady: true;
  filesPresent: false;
} {
  return {
    pip: characterFiles('Pip'),
    goat: characterFiles('Goat'),
    operatorHandoffReady: true,
    filesPresent: false,
  };
}

export function requiredRigReceiveFiles(files: readonly RigHandoffFile[]): string[] {
  return files.filter((file) => file.required).map((file) => file.label);
}
