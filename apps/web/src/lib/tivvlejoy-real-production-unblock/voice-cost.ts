import type { VoiceCostPreflight, VoiceGenerationPlan } from './types';

export function compileVoiceCostPreflight(plan: VoiceGenerationPlan): VoiceCostPreflight {
  const sharedMayNeedTwo = plan.sharedLineCount;
  return {
    state: 'VOICE_COST_UNKNOWN_REQUIRES_AUTHORIZATION',
    pipCharacters: null,
    goatCharacters: null,
    totalCharacters: null,
    expectedGenerationRequests: plan.lineCount,
    pricingInvented: false,
    generated: false,
    ...(sharedMayNeedTwo >= 0 ? {} : {}),
  };
}

export function countSpokenCharacters(input: {
  pipText?: string | null;
  goatText?: string | null;
}): { pipCharacters: number | null; goatCharacters: number | null; totalCharacters: number | null } {
  if (input.pipText == null && input.goatText == null) {
    return { pipCharacters: null, goatCharacters: null, totalCharacters: null };
  }
  const pipCharacters = input.pipText == null ? null : Array.from(input.pipText).length;
  const goatCharacters = input.goatText == null ? null : Array.from(input.goatText).length;
  const totalCharacters =
    pipCharacters == null || goatCharacters == null ? null : pipCharacters + goatCharacters;
  return { pipCharacters, goatCharacters, totalCharacters };
}
