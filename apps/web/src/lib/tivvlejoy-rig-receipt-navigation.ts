export type RigNavigationCharacterId = 'CHAR_PIP_001' | 'CHAR_GOAT_001';
export type RigNavigationBinding = {
  characterId: RigNavigationCharacterId;
  rigVersionId: string;
  rigSourceSha256: string;
  rigReceiptSha256: string;
};

export function parseRigNavigationBinding(params: Record<string, string | string[] | undefined>): RigNavigationBinding | null {
  const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const characterId = one(params.characterId);
  const rigVersionId = String(one(params.rigVersionId) ?? '').trim();
  const rigSourceSha256 = String(one(params.rigSourceSha256) ?? '').trim().toLowerCase();
  const rigReceiptSha256 = String(one(params.rigReceiptSha256) ?? '').trim().toLowerCase();
  if (characterId !== 'CHAR_PIP_001' && characterId !== 'CHAR_GOAT_001') return null;
  if (!/^[a-f0-9-]{36}$/i.test(rigVersionId)) return null;
  if (!/^[a-f0-9]{64}$/i.test(rigSourceSha256)) return null;
  if (rigReceiptSha256 && !/^[a-f0-9]{64}$/i.test(rigReceiptSha256)) return null;
  return { characterId, rigVersionId, rigSourceSha256, rigReceiptSha256 };
}

export function rigNavigationQuery(binding: RigNavigationBinding) {
  const params = new URLSearchParams({
    characterId: binding.characterId,
    rigVersionId: binding.rigVersionId,
    rigSourceSha256: binding.rigSourceSha256,
  });
  if (binding.rigReceiptSha256) params.set('rigReceiptSha256', binding.rigReceiptSha256);
  return params.toString();
}
