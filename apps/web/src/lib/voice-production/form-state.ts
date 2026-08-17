import { GOAT_CHARACTER_ID, PIP_CHARACTER_ID } from './types';

export const VOICE_CARD_ORDER = [PIP_CHARACTER_ID, GOAT_CHARACTER_ID] as const;

export type VoiceFormFields = {
  dialogueText: string;
  performanceDirection: string;
  pronunciationNotes: string;
  emotion: string;
};

export type VoiceFormSnapshot = VoiceFormFields & {
  revision: number;
  lineId: string;
  characterId: string;
};

export type OrderedVoiceLine = {
  id: string;
  characterId: string;
};

export function createFormSnapshot(
  input: VoiceFormFields & { lineId: string; characterId: string; revision?: number },
): VoiceFormSnapshot {
  return {
    dialogueText: input.dialogueText,
    performanceDirection: input.performanceDirection,
    pronunciationNotes: input.pronunciationNotes,
    emotion: input.emotion,
    lineId: input.lineId,
    characterId: input.characterId,
    revision: input.revision ?? 0,
  };
}

export function applyFormPatch(current: VoiceFormSnapshot, patch: Partial<VoiceFormFields>): VoiceFormSnapshot {
  return {
    ...current,
    ...patch,
    revision: current.revision + 1,
  };
}

export function newestFormValue<T>(events: Array<{ revision: number; value: T }>): T {
  if (events.length === 0) {
    throw new Error('No form events to resolve.');
  }
  return events.reduce((best, event) => (event.revision >= best.revision ? event : best)).value;
}

export function canApplyRemoteForm(localRevision: number, remoteRevision: number): boolean {
  return remoteRevision >= localRevision;
}

export function visibleFieldsForAction(form: VoiceFormSnapshot): VoiceFormFields {
  return {
    dialogueText: form.dialogueText,
    performanceDirection: form.performanceDirection,
    pronunciationNotes: form.pronunciationNotes,
    emotion: form.emotion,
  };
}

export function mergeRemoteLine<T extends VoiceFormFields>(
  local: VoiceFormSnapshot,
  remote: T & { revision?: number },
): T & VoiceFormFields {
  if (!canApplyRemoteForm(local.revision, remote.revision ?? -1)) {
    return {
      ...remote,
      ...visibleFieldsForAction(local),
    };
  }
  return remote;
}

export function cardOrderIndex(characterId: string): number {
  const index = VOICE_CARD_ORDER.indexOf(characterId as (typeof VOICE_CARD_ORDER)[number]);
  return index === -1 ? VOICE_CARD_ORDER.length : index;
}

export function sortVoiceLines<T extends { characterId: string }>(lines: T[]): T[] {
  return [...lines].sort((left, right) => cardOrderIndex(left.characterId) - cardOrderIndex(right.characterId));
}

export function replaceLineKeepingOrder<T extends OrderedVoiceLine>(
  lines: T[],
  target: { id?: string; characterId: string },
  next: T,
): T[] {
  let replaced = false;
  const mapped = lines.map((line) => {
    if (line.characterId === target.characterId || (target.id && line.id === target.id)) {
      replaced = true;
      return next;
    }
    return line;
  });
  if (!replaced) mapped.push(next);
  return sortVoiceLines(mapped);
}

export function actionTarget(line: OrderedVoiceLine): { lineId: string; characterId: string } {
  return { lineId: line.id, characterId: line.characterId };
}

export function isCanonicalCardOrder(lines: Array<{ characterId: string }>): boolean {
  const ordered = sortVoiceLines(lines);
  return (
    ordered[0]?.characterId === PIP_CHARACTER_ID &&
    ordered[1]?.characterId === GOAT_CHARACTER_ID &&
    lines.every((line, index) => line.characterId === ordered[index]?.characterId)
  );
}
