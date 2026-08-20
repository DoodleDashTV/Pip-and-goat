import { sha256Canonical, stableSorted } from './hash';
import {
  STATE_GRAPH_SCHEMA,
  type BlockerClass,
  type GraphEdge,
  type GraphNode,
  type GraphState,
  type VoiceReceipt,
  type VisualApprovalReceipt,
} from './types';

export type EpisodeGraphInput = {
  episodeId: string;
  scriptSha256: string;
  shots: Array<{
    shotId: string;
    locationId: string;
    locationSha256?: string | null;
    environmentDependencySha256?: string | null;
    assemblyDependencySha256?: string | null;
    cameraTemplateId?: string;
    lightingPresetId?: string;
    dialogueRefs?: string[];
    charactersVisible?: string[];
    approvedAssetIds?: string[];
    visualApproval?: VisualApprovalReceipt | null;
    renderPreflightReady?: boolean;
    qcComplete?: boolean;
    deliveryReady?: boolean;
    animationPlanReady?: boolean;
    animationQcReady?: boolean;
    continuityReady?: boolean;
    voiceTimingReady?: boolean;
    rigApprovalReady?: boolean;
    shotAnimationManifestSha256?: string | null;
  }>;
  voiceReceipts?: VoiceReceipt[];
  characterRigsResolved?: boolean;
  characterRigsApproved?: boolean;
  pipRigVersion?: string;
  goatRigVersion?: string;
};

export type ProductionStateGraph = {
  schemaVersion: typeof STATE_GRAPH_SCHEMA;
  nodes: GraphNode[];
  edges: GraphEdge[];
  indexes: {
    byEpisode: Record<string, string[]>;
    byKind: Record<string, string[]>;
    byState: Record<string, string[]>;
    byShot: Record<string, string[]>;
    dependents: Record<string, string[]>;
  };
  criticalPath: string[];
  readyNow: string[];
  blocked: string[];
  waitingHuman: string[];
  graphSha256: string;
};

function nodeState(complete: boolean, waiting: GraphState | null, blocked: { code: string; cls: BlockerClass } | null): GraphState {
  if (blocked) return 'BLOCKED';
  if (waiting) return waiting;
  return complete ? 'COMPLETE' : 'PLANNED';
}

export function buildProductionStateGraph(episodes: EpisodeGraphInput[]): ProductionStateGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenNodes = new Set<string>();
  const seenEdges = new Set<string>();
  const sortedEpisodes = [...episodes].sort((left, right) => left.episodeId.localeCompare(right.episodeId));

  const addNode = (node: GraphNode) => {
    if (seenNodes.has(node.nodeId)) return false;
    seenNodes.add(node.nodeId);
    nodes.push(node);
    return true;
  };
  const addEdge = (edge: GraphEdge) => {
    const key = `${edge.from}\0${edge.to}\0${edge.reason}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    edges.push(edge);
  };

  for (const episode of sortedEpisodes) {
    const voices = episode.voiceReceipts ?? [];
    const voiceByRef = new Map(voices.map((item) => [item.dialogueRef, item]));
    const rigsResolved = episode.characterRigsResolved === true;
    const scriptId = `${episode.episodeId}::SCRIPT`;
    addNode({
      nodeId: scriptId,
      kind: 'SCRIPT',
      episodeId: episode.episodeId,
      state: episode.scriptSha256 ? 'COMPLETE' : 'NOT_STARTED',
      blockerClass: episode.scriptSha256 ? null : 'CREATIVE',
      blockerCode: episode.scriptSha256 ? null : 'MISSING_SCRIPT',
      humanLabel: 'Episode script',
      waitingOn: [],
      dependencySha256: episode.scriptSha256 || null,
      humanAuthorizationRequired: false,
    });

    const episodeWait: string[] = [scriptId];
    const shotNodes: string[] = [];

    for (const shot of [...episode.shots].sort((left, right) => left.shotId.localeCompare(right.shotId))) {
      const locationId = `${episode.episodeId}::LOCATION::${shot.locationId}`;
      addNode({
        nodeId: locationId,
        kind: 'LOCATION',
        episodeId: episode.episodeId,
        state: shot.locationSha256 || shot.environmentDependencySha256 ? 'COMPLETE' : 'WAITING_FOR_ASSET',
        blockerClass: shot.locationSha256 || shot.environmentDependencySha256 ? null : 'ASSET',
        blockerCode: shot.locationSha256 || shot.environmentDependencySha256 ? null : 'MISSING_LOCATION_HASH',
        humanLabel: `Location ${shot.locationId}`,
        waitingOn: [scriptId],
        dependencySha256: shot.environmentDependencySha256 ?? shot.locationSha256 ?? null,
        humanAuthorizationRequired: false,
      });
      addEdge({ from: scriptId, to: locationId, reason: 'script defines location use' });

      const assetNodeIds: string[] = [];
      for (const assetId of stableSorted(shot.approvedAssetIds)) {
        const assetNode = `${episode.episodeId}::ASSET::${assetId}`;
        assetNodeIds.push(assetNode);
        addNode({
          nodeId: assetNode,
          kind: 'ASSET',
          episodeId: episode.episodeId,
          shotId: shot.shotId,
          state: 'COMPLETE',
          blockerClass: null,
          blockerCode: null,
          humanLabel: `Approved asset ${assetId}`,
          waitingOn: [locationId],
          dependencySha256: assetId,
          humanAuthorizationRequired: false,
        });
        addEdge({ from: locationId, to: assetNode, reason: 'location uses approved asset' });
      }

      const missingVoices = (shot.dialogueRefs ?? []).filter((ref) => !voiceByRef.has(ref));
      const voiceId = `${episode.episodeId}::VOICE::${shot.shotId}`;
      addNode({
        nodeId: voiceId,
        kind: 'VOICE',
        episodeId: episode.episodeId,
        shotId: shot.shotId,
        state: nodeState(missingVoices.length === 0, missingVoices.length ? 'WAITING_FOR_VOICE' : null, null),
        blockerClass: missingVoices.length ? 'VOICE' : null,
        blockerCode: missingVoices.length ? 'MISSING_VOICE_RECEIPT' : null,
        humanLabel: missingVoices.length ? 'Waiting for confirmed voice line' : 'Voice receipts present',
        waitingOn: [scriptId],
        dependencySha256: sha256Canonical({ refs: stableSorted(shot.dialogueRefs), receipts: voices.map((item) => item.receiptSha256).sort() }),
        humanAuthorizationRequired: false,
      });
      addEdge({ from: scriptId, to: voiceId, reason: 'script dialogue' });

      const rigId = `${episode.episodeId}::CHARACTER_RIG::${shot.shotId}`;
      const needsCharacters = (shot.charactersVisible ?? []).some((id) => id === 'PIP' || id === 'GOAT' || id === 'PIP_AND_GOAT');
      addNode({
        nodeId: rigId,
        kind: 'CHARACTER_RIG',
        episodeId: episode.episodeId,
        shotId: shot.shotId,
        state: !needsCharacters ? 'COMPLETE' : rigsResolved ? 'COMPLETE' : 'WAITING_FOR_RIG',
        blockerClass: needsCharacters && !rigsResolved ? 'RIG' : null,
        blockerCode: needsCharacters && !rigsResolved ? 'UNRESOLVED_PRODUCTION_RIG' : null,
        humanLabel: needsCharacters && !rigsResolved ? 'Waiting for Pip production rig' : 'Character rig planned',
        waitingOn: [scriptId],
        dependencySha256: sha256Canonical({ pip: episode.pipRigVersion ?? 'UNRESOLVED_PRODUCTION_RIG', goat: episode.goatRigVersion ?? 'UNRESOLVED_PRODUCTION_RIG' }),
        humanAuthorizationRequired: false,
      });
      addEdge({ from: scriptId, to: rigId, reason: 'characters required' });

      const cameraId = `${episode.episodeId}::CAMERA::${shot.shotId}`;
      addNode({
        nodeId: cameraId,
        kind: 'CAMERA',
        episodeId: episode.episodeId,
        shotId: shot.shotId,
        state: shot.cameraTemplateId ? 'COMPLETE' : 'PLANNED',
        blockerClass: null,
        blockerCode: null,
        humanLabel: 'Camera binding',
        waitingOn: [scriptId],
        dependencySha256: shot.cameraTemplateId ?? null,
        humanAuthorizationRequired: false,
      });
      const lightingId = `${episode.episodeId}::LIGHTING::${shot.shotId}`;
      addNode({
        nodeId: lightingId,
        kind: 'LIGHTING',
        episodeId: episode.episodeId,
        shotId: shot.shotId,
        state: shot.lightingPresetId ? 'COMPLETE' : 'PLANNED',
        blockerClass: null,
        blockerCode: null,
        humanLabel: 'Lighting binding',
        waitingOn: [locationId],
        dependencySha256: shot.lightingPresetId ?? null,
        humanAuthorizationRequired: false,
      });
      addEdge({ from: scriptId, to: cameraId, reason: 'camera template' });
      addEdge({ from: locationId, to: lightingId, reason: 'location lighting' });

      const assemblyBlocked = needsCharacters && !rigsResolved;
      const assemblyId = `${episode.episodeId}::SHOT_ASSEMBLY::${shot.shotId}`;
      addNode({
        nodeId: assemblyId,
        kind: 'SHOT_ASSEMBLY',
        episodeId: episode.episodeId,
        shotId: shot.shotId,
        state: assemblyBlocked ? 'WAITING_FOR_RIG' : shot.assemblyDependencySha256 ? 'READY_FOR_ASSEMBLY' : 'READY_FOR_SAFE_PLANNING',
        blockerClass: assemblyBlocked ? 'RIG' : null,
        blockerCode: assemblyBlocked ? 'UNRESOLVED_PRODUCTION_RIG' : null,
        humanLabel: assemblyBlocked ? 'Waiting for Pip production rig' : 'Shot assembly planning ready',
        waitingOn: [locationId, voiceId, rigId, cameraId, lightingId],
        dependencySha256: shot.assemblyDependencySha256 ?? null,
        humanAuthorizationRequired: false,
      });
      for (const parent of [locationId, voiceId, rigId, cameraId, lightingId]) {
        addEdge({ from: parent, to: assemblyId, reason: 'assembly dependency' });
      }
      for (const assetNode of assetNodeIds) {
        addEdge({ from: assetNode, to: assemblyId, reason: 'approved asset feeds assembly' });
      }

      const approvalId = `${episode.episodeId}::VISUAL_APPROVAL::${shot.shotId}`;
      const approvalMissing = !shot.visualApproval?.receiptSha256;
      const approvalStale = shot.visualApproval?.stale === true;
      addNode({
        nodeId: approvalId,
        kind: 'VISUAL_APPROVAL',
        episodeId: episode.episodeId,
        shotId: shot.shotId,
        state: approvalStale || approvalMissing ? 'WAITING_FOR_APPROVAL' : 'COMPLETE',
        blockerClass: approvalStale || approvalMissing ? 'APPROVAL' : null,
        blockerCode: approvalStale ? 'VISUAL_APPROVAL_STALE' : approvalMissing ? 'VISUAL_APPROVAL_MISSING' : null,
        humanLabel: approvalMissing ? 'Review shot preview' : approvalStale ? 'Visual approval is stale' : 'Visual approval present',
        waitingOn: [assemblyId],
        dependencySha256: shot.visualApproval?.receiptSha256 ?? null,
        humanAuthorizationRequired: true,
      });
      addEdge({ from: assemblyId, to: approvalId, reason: 'visual approval' });

      const preflightId = `${episode.episodeId}::RENDER_PREFLIGHT::${shot.shotId}`;
      const preflightBlocked = assemblyBlocked || approvalMissing || approvalStale;
      addNode({
        nodeId: preflightId,
        kind: 'RENDER_PREFLIGHT',
        episodeId: episode.episodeId,
        shotId: shot.shotId,
        state: preflightBlocked ? 'WAITING_FOR_DEPENDENCY' : shot.renderPreflightReady ? 'READY_FOR_RENDER_PREFLIGHT' : 'PLANNED',
        blockerClass: preflightBlocked ? (assemblyBlocked ? 'RIG' : 'APPROVAL') : null,
        blockerCode: preflightBlocked ? (assemblyBlocked ? 'UNRESOLVED_PRODUCTION_RIG' : 'VISUAL_APPROVAL_REQUIRED') : null,
        humanLabel: 'Render preflight planning',
        waitingOn: [approvalId],
        dependencySha256: null,
        humanAuthorizationRequired: false,
      });
      addEdge({ from: approvalId, to: preflightId, reason: 'preflight after approval' });

      const renderId = `${episode.episodeId}::RENDER::${shot.shotId}`;
      addNode({
        nodeId: renderId,
        kind: 'RENDER',
        episodeId: episode.episodeId,
        shotId: shot.shotId,
        state: 'NOT_STARTED',
        blockerClass: 'RENDER',
        blockerCode: 'PAID_RENDER_AUTHORIZATION_REQUIRED',
        humanLabel: 'Paid render authorization required',
        waitingOn: [preflightId],
        dependencySha256: null,
        humanAuthorizationRequired: true,
      });
      addEdge({ from: preflightId, to: renderId, reason: 'no render without preflight' });

      const animationId = `${episode.episodeId}::ANIMATION::${shot.shotId}`;
      const animationState = (() => {
        if (assemblyBlocked) return 'WAITING_FOR_RIG' as const;
        if (shot.rigApprovalReady === false || episode.characterRigsApproved === false) return 'WAITING_FOR_RIG_APPROVAL' as const;
        if (missingVoices.length && shot.voiceTimingReady === false) return 'WAITING_FOR_VOICE_TIMING' as const;
        if (shot.continuityReady === false) return 'WAITING_FOR_CONTINUITY' as const;
        if (shot.animationPlanReady !== true) return 'WAITING_FOR_ANIMATION_PLAN' as const;
        if (shot.animationQcReady !== true) return 'WAITING_FOR_ANIMATION_QC' as const;
        return 'READY_FOR_CHARACTER_ANIMATION_ASSEMBLY' as const;
      })();
      const animationLabel =
        animationState === 'WAITING_FOR_RIG'
          ? 'Waiting for approved production rigs before character animation'
          : animationState === 'WAITING_FOR_RIG_APPROVAL'
            ? 'Animation waiting for human rig approval'
            : animationState === 'WAITING_FOR_VOICE_TIMING'
              ? 'Waiting for voice timing before exact mouth/beak animation'
              : animationState === 'WAITING_FOR_CONTINUITY'
                ? 'Waiting for continuity before animation assembly'
                : animationState === 'WAITING_FOR_ANIMATION_PLAN'
                  ? 'Character animation plan still needed'
                  : animationState === 'WAITING_FOR_ANIMATION_QC'
                    ? 'Animation plan waiting for QC'
                    : 'Ready for character animation assembly';
      addNode({
        nodeId: animationId,
        kind: 'ANIMATION',
        episodeId: episode.episodeId,
        shotId: shot.shotId,
        state: animationState,
        blockerClass: animationState === 'WAITING_FOR_RIG' || animationState === 'WAITING_FOR_RIG_APPROVAL' ? 'RIG' : animationState === 'WAITING_FOR_VOICE_TIMING' ? 'VOICE' : animationState === 'READY_FOR_CHARACTER_ANIMATION_ASSEMBLY' ? null : 'TECHNICAL',
        blockerCode:
          animationState === 'WAITING_FOR_RIG'
            ? 'UNRESOLVED_PRODUCTION_RIG'
            : animationState === 'WAITING_FOR_RIG_APPROVAL'
              ? 'RIG_HUMAN_APPROVAL_REQUIRED'
              : animationState === 'WAITING_FOR_VOICE_TIMING'
                ? 'VOICE_TIMING_REQUIRED'
                : animationState === 'READY_FOR_CHARACTER_ANIMATION_ASSEMBLY'
                  ? null
                  : animationState,
        humanLabel: animationLabel,
        waitingOn: [rigId, voiceId],
        dependencySha256: shot.shotAnimationManifestSha256 ?? null,
        humanAuthorizationRequired: animationState === 'WAITING_FOR_RIG_APPROVAL',
      });
      addEdge({ from: rigId, to: animationId, reason: 'animation needs rigs' });
      addEdge({ from: animationId, to: assemblyId, reason: 'assembly consumes animation plan' });

      const audioId = `${episode.episodeId}::AUDIO::${shot.shotId}`;
      addNode({
        nodeId: audioId,
        kind: 'AUDIO',
        episodeId: episode.episodeId,
        shotId: shot.shotId,
        state: missingVoices.length ? 'WAITING_FOR_VOICE' : 'PLANNED',
        blockerClass: missingVoices.length ? 'VOICE' : null,
        blockerCode: missingVoices.length ? 'MISSING_VOICE_RECEIPT' : null,
        humanLabel: 'Audio mux planning',
        waitingOn: [voiceId, renderId],
        dependencySha256: null,
        humanAuthorizationRequired: false,
      });
      addEdge({ from: voiceId, to: audioId, reason: 'dialogue' });
      addEdge({ from: renderId, to: audioId, reason: 'mux after render receipt' });

      const qcId = `${episode.episodeId}::QC::${shot.shotId}`;
      addNode({
        nodeId: qcId,
        kind: 'QC',
        episodeId: episode.episodeId,
        shotId: shot.shotId,
        state: shot.qcComplete ? 'COMPLETE' : 'NOT_STARTED',
        blockerClass: shot.qcComplete ? null : 'TECHNICAL',
        blockerCode: shot.qcComplete ? null : 'QC_NOT_EVALUATED',
        humanLabel: 'Episode/shot QC',
        waitingOn: [audioId],
        dependencySha256: null,
        humanAuthorizationRequired: false,
      });
      addEdge({ from: audioId, to: qcId, reason: 'qc after mux' });

      const deliveryId = `${episode.episodeId}::DELIVERY::${shot.shotId}`;
      addNode({
        nodeId: deliveryId,
        kind: 'DELIVERY',
        episodeId: episode.episodeId,
        shotId: shot.shotId,
        state: shot.deliveryReady && shot.qcComplete ? 'COMPLETE' : 'NOT_STARTED',
        blockerClass: shot.qcComplete ? (shot.deliveryReady ? null : 'DELIVERY') : 'DELIVERY',
        blockerCode: shot.qcComplete ? (shot.deliveryReady ? null : 'WAITING_FOR_MANUAL_RELEASE') : 'QC_BLOCKED',
        humanLabel: 'Manual release only',
        waitingOn: [qcId],
        dependencySha256: null,
        humanAuthorizationRequired: true,
      });
      addEdge({ from: qcId, to: deliveryId, reason: 'no delivery before QC' });

      const shotId = `${episode.episodeId}::SHOT::${shot.shotId}`;
      const shotBlocked = assemblyBlocked || missingVoices.length > 0;
      addNode({
        nodeId: shotId,
        kind: 'SHOT',
        episodeId: episode.episodeId,
        shotId: shot.shotId,
        state: shotBlocked ? (assemblyBlocked ? 'WAITING_FOR_RIG' : 'WAITING_FOR_VOICE') : 'READY_FOR_SAFE_PLANNING',
        blockerClass: shotBlocked ? (assemblyBlocked ? 'RIG' : 'VOICE') : null,
        blockerCode: shotBlocked ? (assemblyBlocked ? 'UNRESOLVED_PRODUCTION_RIG' : 'MISSING_VOICE_RECEIPT') : null,
        humanLabel: `Shot ${shot.shotId}`,
        waitingOn: [assemblyId, voiceId, rigId],
        dependencySha256: shot.assemblyDependencySha256 ?? null,
        humanAuthorizationRequired: false,
      });
      addEdge({ from: assemblyId, to: shotId, reason: 'shot summary' });
      shotNodes.push(shotId);
      episodeWait.push(shotId);
    }

    const episodeBlocked = nodes.some((node) => node.episodeId === episode.episodeId && (node.state === 'BLOCKED' || node.state.startsWith('WAITING')));
    addNode({
      nodeId: `${episode.episodeId}::EPISODE`,
      kind: 'EPISODE',
      episodeId: episode.episodeId,
      state: episodeBlocked ? 'WAITING_FOR_DEPENDENCY' : 'READY_FOR_SAFE_PLANNING',
      blockerClass: episodeBlocked ? 'RIG' : null,
      blockerCode: episodeBlocked ? 'EPISODE_WAITING' : null,
      humanLabel: `Episode ${episode.episodeId}`,
      waitingOn: episodeWait,
      dependencySha256: episode.scriptSha256,
      humanAuthorizationRequired: false,
    });
    for (const shotNode of shotNodes) addEdge({ from: shotNode, to: `${episode.episodeId}::EPISODE`, reason: 'episode aggregates shots' });
  }

  nodes.sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  edges.sort((left, right) => `${left.from}:${left.to}`.localeCompare(`${right.from}:${right.to}`));

  const dependents: Record<string, string[]> = {};
  const byEpisode: Record<string, string[]> = {};
  const byKind: Record<string, string[]> = {};
  const byState: Record<string, string[]> = {};
  const byShot: Record<string, string[]> = {};
  for (const node of nodes) {
    (byEpisode[node.episodeId] ??= []).push(node.nodeId);
    (byKind[node.kind] ??= []).push(node.nodeId);
    (byState[node.state] ??= []).push(node.nodeId);
    if (node.shotId) (byShot[node.shotId] ??= []).push(node.nodeId);
  }
  for (const edge of edges) {
    (dependents[edge.from] ??= []).push(edge.to);
  }
  for (const key of Object.keys(dependents)) dependents[key] = stableSorted(dependents[key]);

  const readyNow = nodes.filter((node) => node.state === 'READY_FOR_SAFE_PLANNING' || node.state === 'READY_FOR_ASSEMBLY' || node.state === 'READY_FOR_RENDER_PREFLIGHT').map((node) => node.nodeId);
  const blocked = nodes.filter((node) => node.state === 'BLOCKED' || node.state.startsWith('WAITING')).map((node) => node.nodeId);
  const waitingHuman = nodes.filter((node) => node.humanAuthorizationRequired && node.state !== 'COMPLETE').map((node) => node.nodeId);
  const criticalPath = longestIncompletePath(nodes, edges);

  const body = {
    schemaVersion: STATE_GRAPH_SCHEMA,
    nodes,
    edges,
    indexes: { byEpisode, byKind, byState, byShot, dependents },
    criticalPath,
    readyNow: stableSorted(readyNow),
    blocked: stableSorted(blocked),
    waitingHuman: stableSorted(waitingHuman),
  };
  return { ...body, graphSha256: sha256Canonical({ nodes: nodes.map((node) => ({ id: node.nodeId, state: node.state, sha: node.dependencySha256 })), edges }) };
}

function longestIncompletePath(nodes: GraphNode[], edges: GraphEdge[]): string[] {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
  }
  const memo = new Map<string, string[]>();
  function walk(id: string, seen: Set<string>): string[] {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return [id];
    const node = byId.get(id);
    if (!node || node.state === 'COMPLETE') {
      memo.set(id, []);
      return [];
    }
    let best: string[] = [];
    for (const next of outgoing.get(id) ?? []) {
      const path = walk(next, new Set(seen).add(id));
      if (path.length > best.length) best = path;
    }
    const result = [id, ...best];
    memo.set(id, result);
    return result;
  }
  let best: string[] = [];
  for (const node of nodes) {
    if (node.state === 'COMPLETE') continue;
    const path = walk(node.nodeId, new Set());
    if (path.length > best.length) best = path;
  }
  return best;
}

export function changeImpact(graph: ProductionStateGraph, changedNodeIds: string[]): string[] {
  const seen = new Set<string>();
  const queue = [...changedNodeIds].sort();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const child of graph.indexes.dependents[id] ?? []) queue.push(child);
  }
  return [...seen].sort();
}

export function episodeWaitingOn(graph: ProductionStateGraph, episodeId: string) {
  return graph.nodes
    .filter((node) => node.episodeId === episodeId && node.state !== 'COMPLETE' && node.kind !== 'EPISODE' && node.kind !== 'RENDER' && node.kind !== 'QC' && node.kind !== 'DELIVERY' && node.kind !== 'AUDIO')
    .map((node) => ({
      nodeId: node.nodeId,
      kind: node.kind,
      state: node.state,
      blockerClass: node.blockerClass,
      blockerCode: node.blockerCode,
      humanLabel: node.humanLabel,
    }))
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
}
