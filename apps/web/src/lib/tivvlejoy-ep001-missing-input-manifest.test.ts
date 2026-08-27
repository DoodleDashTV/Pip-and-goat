import { describe, expect, it } from 'vitest';
import { compileEp001MissingInputManifest } from '@/lib/tivvlejoy-ep001-missing-input-manifest';

describe('compileEp001MissingInputManifest', () => {
  it('lists all six missing external input classes and four phase-zero inputs', () => {
    const manifest = compileEp001MissingInputManifest();
    expect(manifest.metrics.missingInputCount).toBe(6);
    expect(manifest.metrics.phaseZeroMissingInputCount).toBe(4);
    expect(manifest.metrics.missingRigInputs).toBe(2);
    expect(manifest.metrics.missingPaidAuthorizationInputs).toBe(2);
    expect(manifest.metrics.missingHumanDecisionInputs).toBe(1);
    expect(manifest.metrics.missingLicenseInputs).toBe(1);
    expect(manifest.humanDecisionSummary.totalRows).toBe(23);
    expect(manifest.humanDecisionSummary.approvedRows).toBe(0);
    expect(manifest.missingInputs.every((input) => input.present === false)).toBe(true);
  });

  it('keeps required evidence and safe actions attached to each input', () => {
    const manifest = compileEp001MissingInputManifest();
    expect(manifest.missingInputs.every((input) => input.requiredArrivalEvidence.length > 0)).toBe(true);
    expect(manifest.missingInputs.every((input) => input.safeActionsAfterArrival.length > 0)).toBe(true);
    expect(manifest.authority.admissionGranted).toBe(false);
  });
});
