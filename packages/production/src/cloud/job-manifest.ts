/**
 * Cloud job manifest builder (Phase 5). Never embeds secrets.
 */
import { CLOUD_JOB_MANIFEST_SCHEMA, DEFAULT_BLENDER_VERSION } from './config';
import {
  CloudJobManifestSchema,
  type AssetRef,
  type CloudJobManifest,
  type CloudRenderProfile,
} from './types';
import { assertNoSecretsInManifest } from './secret-safety';
import { renderFinalKey, renderDraftKey } from './r2-layout';

export type BuildCloudJobManifestInput = {
  jobId: string;
  episodeId: string;
  seasonId?: string | null;
  episodeNumber?: number;
  renderMode: CloudRenderProfile;
  resolution: string;
  fps: number;
  blenderVersionRequirement?: string;
  pip?: AssetRef;
  goat?: AssetRef;
  environments?: AssetRef[];
  props?: AssetRef[];
  animations?: AssetRef[];
  expressionStates?: Record<string, unknown>;
  visemeData?: Record<string, unknown>;
  cameraState?: Record<string, unknown>;
  lightingState?: Record<string, unknown>;
  vfxState?: Record<string, unknown>;
  audioReferences?: AssetRef[];
  cacheKeys?: string[];
  renderSettings?: Record<string, unknown>;
  estimatedFrameCount: number;
  batchSessionId?: string;
  outputPath?: string;
};

export function buildCloudJobManifest(input: BuildCloudJobManifestInput): CloudJobManifest {
  const isFinal = input.renderMode === 'FINAL_1080P' || input.renderMode === 'PREMIUM';
  const outputPath =
    input.outputPath ??
    (isFinal
      ? renderFinalKey(input.episodeId, input.jobId, 'final.mp4')
      : renderDraftKey(input.episodeId, input.jobId, 'draft.mp4'));

  const manifest = CloudJobManifestSchema.parse({
    schemaVersion: CLOUD_JOB_MANIFEST_SCHEMA,
    jobId: input.jobId,
    episodeId: input.episodeId,
    seasonId: input.seasonId ?? null,
    episodeNumber: input.episodeNumber,
    renderMode: input.renderMode,
    resolution: input.resolution,
    fps: input.fps,
    blenderVersionRequirement: input.blenderVersionRequirement ?? DEFAULT_BLENDER_VERSION,
    provider: 'RUNPOD_BLENDER',
    characters: {
      pip: input.pip,
      goat: input.goat,
    },
    environments: input.environments ?? [],
    props: input.props ?? [],
    animations: input.animations ?? [],
    expressionStates: input.expressionStates ?? {},
    visemeData: input.visemeData ?? {},
    cameraState: input.cameraState ?? {},
    lightingState: input.lightingState ?? {},
    vfxState: input.vfxState ?? {},
    audioReferences: input.audioReferences ?? [],
    outputPath,
    cacheKeys: input.cacheKeys ?? [],
    renderSettings: input.renderSettings ?? {},
    estimatedFrameCount: input.estimatedFrameCount,
    batchSessionId: input.batchSessionId,
    createdAt: new Date().toISOString(),
    credentialsPolicy: {
      secretsInManifest: false,
      r2Scoped: true,
      runpodServerSideOnly: true,
    },
  });

  assertNoSecretsInManifest(manifest);
  return manifest;
}

/** Collect all required asset refs from a manifest for sync planning. */
export function listRequiredAssets(manifest: CloudJobManifest): AssetRef[] {
  const out: AssetRef[] = [];
  if (manifest.characters.pip) out.push(manifest.characters.pip);
  if (manifest.characters.goat) out.push(manifest.characters.goat);
  out.push(...manifest.environments, ...manifest.props, ...manifest.animations, ...manifest.audioReferences);
  return out;
}
