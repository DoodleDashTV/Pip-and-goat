export const PIP_IDENTITY_ACCESSORIES = ['scarf', 'backpack', 'straps', 'copper spiral'] as const;
export const GOAT_IDENTITY_ACCESSORIES = ['collar', 'round Goat tag'] as const;

export type AccessoryRule = {
  characterId: 'PIP' | 'GOAT';
  itemId: string;
  removable: false;
  secondaryMotionAllowed: true;
};

export function identityAccessories(characterId: 'PIP' | 'GOAT'): AccessoryRule[] {
  const items = characterId === 'PIP' ? PIP_IDENTITY_ACCESSORIES : GOAT_IDENTITY_ACCESSORIES;
  return items.map((itemId) => ({
    characterId,
    itemId,
    removable: false as const,
    secondaryMotionAllowed: true as const,
  }));
}

export function accessoryRemovalAllowed(): false {
  return false;
}
