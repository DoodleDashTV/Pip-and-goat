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

const FORBIDDEN = /started gpu|gpu started|render completed|uploaded|asset approved|rigs? approved/i;

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
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Receive and inspect the approved Pip production rig.', neverClaimsExecution: true });
    } else if (node.state === 'WAITING_FOR_RIG_APPROVAL') {
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Human review of the admitted production rig is still required', neverClaimsExecution: true });
    } else if (node.state === 'WAITING_FOR_VOICE_TIMING') {
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Attach confirmed voice timing before exact mouth or beak animation', neverClaimsExecution: true });
    } else if (node.state === 'WAITING_FOR_ANIMATION_PLAN') {
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Finish the semantic character animation plan', neverClaimsExecution: true });
    } else if (node.state === 'WAITING_FOR_ANIMATION_QC') {
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Review animation QC blockers', neverClaimsExecution: true });
    } else if (node.state === 'WAITING_FOR_VOICE') {
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Confirm the episode dialogue receipt.', neverClaimsExecution: true });
    } else if (node.state === 'WAITING_FOR_ASSET') {
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Review the mountain hero candidate.', neverClaimsExecution: true });
    } else if (node.state === 'WAITING_FOR_APPROVAL') {
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Review Shot 08 camera and performance.', neverClaimsExecution: true });
    } else if (node.state === 'WAITING_FOR_DIRECTION') {
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Compile the episode creative intent and story beats.', neverClaimsExecution: true });
    } else if (node.state === 'WAITING_FOR_CAMERA_PLAN') {
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Choose camera language from the story purpose.', neverClaimsExecution: true });
    } else if (node.state === 'WAITING_FOR_STAGING') {
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Stage Pip and Goat for the conversation.', neverClaimsExecution: true });
    } else if (node.state === 'WAITING_FOR_EDIT') {
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Compile the editorial timeline.', neverClaimsExecution: true });
    } else if (node.state === 'WAITING_FOR_AUDIO_PLAN') {
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Plan SFX, ambience, and music cues.', neverClaimsExecution: true });
    } else if (node.state === 'WAITING_FOR_CAPTIONS') {
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Build caption timing from confirmed dialogue.', neverClaimsExecution: true });
    } else if (node.state === 'WAITING_FOR_DIRECTOR_REVIEW' || node.state === 'WAITING_FOR_SHOT_APPROVAL') {
      actions.push({ actionId: `${node.nodeId}::NEXT`, episodeId: node.episodeId, shotId: node.shotId, label: 'Review Shot 08 camera and performance.', neverClaimsExecution: true });
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
