import { describe, expect, it } from 'vitest';
import { compileEp001MapPropHandoff } from './tivvlejoy-ep001-map-prop-handoff';

describe('EP001 story-map prop handoff', () => {
  it('derives only canonical map/fragment transitions and executes none', () => {
    const plan = compileEp001MapPropHandoff();
    expect(plan.metrics.storyMapTransitionCount).toBeGreaterThan(0);
    expect(plan.metrics.fragmentTransitionCount).toBeGreaterThan(0);
    expect(plan.metrics.executedTransitionCount).toBe(0);
    expect(plan.authority.handoffsExecuted).toBe(false);
    expect(plan.authority.blenderLaunched).toBe(false);
    expect(plan.mapPropHandoffSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('binds proven Pip map ownership only where the canonical cue identifies Pip', () => {
    const plan = compileEp001MapPropHandoff();
    const pipTransitions = plan.storyMap.transitions.filter((transition) => transition.toOwner === 'PIP');
    expect(pipTransitions.length).toBeGreaterThan(0);
    expect(pipTransitions.every((transition) => transition.incomingAnchor === 'PIP:PROP_ATTACH')).toBe(true);
    expect(pipTransitions.every((transition) => transition.preserveWorldTransform)).toBe(true);
  });

  it('refuses to infer fragment merge from magic cues alone', () => {
    const plan = compileEp001MapPropHandoff();
    expect(plan.mapFragment.unresolvedMerge.currentState).toBe('HUMAN_BINDING_REQUIRED');
    expect(plan.mapFragment.unresolvedMerge.mayInferFromMagicSparkleAlone).toBe(false);
    expect(plan.authority.fragmentMergeBound).toBe(false);
  });

  it('requires visual continuity review around every explicit switch', () => {
    const plan = compileEp001MapPropHandoff();
    expect(plan.storyMap.transitions.every((transition) => transition.visualContinuityReviewRequired)).toBe(true);
    expect(plan.mapFragment.transitions.every((transition) => transition.visualContinuityReviewRequired)).toBe(true);
  });
});
