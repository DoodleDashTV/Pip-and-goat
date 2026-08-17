export const VOICE_PROGRESS_STEPS = ['Draft', 'Review', 'Approved', 'Package Ready'] as const;
export type VoiceProgressLabel = (typeof VOICE_PROGRESS_STEPS)[number];

export type VoiceProgressLine = {
  generationStatus: string;
  approvalStatus: string;
};

export function evaluateVoiceProgress(lines: VoiceProgressLine[]): {
  current: VoiceProgressLabel;
  steps: Array<{ label: VoiceProgressLabel; active: boolean; complete: boolean }>;
} {
  const hasLine = lines.length > 0;
  const hasFixture = lines.some(
    (line) => line.generationStatus === 'FIXTURE_GENERATED' || line.generationStatus === 'APPROVED_FOR_LIPSYNC',
  );
  const hasApproved = lines.some((line) => line.approvalStatus === 'APPROVED');
  const hasPending = lines.some((line) => line.approvalStatus === 'PENDING');
  const current: VoiceProgressLabel = !hasLine || !hasFixture
    ? 'Draft'
    : !hasApproved
      ? 'Review'
      : hasPending
        ? 'Approved'
        : 'Package Ready';
  const rank: Record<VoiceProgressLabel, number> = {
    Draft: 0,
    Review: 1,
    Approved: 2,
    'Package Ready': 3,
  };
  const currentRank = rank[current];
  return {
    current,
    steps: VOICE_PROGRESS_STEPS.map((label) => ({
      label,
      active: label === current,
      complete: rank[label] < currentRank || (label === 'Approved' && hasApproved),
    })),
  };
}

export const FINAL_RENDER_LOCKED_REASON =
  'Final rendering stays locked because theatrical gates are closed, paid voice generation is disabled, and this Preview only stores fixture audio. Approved lines can be packaged for later lip sync, not for a production render.';
