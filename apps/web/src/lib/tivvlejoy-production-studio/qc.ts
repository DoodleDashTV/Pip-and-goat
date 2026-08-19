import { sha256Canonical } from './hash';
import { EPISODE_QC_SCHEMA, QC_PROFILES, type QcProfileId, type QcState } from './types';

export type QcCheck = {
  category: string;
  state: QcState;
  hardBlocker: boolean;
  detail: string;
};

export type EpisodeQcInput = {
  episodeId: string;
  profileId?: QcProfileId;
  width?: number;
  height?: number;
  fps?: number;
  durationSec?: number;
  frameCount?: number;
  audioPresent?: boolean;
  audioDurationSec?: number;
  dialogueTimingOk?: boolean;
  audioPeakOk?: boolean;
  loudnessOk?: boolean;
  captionTimingOk?: boolean;
  captionSafeAreaOk?: boolean;
  textOverflowOk?: boolean;
  shotContinuityOk?: boolean;
  characterContinuityOk?: boolean;
  propContinuityOk?: boolean;
  locationContinuityOk?: boolean;
  visualApprovalPresent?: boolean;
  visualApprovalFresh?: boolean;
  assetProvenanceOk?: boolean;
  assetHashOk?: boolean;
  characterRigVersion?: string;
  renderManifestMatch?: boolean;
  deliveryManifestMatch?: boolean;
};

export type EpisodeQcReport = {
  schemaVersion: typeof EPISODE_QC_SCHEMA;
  episodeId: string;
  profileId: QcProfileId;
  checks: QcCheck[];
  hardBlockers: string[];
  warnings: string[];
  passed: boolean;
  episodeQcSha256: string;
};

function check(category: string, ok: boolean | undefined, hard: boolean, detail: string): QcCheck {
  if (ok === undefined) return { category, state: 'NOT_EVALUATED', hardBlocker: hard, detail: `${detail} not evaluated` };
  return { category, state: ok ? 'PASS' : hard ? 'FAIL' : 'WARNING', hardBlocker: hard && !ok, detail };
}

export function evaluateEpisodeQc(input: EpisodeQcInput): EpisodeQcReport {
  const profile = QC_PROFILES[input.profileId ?? 'SHORT_60'];
  const widthOk = input.width === undefined ? undefined : input.width === profile.width;
  const heightOk = input.height === undefined ? undefined : input.height === profile.height;
  const fpsOk = input.fps === undefined ? undefined : input.fps === profile.fps;
  const durationOk = input.durationSec === undefined ? undefined : Math.abs(input.durationSec - profile.durationSec) <= 2;
  const framesExpected = profile.fps * profile.durationSec;
  const framesOk = input.frameCount === undefined ? undefined : input.frameCount === framesExpected;
  const rigOk = input.characterRigVersion === undefined ? undefined : input.characterRigVersion !== 'UNRESOLVED_PRODUCTION_RIG';

  const checks = [
    check('VIDEO_FORMAT', widthOk !== undefined && heightOk !== undefined ? Boolean(widthOk && heightOk) : undefined, true, '1080x1920 9:16'),
    check('RESOLUTION', widthOk, true, `${profile.width}x${profile.height}`),
    check('ASPECT_RATIO', widthOk !== undefined && heightOk !== undefined ? Boolean(widthOk && heightOk) : undefined, true, profile.aspect),
    check('FRAME_RATE', fpsOk, true, `${profile.fps} fps`),
    check('DURATION', durationOk, true, `${profile.durationSec}s`),
    check('FRAME_COMPLETENESS', framesOk, true, `${framesExpected} frames`),
    check('AUDIO_PRESENT', input.audioPresent, true, 'audio stream'),
    check('AUDIO_DURATION', input.audioDurationSec === undefined ? undefined : Math.abs((input.audioDurationSec ?? 0) - (input.durationSec ?? profile.durationSec)) <= 1, true, 'audio duration'),
    check('DIALOGUE_TIMING', input.dialogueTimingOk, false, 'dialogue timing'),
    check('AUDIO_PEAK_POLICY', input.audioPeakOk, false, 'peak policy'),
    check('LOUDNESS_POLICY', input.loudnessOk, false, 'loudness policy'),
    check('CAPTION_TIMING', input.captionTimingOk, false, 'caption timing'),
    check('CAPTION_SAFE_AREA', input.captionSafeAreaOk, false, 'caption safe area'),
    check('TEXT_OVERFLOW', input.textOverflowOk, false, 'text overflow'),
    check('SHOT_CONTINUITY', input.shotContinuityOk, true, 'shot continuity'),
    check('CHARACTER_CONTINUITY', input.characterContinuityOk, true, 'character continuity'),
    check('PROP_CONTINUITY', input.propContinuityOk, true, 'prop continuity'),
    check('LOCATION_CONTINUITY', input.locationContinuityOk, true, 'location continuity'),
    check('VISUAL_APPROVAL_PRESENT', input.visualApprovalPresent, true, 'visual approval'),
    check('VISUAL_APPROVAL_FRESH', input.visualApprovalFresh, true, 'fresh visual approval'),
    check('ASSET_PROVENANCE', input.assetProvenanceOk, true, 'asset provenance'),
    check('ASSET_HASH', input.assetHashOk, true, 'asset hashes'),
    check('CHARACTER_RIG_VERSION', rigOk, true, 'character rig version'),
    check('RENDER_MANIFEST_MATCH', input.renderManifestMatch, true, 'render manifest'),
    check('DELIVERY_MANIFEST_MATCH', input.deliveryManifestMatch, true, 'delivery manifest'),
  ];
  const hardBlockers = checks.filter((item) => item.hardBlocker && item.state === 'FAIL').map((item) => item.category);
  const warnings = checks.filter((item) => item.state === 'WARNING' || item.state === 'NOT_EVALUATED').map((item) => item.category);
  const passed = hardBlockers.length === 0 && checks.every((item) => item.state !== 'FAIL');
  const body = {
    schemaVersion: EPISODE_QC_SCHEMA,
    episodeId: input.episodeId,
    profileId: profile.profileId,
    checks,
    hardBlockers,
    warnings,
    passed,
  };
  return { ...body, episodeQcSha256: sha256Canonical(body) };
}
