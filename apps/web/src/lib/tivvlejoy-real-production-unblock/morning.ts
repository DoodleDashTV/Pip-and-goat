import type {
  BlenderAcceptance,
  BlenderBootstrap,
  CommercialInspectionGate,
  FirstReadPlan,
  MorningOperatorPage,
  RealProductionTodo,
  RealReadAuthorization,
  RigArrivalChecklistRow,
  VoiceGenerationPlan,
} from './types';

export function compileMorningOperatorPage(input: {
  plan: FirstReadPlan;
  cost: RealReadAuthorization;
  voice: VoiceGenerationPlan;
  blender: BlenderBootstrap;
  acceptance: BlenderAcceptance;
  gate: CommercialInspectionGate;
  checklist: RigArrivalChecklistRow[];
  ledger: RealProductionTodo[];
}): MorningOperatorPage {
  const missingVoice = input.voice.lines.filter((line) => !line.historicalRealReceipt).length;
  return {
    title: 'FIRST REAL EPISODE',
    numberOneBlocker: 'Receive real Pip and Goat production rigs from the rigger.',
    rigStatus: `NOT_PRESENT · ${input.checklist.filter((row) => row.complete).length}/${input.checklist.length} checklist rows · no auto approval`,
    voiceReceiptStatus: `${missingVoice} of ${input.voice.lineCount} EP012 lines still missing real receipts. Generation performed=false.`,
    sceneryRealInspectionStatus: `${input.plan.selectedObjectCount} first-read objects selected from ${input.plan.listedObjectCount} listed. ${input.plan.commercialBytesDownloaded} commercial bytes downloaded. Cost ${input.cost.costState}.`,
    blenderStatus: input.blender.installedNow
      ? `Binary detected but untrusted. Acceptance ${input.acceptance.state}. Commercial deep inspection ready=${input.gate.ready}.`
      : `Not installed. Target ${input.blender.targetVersion}. Acceptance ${input.acceptance.state}. Commercial deep inspection ready=${input.gate.ready}.`,
    humanReviewStatus: '0 scenery approvals. 0 rig approvals. Inspection is not approval.',
    paidRenderStatus: 'AUTHORIZATION REQUIRED. Do not launch GPU.',
    next5Actions: [
      'Send the rigger the Pip/Goat receive list.',
      'Write or confirm the seven EP012 spoken lines.',
      'Do not download commercial scenery while cost is unknown.',
      'Pin the official Blender 4.2.2 SHA-256 before any install.',
      'Do not generate voices and do not start a paid render.',
    ],
    spendBanner: input.cost.provenZero ? 'AUTHORIZATION REQUIRED' : 'DO NOT SPEND MONEY YET',
  };
}
