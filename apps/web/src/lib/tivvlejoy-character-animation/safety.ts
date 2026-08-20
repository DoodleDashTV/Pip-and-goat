export const ANIMATION_SAFETY = {
  blenderExecuted: false,
  pipGeometryMutated: false,
  goatGeometryMutated: false,
  productionRigModified: false,
  voiceIdentityMutated: false,
  commercialBytesRead: false,
  runPodMutation: false,
  gpuLaunched: false,
  paidComputeUsd: 0,
  productionMutation: false,
  autoApproveRigs: false,
  autoApproveAnimation: false,
  autoApproveVisualShots: false,
} as const;

export function animationSafetyReport() {
  return { ...ANIMATION_SAFETY };
}
