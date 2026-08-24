import { sha256Canonical } from './hash';
import { ZERO_SIDE_EFFECTS } from './types';

export const CHARACTER_BUILDER_SCRIPT = 'scripts/blender/characters/build_character.py' as const;

export type CharacterBuildCommand = {
  argv: readonly string[];
  workingBlend: string;
  manifestPath: string;
  dryRun: true;
  background: true;
  gpuRequested: false;
};

export type RunPodDryRun = {
  payload: {
    jobKind: 'CHARACTER_BUILD';
    characterId: 'CHAR_GOAT_001';
    script: typeof CHARACTER_BUILDER_SCRIPT;
    manifestPath: string;
    workingBlend: string;
    artifactDir: string;
    cleanup: readonly string[];
    secureGpuPolicy: 'SECURE_GPU_PRESERVED';
  };
  workerCommand: string;
  blenderCommand: CharacterBuildCommand;
  expectedArtifacts: readonly string[];
  launched: false;
  paid: false;
  commandSha256: string;
} & typeof ZERO_SIDE_EFFECTS;

export function buildBlenderCommand(input: { workingBlend: string; manifestPath: string }): CharacterBuildCommand {
  return {
    argv: [
      'blender',
      '--background',
      input.workingBlend,
      '--python',
      CHARACTER_BUILDER_SCRIPT,
      '--',
      '--manifest',
      input.manifestPath,
      '--dry-run',
    ],
    workingBlend: input.workingBlend,
    manifestPath: input.manifestPath,
    dryRun: true,
    background: true,
    gpuRequested: false,
  };
}

export function compileRunPodDryRun(input: { workingBlend: string; manifestPath: string; artifactDir: string }): RunPodDryRun {
  const blenderCommand = buildBlenderCommand(input);
  const expectedArtifacts = [
    'goat_source_audit.json',
    'goat_topology_report.json',
    'goat_texture_report.json',
    'goat_rig_build_report.json',
    'goat_weight_report.json',
    'goat_face_report.json',
    'goat_viseme_report.json',
    'goat_deformation_report.json',
    'goat_animation_validation.json',
    'goat_performance_report.json',
    'goat_character_master_gate.json',
  ].map((name) => `${input.artifactDir}/${name}`);
  const payload = {
    jobKind: 'CHARACTER_BUILD' as const,
    characterId: 'CHAR_GOAT_001' as const,
    script: CHARACTER_BUILDER_SCRIPT,
    manifestPath: input.manifestPath,
    workingBlend: input.workingBlend,
    artifactDir: input.artifactDir,
    cleanup: ['/tmp/tivvlejoy-character-build', input.artifactDir],
    secureGpuPolicy: 'SECURE_GPU_PRESERVED' as const,
  };
  return {
    payload,
    workerCommand: `python ${CHARACTER_BUILDER_SCRIPT} --manifest ${input.manifestPath} --dry-run --artifact-dir ${input.artifactDir}`,
    blenderCommand,
    expectedArtifacts,
    launched: false,
    paid: false,
    ...ZERO_SIDE_EFFECTS,
    commandSha256: sha256Canonical(blenderCommand.argv),
  };
}

export function planGoatCharacterExecution(input?: {
  workingBlend?: string;
  manifestPath?: string;
  artifactDir?: string;
}): RunPodDryRun {
  return compileRunPodDryRun({
    workingBlend:
      input?.workingBlend ?? 'production-library/characters/goat/WORKING/CHAR_GOAT_001_working.blend',
    manifestPath: input?.manifestPath ?? 'config/characters/CHAR_GOAT_001/manifest.json',
    artifactDir: input?.artifactDir ?? 'artifacts/character-rigging/CHAR_GOAT_001',
  });
}
