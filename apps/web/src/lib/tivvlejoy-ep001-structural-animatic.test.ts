import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileEp001AnimationBlockingBoard } from './tivvlejoy-ep001-animation-blocking-board';
import { compileEp001AudioCueSheet } from './tivvlejoy-ep001-audio-cue-sheet';
import { compileEp001ProductionPackage } from './tivvlejoy-ep001-production-package';
import {
  EP001_STRUCTURAL_ANIMATIC_SCHEMA,
  EP001_STRUCTURAL_ANIMATIC_WATERMARK,
  compileEp001StructuralAnimatic,
  compileEp001StructuralAnimaticCommand,
} from './tivvlejoy-ep001-structural-animatic';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

describe('TIVVLEJOY_EP001_STRUCTURAL_ANIMATIC_V1', () => {
  it('binds deterministically to the exact production, audio, and blocking packages', () => {
    const episode = compileEp001ProductionPackage();
    const audio = compileEp001AudioCueSheet(episode);
    const blocking = compileEp001AnimationBlockingBoard(episode, audio);
    const first = compileEp001StructuralAnimatic(episode, audio, blocking);
    const second = compileEp001StructuralAnimatic(episode, audio, blocking);

    expect(first.schemaVersion).toBe(EP001_STRUCTURAL_ANIMATIC_SCHEMA);
    expect(first.productionPackageSha256).toBe(episode.packageSha256);
    expect(first.audioCueSheetSha256).toBe(audio.cueSheetSha256);
    expect(first.animationBlockingBoardSha256).toBe(blocking.blockingBoardSha256);
    expect(first.structuralAnimaticSha256).toBe(second.structuralAnimaticSha256);
    expect(first.structuralAnimaticSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('covers the exact 60-second timeline with ten contiguous slates', () => {
    const animatic = compileEp001StructuralAnimatic();

    expect(animatic.renderContract).toMatchObject({
      width: 360,
      height: 640,
      aspectRatio: '9:16',
      fps: 30,
      totalFrames: 1_800,
      durationSeconds: 60,
      audioMode: 'NO_AUDIO',
    });
    expect(animatic.slates).toHaveLength(10);
    expect(animatic.slates[0]).toMatchObject({ inFrame: 0, outFrame: 150 });
    expect(animatic.slates.at(-1)).toMatchObject({ inFrame: 1_620, outFrame: 1_800 });
    for (let index = 1; index < animatic.slates.length; index += 1) {
      expect(animatic.slates[index]!.inFrame).toBe(animatic.slates[index - 1]!.outFrame);
    }
    expect(animatic.slates.reduce((total, slate) => total + slate.durationFrames, 0)).toBe(1_800);
  });

  it('carries all structural character, pose, dialogue, and SFX timing markers', () => {
    const animatic = compileEp001StructuralAnimatic();

    expect(animatic.metrics).toEqual({
      slateCount: 10,
      cutCount: 9,
      dissolveCount: 1,
      dialogueWindowCount: 8,
      sfxMarkerCount: 23,
      characterTrackCount: 20,
      poseCueCount: 80,
    });
    for (const slate of animatic.slates) {
      expect(slate.poseCueCount).toBe(8);
      expect(slate.watermark).toBe(EP001_STRUCTURAL_ANIMATIC_WATERMARK);
      expect(slate.dialogueWindows.every((cue) => cue.startFrame >= slate.inFrame)).toBe(true);
      expect(slate.dialogueWindows.every((cue) => cue.endFrame <= slate.outFrame)).toBe(true);
      expect(slate.sfxMarkers.every((cue) => cue.frame >= slate.inFrame)).toBe(true);
      expect(slate.sfxMarkers.every((cue) => cue.frame < slate.outFrame)).toBe(true);
    }
  });

  it('builds a local-only FFmpeg command with a visible not-final watermark', () => {
    const command = compileEp001StructuralAnimaticCommand({
      outputPath: '/tmp/ep001-structural-animatic.mp4',
      fontFile: '/usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf',
    });

    expect(command.kind).toBe('EP001_STRUCTURAL_ANIMATIC_RENDER');
    expect(command.args.join(' ')).toContain('lavfi');
    expect(command.filterGraph).toContain(EP001_STRUCTURAL_ANIMATIC_WATERMARK);
    expect(command.filterGraph).toContain('NO REAL RIGS OR AUDIO');
    expect(command.args).toContain('1800');
    expect(command).toMatchObject({
      paid: false,
      networkRequired: false,
      localFilesystemWrites: true,
      remoteStorageWrites: false,
      productionWrites: false,
    });
    expect(command.commandSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('refuses protected or non-MP4 output paths and keeps all authority fail-closed', () => {
    expect(() =>
      compileEp001StructuralAnimaticCommand({
        outputPath: 'production-library/episodes/EP001.mp4',
        fontFile: '/tmp/font.otf',
      }),
    ).toThrow('EP001_ANIMATIC_PROTECTED_OUTPUT_PATH');
    expect(() =>
      compileEp001StructuralAnimaticCommand({
        outputPath: '/tmp/EP001.mov',
        fontFile: '/tmp/font.otf',
      }),
    ).toThrow('EP001_ANIMATIC_OUTPUT_MUST_BE_MP4');

    const animatic = compileEp001StructuralAnimatic();
    expect(animatic.authority).toEqual({
      localStructuralRenderAllowed: true,
      realRigRenderAllowed: false,
      voiceGenerationAllowed: false,
      paidComputeAllowed: false,
      finalRenderAllowed: false,
      productionWritesAllowed: false,
      humanVisualApprovalIssued: false,
      autoApprovalAllowed: false,
    });
    expect(animatic.safety).toMatchObject({
      networkCalls: 0,
      paidRequests: 0,
      remoteStorageMutations: 0,
      productionMutations: 0,
    });
  });

  it('renders a read-only Studio route linked from the Episode 1 review', () => {
    const episodePage = readRepo('apps/web/src/app/episode-one/page.tsx');
    const animaticPage = readRepo('apps/web/src/app/episode-one/animatic/page.tsx');
    const renderScript = readRepo('scripts/preproduction/render-ep001-structural-animatic.ts');

    expect(episodePage).toContain("['/episode-one/animatic', 'Structural animatic']");
    expect(episodePage).toContain('Open structural animatic');
    expect(animaticPage).toContain('compileEp001StructuralAnimatic()');
    expect(animaticPage).toContain('Exact 60-second timing proof');
    expect(animaticPage).toContain('Not character-quality approval media');
    expect(animaticPage).not.toContain("'use client'");
    expect(animaticPage).not.toContain("'use server'");
    expect(animaticPage).not.toContain('fetch(');
    expect(animaticPage).not.toContain('<form');
    expect(renderScript).toMatch(/spawnSync\(\s*'ffmpeg'/);
    expect(renderScript).toMatch(/spawnSync\(\s*'ffprobe'/);
  });
});
