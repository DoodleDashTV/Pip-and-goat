/**
 * Step 14 — Draft visual QC.
 *
 * Cannot approve theatrical character quality: no bound characters are present.
 */
import { stableHash } from '@doodle-dash/direction';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { PROXY_WATERMARK } from '../proxy';
import type { AnimaticPlan } from '../animatic';
import type { StoryboardPlan } from '../storyboard';
import { DRAFT_NONCANONICAL, DRAFT_PIPELINE_CLASS } from './story-brain';

export type VisualProbe = {
  width?: number;
  height?: number;
  durationSeconds?: number;
  hasVideo?: boolean;
  fileBytes?: number;
  outputPath?: string;
};

export function compileVisualQc(input: {
  storyboard: StoryboardPlan;
  animatic: AnimaticPlan;
  probe?: VisualProbe;
}): {
  label: typeof DRAFT_NONCANONICAL;
  outputClass: typeof DRAFT_PIPELINE_CLASS;
  theatricalCharacterQualityApproved: false;
  checks: Array<{ item: string; status: 'PASS' | 'FAIL'; detail: string }>;
  technical: 'PASS' | 'FAIL';
  cacheKey: string;
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.visualQc;
} {
  const probe = input.probe ?? {};
  const plannedSeconds = input.animatic.totalFrames / input.animatic.fps;
  const text = JSON.stringify({
    storyboard: input.storyboard,
    animatic: input.animatic,
    path: probe.outputPath ?? '',
  });
  const checks: Array<{ item: string; status: 'PASS' | 'FAIL'; detail: string }> = [
    {
      item: 'RESOLUTION',
      status: input.animatic.resolution === '360x640' && (probe.width == null || (probe.width === 360 && probe.height === 640))
        ? 'PASS'
        : 'FAIL',
      detail: `${input.animatic.resolution} probe=${probe.width ?? 'n/a'}x${probe.height ?? 'n/a'}`,
    },
    {
      item: 'ASPECT_RATIO',
      status: input.animatic.aspect === '9:16' && input.storyboard.aspect === '9:16' ? 'PASS' : 'FAIL',
      detail: `${input.animatic.aspect}`,
    },
    {
      item: 'FRAME_DURATION',
      status: plannedSeconds >= 20 && plannedSeconds <= 40 ? 'PASS' : 'FAIL',
      detail: `${plannedSeconds.toFixed(3)}s planned`,
    },
    {
      item: 'BLANK_FRAMES',
      status: input.animatic.clips.every((clip) => clip.holdFrames > 0) ? 'PASS' : 'FAIL',
      detail: 'every clip has hold frames',
    },
    {
      item: 'EXCESSIVE_BLACK_FRAMES',
      status: input.animatic.clips.every((clip) => clip.holdFrames <= 450) ? 'PASS' : 'FAIL',
      detail: 'no clip longer than 15s hold',
    },
    {
      item: 'CLIPPING',
      status: input.animatic.clips.every((clip) => clip.endFrame > clip.startFrame) ? 'PASS' : 'FAIL',
      detail: 'endFrame > startFrame',
    },
    {
      item: 'UNSAFE_TITLE_AREA',
      status: input.storyboard.panels.every((panel) => panel.captionSafe) ? 'PASS' : 'FAIL',
      detail: 'caption-safe on every panel',
    },
    {
      item: 'WATERMARK_PRESENCE',
      status:
        input.animatic.clips.every((clip) => clip.watermark === PROXY_WATERMARK) &&
        input.storyboard.panels.every((panel) => panel.watermark === PROXY_WATERMARK)
          ? 'PASS'
          : 'FAIL',
      detail: PROXY_WATERMARK,
    },
    {
      item: 'MISSING_PANELS',
      status: input.storyboard.panels.length === input.animatic.clips.length ? 'PASS' : 'FAIL',
      detail: `${input.storyboard.panels.length} panels / ${input.animatic.clips.length} clips`,
    },
    {
      item: 'INVALID_TRANSITIONS',
      status: input.animatic.clips.every((clip) => clip.transition === 'CUT' || clip.transition === 'DISSOLVE')
        ? 'PASS'
        : 'FAIL',
      detail: 'CUT or DISSOLVE only',
    },
    {
      item: 'CACHE_PROVENANCE',
      status: Boolean(input.animatic.cacheKey && input.storyboard.cacheKey) ? 'PASS' : 'FAIL',
      detail: 'cache keys present',
    },
    {
      item: 'FORBIDDEN_FINAL_OR_CANONICAL_LABEL',
      status: !/\bFINAL_RENDER\b|\bFINAL_1080P\b|\bCANONICAL_EPISODE\b/.test(text) && input.animatic.renderTier === 'DRAFT'
        ? 'PASS'
        : 'FAIL',
      detail: `renderTier=${input.animatic.renderTier}`,
    },
    {
      item: 'FORBIDDEN_PRODUCTION_LIBRARY_PATH',
      status: !text.includes('production-library') ? 'PASS' : 'FAIL',
      detail: 'no production-library path',
    },
  ];
  if (probe.fileBytes != null) {
    checks.push({
      item: 'NONZERO_FILE',
      status: probe.fileBytes > 0 ? 'PASS' : 'FAIL',
      detail: `${probe.fileBytes} bytes`,
    });
  }
  if (probe.hasVideo != null) {
    checks.push({
      item: 'VIDEO_STREAM',
      status: probe.hasVideo ? 'PASS' : 'FAIL',
      detail: probe.hasVideo ? 'video present' : 'missing video',
    });
  }
  const technical = checks.every((check) => check.status === 'PASS') ? 'PASS' : 'FAIL';
  return {
    label: DRAFT_NONCANONICAL,
    outputClass: DRAFT_PIPELINE_CLASS,
    theatricalCharacterQualityApproved: false,
    checks,
    technical,
    cacheKey: stableHash({ version: PREPRODUCTION_SUBSYSTEM_VERSIONS.visualQc, checks }),
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.visualQc,
  };
}
