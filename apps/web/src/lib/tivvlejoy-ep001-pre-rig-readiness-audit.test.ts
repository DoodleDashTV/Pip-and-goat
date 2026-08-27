import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EP001_PRE_RIG_READINESS_AUDIT_SCHEMA,
  compileEp001PreRigReadinessAudit,
} from './tivvlejoy-ep001-pre-rig-readiness-audit';

const repoRoot = path.resolve(__dirname, '../../../..');
function readRepo(relative: string): string { return readFileSync(path.join(repoRoot, relative), 'utf8'); }

describe('TIVVLEJOY_EP001_PRE_RIG_READINESS_AUDIT_V1', () => {
  it('compiles deterministically with all planning rows ready', () => {
    const first = compileEp001PreRigReadinessAudit();
    const second = compileEp001PreRigReadinessAudit();
    expect(first.schemaVersion).toBe(EP001_PRE_RIG_READINESS_AUDIT_SCHEMA);
    expect(first.preRigReadinessAuditSha256).toBe(second.preRigReadinessAuditSha256);
    expect(first.preRigReadinessAuditSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.metrics.auditRowCount).toBe(12);
    expect(first.metrics.planningReadyCount).toBe(12);
  });

  it('does not pretend absent character files or external evidence exist', () => {
    const audit = compileEp001PreRigReadinessAudit();
    expect(audit.metrics.physicalCharacterAssetCountRequired).toBe(2);
    expect(audit.metrics.physicalCharacterAssetCountPresent).toBe(0);
    expect(audit.physicalAssetBlockers.every((item) => item.present === false)).toBe(true);
    expect(audit.currentConclusion.externalVoiceExecutionStillRequired).toBe(true);
    expect(audit.currentConclusion.externalSceneryEvidenceStillRequired).toBe(true);
    expect(audit.currentConclusion.humanDecisionsStillRequired).toBe(true);
  });

  it('refuses pointless paid compute before admitted rig arrival', () => {
    const audit = compileEp001PreRigReadinessAudit();
    expect(audit.currentConclusion.autonomousEngineeringRemaining).toBe(false);
    expect(audit.currentConclusion.safePaidComputeUsefulBeforeRigArrival).toBe(false);
    expect(audit.authority.paidComputeExecutionAllowed).toBe(false);
    expect(audit.authority.animationExecutionAllowed).toBe(false);
    expect(audit.authority.autoApprovalAllowed).toBe(false);
  });

  it('keeps the Studio route read-only', () => {
    const page = readRepo('apps/web/src/app/episode-one/pre-rig-readiness/page.tsx');
    expect(page).toContain('Pre-rig readiness audit');
    expect(page).toContain('compileEp001PreRigReadinessAudit()');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('onClick=');
  });
});
