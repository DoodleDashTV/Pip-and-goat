import { detectLocalBlender } from '@/lib/tivvlejoy-real-scenery-inspection/blender';
import { SUPPORTED_BLENDER_VERSION } from '@/lib/scenery/types';
import { BLENDER_INSTALL_SCHEMA, type BlenderInstallationPlan } from './types';

export function blenderInstallationPlan(): BlenderInstallationPlan {
  const detected = detectLocalBlender();
  return {
    schemaVersion: BLENDER_INSTALL_SCHEMA,
    requiredVersion: SUPPORTED_BLENDER_VERSION,
    trustedSource: 'Official Blender Foundation download for the pinned 4.2 LTS line, verified against project-documented checksums before install.',
    checksumExpectation: 'SHA-256 of the official archive must match the project-supported pin before extraction.',
    installLocation: '/usr/local/bin/blender or an isolated project tool cache; never overwrite production rigs.',
    networkRestrictions: [
      'Do not download unofficial mirrors.',
      'Do not use paid GPU hosts to fetch Blender.',
      'Do not install addons during the smoke test.',
    ],
    testCommand: 'blender --version',
    rollbackRemoval: 'Delete the isolated binary and keep factory-startup inspection disabled until a new verified pin exists.',
    installedNow: false,
    reasonNotInstalled: detected.available
      ? 'Local Blender was detected, but this marathon does not treat detection as a deep-inspection admission.'
      : 'Blender is not installed locally and no trusted checksum-verified project install route was executed.',
  };
}

export function localBlenderSmokePlan(): {
  commercialBytes: false;
  paidCompute: false;
  scene: 'SYNTHETIC_ONLY';
  executed: boolean;
  command: string;
} {
  const detected = detectLocalBlender();
  return {
    commercialBytes: false,
    paidCompute: false,
    scene: 'SYNTHETIC_ONLY',
    executed: false,
    command: detected.available
      ? 'blender -b --factory-startup --python-expr "import bpy; print(bpy.app.version_string)"'
      : 'NOT_EXECUTED: trusted local Blender is unavailable',
  };
}

export function renderEnvironmentReadiness(): {
  blender: 'WAITING_EXTERNAL_INPUT' | 'REAL_PARTIAL';
  workerImage: 'WAITING_PAID_AUTHORIZATION';
  renderBackend: 'WAITING_PAID_AUTHORIZATION';
  assetMaterialization: 'WAITING_HUMAN_APPROVAL';
  launched: false;
} {
  const detected = detectLocalBlender();
  return {
    blender: detected.available ? 'REAL_PARTIAL' : 'WAITING_EXTERNAL_INPUT',
    workerImage: 'WAITING_PAID_AUTHORIZATION',
    renderBackend: 'WAITING_PAID_AUTHORIZATION',
    assetMaterialization: 'WAITING_HUMAN_APPROVAL',
    launched: false,
  };
}
