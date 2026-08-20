import { sha256Canonical } from './hash';
import type { DialogueEdit } from './dialogue';

export type AudioOverlapPlan = {
  kind: 'J_CUT' | 'L_CUT' | 'NONE';
  incomingShotId: string;
  outgoingShotId: string;
  overlapFrames: number;
  duplicateDialogue: false;
  planSha256: string;
};

export function planJlCut(input: {
  outgoing: { shotId: string; outFrame: number; dialogue?: DialogueEdit | null };
  incoming: { shotId: string; inFrame: number; dialogue?: DialogueEdit | null };
  prefer?: 'J_CUT' | 'L_CUT' | 'NONE';
}): AudioOverlapPlan {
  const sameLine = Boolean(input.outgoing.dialogue && input.incoming.dialogue && input.outgoing.dialogue.lineId === input.incoming.dialogue.lineId);
  if (sameLine || input.prefer === 'NONE') {
    return {
      kind: 'NONE',
      incomingShotId: input.incoming.shotId,
      outgoingShotId: input.outgoing.shotId,
      overlapFrames: 0,
      duplicateDialogue: false,
      planSha256: sha256Canonical({ kind: 'NONE', in: input.incoming.shotId, out: input.outgoing.shotId }),
    };
  }
  const kind = input.prefer ?? (input.incoming.dialogue && !input.outgoing.dialogue ? 'J_CUT' : input.outgoing.dialogue && !input.incoming.dialogue ? 'L_CUT' : 'NONE');
  const overlapFrames = kind === 'NONE' ? 0 : 8;
  return {
    kind,
    incomingShotId: input.incoming.shotId,
    outgoingShotId: input.outgoing.shotId,
    overlapFrames,
    duplicateDialogue: false,
    planSha256: sha256Canonical({ kind, overlapFrames, in: input.incoming.shotId, out: input.outgoing.shotId }),
  };
}
