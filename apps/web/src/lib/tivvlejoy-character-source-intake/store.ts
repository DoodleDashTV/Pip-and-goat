import type { GoatSourceReceipt } from './receipt';
import type { CharacterUploadSession } from './session';

const sessions = new Map<string, CharacterUploadSession>();
let lockedReceipt: GoatSourceReceipt | null = null;

export function getCharacterSourceStore() {
  return {
    putSession(session: CharacterUploadSession) {
      sessions.set(session.sessionId, session);
      return session;
    },
    getSession(sessionId: string) {
      return sessions.get(sessionId) ?? null;
    },
    listSessions() {
      return [...sessions.values()];
    },
    lockReceipt(receipt: GoatSourceReceipt) {
      lockedReceipt = receipt;
      return receipt;
    },
    getReceipt() {
      return lockedReceipt;
    },
    reset() {
      sessions.clear();
      lockedReceipt = null;
    },
  };
}

export function resetCharacterSourceStore() {
  getCharacterSourceStore().reset();
}
