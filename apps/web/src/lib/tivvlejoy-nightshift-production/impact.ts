import { sha256Canonical } from './hash';

export type ChangeKind =
  | 'VOICE_RECEIPT'
  | 'PIP_RIG'
  | 'GOAT_RIG'
  | 'SCENERY_ASSET'
  | 'CAMERA'
  | 'LIGHTING'
  | 'SHOT_DURATION'
  | 'CAPTION'
  | 'REVIEW_APPROVAL';

export type ChangeImpact = {
  kind: ChangeKind;
  invalidates: string[];
  preserves: string[];
  impactSha256: string;
};

const MATRIX: Record<ChangeKind, { invalidates: string[]; preserves: string[] }> = {
  VOICE_RECEIPT: {
    invalidates: ['viseme', 'performance timing', 'dialogue edit', 'caption timing', 'editorial audio', 'final shot spec'],
    preserves: ['scenery source inspection', 'approved scenery identity', 'camera language', 'staging axis'],
  },
  PIP_RIG: {
    invalidates: ['pip animation binding', 'pip contact', 'shot animation manifest', 'render dependency'],
    preserves: ['voice receipt', 'scenery source inspection', 'editorial picture intent', 'captions wording'],
  },
  GOAT_RIG: {
    invalidates: ['goat animation binding', 'goat contact', 'shot animation manifest', 'render dependency'],
    preserves: ['voice receipt', 'scenery source inspection', 'editorial picture intent', 'captions wording'],
  },
  SCENERY_ASSET: {
    invalidates: ['environment resolution', 'dependent shot assembly', 'visual approval', 'render dependency'],
    preserves: ['voice receipt', 'unrelated character performances', 'caption wording'],
  },
  CAMERA: {
    invalidates: ['camera hash', 'composition QC', 'staging visibility', 'final shot spec', 'render dependency'],
    preserves: ['voice receipt', 'scenery source inspection'],
  },
  LIGHTING: {
    invalidates: ['lighting hash', 'visual approval', 'render dependency', 'final shot spec'],
    preserves: ['voice receipt', 'dialogue wording', 'scenery source inspection'],
  },
  SHOT_DURATION: {
    invalidates: ['editorial timeline', 'dialogue bounds', 'sfx timing', 'music bounds', 'caption boundaries', 'final shot spec'],
    preserves: ['voice source hash', 'scenery source hash', 'camera intent'],
  },
  CAPTION: {
    invalidates: ['caption plan', 'master timeline captions'],
    preserves: ['animation manifest', 'scenery source hash', 'voice receipt', 'camera hash'],
  },
  REVIEW_APPROVAL: {
    invalidates: ['approval matrix binding', 'director package approval slice'],
    preserves: ['voice receipt', 'scenery source hash', 'camera hash unless the note changed camera'],
  },
};

export function evaluateChangeImpact(kind: ChangeKind): ChangeImpact {
  const row = MATRIX[kind];
  return { kind, ...row, impactSha256: sha256Canonical({ kind, ...row }) };
}
