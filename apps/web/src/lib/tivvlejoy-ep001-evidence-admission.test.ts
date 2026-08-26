import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileEp001AudioCueSheet } from './tivvlejoy-ep001-audio-cue-sheet';
import {
  EP001_EVIDENCE_ADMISSION_SCHEMA,
  compileEp001EvidenceAdmissionBoard,
  type Ep001EvidenceCandidates,
} from './tivvlejoy-ep001-evidence-admission';
import { compileEp001ProductionHandoff } from './tivvlejoy-ep001-production-handoff';
import { compileEp001ProductionPackage } from './tivvlejoy-ep001-production-package';
import { compileEp001RigHandoffMatrix } from './tivvlejoy-ep001-rig-handoff';
import { compileEp001SceneryPullSheet } from './tivvlejoy-ep001-scenery-pull-sheet';

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepo = (relative: string) => readFileSync(path.join(repoRoot, relative), 'utf8');
const hash = (token: string) => token.repeat(64).slice(0, 64);

function completeCandidatePacket(): Ep001EvidenceCandidates {
  const episode = compileEp001ProductionPackage();
  const rigs = compileEp001RigHandoffMatrix(episode);
  const scenery = compileEp001SceneryPullSheet(episode);
  const audio = compileEp001AudioCueSheet(episode);
  const handoff = compileEp001ProductionHandoff();
  const pip = rigs.characters.find((character) => character.characterId === 'PIP')!;
  const goat = rigs.characters.find((character) => character.characterId === 'GOAT')!;
  const pipRig = {
    characterId: 'PIP' as const,
    artifactSha256: hash('a'),
    byteSize: 90_000_000,
    extension: '.blend',
    rigMatrixSha256: rigs.matrixSha256,
    requiredControlCount: pip.admissionRequiredControls.length,
    requiredTestPoseCount: pip.requiredTestPoses.length,
    hashVerified: true,
    structureVerified: true,
    inspectionReportSha256: hash('b'),
    deformationMediaSha256: hash('c'),
    humanApprovalReceiptSha256: hash('d'),
  };
  const goatRig = {
    characterId: 'GOAT' as const,
    artifactSha256: hash('e'),
    byteSize: 298_161_606,
    extension: '.blend',
    rigMatrixSha256: rigs.matrixSha256,
    requiredControlCount: goat.admissionRequiredControls.length,
    requiredTestPoseCount: goat.requiredTestPoses.length,
    hashVerified: true,
    structureVerified: true,
    inspectionReportSha256: hash('f'),
    deformationMediaSha256: hash('1'),
    humanApprovalReceiptSha256: hash('2'),
  };
  return {
    pipRig,
    goatRig,
    scenery: {
      pullSheetSha256: scenery.pullSheetSha256,
      bindingManifestSha256: hash('3'),
      resolvedRoleCount: scenery.metrics.uniqueRequiredRoleCount,
      allSourcesHashVerified: true,
      allLicensesVerified: true,
      humanApprovalReceiptSha256: hash('4'),
    },
    voices: {
      cueSheetSha256: audio.cueSheetSha256,
      lineReceipts: episode.dialogue.map((line, index) => ({
        lineId: line.lineId,
        speaker: line.speaker,
        audioSha256: hash(String((index % 8) + 1)),
        timingSha256: hash(String(((index + 1) % 8) + 1)),
        humanApprovalReceiptSha256: hash(String(((index + 2) % 8) + 1)),
      })),
    },
    storyApproval: {
      subjectSha256: episode.packageSha256,
      decision: 'APPROVED',
      reviewerId: 'HUMAN_REVIEWER',
      receiptSha256: hash('5'),
    },
    visualApproval: {
      subjectSha256: handoff.handoffSha256,
      decision: 'APPROVED',
      reviewerId: 'HUMAN_REVIEWER',
      receiptSha256: hash('6'),
      realPlayblastSha256: hash('7'),
      pipRigSha256: pipRig.artifactSha256,
      goatRigSha256: goatRig.artifactSha256,
      reviewedShotCount: episode.shots.length,
    },
    paidAuthorization: {
      handoffSha256: handoff.handoffSha256,
      authorizationId: 'EP001_FINAL_RENDER_AUTH_V1',
      executionId: 'ep001-final-render-v1',
      immutableImageDigest: `sha256:${hash('8')}`,
      maxUsd: 3,
      expiresAt: '2099-01-01T00:00:00.000Z',
      receiptSha256: hash('9'),
    },
  };
}

describe('TIVVLEJOY_EP001_EVIDENCE_ADMISSION_V1', () => {
  it('compiles seven exact missing evidence classes deterministically', () => {
    const first = compileEp001EvidenceAdmissionBoard();
    const second = compileEp001EvidenceAdmissionBoard();

    expect(first.schemaVersion).toBe(EP001_EVIDENCE_ADMISSION_SCHEMA);
    expect(first.rows.map((row) => row.blockerCode)).toEqual([
      'PIP_APPROVED_RIG_REQUIRED',
      'GOAT_APPROVED_RIG_REQUIRED',
      'APPROVED_SCENERY_BINDINGS_REQUIRED',
      'EXACT_VOICE_RECEIPTS_REQUIRED',
      'HUMAN_STORY_APPROVAL_REQUIRED',
      'HUMAN_VISUAL_APPROVAL_REQUIRED',
      'PAID_FINAL_RENDER_AUTHORIZATION_REQUIRED',
    ]);
    expect(first.rows.every((row) => row.status === 'NOT_PRESENT')).toBe(true);
    expect(first.evidenceBoardSha256).toBe(second.evidenceBoardSha256);
    expect(first.evidenceBoardSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects malformed and mismatched evidence without resolving blockers', () => {
    const board = compileEp001EvidenceAdmissionBoard({
      goatRig: {
        characterId: 'GOAT',
        artifactSha256: 'bad',
        byteSize: 298_161_606,
        extension: '.exe',
        rigMatrixSha256: 'wrong',
        requiredControlCount: 0,
        requiredTestPoseCount: 0,
        hashVerified: false,
        structureVerified: false,
        inspectionReportSha256: 'bad',
        deformationMediaSha256: 'bad',
        humanApprovalReceiptSha256: 'bad',
      },
      voices: { cueSheetSha256: 'wrong', lineReceipts: [] },
    });
    const goat = board.rows.find((row) => row.blockerCode === 'GOAT_APPROVED_RIG_REQUIRED')!;
    const voices = board.rows.find((row) => row.blockerCode === 'EXACT_VOICE_RECEIPTS_REQUIRED')!;

    expect(goat.status).toBe('REJECTED');
    expect(goat.issues).toEqual(
      expect.arrayContaining([
        'RIG_MATRIX_BINDING_MISMATCH',
        'RIG_EXTENSION_REJECTED',
        'RIG_HASH_NOT_VERIFIED',
        'RIG_REQUIRED_CONTROL_COVERAGE_INCOMPLETE',
      ]),
    );
    expect(voices.status).toBe('REJECTED');
    expect(voices.issues).toContain('VOICE_RECEIPT_COUNT_MISMATCH');
    expect(board.metrics.resolvedBlockerCount).toBe(0);
  });

  it('accepts complete metadata only as candidates for separate manual gates', () => {
    const board = compileEp001EvidenceAdmissionBoard(completeCandidatePacket());

    expect(board.metrics).toEqual({
      evidenceClassCount: 7,
      notPresentCount: 0,
      rejectedCount: 0,
      candidateReadyCount: 7,
      resolvedBlockerCount: 0,
    });
    expect(board.rows.every((row) => row.status === 'CANDIDATE_READY_FOR_MANUAL_GATE')).toBe(true);
    expect(board.rows.every((row) => !row.blockerResolved && !row.autoAccepted)).toBe(true);
  });

  it('requires all eight uniquely bound voice line receipts', () => {
    const candidates = completeCandidatePacket();
    const duplicate = candidates.voices!.lineReceipts[0]!;
    candidates.voices!.lineReceipts = candidates.voices!.lineReceipts.map((receipt, index) =>
      index === 1 ? { ...duplicate } : receipt,
    );
    const voiceRow = compileEp001EvidenceAdmissionBoard(candidates).rows.find(
      (row) => row.blockerCode === 'EXACT_VOICE_RECEIPTS_REQUIRED',
    )!;

    expect(voiceRow.status).toBe('REJECTED');
    expect(voiceRow.issues).toContain('VOICE_DUPLICATE_LINE_RECEIPT');
    expect(voiceRow.issues.some((issue) => issue.startsWith('VOICE_LINE_RECEIPT_MISSING:'))).toBe(
      true,
    );
  });

  it('keeps all real execution and mutation authority fail-closed', () => {
    const board = compileEp001EvidenceAdmissionBoard(completeCandidatePacket());

    expect(board.authority).toMatchObject({
      evidenceInspectionAllowed: true,
      evidencePersistenceAllowed: false,
      blockerResolutionAllowed: false,
      rigAdmissionGranted: false,
      storyApprovalIssued: false,
      visualApprovalIssued: false,
      voiceProviderCallsAllowed: false,
      animationExecutionAllowed: false,
      paidComputeAllowed: false,
      launchAllowed: false,
      productionWritesAllowed: false,
      autoApprovalAllowed: false,
    });
    expect(board.safety).toMatchObject({
      sourceBytesRead: 0,
      networkCalls: 0,
      paidRequests: 0,
      remoteStorageMutations: 0,
      productionMutations: 0,
    });
  });

  it('renders a read-only evidence route linked from the handoff and Episode 1 review', () => {
    const episodePage = readRepo('apps/web/src/app/episode-one/page.tsx');
    const handoffPage = readRepo('apps/web/src/app/episode-one/handoff/page.tsx');
    const evidencePage = readRepo('apps/web/src/app/episode-one/evidence/page.tsx');

    expect(episodePage).toContain("['/episode-one/evidence', 'Evidence admission']");
    expect(handoffPage).toContain('Open evidence admission');
    expect(evidencePage).toContain('compileEp001EvidenceAdmissionBoard()');
    expect(evidencePage).toContain('No evidence has been admitted yet');
    expect(evidencePage).not.toContain("'use client'");
    expect(evidencePage).not.toContain("'use server'");
    expect(evidencePage).not.toContain('fetch(');
    expect(evidencePage).not.toContain('<form');
  });
});
