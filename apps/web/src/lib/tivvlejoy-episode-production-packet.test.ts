import { describe, expect, it } from 'vitest';
import { compileEpisodeProductionPacket } from './tivvlejoy-production-studio/packet';
import { compileEp012ProductionPacket } from './tivvlejoy-production-studio/fixtures';

function packet(overrides: Partial<Parameters<typeof compileEpisodeProductionPacket>[0]> = {}) {
  return compileEpisodeProductionPacket({
    episodeId: 'EP012',
    episodeVersion: 'v1',
    scriptSha256: 'aa'.repeat(32),
    shots: [
      { shotId: 'SH001', locationId: 'bakery', assemblyDependencySha256: 'bb'.repeat(32), environmentDependencySha256: 'cc'.repeat(32), dialogueRefs: ['DL_HOOK_01'], charactersVisible: ['PIP'] },
    ],
    voiceReceipts: [{ dialogueRef: 'DL_HOOK_01', receiptRef: 'VR', receiptSha256: 'dd'.repeat(32), characterId: 'PIP' }],
    characterRigsResolved: false,
    pipRigVersion: 'UNRESOLVED_PRODUCTION_RIG',
    ...overrides,
  });
}

describe('episode production packets', () => {
  it('compiles a deterministic packet', () => {
    expect(packet().productionPacketSha256).toBe(packet().productionPacketSha256);
  });

  it('ignores shot input order', () => {
    const a = compileEpisodeProductionPacket({
      episodeId: 'EP1',
      episodeVersion: 'v1',
      scriptSha256: 'aa'.repeat(32),
      shots: [
        { shotId: 'SH002', locationId: 'forest_exit' },
        { shotId: 'SH001', locationId: 'bakery' },
      ],
    });
    const b = compileEpisodeProductionPacket({
      episodeId: 'EP1',
      episodeVersion: 'v1',
      scriptSha256: 'aa'.repeat(32),
      shots: [
        { shotId: 'SH001', locationId: 'bakery' },
        { shotId: 'SH002', locationId: 'forest_exit' },
      ],
    });
    expect(a.productionPacketSha256).toBe(b.productionPacketSha256);
  });

  it('includes all required dependency hashes', () => {
    const compiled = packet();
    for (const key of ['scriptSha256', 'voiceDependencySha256', 'environmentDependencySha256', 'characterDependencySha256', 'continuityDependencySha256', 'shotAssemblyDependencySha256', 'renderDependencySha256', 'qcDependencySha256', 'productionPacketSha256']) {
      expect(compiled[key as keyof typeof compiled]).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('stays PLANNING_COMPLETE when Pip/Goat rigs are unresolved', () => {
    expect(packet().readiness).toBe('PLANNING_COMPLETE');
    expect(packet().readiness).not.toBe('REAL_PRODUCTION_READY');
  });

  it('never becomes REAL_PRODUCTION_READY from synthetic packets', () => {
    expect(packet({ characterRigsResolved: true, pipRigVersion: 'PIP_V1', goatRigVersion: 'GOAT_V1' }).readiness).not.toBe('REAL_PRODUCTION_READY');
  });

  it('reports the exact character blocker', () => {
    expect(packet().reasons.find((item) => item.key === 'character')?.reason).toMatch(/UNRESOLVED_PRODUCTION_RIG/);
    expect(packet().reasons.find((item) => item.key === 'character')?.blocksRealProduction).toBe(true);
  });

  it('reports missing voice receipts', () => {
    const compiled = packet({ voiceReceipts: [] });
    expect(compiled.reasons.find((item) => item.key === 'voice')?.reason).toMatch(/DL_HOOK_01/);
  });

  it('changes environment hash when an approved asset resolution changes', () => {
    const a = packet({ approvedAssetResolutions: [{ assetId: 'AA1', assetVersion: '1', assetDependencySha256: '11'.repeat(32) }] });
    const b = packet({ approvedAssetResolutions: [{ assetId: 'AA1', assetVersion: '2', assetDependencySha256: '22'.repeat(32) }] });
    expect(a.environmentDependencySha256).not.toBe(b.environmentDependencySha256);
    expect(a.productionPacketSha256).not.toBe(b.productionPacketSha256);
  });

  it('changes character hash when a rig version changes', () => {
    expect(packet({ pipRigVersion: 'UNRESOLVED_PRODUCTION_RIG' }).characterDependencySha256).not.toBe(
      packet({ pipRigVersion: 'PIP_V2', characterRigsResolved: true }).characterDependencySha256,
    );
  });

  it('changes voice hash when a receipt changes', () => {
    const a = packet();
    const b = packet({ voiceReceipts: [{ dialogueRef: 'DL_HOOK_01', receiptRef: 'VR', receiptSha256: '99'.repeat(32), characterId: 'PIP' }] });
    expect(a.voiceDependencySha256).not.toBe(b.voiceDependencySha256);
  });

  it('compiles a synthetic complete planning packet for EP012', () => {
    const compiled = compileEp012ProductionPacket();
    expect(compiled.episodeId).toBe('EP012');
    expect(compiled.readiness).toBe('PLANNING_COMPLETE');
    expect(compiled.reasons.length).toBeGreaterThanOrEqual(6);
  });

  it('does not duplicate media bytes in the packet', () => {
    expect(JSON.stringify(packet())).not.toMatch(/\.blend|\.mp4|base64/);
  });

  it('binds render and qc hashes without authorizing execution', () => {
    expect(packet().reasons.find((item) => item.key === 'render')?.blocksRealProduction).toBe(true);
    expect(packet().reasons.find((item) => item.key === 'qc')?.blocksRealProduction).toBe(true);
  });

  it('uses packet version TIVVLEJOY_EPISODE_PRODUCTION_PACKET_V1', () => {
    expect(packet().schemaVersion).toBe('TIVVLEJOY_EPISODE_PRODUCTION_PACKET_V1');
  });

  it('keeps continuity hash stable when unset', () => {
    expect(packet().continuityDependencySha256).toBe(packet().continuityDependencySha256);
  });

  it('changes continuity hash when the ledger snapshot changes', () => {
    expect(packet({ continuityDependencySha256: '11'.repeat(32) }).continuityDependencySha256).not.toBe(
      packet({ continuityDependencySha256: '22'.repeat(32) }).continuityDependencySha256,
    );
  });

  it('changes shot-assembly hash when a camera binding changes', () => {
    const a = packet({ shots: [{ shotId: 'SH001', locationId: 'bakery', cameraTemplateId: 'CAM_A' }] });
    const b = packet({ shots: [{ shotId: 'SH001', locationId: 'bakery', cameraTemplateId: 'CAM_B' }] });
    expect(a.shotAssemblyDependencySha256).not.toBe(b.shotAssemblyDependencySha256);
  });

  it('reports every required dependency reason key', () => {
    expect(packet().reasons.map((item) => item.key).sort()).toEqual(
      ['character', 'continuity', 'environment', 'qc', 'render', 'script', 'shotAssembly', 'voice'].sort(),
    );
  });

  it('includes episode identity fields', () => {
    expect(packet().episodeId).toBe('EP012');
    expect(packet().episodeVersion).toBe('v1');
    expect(packet().productionPacketVersion).toBe('TIVVLEJOY_EPISODE_PRODUCTION_PACKET_V1');
  });

  it('does not become real-production ready when render is unset even if rigs resolve', () => {
    const compiled = packet({
      characterRigsResolved: true,
      pipRigVersion: 'PIP_V1',
      goatRigVersion: 'GOAT_V1',
      renderDependencySha256: null,
    });
    expect(compiled.readiness).toBe('PLANNING_COMPLETE');
    expect(compiled.reasons.find((item) => item.key === 'render')?.blocksRealProduction).toBe(true);
  });

  it('waits when a required voice receipt is missing even if rigs resolve', () => {
    expect(packet({ characterRigsResolved: true, voiceReceipts: [] }).readiness).toBe('WAITING_FOR_DEPENDENCY');
  });

  it('binds lighting into the shot-assembly dependency', () => {
    const a = packet({ shots: [{ shotId: 'SH001', locationId: 'bakery', lightingPresetId: 'DAY' }] });
    const b = packet({ shots: [{ shotId: 'SH001', locationId: 'bakery', lightingPresetId: 'NIGHT' }] });
    expect(a.shotAssemblyDependencySha256).not.toBe(b.shotAssemblyDependencySha256);
  });

  it('hashes unused extra voice receipts into the voice dependency', () => {
    const extra = packet({
      voiceReceipts: [
        { dialogueRef: 'DL_HOOK_01', receiptRef: 'VR', receiptSha256: 'dd'.repeat(32), characterId: 'PIP' },
        { dialogueRef: 'DL_UNUSED', receiptRef: 'VR2', receiptSha256: 'ee'.repeat(32), characterId: 'GOAT' },
      ],
    });
    expect(extra.voiceDependencySha256).not.toBe(packet().voiceDependencySha256);
  });

  it('keeps EP012 packet free of paid authorization fields', () => {
    expect(JSON.stringify(compileEp012ProductionPacket())).not.toMatch(/RUNPOD|gpuLaunched|paidCompute/i);
  });

  it('uses the same packet hash when approved-asset arrays are reordered', () => {
    const a = packet({
      approvedAssetResolutions: [
        { assetId: 'AA2', assetVersion: '1', assetDependencySha256: '22'.repeat(32) },
        { assetId: 'AA1', assetVersion: '1', assetDependencySha256: '11'.repeat(32) },
      ],
    });
    const b = packet({
      approvedAssetResolutions: [
        { assetId: 'AA1', assetVersion: '1', assetDependencySha256: '11'.repeat(32) },
        { assetId: 'AA2', assetVersion: '1', assetDependencySha256: '22'.repeat(32) },
      ],
    });
    expect(a.productionPacketSha256).toBe(b.productionPacketSha256);
  });
});
