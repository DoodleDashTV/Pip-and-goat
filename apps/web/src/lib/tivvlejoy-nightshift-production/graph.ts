import type { ProductionStateGraph } from '@/lib/tivvlejoy-production-studio/state-graph';
import type { GraphNode, GraphState } from '@/lib/tivvlejoy-production-studio/types';

export const NIGHTSHIFT_NODE_KINDS = ['DIRECTING', 'CAMERA', 'STAGING', 'EDITORIAL', 'AUDIO_DESIGN', 'CAPTIONS', 'SHOT_REVIEW'] as const;

export const NIGHTSHIFT_WAIT_STATES = [
  'WAITING_FOR_DIRECTION',
  'WAITING_FOR_CAMERA_PLAN',
  'WAITING_FOR_STAGING',
  'WAITING_FOR_EDIT',
  'WAITING_FOR_AUDIO_PLAN',
  'WAITING_FOR_CAPTIONS',
  'WAITING_FOR_DIRECTOR_REVIEW',
  'WAITING_FOR_SHOT_APPROVAL',
] as const;

export function attachDirectingGraph(graph: ProductionStateGraph, input: { episodeId: string; hasIntent: boolean; hasCamera: boolean; hasStaging: boolean; hasEdit: boolean; hasAudio: boolean; hasCaptions: boolean; hasReview: boolean }): ProductionStateGraph {
  const nodes: GraphNode[] = [...graph.nodes];
  const add = (kind: (typeof NIGHTSHIFT_NODE_KINDS)[number], complete: boolean, waiting: GraphState, label: string) => {
    nodes.push({
      nodeId: `${input.episodeId}::${kind}`,
      kind: kind as GraphNode['kind'],
      episodeId: input.episodeId,
      state: complete ? 'COMPLETE' : waiting,
      blockerClass: complete ? null : 'CREATIVE',
      blockerCode: complete ? null : waiting,
      humanLabel: label,
      waitingOn: [`${input.episodeId}::SCRIPT`],
      dependencySha256: complete ? 'planned' : null,
      humanAuthorizationRequired: kind === 'SHOT_REVIEW',
    });
  };
  add('DIRECTING', input.hasIntent, 'WAITING_FOR_DIRECTION' as GraphState, 'Episode directing');
  add('CAMERA', input.hasCamera, 'WAITING_FOR_CAMERA_PLAN' as GraphState, 'Camera plan');
  add('STAGING', input.hasStaging, 'WAITING_FOR_STAGING' as GraphState, 'Character staging');
  add('EDITORIAL', input.hasEdit, 'WAITING_FOR_EDIT' as GraphState, 'Editorial timeline');
  add('AUDIO_DESIGN', input.hasAudio, 'WAITING_FOR_AUDIO_PLAN' as GraphState, 'Audio design');
  add('CAPTIONS', input.hasCaptions, 'WAITING_FOR_CAPTIONS' as GraphState, 'Captions');
  add('SHOT_REVIEW', input.hasReview, 'WAITING_FOR_DIRECTOR_REVIEW' as GraphState, 'Director review');
  const existingRigs = graph.nodes.filter((node) => node.blockerClass === 'RIG' || node.state === 'WAITING_FOR_RIG' || node.state === 'WAITING_FOR_RIG_APPROVAL');
  return { ...graph, nodes: [...nodes], blocked: [...graph.blocked, ...existingRigs.map((node) => node.nodeId)] };
}
