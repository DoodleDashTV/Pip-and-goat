import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_REQUIRED_GATES,
  REQUIRED_SCENE_GATES,
  evaluateLocalQualityGates,
  assertLocalQualityGates,
} from './local-quality-gates';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

/** The local quality-repair scripts. None may touch paid infrastructure. */
const LOCAL_SCRIPTS = [
  'scripts/blender/ddp_rig.py',
  'scripts/assets/audit_rig.py',
  'scripts/assets/repair_rigs.py',
  'scripts/assets/scene_gates.py',
  'scripts/assets/local_acceptance.py',
  'scripts/assets/test_rig_gates.py',
  'scripts/assets/run_gate_faults.sh',
];

const ASSET_SHA = {
  pip: 'a'.repeat(64),
  goat: 'b'.repeat(64),
  meadow: 'c'.repeat(64),
  map: 'd'.repeat(64),
};

function passingSceneReport(overrides: Record<string, unknown> = {}) {
  return {
    status: 'PASS',
    gates: Object.fromEntries(REQUIRED_SCENE_GATES.map((g) => [g, true])),
    assetSha256: { ...ASSET_SHA },
    ...overrides,
  };
}

const passingLocalReport = { status: 'PASS', gate: { LOCAL_VISUAL_ACCEPTANCE: true } };

describe('local quality gates', () => {
  it('passes when every gate is true and assets match', () => {
    const result = evaluateLocalQualityGates(passingSceneReport(), passingLocalReport, ASSET_SHA);
    expect(result.ok).toBe(true);
    expect(result.failed).toEqual([]);
    expect(result.missing).toEqual([]);
    for (const gate of ALL_REQUIRED_GATES) {
      expect(result.gates[gate]).toBe(true);
    }
  });

  it.each(REQUIRED_SCENE_GATES)('fails closed when %s is false', (gate) => {
    const report = passingSceneReport();
    (report.gates as Record<string, boolean>)[gate] = false;
    const result = evaluateLocalQualityGates(report, passingLocalReport, ASSET_SHA);
    expect(result.ok).toBe(false);
    expect(result.failed).toContain(gate);
  });

  it('fails closed when the local visual acceptance gate is false', () => {
    const result = evaluateLocalQualityGates(
      passingSceneReport(),
      { gate: { LOCAL_VISUAL_ACCEPTANCE: false } },
      ASSET_SHA,
    );
    expect(result.ok).toBe(false);
    expect(result.failed).toContain('LOCAL_VISUAL_ACCEPTANCE');
  });

  it('fails closed when a report is missing entirely', () => {
    expect(evaluateLocalQualityGates(null, passingLocalReport).ok).toBe(false);
    expect(evaluateLocalQualityGates(passingSceneReport(), null).ok).toBe(false);
    expect(evaluateLocalQualityGates(undefined, undefined).ok).toBe(false);
  });

  it('fails closed when a gate value is not a boolean', () => {
    const report = passingSceneReport();
    (report.gates as Record<string, unknown>).PIP_MOTION_VALID = 'true';
    const result = evaluateLocalQualityGates(report, passingLocalReport, ASSET_SHA);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('PIP_MOTION_VALID');
  });

  it('refuses a report that was produced with an injected fault', () => {
    const report = passingSceneReport({ injectedFault: 'camera-only' });
    const result = evaluateLocalQualityGates(report, passingLocalReport, ASSET_SHA);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('injected fault');
  });

  it('refuses stale gates when the assets changed since they ran', () => {
    const result = evaluateLocalQualityGates(passingSceneReport(), passingLocalReport, {
      ...ASSET_SHA,
      pip: 'f'.repeat(64),
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('asset pip changed since gates ran');
  });

  it('requires recorded asset hashes when hashes are supplied', () => {
    const report = passingSceneReport();
    delete (report as Record<string, unknown>).assetSha256;
    const result = evaluateLocalQualityGates(report, passingLocalReport, ASSET_SHA);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('does not record asset hashes');
  });

  it('throws from the assert helper so a paid launch cannot proceed', () => {
    expect(() => assertLocalQualityGates(passingSceneReport(), passingLocalReport, ASSET_SHA)).not.toThrow();
    expect(() =>
      assertLocalQualityGates(passingSceneReport({ gates: { RIG_BINDING_VALID: false } }), passingLocalReport),
    ).toThrow(/LOCAL_QUALITY_GATES_FAILED/);
  });
});

describe('local quality repair stays local', () => {
  // Matches real paid-infrastructure usage rather than the word "Runpod", which
  // legitimately appears in these files' docstrings saying they never use it.
  const FORBIDDEN = [
    /RUNPOD_API_KEY/,
    /RunpodClient/,
    /runpod\.io/i,
    /podFindAndDeploy/i,
    /terminatePod/i,
    /createPodForBenchmark/,
    /ALLOW_PAID_GPU_LAUNCH\s*=\s*['"]?true/i,
    /CLOUD_RENDER_ENABLED\s*=\s*['"]?true/i,
  ];

  it.each(LOCAL_SCRIPTS)('%s never touches paid GPU infrastructure', (relative) => {
    const source = readFileSync(path.join(REPO_ROOT, relative), 'utf8');
    for (const pattern of FORBIDDEN) {
      expect(source, `${relative} must not match ${pattern}`).not.toMatch(pattern);
    }
  });

  it('does not enable paid GPU launch while tests run', () => {
    expect(process.env.ALLOW_PAID_GPU_LAUNCH ?? 'false').not.toBe('true');
    expect(process.env.CLOUD_RENDER_ENABLED ?? 'false').not.toBe('true');
  });
});
