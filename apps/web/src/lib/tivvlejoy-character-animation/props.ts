import { sha256Canonical } from './hash';
import { type PropState } from './types';

export type PropEvent = {
  shotId: string;
  propId: string;
  fromCarrier: string | null;
  toCarrier: string | null;
  state: PropState;
};

export type PropInteractionPlan = {
  events: PropEvent[];
  propInteractionSha256: string;
};

export function buildPropInteraction(events: Omit<PropEvent, 'state'>[] | PropEvent[]): PropInteractionPlan {
  const normalized: PropEvent[] = events.map((event, index) => ({
    ...event,
    state: 'state' in event && event.state ? event.state : defaultState(event, index, events.length),
  }));
  return { events: normalized, propInteractionSha256: sha256Canonical(normalized) };
}

function defaultState(event: { fromCarrier: string | null; toCarrier: string | null }, index: number, total: number): PropState {
  if (!event.fromCarrier && !event.toCarrier) return 'FREE';
  if (event.fromCarrier && event.toCarrier && event.fromCarrier !== event.toCarrier) return 'TRANSFERRING';
  if (event.toCarrier && !event.fromCarrier) return index === 0 ? 'APPROACHING' : 'ATTACHED';
  if (event.fromCarrier && !event.toCarrier) return 'RELEASED';
  return index === total - 1 ? 'HELD' : 'ATTACHED';
}

export function detectPropTeleport(events: PropEvent[]): boolean {
  let carrier: string | null = null;
  for (const event of events) {
    if (event.state === 'TRANSFERRING') {
      carrier = event.toCarrier;
      continue;
    }
    if (event.toCarrier && carrier && event.toCarrier !== carrier && event.state !== 'RECEIVING' as never) {
      if (event.state !== 'TRANSFERRING' && event.fromCarrier !== carrier) return true;
    }
    if (event.toCarrier) carrier = event.toCarrier;
    if (event.state === 'RELEASED' || event.state === 'FREE' || event.state === 'STORED') carrier = null;
  }
  return false;
}

export function mapHandoffPlan(shotIds: string[]): PropInteractionPlan {
  const [a, b, c, d, e, f] = shotIds;
  return buildPropInteraction([
    { shotId: a ?? 'SH01', propId: 'STORY_MAP', fromCarrier: null, toCarrier: 'PIP', state: 'PICK_UP' as never },
    { shotId: b ?? 'SH02', propId: 'STORY_MAP', fromCarrier: 'PIP', toCarrier: 'PIP', state: 'HELD' },
    { shotId: c ?? 'SH03', propId: 'STORY_MAP', fromCarrier: 'PIP', toCarrier: 'GOAT', state: 'TRANSFERRING' },
    { shotId: d ?? 'SH04', propId: 'STORY_MAP', fromCarrier: 'PIP', toCarrier: 'GOAT', state: 'HELD' },
    { shotId: e ?? 'SH05', propId: 'STORY_MAP', fromCarrier: 'GOAT', toCarrier: 'GOAT', state: 'HELD' },
    { shotId: f ?? 'SH06', propId: 'STORY_MAP', fromCarrier: 'GOAT', toCarrier: null, state: 'RELEASED' },
  ].map((event) => ({
    shotId: event.shotId,
    propId: event.propId,
    fromCarrier: event.fromCarrier,
    toCarrier: event.toCarrier,
    state: event.state === ('PICK_UP' as never) ? 'ATTACHED' : event.state,
  })));
}
