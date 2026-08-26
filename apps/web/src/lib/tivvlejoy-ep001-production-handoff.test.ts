import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileEp001AnimationBlockingBoard } from './tivvlejoy-ep001-animation-blocking-board';
import { compileEp001AudioCueSheet } from './tivvlejoy-ep001-audio-cue-sheet';
import {
  EP001_PRODUCTION_HANDOFF_SCHEMA,
  compileEp001ProductionHandoff,
} from './tivvlejoy-ep001-production-handoff';
import { compileEp001ProductionPackage } from './tivvlejoy-ep001-production-package';
import { compileEp001RigHandoffMatrix } from './tivvlejoy-ep001-rig-handoff';
import { compileEp001SceneryPullSheet } from './tivvlejoy-ep001-scenery-pull-sheet';
import { compileEp001StructuralAnimatic } from './tivvlejoy-ep001-structural-animatic';

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepo = (relative: string) => readFileSync(path.join(repoRoot, relative), 'utf8');

describe('TIVVLEJOY_EP001_PRODUCTION_HANDOFF_V1', () => {
  it('binds all six immutable planning inputs deterministically', () => {
    const episode = compileEp001ProductionPackage();
    const audio = compileEp001AudioCueSheet(episode);
    const blocking = compileEp001AnimationBlockingBoard(episode, audio);
    const expectedShas = [
      episode.packageSha256,
      compileEp001RigHandoffMatrix(episode).matrixSha256,
      compileEp001SceneryPullSheet(episode).pullSheetSha256,
      audio.cueSheetSha256,
      blocking.blockingBoardSha256,
      compileEp001StructuralAnimatic(episode, audio, blocking).structuralAnimaticSha256,
    ];
    const first = compileEp001ProductionHandoff();
    const second = compileEp001ProductionHandoff();

    expect(first.schemaVersion).toBe(EP001_PRODUCTION_HANDOFF_SCHEMA);
    expect(first.dependencyGraph.map((node) => node.sha256)).toEqual(expectedShas);
    expect(first.dependencyGraph.every((node) => node.state === 'VERIFIED_PLANNING_INPUT')).toBe(
      true,
    );
    expect(first.handoffSha256).toBe(second.handoffSha256);
    expect(first.handoffSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps the dependency graph explicit and acyclic', () => {
    const handoff = compileEp001ProductionHandoff();
    const seen = new Set<string>();

    for (const node of handoff.dependencyGraph) {
      expect(node.dependsOn.every((dependency) => seen.has(dependency))).toBe(true);
      seen.add(node.nodeId);
    }
    expect(seen.size).toBe(6);
  });

  it('provides one ordered ten-step route from review to controlled preflight', () => {
    const handoff = compileEp001ProductionHandoff();

    expect(handoff.executionPlan).toHaveLength(10);
    expect(handoff.executionPlan.map((step) => step.ordinal)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(handoff.executionPlan[0]?.department).toBe('STORY_REVIEW');
    expect(handoff.executionPlan.at(-1)?.department).toBe('CONTROLLED_EXECUTION_PREFLIGHT');
    expect(handoff.executionPlan.every((step) => !step.complete && !step.autoAdvance)).toBe(true);
  });

  it('preserves every current readiness blocker without granting authority', () => {
    const handoff = compileEp001ProductionHandoff();

    expect(handoff.remainingBlockers.map((blocker) => blocker.code)).toEqual([
      'PIP_APPROVED_RIG_REQUIRED',
      'GOAT_APPROVED_RIG_REQUIRED',
      'APPROVED_SCENERY_BINDINGS_REQUIRED',
      'EXACT_VOICE_RECEIPTS_REQUIRED',
      'HUMAN_STORY_APPROVAL_REQUIRED',
      'HUMAN_VISUAL_APPROVAL_REQUIRED',
      'PAID_FINAL_RENDER_AUTHORIZATION_REQUIRED',
    ]);
    expect(handoff.authority).toMatchObject({
      planningHandoffComplete: true,
      assetAdmissionGranted: false,
      animationExecutionAllowed: false,
      paidComputeAllowed: false,
      launchAllowed: false,
      productionWritesAllowed: false,
      autoApprovalAllowed: false,
    });
  });

  it('summarizes the exact production scope with zero side effects', () => {
    const handoff = compileEp001ProductionHandoff();

    expect(handoff.metrics).toEqual({
      immutablePlanningInputCount: 6,
      executionStepCount: 10,
      blockerCount: 7,
      shotCount: 10,
      dialogueLineCount: 8,
      characterTrackCount: 20,
      poseCueCount: 80,
      sfxMarkerCount: 23,
      structuralAnimaticFrames: 1_800,
    });
    expect(handoff.safety).toMatchObject({
      networkCalls: 0,
      paidRequests: 0,
      remoteStorageMutations: 0,
      productionMutations: 0,
    });
  });

  it('renders a read-only handoff route linked from Episode 1 review', () => {
    const episodePage = readRepo('apps/web/src/app/episode-one/page.tsx');
    const handoffPage = readRepo('apps/web/src/app/episode-one/handoff/page.tsx');

    expect(episodePage).toContain("['/episode-one/handoff', 'Production handoff']");
    expect(episodePage).toContain('Open production handoff');
    expect(handoffPage).toContain('compileEp001ProductionHandoff()');
    expect(handoffPage).toContain('Planning complete. Execution still blocked.');
    expect(handoffPage).not.toContain("'use client'");
    expect(handoffPage).not.toContain("'use server'");
    expect(handoffPage).not.toContain('fetch(');
    expect(handoffPage).not.toContain('<form');
  });
});
