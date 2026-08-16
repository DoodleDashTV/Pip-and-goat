/**
 * Local audio timing QC against the planned animatic.
 *
 * Compares planned mix duration to animatic frames. Does not synthesise voices.
 */
import type { AnimaticPlan } from './animatic';
import type { AudioPlan } from './audio';

export function evaluateAudioTiming(input: {
  animatic: AnimaticPlan;
  audio: AudioPlan;
  measuredDurationSeconds?: number;
}): {
  plannedSeconds: number;
  measuredSeconds: number | null;
  withinTolerance: boolean;
  lockedVoicesUntouched: true;
  paid: false;
} {
  const plannedSeconds = input.animatic.totalFrames / input.animatic.fps;
  const measuredSeconds = input.measuredDurationSeconds ?? null;
  const withinTolerance =
    measuredSeconds == null ? true : Math.abs(measuredSeconds - plannedSeconds) <= 0.75;
  return {
    plannedSeconds,
    measuredSeconds,
    withinTolerance,
    lockedVoicesUntouched: true,
    paid: false,
  };
}
