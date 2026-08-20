export const NIGHTSHIFT_SYNTHETIC_BANNER = 'PREVIEW / SYNTHETIC PRODUCTION DATA' as const;

export function nightshiftSafetyReport() {
  return {
    productionMutation: false,
    realProductionDatabaseConnected: false,
    pipGeometryMutated: false,
    goatGeometryMutated: false,
    productionRigModified: false,
    voiceIdentityMutated: false,
    commercialSourceModified: false,
    commercialBytesCommitted: false,
    embeddedCommercialScriptsExecuted: false,
    botaniqActivated: false,
    geoScatterIntegrated: false,
    gafferActivated: false,
    physicalStarlightActivated: false,
    runPodMutation: false,
    gpuLaunched: false,
    paidComputeUsd: 0,
    assetsAutoApproved: false,
    rigsAutoApproved: false,
    shotsAutoApproved: false,
    publishedContent: false,
    blenderExecuted: false,
    ffmpegFinalRender: false,
  } as const;
}

export function assertNeverClaimsProductionReady(state: string): void {
  if (state === 'PRODUCTION_READY') {
    throw new Error('Synthetic nightshift fixtures cannot claim PRODUCTION_READY.');
  }
}
