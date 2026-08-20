import type { FirstEpisodeUnblockReport } from './types';

export type FirstEpisodeOperatorModel = {
  title: 'FIRST REAL EPISODE';
  numberOneBlocker: string;
  rigStatus: string;
  voiceReceiptStatus: string;
  sceneryRealInspectionStatus: string;
  blenderStatus: string;
  humanReviewStatus: string;
  paidRenderStatus: string;
  next5Actions: string[];
  spendBanner: 'DO NOT SPEND MONEY YET' | 'AUTHORIZATION REQUIRED';
  selectedObjectCount: number;
  selectedTotalBytes: number;
  listedObjectCount: number;
  commercialDeepInspectionReady: false;
  voiceGenerationPerformed: false;
};

export function buildFirstEpisodeOperatorModel(report: FirstEpisodeUnblockReport): FirstEpisodeOperatorModel {
  return {
    title: 'FIRST REAL EPISODE',
    numberOneBlocker: report.morning.numberOneBlocker,
    rigStatus: report.morning.rigStatus,
    voiceReceiptStatus: report.morning.voiceReceiptStatus,
    sceneryRealInspectionStatus: report.morning.sceneryRealInspectionStatus,
    blenderStatus: report.morning.blenderStatus,
    humanReviewStatus: report.morning.humanReviewStatus,
    paidRenderStatus: report.morning.paidRenderStatus,
    next5Actions: report.morning.next5Actions,
    spendBanner: report.morning.spendBanner,
    selectedObjectCount: report.firstReadPlan.selectedObjectCount,
    selectedTotalBytes: report.firstReadPlan.selectedTotalBytes,
    listedObjectCount: report.firstReadPlan.listedObjectCount,
    commercialDeepInspectionReady: false,
    voiceGenerationPerformed: false,
  };
}

export function fallbackFirstEpisodeOperatorModel(): FirstEpisodeOperatorModel {
  return {
    title: 'FIRST REAL EPISODE',
    numberOneBlocker: 'Receive real Pip and Goat production rigs from the rigger.',
    rigStatus: 'NOT_PRESENT',
    voiceReceiptStatus: '7 of 7 EP012 lines missing real receipts.',
    sceneryRealInspectionStatus: 'Listing only. No commercial bytes downloaded.',
    blenderStatus: 'Not installed. Target 4.2.2. Trust pin missing.',
    humanReviewStatus: '0 approvals.',
    paidRenderStatus: 'AUTHORIZATION REQUIRED. Do not launch GPU.',
    next5Actions: [
      'Send the rigger the Pip/Goat receive list.',
      'Write or confirm the seven EP012 spoken lines.',
      'Do not download commercial scenery while cost is unknown.',
      'Pin the official Blender 4.2.2 SHA-256 before any install.',
      'Do not generate voices and do not start a paid render.',
    ],
    spendBanner: 'DO NOT SPEND MONEY YET',
    selectedObjectCount: 0,
    selectedTotalBytes: 0,
    listedObjectCount: 0,
    commercialDeepInspectionReady: false,
    voiceGenerationPerformed: false,
  };
}
