import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001AudioCueSheet } from '@/lib/tivvlejoy-ep001-audio-cue-sheet';

export const EP001_MAP_PROP_HANDOFF_SCHEMA = 'TIVVLEJOY_EP001_MAP_PROP_HANDOFF_V1' as const;

type Owner = 'WORLD' | 'PIP' | 'GOAT' | 'SHARED' | 'HUMAN_BINDING_REQUIRED';
type PropState = 'WORLD_UNHELD' | 'PIP_PROP_ATTACH' | 'GOAT_PROP_ATTACH' | 'TWO_CHARACTER_SHARED' | 'WORLD_PLACED' | 'HUMAN_BINDING_REQUIRED';

function ownerFor(characterId: 'PIP' | 'GOAT' | null): Owner {
  return characterId === 'PIP' ? 'PIP' : characterId === 'GOAT' ? 'GOAT' : 'HUMAN_BINDING_REQUIRED';
}

function stateFor(owner: Owner): PropState {
  if (owner === 'PIP') return 'PIP_PROP_ATTACH';
  if (owner === 'GOAT') return 'GOAT_PROP_ATTACH';
  if (owner === 'SHARED') return 'TWO_CHARACTER_SHARED';
  if (owner === 'WORLD') return 'WORLD_PLACED';
  return 'HUMAN_BINDING_REQUIRED';
}

export function compileEp001MapPropHandoff() {
  const audio = compileEp001AudioCueSheet();
  const mapEvents = audio.sfxCues.filter((cue) => cue.propId === 'STORY_MAP' || cue.propId === 'MAP_FRAGMENT');
  const storyMapEvents = mapEvents.filter((cue) => cue.propId === 'STORY_MAP');
  const fragmentEvents = mapEvents.filter((cue) => cue.propId === 'MAP_FRAGMENT');

  const storyMapTransitions = storyMapEvents.map((cue, index) => {
    const prior = storyMapEvents[index - 1];
    const inferredOwner = ownerFor(cue.characterId);
    const priorOwner: Owner = index === 0 ? 'WORLD' : ownerFor(prior?.characterId ?? null);
    return {
      transitionId: `EP001_MAP_TRANSITION_${String(index + 1).padStart(2, '0')}`,
      propId: 'STORY_MAP' as const,
      shotId: cue.shotId,
      frame: cue.frame,
      semanticType: cue.semanticType,
      syncTarget: cue.syncTarget,
      fromOwner: priorOwner,
      toOwner: inferredOwner,
      fromState: index === 0 ? 'WORLD_UNHELD' as const : stateFor(priorOwner),
      toState: inferredOwner === 'HUMAN_BINDING_REQUIRED' ? 'HUMAN_BINDING_REQUIRED' as const : stateFor(inferredOwner),
      outgoingAnchor: priorOwner === 'PIP' ? 'PIP:PROP_ATTACH' : priorOwner === 'GOAT' ? 'GOAT:PROP_ATTACH' : 'WORLD',
      incomingAnchor: inferredOwner === 'PIP' ? 'PIP:PROP_ATTACH' : inferredOwner === 'GOAT' ? 'GOAT:PROP_ATTACH' : 'HUMAN_BINDING_REQUIRED',
      constraintSwitchFrame: cue.frame,
      preserveWorldTransform: true as const,
      visualContinuityReviewRequired: true as const,
      ownershipProvenByCanonicalCue: cue.characterId !== null,
      humanBindingRequired: cue.characterId === null,
    };
  });

  const fragmentTransitions = fragmentEvents.map((cue, index) => {
    const inferredOwner = ownerFor(cue.characterId);
    return {
      transitionId: `EP001_FRAGMENT_TRANSITION_${String(index + 1).padStart(2, '0')}`,
      propId: 'MAP_FRAGMENT' as const,
      shotId: cue.shotId,
      frame: cue.frame,
      semanticType: cue.semanticType,
      syncTarget: cue.syncTarget,
      fromState: index === 0 ? 'WORLD_UNHELD' as const : 'HUMAN_BINDING_REQUIRED' as const,
      toState: inferredOwner === 'PIP' ? 'PIP_PROP_ATTACH' as const : inferredOwner === 'GOAT' ? 'GOAT_PROP_ATTACH' as const : 'HUMAN_BINDING_REQUIRED' as const,
      incomingAnchor: inferredOwner === 'PIP' ? 'PIP:PROP_ATTACH' : inferredOwner === 'GOAT' ? 'GOAT:PROP_ATTACH' : 'HUMAN_BINDING_REQUIRED',
      preserveWorldTransform: true as const,
      constraintSwitchFrame: cue.frame,
      ownershipProvenByCanonicalCue: cue.characterId !== null,
      humanBindingRequired: cue.characterId === null,
      visualContinuityReviewRequired: true as const,
    };
  });

  const unresolvedMerge = {
    operationId: 'EP001_MAP_FRAGMENT_MERGE_BINDING',
    storyRequirement: 'Bind the retrieved MAP_FRAGMENT back into STORY_MAP only when a canonical picture/animation decision identifies the exact merge frame and attachment behavior.',
    currentState: 'HUMAN_BINDING_REQUIRED' as const,
    mergeFrame: null,
    outgoingFragmentAnchor: null,
    incomingMapAnchor: null,
    preserveWorldTransform: true as const,
    mayInferFromMagicSparkleAlone: false as const,
    autoBindAllowed: false as const,
  };

  const body = {
    schemaVersion: EP001_MAP_PROP_HANDOFF_SCHEMA,
    episodeId: 'EP001' as const,
    audioCueSheetSha256: audio.cueSheetSha256,
    storyMap: {
      initialState: 'WORLD_UNHELD' as const,
      transitions: storyMapTransitions,
      canonicalAnchorCollection: 'TJ_EP001_PROP_MAP' as const,
    },
    mapFragment: {
      initialState: 'WORLD_UNHELD' as const,
      transitions: fragmentTransitions,
      unresolvedMerge,
    },
    rules: [
      'Prop ownership may change only at an explicit state transition.',
      'Every owner switch preserves world transform before enabling the incoming constraint.',
      'Never parent STORY_MAP or MAP_FRAGMENT directly to a deforming mesh.',
      'Use canonical PROP_ATTACH anchors for single-character ownership.',
      'A null-character magic or story cue may not be used to invent ownership.',
      'The fragment-to-map merge remains human-bound until an exact picture/animation frame is approved.',
      'Every handoff requires a visual continuity review at frame-1, frame, and frame+1.',
    ],
    metrics: {
      storyMapCueCount: storyMapEvents.length,
      storyMapTransitionCount: storyMapTransitions.length,
      fragmentCueCount: fragmentEvents.length,
      fragmentTransitionCount: fragmentTransitions.length,
      humanBoundMergeCount: 1 as const,
      executedTransitionCount: 0 as const,
      approvedTransitionCount: 0 as const,
    },
    authority: {
      propConstraintsCreated: false as const,
      handoffsExecuted: false as const,
      fragmentMergeBound: false as const,
      blenderLaunched: false as const,
      animationExecutionAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
  };

  return { ...body, mapPropHandoffSha256: sha256Canonical(body) };
}
