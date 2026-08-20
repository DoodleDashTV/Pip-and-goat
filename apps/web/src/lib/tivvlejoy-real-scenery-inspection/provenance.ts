import type { AbstractSourceReceipt, LicenseState, ProvenanceState } from './types';

export type ProvenanceLicenseReview = {
  provenanceState: ProvenanceState;
  licenseState: LicenseState;
  rawRedistributionAllowed: false;
  inferredRedistributionRights: false;
};

export function reviewProvenanceAndLicense(receipt: AbstractSourceReceipt): ProvenanceLicenseReview {
  return {
    provenanceState: receipt.provenanceState,
    licenseState: receipt.licenseState,
    rawRedistributionAllowed: false,
    inferredRedistributionRights: false,
  };
}
