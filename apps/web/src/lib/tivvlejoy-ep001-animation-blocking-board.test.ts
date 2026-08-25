import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileEp001AudioCueSheet } from './tivvlejoy-ep001-audio-cue-sheet';
import {
  EP001_ANIMATION_BLOCKING_BOARD_SCHEMA,
  compileEp001AnimationBlockingBoard,
} from './tivvlejoy-ep001-animation-blocking-board';
import { compileEp001ProductionPackage } from './tivvlejoy-ep001-production-package';

const repoRoot = path.resolve(__dirname, '../../../..');

function readRepo(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

describe('TIVVLEJOY_EP001_ANIMATION_BLOCKING_BOARD_V1', () => {
  it('compiles deterministically against the exact production and audio packages', () => {
    const episode = compileEp001ProductionPackage();
    const audio = compileEp001AudioCueSheet(episode);
    const first = compileEp001AnimationBlockingBoard(episode, audio);
    const second = compileEp001AnimationBlockingBoard(episode, audio);

    expect(first.schemaVersion).toBe(EP001_ANIMATION_BLOCKING_BOARD_SCHEMA);
    expect(first.productionPackageSha256).toBe(episode.packageSha256);
    expect(first.audioCueSheetSha256).toBe(audio.cueSheetSha256);
    expect(first.blockingBoardSha256).toBe(second.blockingBoardSha256);
    expect(first.blockingBoardSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('covers all ten shots with twenty character tracks and eighty ordered pose cues', () => {
    const board = compileEp001AnimationBlockingBoard();

    expect(board.metrics).toMatchObject({
      shotCount: 10,
      characterTrackCount: 20,
      pipTrackCount: 10,
      goatTrackCount: 10,
      poseCueCount: 80,
      speakingTrackCount: 8,
      locomotionTrackCount: 11,
      dialogueSyncCueCount: 8,
      sfxSyncCueCount: 23,
    });
    for (const shot of board.shots) {
      expect(shot.characterTracks).toHaveLength(2);
      for (const track of shot.characterTracks) {
        expect(track.poseCues).toHaveLength(4);
        expect(track.poseCues.map((pose) => pose.frame)).toEqual(
          [...track.poseCues.map((pose) => pose.frame)].sort((left, right) => left - right),
        );
        expect(
          track.poseCues.every(
            (pose) =>
              pose.frame >= shot.inFrame &&
              pose.frame < shot.outFrame &&
              pose.mustRemainStepped === true,
          ),
        ).toBe(true);
      }
    }
  });

  it('preserves every locked performance action, goal, target, and continuity rule', () => {
    const episode = compileEp001ProductionPackage();
    const board = compileEp001AnimationBlockingBoard(episode);

    for (const shot of board.shots) {
      const sourceShot = episode.shots.find((candidate) => candidate.shotId === shot.shotId)!;
      expect(shot.continuity).toEqual(sourceShot.continuity);
      expect(shot.cameraTemplateId).toBe(sourceShot.cameraTemplateId);
      for (const track of shot.characterTracks) {
        const sourceCue = sourceShot.performance[track.characterId]!;
        expect(track).toMatchObject({
          emotion: sourceCue.emotion,
          storyGoal: sourceCue.storyGoal,
          attentionTarget: sourceCue.attentionTarget,
          locomotion: sourceCue.locomotion,
          gesture: sourceCue.gesture,
        });
        expect(track.intendedActions).toEqual(sourceCue.intendedActions);
        expect(track.semanticAnimationDependencySha256).toMatch(/^[a-f0-9]{64}$/);
      }
    }
  });

  it('aligns dialogue reactions while refusing invented mouth timing', () => {
    const episode = compileEp001ProductionPackage();
    const board = compileEp001AnimationBlockingBoard(episode);

    for (const line of episode.dialogue) {
      const shot = board.shots.find((candidate) => candidate.shotId === line.shotId)!;
      const midpoint = Math.round((line.startFrame + line.endFrame) / 2);
      for (const track of shot.characterTracks) {
        const reaction = track.poseCues[2]!;
        expect(reaction.frame).toBe(midpoint);
        if (track.characterId === line.speaker) {
          expect(reaction.kind).toBe('DIALOGUE_ACCENT');
          expect(track.mouthTimingState).toBe('BLOCKED_AWAITING_EXACT_APPROVED_VOICE_TIMING');
        } else {
          expect(reaction.kind).toBe('PARTNER_REACTION');
          expect(track.mouthTimingState).toBe('NOT_APPLICABLE');
        }
      }
    }
  });

  it('keeps execution, paid services, storage, and approval fail-closed', () => {
    const board = compileEp001AnimationBlockingBoard();

    expect(board.state).toBe('BLOCKING_PLAN_READY_EXECUTION_BLOCKED');
    expect(board.qualityGates).toHaveLength(14);
    expect(board.qualityGates.every((gate) => !gate.complete && !gate.autoApproval)).toBe(true);
    expect(board.authority).toEqual({
      rigAdmissionGranted: false,
      blockingExecutionAllowed: false,
      animationBakeAllowed: false,
      exactVoiceTimingBound: false,
      paidComputeAllowed: false,
      productionWritesAllowed: false,
      autoApprovalAllowed: false,
    });
    expect(board.safety).toEqual({
      semanticBlockingOnly: true,
      transformCurvesAuthored: false,
      boneKeyframesAuthored: false,
      rigBytesIncluded: false,
      audioBytesIncluded: false,
      networkCalls: 0,
      paidRequests: 0,
      storageMutations: 0,
      productionMutations: 0,
    });
  });

  it('renders a read-only Studio route linked from the Episode 1 review', () => {
    const episodePage = readRepo('apps/web/src/app/episode-one/page.tsx');
    const animationPage = readRepo('apps/web/src/app/episode-one/animation/page.tsx');

    expect(episodePage).toContain("['/episode-one/animation', 'Animation blocking']");
    expect(episodePage).toContain('Open animation board');
    expect(animationPage).toContain('compileEp001AnimationBlockingBoard()');
    expect(animationPage).toContain('80 locked pose cues');
    expect(animationPage).toContain('Real rigs and voice timing still required');
    expect(animationPage).toContain('zero paid requests');
    expect(animationPage).not.toContain("'use client'");
    expect(animationPage).not.toContain("'use server'");
    expect(animationPage).not.toContain('fetch(');
    expect(animationPage).not.toContain('onClick=');
    expect(animationPage).not.toContain('<form');
  });
});
