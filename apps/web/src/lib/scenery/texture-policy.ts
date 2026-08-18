import { z } from 'zod';
import { TEXTURE_TIERS, type TextureTier } from './types';

export const TextureTierPolicySchema = z.object({
  requestedTier: z.enum(TEXTURE_TIERS),
  memoryBudgetMb: z.number().positive(),
  shotKind: z.enum(['preview', 'distant', 'standard', 'hero_closeup']),
});

export type TextureTierPolicy = z.infer<typeof TextureTierPolicySchema>;

export interface TextureTierDecision {
  selectedTier: TextureTier;
  rejectedTiers: TextureTier[];
  reason: string;
  memoryBudgetMb: number;
  estimatedMemoryMb: number;
  withinBudget: boolean;
}

const TIER_BASE_MEMORY: Record<TextureTier, number> = {
  '1024': 24,
  '2048': 64,
  '4096': 180,
};

export function recommendTextureTier(shotKind: TextureTierPolicy['shotKind']): TextureTier {
  if (shotKind === 'preview' || shotKind === 'distant') {
    return '1024';
  }
  if (shotKind === 'hero_closeup') {
    return '4096';
  }
  return '2048';
}

export function resolveTextureTier(
  policy: TextureTierPolicy,
  assetCount: number,
  availableTiers: TextureTier[] = ['1024', '2048', '4096'],
): TextureTierDecision {
  const parsed = TextureTierPolicySchema.parse(policy);
  const rejectedTiers: TextureTier[] = [];
  if (parsed.requestedTier === '4096' && parsed.shotKind !== 'hero_closeup') {
    rejectedTiers.push('4096');
  }
  const preference: readonly TextureTier[] =
    parsed.shotKind === 'hero_closeup'
      ? ['4096', '2048', '1024']
      : parsed.shotKind === 'preview' || parsed.shotKind === 'distant'
        ? ['1024', '2048']
        : ['2048', '1024'];

  let selected: TextureTier | null = null;
  let estimated = 0;

  for (const tier of preference) {
    if (tier === '4096' && parsed.shotKind !== 'hero_closeup') {
      rejectedTiers.push(tier);
      continue;
    }
    if (!availableTiers.includes(tier)) {
      rejectedTiers.push(tier);
      continue;
    }
    estimated = TIER_BASE_MEMORY[tier] * Math.max(1, assetCount);
    if (estimated <= parsed.memoryBudgetMb) {
      selected = tier;
      break;
    }
    rejectedTiers.push(tier);
  }

  if (!selected) {
    selected = '1024';
    estimated = TIER_BASE_MEMORY[selected] * Math.max(1, assetCount);
  }

  return {
    selectedTier: selected,
    rejectedTiers: [...new Set(rejectedTiers)],
    reason:
      selected === parsed.requestedTier
        ? `Using requested ${selected} texture tier for ${parsed.shotKind} shots.`
        : `Selected ${selected} instead of ${parsed.requestedTier} to stay within the ${parsed.memoryBudgetMb} MB budget and ${parsed.shotKind} policy.`,
    memoryBudgetMb: parsed.memoryBudgetMb,
    estimatedMemoryMb: estimated,
    withinBudget: estimated <= parsed.memoryBudgetMb,
  };
}

export function textureTierPolicyCopy(): string[] {
  return [
    '1024: previews, distant scenery, and lightweight drafts.',
    '2048: normal final-production default.',
    '4096: hero environmental close-ups only.',
    'Never load 1024, 2048, and 4096 of the same map at the same time.',
  ];
}
