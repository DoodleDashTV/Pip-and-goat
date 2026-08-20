export interface FramingCheckInput {
  aspect: '9:16';
  headInFrame: boolean;
  faceInFrame: boolean;
  propInFrame: boolean;
  gestureInFrame: boolean;
  walkEntryVisible: boolean;
  walkExitVisible: boolean;
  importantActingOutsideFrame: boolean;
}

export interface FramingCheckResult {
  ok: boolean;
  warnings: string[];
  blockers: string[];
}

export function evaluatePerformanceFraming(input: FramingCheckInput): FramingCheckResult {
  const warnings: string[] = [];
  const blockers: string[] = [];
  if (input.importantActingOutsideFrame) {
    blockers.push('Important acting is planned outside the 9:16 frame.');
  }
  if (!input.headInFrame) blockers.push('Head is not visible in frame.');
  if (!input.faceInFrame) warnings.push('Face may not be readable in this framing.');
  if (!input.propInFrame) warnings.push('Story prop may leave frame.');
  if (!input.gestureInFrame) warnings.push('Gesture may not read in 9:16.');
  if (!input.walkEntryVisible) warnings.push('Walk entry may be cut off.');
  if (!input.walkExitVisible) warnings.push('Walk exit may be cut off.');
  return { ok: blockers.length === 0, warnings, blockers };
}
