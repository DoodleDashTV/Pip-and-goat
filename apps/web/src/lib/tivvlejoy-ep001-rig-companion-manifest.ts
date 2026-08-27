import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';

export const EP001_RIG_COMPANION_MANIFEST_SCHEMA = 'TIVVLEJOY_EP001_RIG_COMPANION_MANIFEST_V1' as const;

export function compileEp001RigCompanionManifest() {
  const body = {
    schemaVersion: EP001_RIG_COMPANION_MANIFEST_SCHEMA,
    episodeId: 'EP001' as const,
    canonicalArtifact: {
      extension: '.blend' as const,
      role: 'CANONICAL_PRODUCTION_RIG' as const,
      required: true as const,
      rule: 'The reviewed artist-delivered Blender file is the canonical rig identity unless a later explicit approval replaces that choice.',
    },
    companionArtifacts: [
      { extension: '.fbx', role: 'INTERCHANGE_EXPORT', required: false },
      { extension: '.glb', role: 'INTERCHANGE_EXPORT', required: false },
      { extension: '.zip', role: 'DELIVERY_SUPPORT_BUNDLE', required: false },
    ] as const,
    attachmentRules: [
      'Every companion file binds to one exact canonical rig versionId and canonical source SHA-256.',
      'A companion file has its own byte size, source SHA-256, receipt SHA-256, and immutable object key.',
      'A companion file can never replace or mutate the canonical .blend identity.',
      'Changed companion bytes create a new companion receipt; silent overwrite is refused.',
      'Textures packed inside the .blend are not duplicated merely to fill a checklist.',
      'Unpacked texture/support files may be accepted only as a version-bound support bundle.',
    ],
    futureUploadNamespace: 'tivvlejoy-assets/characters/{CHARACTER_ID}/rig-deliveries/{VERSION_ID}/companions/{COMPANION_ID}/{FILENAME}',
    authority: {
      companionsPresent: false as const,
      canonicalRigChanged: false as const,
      humanApprovalGranted: false as const,
      productionWritesAllowed: false as const,
    },
  };
  return { ...body, rigCompanionManifestSha256: sha256Canonical(body) };
}
