import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EP001_PRODUCTION_GATEWAY_SCHEMA,
  compileEp001ProductionGateway,
} from './tivvlejoy-ep001-production-gateway';

const repoRoot = path.resolve(__dirname, '../../../..');
function readRepo(relative: string): string { return readFileSync(path.join(repoRoot, relative), 'utf8'); }

describe('TIVVLEJOY_EP001_PRODUCTION_GATEWAY_V1', () => {
  it('compiles deterministically and exposes the eight-layer production chain', () => {
    const first = compileEp001ProductionGateway();
    const second = compileEp001ProductionGateway();
    expect(first.schemaVersion).toBe(EP001_PRODUCTION_GATEWAY_SCHEMA);
    expect(first.gatewaySha256).toBe(second.gatewaySha256);
    expect(first.gatewaySha256).toMatch(/^[a-f0-9]{64}$/);
    expect(first.stages).toHaveLength(8);
  });

  it('identifies external corrected rigs as the current critical path without claiming delivery', () => {
    const gateway = compileEp001ProductionGateway();
    expect(gateway.state).toBe('EXTERNAL_RIG_DELIVERY_IS_CURRENT_CRITICAL_PATH');
    expect(gateway.currentCriticalPath.owner).toBe('EXTERNAL_CHARACTER_ARTIST');
    expect(gateway.currentCriticalPath.requiredInputs).toEqual(['Corrected Goat production rig', 'Corrected Pip production rig']);
    expect(gateway.summary.externalWaitingCount).toBe(1);
  });

  it('keeps all execution and mutation authority closed', () => {
    const gateway = compileEp001ProductionGateway();
    expect(gateway.authority.rigAdmissionAllowed).toBe(false);
    expect(gateway.authority.animationExecutionAllowed).toBe(false);
    expect(gateway.authority.paidComputeAllowed).toBe(false);
    expect(gateway.authority.finalRenderAllowed).toBe(false);
    expect(gateway.authority.publishingAllowed).toBe(false);
    expect(gateway.authority.archiveWriteAllowed).toBe(false);
    expect(gateway.authority.productionWritesAllowed).toBe(false);
    expect(gateway.authority.autoApprovalAllowed).toBe(false);
  });

  it('keeps the Studio gateway route read-only', () => {
    const page = readRepo('apps/web/src/app/episode-one/production-gateway/page.tsx');
    expect(page).toContain('Episode 1 production gateway');
    expect(page).toContain('compileEp001ProductionGateway()');
    expect(page).not.toContain("'use client'");
    expect(page).not.toContain("'use server'");
    expect(page).not.toContain('fetch(');
    expect(page).not.toContain('<form');
    expect(page).not.toContain('onClick=');
  });
});
