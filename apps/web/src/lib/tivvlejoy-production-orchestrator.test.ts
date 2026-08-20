import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSafeNextActions } from './tivvlejoy-production-studio/next-actions';
import { buildProductionStateGraph } from './tivvlejoy-production-studio/state-graph';
import { buildProductionStudioPlan, studioReadinessFor } from './tivvlejoy-production-studio/orchestrator';
import { compileEp012ProductionPacket } from './tivvlejoy-production-studio/fixtures';
import { evaluateEpisodeQc } from './tivvlejoy-production-studio/qc';
import { compileDeliveryPackage } from './tivvlejoy-production-studio/delivery';

const studioDir = path.resolve(__dirname, 'tivvlejoy-production-studio');

function studioSources(): string[] {
  return readdirSync(studioDir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => readFileSync(path.join(studioDir, name), 'utf8'));
}

describe('production orchestrator', () => {
  it('compiles an EP012 planning packet through the studio API', () => {
    const packet = compileEp012ProductionPacket();
    const plan = buildProductionStudioPlan({
      episodes: [
        {
          episodeId: packet.episodeId,
          episodeVersion: packet.episodeVersion,
          episodeNumber: 12,
          scriptSha256: packet.scriptSha256,
          shots: [{ shotId: 'SH001', locationId: 'bakery', dialogueRefs: ['DL_HOOK_01'], charactersVisible: ['PIP'] }],
          voiceReceipts: [{ dialogueRef: 'DL_HOOK_01', receiptRef: 'VR', receiptSha256: 'aa'.repeat(32), characterId: 'PIP' }],
        },
      ],
      evidenceClass: 'SYNTHETIC_PREVIEW',
    });
    expect(plan.packets[0]?.readiness).toBe('PLANNING_COMPLETE');
    expect(plan.studioReadiness).toBe('WAITING_FOR_CHARACTER_RIGS');
  });

  it('accepts the documented public input fields', () => {
    const plan = buildProductionStudioPlan({
      episodes: [
        {
          episodeId: 'EP001',
          episodeVersion: 'v1',
          episodeNumber: 1,
          scriptSha256: 'aa'.repeat(32),
          shots: [{ shotId: 'SH001', locationId: 'cave' }],
        },
      ],
      voiceReceipts: [],
      characterReadiness: { characterRigsResolved: false, pipRigVersion: 'UNRESOLVED_PRODUCTION_RIG' },
      visualApprovals: [],
      renderBackendReadiness: { authorized: false, backendId: 'none' },
      continuityFacts: [],
      deliveryProfiles: ['SHORT_60'],
      evidenceClass: 'SYNTHETIC_PREVIEW',
    });
    expect(plan.schemaVersion).toBe('TIVVLEJOY_PRODUCTION_STUDIO_ORCHESTRATOR_V1');
    expect(plan.safeNextActions.some((item) => item.label.includes('Review the mountain hero candidate'))).toBe(true);
  });

  it('never returns PRODUCTION_READY for synthetic evidence', () => {
    expect(
      studioReadinessFor({
        episodes: [],
        evidenceClass: 'SYNTHETIC_PREVIEW',
        characterReadiness: { characterRigsResolved: true },
      }),
    ).toBe('WAITING_FOR_REAL_ASSETS');
  });

  it('stays conservative even for an approved-plan evidence class without rigs', () => {
    expect(studioReadinessFor({ episodes: [], evidenceClass: 'APPROVED_PRODUCTION_PLAN' })).toBe('WAITING_FOR_CHARACTER_RIGS');
  });

  it('labels missing voices, rigs, approval, and paid render without claiming execution', () => {
    const graph = buildProductionStateGraph([
      {
        episodeId: 'EP001',
        scriptSha256: 'aa'.repeat(32),
        shots: [
          {
            shotId: 'SH001',
            locationId: 'bakery',
            dialogueRefs: ['DL_MISSING'],
            charactersVisible: ['PIP'],
          },
        ],
      },
    ]);
    const actions = buildSafeNextActions({
      graph,
      qcReports: [evaluateEpisodeQc({ episodeId: 'EP001' })],
      deliveries: [
        compileDeliveryPackage({
          episodeId: 'EP001',
          episodeVersion: 'v1',
          episodeNumber: 1,
          seasonNumber: 1,
          title: 'Test',
          productionPacketSha256: 'aa'.repeat(32),
          qcPassed: false,
        }),
      ],
    });
    expect(actions.some((item) => item.label === 'Receive and inspect the approved Pip production rig.')).toBe(true);
    expect(actions.some((item) => item.label === 'Confirm the episode dialogue receipt.')).toBe(true);
    expect(actions.some((item) => item.label === 'Review Shot 08 camera and performance.')).toBe(true);
    expect(actions.some((item) => item.label === 'Paid render authorization required')).toBe(true);
    expect(actions.every((item) => item.neverClaimsExecution)).toBe(true);
  });

  it('does not import child_process or spawn Blender', () => {
    const sources = studioSources().join('\n');
    expect(sources).not.toContain('child_process');
    expect(sources).not.toContain('spawnSync');
    expect(sources).not.toContain('spawn(');
    expect(sources).not.toMatch(/bpy\.|blender -b/);
  });

  it('does not call RunPod mutation endpoints or paid authorization', () => {
    const sources = studioSources().join('\n');
    expect(sources).not.toMatch(/runpod\.io|RUNPOD_API|method:\s*'POST'|method:\s*'DELETE'/i);
    expect(sources).not.toMatch(/paidComputeUsd|launchPod|createPod/);
  });

  it('does not auto-approve hero assets or visual scenes', () => {
    const sources = studioSources().join('\n');
    expect(sources).not.toMatch(/autoApprove|auto-approve|approvalState:\s*'APPROVED'/);
    expect(sources).not.toMatch(/visualApprovalAutoIssued/);
  });

  it('does not use purchased filenames or mutable latest as identity', () => {
    const sources = studioSources().join('\n');
    expect(sources).not.toMatch(/originalFilename|displayName/);
    expect(sources).not.toMatch(/mutableLatest|version:\s*'latest'/);
  });

  it('keeps Node builtins out of the studio library', () => {
    const sources = studioSources().join('\n');
    expect(sources).not.toContain("from 'node:fs'");
    expect(sources).not.toContain("from 'node:path'");
    expect(sources).not.toContain("from 'node:crypto'");
  });

  it('keeps the operator console labeled as synthetic preview data', () => {
    const ui = readFileSync(path.resolve(__dirname, '../components/preview/ProductionStudioConsole.tsx'), 'utf8');
    const page = readFileSync(path.resolve(__dirname, '../app/production-control/page.tsx'), 'utf8');
    expect(ui).toContain('PREVIEW / SYNTHETIC PRODUCTION DATA');
    expect(ui).toContain('Waiting for Pip production rig');
    expect(page).toContain('ProductionStudioConsole');
    expect(ui).not.toMatch(/Started GPU|Rendered|Uploaded/);
  });
});
