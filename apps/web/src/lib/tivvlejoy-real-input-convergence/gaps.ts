import { sha256Canonical } from './hash';
import type { FirstEpisodePreflight, GapLedger, MorningBrief, ProductionGap, VoiceConvergence } from './types';
import { GAP_LEDGER_SCHEMA } from './types';

function gap(partial: Omit<ProductionGap, 'evidenceSha256'>): ProductionGap {
  const evidenceSha256 = sha256Canonical(partial);
  return { ...partial, evidenceSha256 };
}

export function compileGapLedger(input: {
  preflight: FirstEpisodePreflight;
  voice: VoiceConvergence;
  realCandidates: number;
  humanApprovals: number;
  blenderAvailable: boolean;
}): GapLedger {
  const allShots = input.preflight.shots.map((shot) => shot.shotId);
  const dialogueShots = input.preflight.shots.filter((shot) => shot.columns.voice !== 'REAL_READY').map((shot) => shot.shotId);
  const gaps: ProductionGap[] = [
    gap({
      gapId: 'GAP_PIP_GOAT_PRODUCTION_RIGS',
      category: 'RIGS',
      exactDependency: 'External Pip and Goat production rig files with hash, inspection, and human approval',
      affectedEpisodes: ['EP012'],
      affectedShots: allShots,
      resolutionType: 'EXTERNAL_FILE_THEN_HUMAN_REVIEW',
      requiresHuman: true,
      requiresExternalFile: true,
      requiresPaidAction: false,
      priority: 1,
      blockingCriticalPath: true,
    }),
    gap({
      gapId: 'GAP_REAL_VOICE_RECEIPTS',
      category: 'VOICE',
      exactDependency: 'Real ElevenLabs-or-recorded receipts with at least line timing; fixtures are synthetic-only',
      affectedEpisodes: ['EP012'],
      affectedShots: dialogueShots,
      resolutionType: 'EXTERNAL_RECEIPT_RECONCILIATION',
      requiresHuman: true,
      requiresExternalFile: true,
      requiresPaidAction: false,
      priority: 2,
      blockingCriticalPath: true,
    }),
    gap({
      gapId: 'GAP_SCENERY_HUMAN_APPROVAL',
      category: 'SCENERY',
      exactDependency: 'Human visual approval of real inspected candidates. Inspection is not approval.',
      affectedEpisodes: ['EP012'],
      affectedShots: allShots,
      resolutionType: 'HUMAN_VISUAL_REVIEW',
      requiresHuman: true,
      requiresExternalFile: input.realCandidates === 0,
      requiresPaidAction: false,
      priority: 3,
      blockingCriticalPath: true,
    }),
    gap({
      gapId: 'GAP_BLENDER_DEEP_INSPECTION',
      category: 'BLENDER',
      exactDependency: 'Trusted Blender 4.2 pin plus isolated factory-startup deep inspection gate',
      affectedEpisodes: ['EP012'],
      affectedShots: allShots,
      resolutionType: 'LOCAL_TRUSTED_INSTALL_THEN_ISOLATED_INSPECT',
      requiresHuman: true,
      requiresExternalFile: !input.blenderAvailable,
      requiresPaidAction: false,
      priority: 4,
      blockingCriticalPath: true,
    }),
    gap({
      gapId: 'GAP_PAID_RENDER_AUTHORIZATION',
      category: 'RENDER',
      exactDependency: 'Explicit paid render authorization. No RunPod or GPU launch from this system.',
      affectedEpisodes: ['EP012'],
      affectedShots: allShots,
      resolutionType: 'PAID_AUTHORIZATION',
      requiresHuman: true,
      requiresExternalFile: false,
      requiresPaidAction: true,
      priority: 5,
      blockingCriticalPath: true,
    }),
    gap({
      gapId: 'GAP_SHOT_VISUAL_APPROVAL',
      category: 'SHOT_REVIEW',
      exactDependency: 'Human composition and final visual approval per shot',
      affectedEpisodes: ['EP012'],
      affectedShots: allShots,
      resolutionType: 'HUMAN_REVIEW',
      requiresHuman: true,
      requiresExternalFile: false,
      requiresPaidAction: false,
      priority: 6,
      blockingCriticalPath: true,
    }),
    gap({
      gapId: 'GAP_REAL_MEDIA_QC',
      category: 'QC',
      exactDependency: 'Actual rendered media file receipt before QC claims',
      affectedEpisodes: ['EP012'],
      affectedShots: allShots,
      resolutionType: 'WAIT_FOR_REAL_MEDIA',
      requiresHuman: true,
      requiresExternalFile: true,
      requiresPaidAction: true,
      priority: 7,
      blockingCriticalPath: false,
    }),
    gap({
      gapId: 'GAP_VOICE_EXACT_TIMING',
      category: 'VOICE',
      exactDependency: 'Word/phoneme timing receipts for animation and captions',
      affectedEpisodes: ['EP012'],
      affectedShots: dialogueShots,
      resolutionType: 'TIMING_RECEIPT_UPGRADE',
      requiresHuman: true,
      requiresExternalFile: true,
      requiresPaidAction: false,
      priority: 8,
      blockingCriticalPath: false,
    }),
    gap({
      gapId: 'GAP_FIRST_EPISODE_LOCK',
      category: 'LOCK',
      exactDependency: 'All real prerequisites before TIVVLEJOY_FIRST_EPISODE_PRODUCTION_LOCK_V1 can leave NOT_LOCKABLE',
      affectedEpisodes: ['EP012'],
      affectedShots: allShots,
      resolutionType: 'WAIT_FOR_REAL_PREREQUISITES',
      requiresHuman: true,
      requiresExternalFile: true,
      requiresPaidAction: true,
      priority: 9,
      blockingCriticalPath: true,
    }),
    gap({
      gapId: 'GAP_NO_NEW_SCENERY_PURCHASE',
      category: 'PURCHASE',
      exactDependency: 'Compare EP012 roles against inspected candidates and native procedural before any purchase',
      affectedEpisodes: ['EP012'],
      affectedShots: [],
      resolutionType: 'DO_NOT_BUY',
      requiresHuman: true,
      requiresExternalFile: false,
      requiresPaidAction: false,
      priority: 20,
      blockingCriticalPath: false,
    }),
  ];

  const readyWhileWaiting = [
    'Continue real scenery static inspection of budgeted small sources',
    'Reconcile remaining voice receipt metadata without synthesizing audio',
    'Review EP012 camera and staging plans as planning-only',
    'Prepare caption templates against missing real timing',
    'Keep the scenery visual-review queue ready for Justin',
    'Keep the rig-arrival intake surface ready for Michael/rigger',
    'Do not launch RunPod or GPU',
  ];

  return { schemaVersion: GAP_LEDGER_SCHEMA, gaps, readyWhileWaiting };
}

export function prioritizeGaps(ledger: GapLedger): ProductionGap[] {
  return [...ledger.gaps].sort((a, b) => {
    if (a.blockingCriticalPath !== b.blockingCriticalPath) return a.blockingCriticalPath ? -1 : 1;
    if (a.affectedShots.length !== b.affectedShots.length) return b.affectedShots.length - a.affectedShots.length;
    return a.priority - b.priority;
  });
}

export function morningBrief(input: {
  listedObjects: number;
  realDownloads: number;
  realInspections: number;
  realCandidates: number;
  voice: VoiceConvergence;
}): MorningBrief {
  return {
    whatChanged: [
      'Real private object inventory reconciliation is now a first-class system.',
      'EP012 first-episode preflight compiles honest real vs synthetic blockers.',
      'Rig arrival intake exists without requiring the actual rig files.',
    ],
    whatIsReal: [
      input.listedObjects > 0 ? `${input.listedObjects} private objects listed (identities hashed)` : 'Private listing was attempted',
      `${input.realDownloads} real sources materialized under budget`,
      `${input.realInspections} real static inspections`,
      `${input.voice.pipConfirmedRealReceipts + input.voice.goatConfirmedRealReceipts} real voice receipts bound`,
    ],
    whatIsStillSynthetic: [
      'Director / editorial / animation packages',
      'EP012 voice fixture hashes',
      'Approved-like scenery fixtures',
      'Any synthetic rig playbook rows',
    ],
    whatNeedsJustin: [
      'Human visual review of any real scenery candidates',
      'Shot composition review once rigs and scenery exist',
      'Release approval later — not now',
    ],
    whatNeedsMichaelOrRigger: ['Receive Pip production rig', 'Receive Goat production rig', 'Do not auto-approve either rig'],
    whatCouldCostMoney: [
      'Paid render authorization',
      'Unbudgeted R2 GET of multi-GB archives — not performed',
      'ElevenLabs synthesis — not performed',
    ],
    next5SafeActions: [
      'Receive Pip rig on /rig-arrival',
      'Receive Goat rig on /rig-arrival',
      'Review real scenery candidates if any are queued',
      'Confirm or generate missing EP012 real voice receipts',
      'Do not authorize paid render yet',
    ],
    secretsIncluded: false,
  };
}

export function firstEpisodeCriticalPath(ledger: GapLedger): string[] {
  return prioritizeGaps(ledger)
    .filter((gap) => gap.blockingCriticalPath)
    .map((gap) => gap.exactDependency);
}

export function nextSafeActions(ledger: GapLedger): string[] {
  return [
    'Receive Pip rig',
    'Receive Goat rig',
    'Confirm real EP012 voice receipts; do not synthesize',
    'Review scenery candidates without approving from filenames',
    'Review Shot 01-11 composition as planning-only',
    'Install approved Blender 4.2 only via trusted pin',
    'Keep Botaniq and addons inactive',
    'Do not buy new scenery until role coverage is compared',
    'Paid render authorization required later',
    ...ledger.readyWhileWaiting.slice(0, 1),
  ].slice(0, 10);
}

export function humanReviewPlaybook(): string[] {
  return [
    'scenery candidate review',
    'rig test pose review',
    'blocking review',
    'animation review',
    'lighting review',
    'final visual approval',
    'audio/edit review',
    'QC review',
    'release approval',
  ];
}
