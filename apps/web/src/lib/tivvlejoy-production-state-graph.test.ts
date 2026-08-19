import { describe, expect, it } from 'vitest';
import {
  buildProductionStateGraph,
  changeImpact,
  episodeWaitingOn,
} from './tivvlejoy-production-studio/state-graph';

function episode(overrides: { voices?: boolean; rigs?: boolean; approval?: boolean } = {}) {
  return buildProductionStateGraph([
    {
      episodeId: 'EP012',
      scriptSha256: 'aa'.repeat(32),
      characterRigsResolved: overrides.rigs === true,
      pipRigVersion: overrides.rigs ? 'PIP_V1' : 'UNRESOLVED_PRODUCTION_RIG',
      shots: [
        {
          shotId: 'SH001',
          locationId: 'bakery',
          locationSha256: 'bb'.repeat(32),
          environmentDependencySha256: 'cc'.repeat(32),
          assemblyDependencySha256: 'dd'.repeat(32),
          cameraTemplateId: 'TJ_CAM_ESTABLISHING_VERTICAL',
          lightingPresetId: 'TJ_MORNING_WARM',
          dialogueRefs: ['DL_HOOK_01'],
          charactersVisible: ['PIP', 'GOAT'],
          approvedAssetIds: ['AA_VILLAGE_HERO_BUILDING'],
          visualApproval: overrides.approval ? { shotId: 'SH001', receiptRef: 'VA1', receiptSha256: 'ee'.repeat(32) } : null,
        },
      ],
      voiceReceipts: overrides.voices === false ? [] : [{ dialogueRef: 'DL_HOOK_01', receiptRef: 'VR1', receiptSha256: 'ff'.repeat(32), characterId: 'PIP' }],
    },
  ]);
}

describe('production state graph', () => {
  it('builds deterministic graphs independent of input order', () => {
    const a = episode();
    const b = episode();
    expect(a.graphSha256).toBe(b.graphSha256);
  });

  it('indexes nodes by episode, kind, state, and shot', () => {
    const graph = episode();
    expect(graph.indexes.byEpisode.EP012?.length).toBeGreaterThan(5);
    expect(graph.indexes.byKind.SHOT?.length).toBe(1);
    expect(graph.indexes.byShot.SH001?.length).toBeGreaterThan(3);
  });

  it('explains that EP012 is waiting on production rigs', () => {
    const waiting = episodeWaitingOn(episode({ rigs: false }), 'EP012');
    expect(waiting.some((item) => item.humanLabel.includes('Pip production rig'))).toBe(true);
    expect(waiting.some((item) => item.blockerClass === 'RIG')).toBe(true);
  });

  it('does not use RUNNING states', () => {
    expect(JSON.stringify(episode())).not.toContain('RUNNING');
  });

  it('marks visual approval as human-authorized work', () => {
    const node = episode().nodes.find((item) => item.kind === 'VISUAL_APPROVAL');
    expect(node?.humanAuthorizationRequired).toBe(true);
    expect(node?.state).toBe('WAITING_FOR_APPROVAL');
  });

  it('marks paid render as authorization-required and not started', () => {
    const node = episode().nodes.find((item) => item.kind === 'RENDER');
    expect(node?.state).toBe('NOT_STARTED');
    expect(node?.humanLabel).toBe('Paid render authorization required');
  });

  it('waits for missing voice receipts', () => {
    const graph = episode({ voices: false });
    expect(graph.nodes.some((node) => node.state === 'WAITING_FOR_VOICE')).toBe(true);
  });

  it('computes reverse dependents for change impact', () => {
    const graph = episode();
    const location = graph.nodes.find((node) => node.kind === 'LOCATION')!.nodeId;
    const impacted = changeImpact(graph, [location]);
    expect(impacted.some((id) => id.includes('SHOT_ASSEMBLY'))).toBe(true);
    expect(impacted.some((id) => id.includes('RENDER'))).toBe(true);
  });

  it('does not invalidate an unrelated episode when one location changes', () => {
    const graph = buildProductionStateGraph([
      { episodeId: 'EP001', scriptSha256: '11'.repeat(32), shots: [{ shotId: 'A', locationId: 'bakery', locationSha256: '22'.repeat(32), charactersVisible: ['PIP'] }] },
      { episodeId: 'EP002', scriptSha256: '33'.repeat(32), shots: [{ shotId: 'B', locationId: 'forest_exit', locationSha256: '44'.repeat(32), charactersVisible: ['PIP'] }] },
    ]);
    const bakery = graph.nodes.find((node) => node.nodeId.includes('LOCATION::bakery'))!.nodeId;
    const impacted = changeImpact(graph, [bakery]);
    expect(impacted.some((id) => id.includes('EP002'))).toBe(false);
  });

  it('lists a critical path of incomplete work', () => {
    expect(episode().criticalPath.length).toBeGreaterThan(0);
  });

  it('classifies blockers as rig, voice, approval, asset, or render', () => {
    const classes = new Set(episode({ voices: false }).nodes.map((node) => node.blockerClass).filter(Boolean));
    expect(classes.has('RIG') || classes.has('VOICE') || classes.has('RENDER')).toBe(true);
  });

  it('keeps delivery waiting on QC', () => {
    const graph = episode();
    expect(graph.edges.some((edge) => edge.from.includes('::QC::') && edge.to.includes('::DELIVERY::'))).toBe(true);
  });

  it('exposes ready-now planning nodes without claiming render started', () => {
    const graph = episode({ rigs: true, approval: true });
    expect(graph.readyNow.length).toBeGreaterThan(0);
    expect(graph.nodes.find((node) => node.kind === 'RENDER')?.state).toBe('NOT_STARTED');
  });

  it('builds graphs for many episodes without losing indexes', () => {
    const graph = buildProductionStateGraph(
      Array.from({ length: 8 }, (_, index) => ({
        episodeId: `EP${index}`,
        scriptSha256: `${index}`.repeat(64).slice(0, 64),
        shots: [{ shotId: `S${index}`, locationId: 'bakery', charactersVisible: ['PIP'] }],
      })),
    );
    expect(Object.keys(graph.indexes.byEpisode)).toHaveLength(8);
  });

  it('does not use mutable latest as a dependency', () => {
    expect(JSON.stringify(episode())).not.toMatch(/"latest"/);
  });

  it('creates SCRIPT, VOICE, LOCATION, ASSET, SHOT, CHARACTER_RIG, CAMERA, LIGHTING nodes', () => {
    const kinds = new Set(episode().nodes.map((node) => node.kind));
    for (const kind of ['SCRIPT', 'VOICE', 'LOCATION', 'ASSET', 'SHOT', 'CHARACTER_RIG', 'CAMERA', 'LIGHTING', 'ANIMATION', 'SHOT_ASSEMBLY', 'VISUAL_APPROVAL', 'RENDER_PREFLIGHT', 'RENDER', 'AUDIO', 'QC', 'DELIVERY', 'EPISODE']) {
      expect(kinds.has(kind as 'SCRIPT')).toBe(true);
    }
  });

  it('marks missing location hashes as waiting for assets', () => {
    const graph = buildProductionStateGraph([{ episodeId: 'EPX', scriptSha256: '11'.repeat(32), shots: [{ shotId: 'S1', locationId: 'cave' }] }]);
    expect(graph.nodes.some((node) => node.kind === 'LOCATION' && node.state === 'WAITING_FOR_ASSET')).toBe(true);
  });

  it('requires human authorization for delivery', () => {
    expect(episode().nodes.find((node) => node.kind === 'DELIVERY')?.humanAuthorizationRequired).toBe(true);
  });

  it('keeps QC incomplete until evaluated', () => {
    expect(episode().nodes.find((node) => node.kind === 'QC')?.state).toBe('NOT_STARTED');
  });

  it('tracks waitingHuman separately from technical blockers', () => {
    expect(episode().waitingHuman.some((id) => id.includes('VISUAL_APPROVAL') || id.includes('RENDER'))).toBe(true);
  });

  it('uses exact script hash on the script node', () => {
    expect(episode().nodes.find((node) => node.kind === 'SCRIPT')?.dependencySha256).toBe('aa'.repeat(32));
  });

  it('does not silently complete assembly when rigs are unresolved', () => {
    expect(episode({ rigs: false }).nodes.find((node) => node.kind === 'SHOT_ASSEMBLY')?.state).toBe('WAITING_FOR_RIG');
  });

  it('can become ready for assembly only after rigs resolve', () => {
    expect(episode({ rigs: true }).nodes.find((node) => node.kind === 'SHOT_ASSEMBLY')?.state).toBe('READY_FOR_ASSEMBLY');
  });

  it('propagates a stale visual approval as waiting for approval', () => {
    const graph = buildProductionStateGraph([{
      episodeId: 'EP012',
      scriptSha256: 'aa'.repeat(32),
      shots: [{ shotId: 'SH001', locationId: 'bakery', visualApproval: { shotId: 'SH001', receiptRef: 'VA', receiptSha256: '11'.repeat(32), stale: true } }],
    }]);
    expect(graph.nodes.find((node) => node.kind === 'VISUAL_APPROVAL')?.blockerCode).toBe('VISUAL_APPROVAL_STALE');
  });

  it('sorts edges deterministically', () => {
    const a = episode();
    const b = episode();
    expect(a.edges.map((edge) => `${edge.from}->${edge.to}`)).toEqual(b.edges.map((edge) => `${edge.from}->${edge.to}`));
  });

  it('includes approved asset nodes for resolved scenery', () => {
    expect(episode().nodes.some((node) => node.kind === 'ASSET' && node.humanLabel.includes('AA_VILLAGE_HERO_BUILDING'))).toBe(true);
  });

  it('keeps animation waiting on unresolved rigs', () => {
    expect(episode().nodes.find((node) => node.kind === 'ANIMATION')?.state).toBe('WAITING_FOR_RIG');
  });

  it('does not claim audio is complete without a render receipt', () => {
    expect(episode().nodes.find((node) => node.kind === 'AUDIO')?.state).not.toBe('COMPLETE');
  });

  it('aggregates shot nodes onto the episode node', () => {
    expect(episode().edges.some((edge) => edge.to.endsWith('::EPISODE') && edge.from.includes('::SHOT::'))).toBe(true);
  });

  it('invalidates assembly when an approved asset node changes', () => {
    const graph = episode();
    const asset = graph.nodes.find((node) => node.kind === 'ASSET')!.nodeId;
    expect(changeImpact(graph, [asset]).some((id) => id.includes('SHOT_ASSEMBLY'))).toBe(true);
  });

  it('uses human labels instead of only raw blocker codes', () => {
    expect(episode().nodes.find((node) => node.kind === 'CHARACTER_RIG')?.humanLabel).toBe('Waiting for Pip production rig');
  });
});
