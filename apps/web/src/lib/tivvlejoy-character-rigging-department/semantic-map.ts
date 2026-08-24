import type { DepartmentCharacterId } from './types';

export type MeshRole =
  | 'BODY'
  | 'HEAD'
  | 'EYES'
  | 'MOUTH'
  | 'HORNS'
  | 'EARS'
  | 'COLLAR'
  | 'TAG'
  | 'SCARF'
  | 'WINGS'
  | 'CREST'
  | 'BACKPACK'
  | 'STRAP'
  | 'ACCESSORY'
  | 'UNKNOWN';

export type SemanticMapRule = {
  role: MeshRole;
  nameHints: readonly string[];
  characterIds: readonly DepartmentCharacterId[];
};

export const SEMANTIC_MAP_RULES: readonly SemanticMapRule[] = [
  { role: 'WINGS', nameHints: ['wing'], characterIds: ['CHAR_PIP_001'] },
  { role: 'CREST', nameHints: ['crest', 'feather'], characterIds: ['CHAR_PIP_001'] },
  { role: 'BACKPACK', nameHints: ['backpack'], characterIds: ['CHAR_PIP_001'] },
  { role: 'STRAP', nameHints: ['strap'], characterIds: ['CHAR_PIP_001'] },
  { role: 'ACCESSORY', nameHints: ['spiral', 'copper'], characterIds: ['CHAR_PIP_001'] },
  { role: 'HORNS', nameHints: ['horn'], characterIds: ['CHAR_GOAT_001'] },
  { role: 'EARS', nameHints: ['ear'], characterIds: ['CHAR_GOAT_001'] },
  { role: 'COLLAR', nameHints: ['collar'], characterIds: ['CHAR_GOAT_001'] },
  { role: 'TAG', nameHints: ['tag', 'nameplate'], characterIds: ['CHAR_GOAT_001'] },
  { role: 'SCARF', nameHints: ['scarf'], characterIds: ['CHAR_PIP_001', 'CHAR_GOAT_001'] },
  { role: 'EYES', nameHints: ['eye'], characterIds: ['CHAR_GOAT_001', 'CHAR_PIP_001'] },
  { role: 'MOUTH', nameHints: ['mouth', 'jaw', 'beak'], characterIds: ['CHAR_GOAT_001', 'CHAR_PIP_001'] },
  { role: 'HEAD', nameHints: ['head'], characterIds: ['CHAR_GOAT_001', 'CHAR_PIP_001'] },
  { role: 'BODY', nameHints: ['body', 'mesh'], characterIds: ['CHAR_GOAT_001', 'CHAR_PIP_001'] },
];

export function mapObjectNameToRole(objectName: string, characterId: DepartmentCharacterId): MeshRole {
  const lowered = objectName.toLowerCase();
  const match = SEMANTIC_MAP_RULES.find(
    (rule) => rule.characterIds.includes(characterId) && rule.nameHints.some((hint) => lowered.includes(hint)),
  );
  return match?.role ?? 'UNKNOWN';
}
