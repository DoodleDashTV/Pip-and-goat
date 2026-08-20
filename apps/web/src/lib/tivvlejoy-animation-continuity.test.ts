import { describe, expect, it } from 'vitest';
import {
  detectAnimationContinuity,
  detectPropTeleport,
  evaluatePerformanceFraming,
  mapHandoffPlan,
  mapHandoffStress,
  type ShotContinuitySnapshot,
} from './tivvlejoy-character-animation';

function snap(overrides: Partial<ShotContinuitySnapshot> & Pick<ShotContinuitySnapshot, 'shotId'>): ShotContinuitySnapshot {
  return {
    characterId: 'PIP',
    positionToken: 'A',
    facing: 'RIGHT',
    screenDirection: 'RIGHT',
    poseToken: 'idle',
    propAttachment: 'PIP',
    gazeTarget: 'OTHER_CHARACTER',
    motionEntry: 'HOLD',
    motionExit: 'HOLD',
    locomotionPhase: 'PLANTED',
    hardCut: false,
    ...overrides,
  };
}

describe('animation continuity and props', () => {
  it('does not flag an intentional hard cut', () => {
    expect(
      detectAnimationContinuity(snap({ shotId: 'A', positionToken: 'A' }), snap({ shotId: 'B', positionToken: 'Z', hardCut: true })),
    ).toEqual([]);
  });

  it('detects an unexplained position jump', () => {
    expect(detectAnimationContinuity(snap({ shotId: 'A' }), snap({ shotId: 'B', positionToken: 'Z' })).map((item) => item.kind)).toContain(
      'POSITION_JUMP',
    );
  });

  it('allows a depart-to-arrive move', () => {
    expect(
      detectAnimationContinuity(
        snap({ shotId: 'A', motionExit: 'DEPART' }),
        snap({ shotId: 'B', positionToken: 'Z', motionEntry: 'ARRIVE' }),
      ).some((item) => item.kind === 'POSITION_JUMP'),
    ).toBe(false);
  });

  it('detects a facing flip without a turn', () => {
    expect(detectAnimationContinuity(snap({ shotId: 'A' }), snap({ shotId: 'B', facing: 'LEFT' })).map((item) => item.kind)).toContain(
      'FACING_FLIP',
    );
  });

  it('allows a facing change when a turn is planned', () => {
    expect(
      detectAnimationContinuity(snap({ shotId: 'A', motionExit: 'TURN' }), snap({ shotId: 'B', facing: 'LEFT', motionEntry: 'TURN' })).some(
        (item) => item.kind === 'FACING_FLIP',
      ),
    ).toBe(false);
  });

  it('detects a silent prop teleport', () => {
    expect(
      detectAnimationContinuity(snap({ shotId: 'A', propAttachment: 'PIP' }), snap({ shotId: 'B', propAttachment: 'GOAT' })).map(
        (item) => item.kind,
      ),
    ).toContain('PROP_TELEPORT');
  });

  it('detects gaze discontinuity away from a hold', () => {
    expect(
      detectAnimationContinuity(snap({ shotId: 'A', gazeTarget: 'STORY_PROP' }), snap({ shotId: 'B', gazeTarget: 'CAMERA_OFF_AXIS' })).map(
        (item) => item.kind,
      ),
    ).toContain('GAZE_DISCONTINUITY');
  });

  it('detects motion discontinuity from in-motion to stationary', () => {
    expect(
      detectAnimationContinuity(snap({ shotId: 'A', motionExit: 'IN_MOTION' }), snap({ shotId: 'B', motionEntry: 'STATIONARY' })).map(
        (item) => item.kind,
      ),
    ).toContain('MOTION_DISCONTINUITY');
  });

  it('detects airborne contact without a jump', () => {
    expect(
      detectAnimationContinuity(
        snap({ shotId: 'A', locomotionPhase: 'CONTACT' }),
        snap({ shotId: 'B', locomotionPhase: 'AIRBORNE' }),
      ).map((item) => item.kind),
    ).toContain('CONTACT_DISCONTINUITY');
  });

  it('ignores a different character', () => {
    expect(detectAnimationContinuity(snap({ shotId: 'A' }), snap({ shotId: 'B', characterId: 'GOAT' }))).toEqual([]);
  });

  it('plans a map handoff without a silent carrier jump', () => {
    const plan = mapHandoffPlan(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
    expect(plan.events.map((item) => item.state)).toEqual(['ATTACHED', 'HELD', 'TRANSFERRING', 'HELD', 'HELD', 'RELEASED']);
    expect(detectPropTeleport(plan.events)).toBe(false);
  });

  it('detects an injected missing transfer', () => {
    const stress = mapHandoffStress(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
    expect(stress.missingTransferDetected).toBe(true);
    expect(stress.teleportOnValidHandoff).toBe(false);
  });

  it('blocks important acting outside a 9:16 frame', () => {
    const result = evaluatePerformanceFraming({
      aspect: '9:16',
      headInFrame: false,
      faceInFrame: false,
      propInFrame: false,
      gestureInFrame: false,
      walkEntryVisible: false,
      walkExitVisible: false,
      importantActingOutsideFrame: true,
    });
    expect(result.ok).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/outside the 9:16 frame/);
  });

  it('warns when a gesture may not read', () => {
    const result = evaluatePerformanceFraming({
      aspect: '9:16',
      headInFrame: true,
      faceInFrame: true,
      propInFrame: true,
      gestureInFrame: false,
      walkEntryVisible: true,
      walkExitVisible: true,
      importantActingOutsideFrame: false,
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/Gesture/);
  });

  const carriers = ['PIP', 'GOAT'] as const;
  for (const from of carriers) {
    for (const to of carriers) {
      it(`tracks ${from} to ${to} attachment without inventing a filename`, () => {
        const issues = detectAnimationContinuity(
          snap({ shotId: 'A', characterId: from, propAttachment: from }),
          snap({ shotId: 'B', characterId: from, propAttachment: to, hardCut: from === to }),
        );
        if (from === to) expect(issues.some((item) => item.kind === 'PROP_TELEPORT')).toBe(false);
        else expect(issues.some((item) => item.kind === 'PROP_TELEPORT')).toBe(true);
      });
    }
  }

  it('keeps framing checks semantic rather than numeric camera solves', () => {
    expect(JSON.stringify(evaluatePerformanceFraming({
      aspect: '9:16',
      headInFrame: true,
      faceInFrame: true,
      propInFrame: true,
      gestureInFrame: true,
      walkEntryVisible: true,
      walkExitVisible: true,
      importantActingOutsideFrame: false,
    }))).not.toMatch(/focalLength|sensorWidth/);
  });

  const frames = [
    { faceInFrame: false, warning: /Face/ },
    { propInFrame: false, warning: /prop/i },
    { walkEntryVisible: false, warning: /Walk entry/ },
    { walkExitVisible: false, warning: /Walk exit/ },
  ] as const;
  for (const frame of frames) {
    it(`warns when ${Object.keys(frame)[0]} is false`, () => {
      const result = evaluatePerformanceFraming({
        aspect: '9:16',
        headInFrame: true,
        faceInFrame: true,
        propInFrame: true,
        gestureInFrame: true,
        walkEntryVisible: true,
        walkExitVisible: true,
        importantActingOutsideFrame: false,
        ...frame,
      });
      expect(result.warnings.join(' ')).toMatch(frame.warning);
    });
  }

  it('does not compare snapshots across a hard cut even when gaze flips', () => {
    expect(
      detectAnimationContinuity(
        snap({ shotId: 'A', gazeTarget: 'STORY_PROP' }),
        snap({ shotId: 'B', gazeTarget: 'CAMERA_OFF_AXIS', hardCut: true }),
      ),
    ).toEqual([]);
  });

  it('records from/to shot ids on every continuity issue', () => {
    const [issue] = detectAnimationContinuity(snap({ shotId: 'A1' }), snap({ shotId: 'B2', positionToken: 'Z' }));
    expect(issue?.fromShotId).toBe('A1');
    expect(issue?.toShotId).toBe('B2');
  });

  it('treats a released map as free for the next carrier only after RELEASED', () => {
    expect(
      detectPropTeleport([
        { shotId: 'A', propId: 'STORY_MAP', fromCarrier: 'PIP', toCarrier: null, state: 'RELEASED' },
        { shotId: 'B', propId: 'STORY_MAP', fromCarrier: null, toCarrier: 'GOAT', state: 'ATTACHED' },
      ]),
    ).toBe(false);
  });

  it('flags Goat suddenly holding a map Pip still owned', () => {
    expect(
      detectPropTeleport([
        { shotId: 'A', propId: 'STORY_MAP', fromCarrier: null, toCarrier: 'PIP', state: 'HELD' },
        { shotId: 'B', propId: 'STORY_MAP', fromCarrier: 'GOAT', toCarrier: 'GOAT', state: 'HELD' },
      ]),
    ).toBe(true);
  });

  it('allows a stored identity accessory to stay off the transfer ledger', () => {
    expect(
      detectPropTeleport([
        { shotId: 'A', propId: 'SCARF', fromCarrier: 'PIP', toCarrier: 'PIP', state: 'STORED' },
        { shotId: 'B', propId: 'SCARF', fromCarrier: 'PIP', toCarrier: 'PIP', state: 'HELD' },
      ]),
    ).toBe(false);
  });

  it('keeps a reaching state from jumping carriers', () => {
    expect(
      detectPropTeleport([
        { shotId: 'A', propId: 'STORY_MAP', fromCarrier: null, toCarrier: 'PIP', state: 'APPROACHING' },
        { shotId: 'B', propId: 'STORY_MAP', fromCarrier: 'PIP', toCarrier: 'PIP', state: 'REACHING' },
        { shotId: 'C', propId: 'STORY_MAP', fromCarrier: 'PIP', toCarrier: 'PIP', state: 'ATTACHED' },
      ]),
    ).toBe(false);
  });
});
