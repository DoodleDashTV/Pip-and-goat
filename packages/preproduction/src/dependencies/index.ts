/**
 * Shot dependency tracking and invalidation.
 *
 * A shot depends on its beat, storyboard panel, animatic clip, occupants and
 * props. Changing any of those marks the shot dirty. Invalidation never writes
 * production-library and never authorizes a paid rerender.
 */
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import type { StoryDraft } from '../story';
import type { StoryboardPlan } from '../storyboard';
import type { AnimaticPlan } from '../animatic';
import type { ShotPlan } from '../shotplan';

export type ShotDependency = {
  shotId: string;
  beatId: string;
  panelId: string | null;
  clipId: string | null;
  occupants: string[];
  props: string[];
};

export function trackShotDependencies(input: {
  draft: StoryDraft;
  storyboard: StoryboardPlan;
  animatic: AnimaticPlan;
  shotPlan: ShotPlan;
}): {
  dependencies: ShotDependency[];
  version: typeof PREPRODUCTION_SUBSYSTEM_VERSIONS.dependencies;
} {
  const dependencies = input.shotPlan.shots.map((shot) => {
    const beat = input.draft.beats.find((candidate) => candidate.beatId === shot.beatId);
    const panel = input.storyboard.panels.find((candidate) => candidate.beatId === shot.beatId);
    const clip = input.animatic.clips.find((candidate) => candidate.beatId === shot.beatId);
    return {
      shotId: shot.shotId,
      beatId: shot.beatId,
      panelId: panel?.panelId ?? null,
      clipId: clip?.clipId ?? null,
      occupants: [...shot.occupants],
      props: [...(beat?.requiredProps ?? [])],
    };
  });
  return { dependencies, version: PREPRODUCTION_SUBSYSTEM_VERSIONS.dependencies };
}

export function invalidateShots(
  dependencies: readonly ShotDependency[],
  change: { kind: 'BEAT' | 'PANEL' | 'CLIP' | 'OCCUPANT' | 'PROP'; id: string },
): { dirtyShotIds: string[]; paidRerender: false } {
  const dirtyShotIds = dependencies
    .filter((entry) => {
      if (change.kind === 'BEAT') return entry.beatId === change.id;
      if (change.kind === 'PANEL') return entry.panelId === change.id;
      if (change.kind === 'CLIP') return entry.clipId === change.id;
      if (change.kind === 'OCCUPANT') return entry.occupants.includes(change.id);
      return entry.props.includes(change.id);
    })
    .map((entry) => entry.shotId);
  return { dirtyShotIds, paidRerender: false };
}
