import type { ProductionStateGraph } from './state-graph';
import type { EpisodeQcReport } from './qc';
import type { DeliveryPackage } from './delivery';

export type SafeNextAction = {
  actionId: string;
  episodeId: string;
  shotId?: string;
  label: string;
  neverClaimsExecution: true;
};

const FORBIDDEN = /started gpu|rendered|uploaded|approved/i;

export function buildSafeNextActions(input: {
  graph: ProductionStateGraph;
  qcReports?: EpisodeQcReport[];
  deliveries?: DeliveryPackage[];
}): SafeNextAction[] {
  const actions: SafeNextAction[] = [];
  for (const node of input.graph.nodes) {
    if (node.state === 'COMPLETE' || node.kind === 'EPISODE') continue;
    if (node.kind === 'RENDER') {
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Paid render authorization required', neverClaimsExecution: true });
      continue;
    }
    if (node.state === 'WAITING_FOR_RIG') {
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Wait for production Pip/Goat rig', neverClaimsExecution: true });
    } else if (node.state === 'WAITING_FOR_VOICE') {
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Generate/review confirmed voice line', neverClaimsExecution: true });
    } else if (node.state === 'WAITING_FOR_ASSET') {
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Inspect or approve required scenery source', neverClaimsExecution: true });
    } else if (node.state === 'WAITING_FOR_APPROVAL') {
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Review shot preview', neverClaimsExecution: true });
    }
  }
  for (const qc of input.qcReports ?? []) {
    if (!qc.passed) actions.push({ actionId: `QC::${qc.episodeId}`, episodeId: qc.episodeId, label: `QC blocked: ${qc.hardBlockers.join(', ') || 'incomplete'}`, neverClaimsExecution: true });
  }
  for (const delivery of input.deliveries ?? []) {
    if (delivery.readiness !== 'READY_FOR_MANUAL_RELEASE') {
      actions.push({ actionId: `DELIVERY::${delivery.episodeId}`, episodeId: delivery.episodeId, label: `Delivery ${delivery.readiness.split('_').join(' ').toLowerCase()}`, neverClaimsExecution: true });
    }
  }
  const unique = new Map(actions.map((item) => [item.label + item.episodeId + (item.shotId ?? ''), item]));
  return [...unique.values()].filter((item) => !FORBIDDEN.test(item.label)).sort((left, right) => left.actionId.localeCompare(right.actionId));
}
