import { ACTION_IDS, ACTION_VOCABULARY_SCHEMA, type ActionId } from './types';

export const ACTION_VOCABULARY = ACTION_IDS.map((actionId) => ({
  schemaVersion: ACTION_VOCABULARY_SCHEMA,
  actionId,
  semantic: true as const,
  adapterRequired: true as const,
}));

export function actionCount(): number {
  return ACTION_IDS.length;
}

export function isKnownAction(value: string): value is ActionId {
  return (ACTION_IDS as readonly string[]).includes(value);
}
