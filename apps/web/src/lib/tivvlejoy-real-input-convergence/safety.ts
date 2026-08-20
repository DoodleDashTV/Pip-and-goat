export function realInputSafetyReport() {
  return {
    productionMutation: false,
    productionDatabaseConnected: false,
    commercialSourceModified: false,
    commercialBytesCommitted: false,
    commercialBytesRedistributed: false,
    embeddedScriptsExecuted: false,
    pipGeometryMutated: false,
    goatGeometryMutated: false,
    productionRigModified: false,
    voiceIdentityMutated: false,
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
  } as const;
}

export function assertNoSecrets(value: unknown): void {
  const text = JSON.stringify(value);
  if (/DATABASE_URL\s*=|R2_SECRET\s*=|postgres(?:ql)?:\/\/|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{16,}|rpa_[A-Za-z0-9]+|X-Amz-/i.test(text)) {
    throw new Error('Secret-bearing payload leaked into real-input evidence.');
  }
}

export const REALITY_BANNER = 'REAL PROJECT STATUS — not a synthetic simulation' as const;
export const SYNTHETIC_BANNER = 'SYNTHETIC SIMULATION — not real production evidence' as const;
