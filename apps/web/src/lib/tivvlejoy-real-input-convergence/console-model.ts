import { REALITY_BANNER, SYNTHETIC_BANNER } from './safety';
import type { compileRealInputConvergence } from './compile';

export type RealityMode = 'REAL_PROJECT_STATUS' | 'SYNTHETIC_SIMULATION';

export type EvidenceBadgeView = {
  label: 'REAL' | 'SYNTHETIC' | 'PENDING' | 'HUMAN APPROVAL' | 'PAID AUTH';
  readyFromFixtureOnly: false;
};

export function evidenceBadge(label: EvidenceBadgeView['label']): EvidenceBadgeView {
  return { label, readyFromFixtureOnly: false };
}

export function buildRealInputConsoleModel(
  report: Awaited<ReturnType<typeof compileRealInputConvergence>>,
  mode: RealityMode = 'REAL_PROJECT_STATUS',
) {
  return {
    mode,
    banner: mode === 'REAL_PROJECT_STATUS' ? REALITY_BANNER : SYNTHETIC_BANNER,
    episodeId: report.preflight.episodeId,
    title: report.preflight.title,
    listedObjects: report.inventory.objectCount,
    listingExecuted: report.inventory.listingExecuted,
    listingBlocker: report.inventory.blocker,
    totalListedBytes: report.inventory.totalBytes,
    downloads: report.counts.realSourcesDownloaded,
    hashesVerified: report.counts.realHashesVerified,
    inspections: report.counts.realSourcesStaticallyInspected,
    children: report.counts.realLogicalChildrenDiscovered,
    heroCandidates: report.counts.realHeroCandidates,
    interiorCandidates: report.counts.realInteriorCandidates,
    mountainCandidates: report.counts.realMountainCandidates,
    propCandidates: report.counts.realPropCandidates,
    reviewReady: report.counts.realCandidatesReadyForVisualReview,
    humanApprovals: report.counts.humanSceneryApprovalsIssued,
    approvedAssets: report.counts.realApprovedLogicalAssets,
    voice: report.voice,
    pipRig: report.rigs.pipStatus,
    goatRig: report.rigs.goatStatus,
    blenderInstalled: report.blender.installedNow,
    blenderReason: report.blender.reasonNotInstalled,
    subsystems: report.preflight.subsystems,
    shots: report.preflight.shots,
    shotCount: report.preflight.shotCount,
    realReadyShots: report.preflight.realReadyShots,
    partialShots: report.preflight.partialShots,
    blockedShots: report.preflight.blockedShots,
    criticalPath: report.criticalPath,
    gaps: report.prioritizedGaps.slice(0, 10),
    nextActions: report.nextSafeActions,
    morningBrief: report.morningBrief,
    lockState: report.lock.state,
    badges: [
      evidenceBadge(report.inventory.listingExecuted ? 'REAL' : 'PENDING'),
      evidenceBadge(report.voice.pipConfirmedRealReceipts + report.voice.goatConfirmedRealReceipts > 0 ? 'REAL' : 'SYNTHETIC'),
      evidenceBadge('HUMAN APPROVAL'),
      evidenceBadge('PAID AUTH'),
    ],
    noGreenReadyFromFixtures: true,
  };
}

export function buildRigArrivalConsoleModel(report: Awaited<ReturnType<typeof compileRealInputConvergence>>) {
  return {
    banner: REALITY_BANNER,
    pip: report.rigs.pip,
    goat: report.rigs.goat,
    pipPlaybook: report.syntheticRigPlaybook.pip.map((row) => ({
      state: row.state,
      evidenceClass: row.evidenceClass,
      autoApproved: row.autoApproved,
    })),
    goatPlaybook: report.syntheticRigPlaybook.goat.map((row) => ({
      state: row.state,
      evidenceClass: row.evidenceClass,
      autoApproved: row.autoApproved,
    })),
    requiredFiles: ['.blend or .glb or .fbx', 'SHA-256', 'byte size', 'Blender 4.2 compatibility note'],
    checklists: {
      capability: ['armature', 'face controls', 'body controls', 'test pose set'],
      testPose: ['neutral', 'smile', 'walk contact', 'silhouette'],
      humanReview: ['identity', 'deformation', 'storybook proportion', 'no auto-approval'],
    },
    admissionState: 'NOT_PRESENT' as const,
  };
}
