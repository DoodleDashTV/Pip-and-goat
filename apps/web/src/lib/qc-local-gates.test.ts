/**
 * Web vitest entry for @doodle-dash/qc-gates so full `pnpm test` covers local gates.
 * Implementation lives in packages/qc-gates (isolated from cloud orchestration).
 */
import { describe, expect, it } from 'vitest';
import {
  cameraOnlyStaticCharactersEvidence,
  evaluateLocalQcGates,
  validProductionEvidence,
} from '@doodle-dash/qc-gates';

describe('@doodle-dash/qc-gates via web vitest', () => {
  it('exports evaluateLocalQcGates and pass path', () => {
    const report = evaluateLocalQcGates(validProductionEvidence());
    expect(report.readyForCloudAcceptance).toBe(true);
  });

  it('critical regression: camera-only does not unlock cloud acceptance', () => {
    const report = evaluateLocalQcGates(cameraOnlyStaticCharactersEvidence());
    expect(report.gates.TECHNICAL_RENDER_VALID.status).toBe('PASS');
    expect(report.gates.PIP_MOTION_VALID.status).toBe('FAIL');
    expect(report.gates.GOAT_MOTION_VALID.status).toBe('FAIL');
    expect(report.gates.VISUAL_QUALITY_VALID.status).toBe('FAIL');
    expect(report.gates.READY_FOR_CLOUD_ACCEPTANCE.status).toBe('FAIL');
  });
});
