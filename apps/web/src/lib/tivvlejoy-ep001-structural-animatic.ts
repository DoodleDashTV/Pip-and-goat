import { sha256Canonical } from '@/lib/tivvlejoy-character-animation/hash';
import { compileEp001AnimationBlockingBoard } from '@/lib/tivvlejoy-ep001-animation-blocking-board';
import { compileEp001AudioCueSheet } from '@/lib/tivvlejoy-ep001-audio-cue-sheet';
import { compileEp001ProductionPackage } from '@/lib/tivvlejoy-ep001-production-package';

export const EP001_STRUCTURAL_ANIMATIC_SCHEMA = 'TIVVLEJOY_EP001_STRUCTURAL_ANIMATIC_V1' as const;
export const EP001_STRUCTURAL_ANIMATIC_WATERMARK =
  'TIVVLEJOY STRUCTURAL PREVIZ - NOT FINAL' as const;

type Ep001Package = ReturnType<typeof compileEp001ProductionPackage>;
type Ep001AudioCueSheet = ReturnType<typeof compileEp001AudioCueSheet>;
type Ep001BlockingBoard = ReturnType<typeof compileEp001AnimationBlockingBoard>;

const SLATE_COPY: Record<string, string> = {
  EP001_SH01: 'A MAP FRAGMENT FLUTTERS FREE',
  EP001_SH02: 'PIP FINDS THE TORN MAP',
  EP001_SH03: 'GOAT TRACKS THE WIND',
  EP001_SH04: 'THE FRIENDS CHOOSE TO FOLLOW',
  EP001_SH05: 'THE CHASE REACHES THE MEADOW',
  EP001_SH06: 'GOAT SEARCHES LOW',
  EP001_SH07: 'PIP SEARCHES HIGH',
  EP001_SH08: 'TEAMWORK RECOVERS THE CLUE',
  EP001_SH09: 'THE MAP DRAWS A NEW PATH',
  EP001_SH10: 'ADVENTURE FIRST SNACKS SECOND',
};

const LOCATION_COLORS = {
  bakery: '0x294C60',
  main_street: '0x655034',
  forest_exit: '0x31543F',
} as const;

const QUALITY_GATES = [
  ['ANIMATIC_GATE_01', 'The production, audio, and blocking dependency hashes match exactly.'],
  ['ANIMATIC_GATE_02', 'All ten shot slates are contiguous with no frame gaps or overlaps.'],
  ['ANIMATIC_GATE_03', 'The structural animatic is exactly 1,800 frames at 30 fps.'],
  ['ANIMATIC_GATE_04', 'Every dialogue window stays within its bound shot.'],
  ['ANIMATIC_GATE_05', 'All 23 semantic SFX markers remain bound to exact frames.'],
  ['ANIMATIC_GATE_06', 'The output remains 9:16 at the approved 360x640 draft resolution.'],
  ['ANIMATIC_GATE_07', 'Every frame carries the structural-previz, not-final watermark.'],
  ['ANIMATIC_GATE_08', 'The output contains no voice, music, SFX, or copyrighted audio bytes.'],
  ['ANIMATIC_GATE_09', 'FFprobe confirms width, height, frame rate, duration, and frame count.'],
  [
    'ANIMATIC_GATE_10',
    'The local proof is reviewed only for timing and structure, not character quality.',
  ],
] as const;

function escapeDrawtext(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/%/g, '\\%')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function wrapWords(value: string, maxCharacters = 28): string[] {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharacters && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function assertSafeOutputPath(outputPath: string): void {
  const normalized = outputPath.replace(/\\/g, '/').toLowerCase();
  if (!normalized.endsWith('.mp4')) {
    throw new Error('EP001_ANIMATIC_OUTPUT_MUST_BE_MP4');
  }
  const pathSegments = normalized.split('/').filter(Boolean);
  if (
    pathSegments.some((segment) =>
      ['production-library', 'tivvlejoy-assets', 'source'].includes(segment),
    )
  ) {
    throw new Error('EP001_ANIMATIC_PROTECTED_OUTPUT_PATH');
  }
}

export function compileEp001StructuralAnimatic(
  episode: Ep001Package = compileEp001ProductionPackage(),
  audio: Ep001AudioCueSheet = compileEp001AudioCueSheet(episode),
  blocking: Ep001BlockingBoard = compileEp001AnimationBlockingBoard(episode, audio),
) {
  if (episode.episodeId !== 'EP001') throw new Error('EP001_ANIMATIC_WRONG_EPISODE');
  if (audio.productionPackageSha256 !== episode.packageSha256) {
    throw new Error('EP001_ANIMATIC_AUDIO_PACKAGE_MISMATCH');
  }
  if (
    blocking.productionPackageSha256 !== episode.packageSha256 ||
    blocking.audioCueSheetSha256 !== audio.cueSheetSha256
  ) {
    throw new Error('EP001_ANIMATIC_BLOCKING_PACKAGE_MISMATCH');
  }

  let expectedInFrame = 0;
  const slates = episode.shots.map((shot, index) => {
    if (shot.inFrame !== expectedInFrame) {
      throw new Error(`EP001_ANIMATIC_TIMELINE_GAP_OR_OVERLAP:${shot.shotId}`);
    }
    expectedInFrame = shot.outFrame;
    const title = SLATE_COPY[shot.shotId];
    if (!title) throw new Error(`EP001_ANIMATIC_SLATE_COPY_MISSING:${shot.shotId}`);
    const blockingShot = blocking.shots.find((candidate) => candidate.shotId === shot.shotId);
    if (!blockingShot) throw new Error(`EP001_ANIMATIC_BLOCKING_SHOT_MISSING:${shot.shotId}`);

    const dialogueWindows = audio.dialogueCues
      .filter((cue) => cue.shotId === shot.shotId)
      .map((cue) => ({
        lineId: cue.lineId,
        speaker: cue.speaker,
        text: cue.text,
        startFrame: cue.startFrame,
        endFrame: cue.endFrame,
        localStartSeconds: (cue.startFrame - shot.inFrame) / episode.format.fps,
        localEndSeconds: (cue.endFrame - shot.inFrame) / episode.format.fps,
      }));
    const sfxMarkers = audio.sfxCues
      .filter((cue) => cue.shotId === shot.shotId)
      .map((cue) => ({
        sfxEventId: cue.sfxEventId,
        semanticType: cue.semanticType,
        frame: cue.frame,
        localSeconds: (cue.frame - shot.inFrame) / episode.format.fps,
      }));

    return {
      slateId: `EP001_ANIMATIC_SLATE_${String(index + 1).padStart(2, '0')}`,
      shotId: shot.shotId,
      index: index + 1,
      title,
      beat: shot.beat,
      locationId: shot.locationId,
      backgroundColor: shot.shotId === 'EP001_SH09' ? '0x403A6E' : LOCATION_COLORS[shot.locationId],
      inFrame: shot.inFrame,
      outFrame: shot.outFrame,
      durationFrames: shot.durationFrames,
      startSeconds: shot.inFrame / episode.format.fps,
      endSeconds: shot.outFrame / episode.format.fps,
      durationSeconds: shot.durationFrames / episode.format.fps,
      cameraTemplateId: shot.cameraTemplateId,
      cameraMotion: shot.cameraMotion,
      charactersVisible: [...shot.charactersVisible],
      characterTrackCount: blockingShot.characterTracks.length,
      poseCueCount: blockingShot.characterTracks.flatMap((track) => track.poseCues).length,
      dialogueWindows,
      sfxMarkers,
      transition: shot.shotId === 'EP001_SH10' ? ('DISSOLVE_TO_BLACK' as const) : ('CUT' as const),
      watermark: EP001_STRUCTURAL_ANIMATIC_WATERMARK,
      realSceneMediaIncluded: false as const,
      realCharacterMediaIncluded: false as const,
      audioIncluded: false as const,
    };
  });
  if (expectedInFrame !== episode.format.totalFrames) {
    throw new Error('EP001_ANIMATIC_DURATION_MISMATCH');
  }

  const body = {
    schemaVersion: EP001_STRUCTURAL_ANIMATIC_SCHEMA,
    episodeId: episode.episodeId,
    workingTitle: episode.workingTitle,
    productionPackageSha256: episode.packageSha256,
    audioCueSheetSha256: audio.cueSheetSha256,
    animationBlockingBoardSha256: blocking.blockingBoardSha256,
    state: 'LOCAL_STRUCTURAL_ANIMATIC_READY_NOT_VISUAL_APPROVAL_MEDIA' as const,
    renderContract: {
      outputClass: 'LOCAL_PIPELINE_TEST' as const,
      renderTier: 'DRAFT_STRUCTURAL_PREVIZ' as const,
      width: 360 as const,
      height: 640 as const,
      aspectRatio: '9:16' as const,
      fps: episode.format.fps,
      totalFrames: episode.format.totalFrames,
      durationSeconds: episode.format.durationSeconds,
      codec: 'mpeg4' as const,
      pixelFormat: 'yuv420p' as const,
      audioMode: 'NO_AUDIO' as const,
      watermark: EP001_STRUCTURAL_ANIMATIC_WATERMARK,
    },
    slates,
    metrics: {
      slateCount: slates.length,
      cutCount: slates.filter((slate) => slate.transition === 'CUT').length,
      dissolveCount: slates.filter((slate) => slate.transition === 'DISSOLVE_TO_BLACK').length,
      dialogueWindowCount: slates.flatMap((slate) => slate.dialogueWindows).length,
      sfxMarkerCount: slates.flatMap((slate) => slate.sfxMarkers).length,
      characterTrackCount: slates.reduce((total, slate) => total + slate.characterTrackCount, 0),
      poseCueCount: slates.reduce((total, slate) => total + slate.poseCueCount, 0),
    },
    qualityGates: QUALITY_GATES.map(([gateId, label]) => ({
      gateId,
      label,
      planningCheckComplete: gateId !== 'ANIMATIC_GATE_09' && gateId !== 'ANIMATIC_GATE_10',
      realMediaApprovalComplete: false as const,
      autoApproval: false as const,
    })),
    authority: {
      localStructuralRenderAllowed: true as const,
      realRigRenderAllowed: false as const,
      voiceGenerationAllowed: false as const,
      paidComputeAllowed: false as const,
      finalRenderAllowed: false as const,
      productionWritesAllowed: false as const,
      humanVisualApprovalIssued: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      structuralColorSlatesOnly: true as const,
      realRigBytesIncluded: false as const,
      realSceneryBytesIncluded: false as const,
      audioBytesIncluded: false as const,
      localFilesystemWritesAllowed: true as const,
      networkCalls: 0 as const,
      paidRequests: 0 as const,
      remoteStorageMutations: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, structuralAnimaticSha256: sha256Canonical(body) };
}

export function compileEp001StructuralAnimaticCommand(input: {
  outputPath: string;
  fontFile: string;
  animatic?: ReturnType<typeof compileEp001StructuralAnimatic>;
}) {
  assertSafeOutputPath(input.outputPath);
  const animatic = input.animatic ?? compileEp001StructuralAnimatic();
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-nostdin'];

  for (const slate of animatic.slates) {
    args.push(
      '-f',
      'lavfi',
      '-t',
      slate.durationSeconds.toFixed(3),
      '-i',
      `color=c=${slate.backgroundColor}:s=${animatic.renderContract.width}x${animatic.renderContract.height}:r=${animatic.renderContract.fps}:d=${slate.durationSeconds.toFixed(3)}`,
    );
  }

  const filterChains = animatic.slates.map((slate, index) => {
    const font = `fontfile='${escapeDrawtext(input.fontFile)}'`;
    const filters = [
      `drawbox=x=0:y=0:w=iw:h=58:color=0x111827@0.88:t=fill`,
      `drawtext=${font}:text='${escapeDrawtext(animatic.renderContract.watermark)}':fontsize=14:fontcolor=white:x=(w-text_w)/2:y=21`,
      `drawtext=${font}:text='${escapeDrawtext(`${slate.shotId}  ${slate.beat}`)}':fontsize=22:fontcolor=0xF9D56E:x=24:y=108`,
      `drawtext=${font}:text='${escapeDrawtext(slate.title)}':fontsize=19:fontcolor=white:x=(w-text_w)/2:y=180`,
      `drawtext=${font}:text='${escapeDrawtext(`${slate.cameraTemplateId}  ${slate.cameraMotion}`)}':fontsize=12:fontcolor=0xD1D5DB:x=(w-text_w)/2:y=228`,
      `drawtext=${font}:text='${escapeDrawtext(slate.charactersVisible.join(' + '))}':fontsize=28:fontcolor=white:x=(w-text_w)/2:y=302`,
      `drawtext=${font}:text='${escapeDrawtext(`FRAMES ${slate.inFrame}-${slate.outFrame}  ${slate.startSeconds.toFixed(2)}s-${slate.endSeconds.toFixed(2)}s`)}':fontsize=13:fontcolor=0xD1D5DB:x=(w-text_w)/2:y=360`,
      `drawtext=${font}:text='${escapeDrawtext(`${slate.poseCueCount} POSE CUES  ${slate.sfxMarkers.length} SFX MARKERS`)}':fontsize=13:fontcolor=0xD1D5DB:x=(w-text_w)/2:y=392`,
      `drawbox=x=18:y=ih-132:w=iw-36:h=92:color=black@0.36:t=fill`,
      `drawtext=${font}:text='NO REAL RIGS OR AUDIO':fontsize=15:fontcolor=0xF9D56E:x=(w-text_w)/2:y=h-70`,
    ];

    for (const dialogue of slate.dialogueWindows) {
      const enable = `enable='between(t\\,${dialogue.localStartSeconds.toFixed(3)}\\,${dialogue.localEndSeconds.toFixed(3)})'`;
      filters.push(`drawbox=x=16:y=ih-178:w=iw-32:h=100:color=black@0.82:t=fill:${enable}`);
      const cleanDialogue = `${dialogue.speaker} ${dialogue.text}`
        .toUpperCase()
        .replace(/'/g, '')
        .replace(/[^A-Z0-9?!., -]/g, '');
      wrapWords(cleanDialogue).forEach((line, lineIndex) => {
        filters.push(
          `drawtext=${font}:text='${escapeDrawtext(line)}':fontsize=15:fontcolor=white:x=(w-text_w)/2:y=h-${156 - lineIndex * 22}:${enable}`,
        );
      });
    }
    if (slate.transition === 'DISSOLVE_TO_BLACK') {
      filters.push(`fade=t=out:st=${(slate.durationSeconds - 0.5).toFixed(3)}:d=0.500:color=black`);
    }
    return `[${index}:v]${filters.join(',')}[v${index}]`;
  });
  const concatInputs = animatic.slates.map((_, index) => `[v${index}]`).join('');
  filterChains.push(`${concatInputs}concat=n=${animatic.slates.length}:v=1:a=0[vout]`);
  const filterGraph = filterChains.join(';');

  args.push(
    '-filter_complex',
    filterGraph,
    '-map',
    '[vout]',
    '-an',
    '-frames:v',
    String(animatic.renderContract.totalFrames),
    '-c:v',
    animatic.renderContract.codec,
    '-q:v',
    '5',
    '-pix_fmt',
    animatic.renderContract.pixelFormat,
    '-r',
    String(animatic.renderContract.fps),
    input.outputPath,
  );

  const body = {
    kind: 'EP001_STRUCTURAL_ANIMATIC_RENDER' as const,
    args,
    filterGraph,
    outputPath: input.outputPath,
    structuralAnimaticSha256: animatic.structuralAnimaticSha256,
    paid: false as const,
    networkRequired: false as const,
    localFilesystemWrites: true as const,
    remoteStorageWrites: false as const,
    productionWrites: false as const,
  };
  return { ...body, commandSha256: sha256Canonical(body) };
}

export type Ep001StructuralAnimatic = ReturnType<typeof compileEp001StructuralAnimatic>;
