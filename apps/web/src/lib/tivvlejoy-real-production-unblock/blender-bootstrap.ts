import { detectLocalBlender } from '@/lib/tivvlejoy-real-scenery-inspection/blender';
import { SUPPORTED_BLENDER_VERSION } from '@/lib/scenery/types';
import { TRUSTED_BLENDER_SCHEMA, type BlenderBootstrap } from './types';

export const BLENDER_TARGET_VERSION = SUPPORTED_BLENDER_VERSION;
export const BLENDER_TRUSTED_SOURCE = 'https://download.blender.org/release/Blender4.2/';
export const BLENDER_LINUX_ARCHIVE = `blender-${SUPPORTED_BLENDER_VERSION}-linux-x64.tar.xz`;

const PLAYBOOK = [
  `Confirm the project pin remains ${SUPPORTED_BLENDER_VERSION}. Cloud scripts mention 4.2.3 in one acceptance path; do not install until that ambiguity is resolved by a human.`,
  `Ask Justin to paste the official Blender Foundation SHA-256 for ${BLENDER_LINUX_ARCHIVE} from ${BLENDER_TRUSTED_SOURCE}. Do not use a third-party mirror or an unverified GitHub binary.`,
  `After the SHA-256 is pinned in-repo, download only from download.blender.org into an isolated cache (for example $HOME/.local/opt/tivvlejoy-blender).`,
  `Verify sha256sum -c against the pinned digest before extraction. If it does not match, delete the archive and stop.`,
  'Extract the tarball as the current user. Root/admin is not required if the cache directory is user-writable.',
  'Do not install addons. Do not overwrite Pip or Goat production files. Do not enable auto-run scripts.',
  'Run only the synthetic factory-startup acceptance command from TIVVLEJOY_TRUSTED_BLENDER_BOOTSTRAP_V1. Do not open purchased assets.',
];

export function compileTrustedBlenderBootstrap(): BlenderBootstrap {
  const detected = detectLocalBlender();
  return {
    schemaVersion: TRUSTED_BLENDER_SCHEMA,
    targetVersion: BLENDER_TARGET_VERSION,
    projectCompatibility: `Scenery intake, assembly manifests, and storybook environment all pin Blender ${SUPPORTED_BLENDER_VERSION}. A 4.2 LTS line is required. 4.2.3 appears only in older cloud-acceptance notes and is not a trusted substitute until a human reconciles the pin.`,
    trustedSource: BLENDER_TRUSTED_SOURCE,
    checksumApproach:
      'Download only the official linux-x64 tarball, then verify SHA-256 against a human-pinned official digest before extraction. The repository does not currently contain that official digest, so installation is refused.',
    installMethod:
      'User-space extract of the official tarball into an isolated cache. Add the blender binary to PATH for this session only. Do not apt-install random packages and do not use unofficial AppImages.',
    installSize: 'Official linux-x64 tarball is typically a few hundred megabytes compressed. Treat this as an estimate, not a billed download from a commercial asset host.',
    estimatedDiskRequirement: 'About 1 GiB free for extract plus temporary factory-startup output. Cloud agent disks are ephemeral unless a later snapshot is authorized.',
    adminRootNeeded: false,
    persistent: false,
    installationCostsMoney: false,
    installedNow: detected.available,
    trustedPinPresent: false,
    reasonNotInstalled: detected.available
      ? `A blender binary is on PATH at ${detected.path}, but no official SHA-256 pin exists in this repository and 4.2.2 vs 4.2.3 remains unresolved. Detection is not a trusted install.`
      : 'Blender is not installed locally. Official SHA-256 is not pinned in-repo, so this marathon will not download or extract a binary.',
    laterAuthorizationPlaybook: PLAYBOOK,
  };
}

export function blenderTrustAllowsInstall(bootstrap: BlenderBootstrap): boolean {
  return bootstrap.trustedPinPresent === true && bootstrap.targetVersion === BLENDER_TARGET_VERSION;
}
