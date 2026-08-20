import { sampleEpisodeWithKnownHashes } from '@/lib/tivvlejoy-episode-scene-planner/fixture';
import { bindEp012VoiceReceipts } from '@/lib/tivvlejoy-real-input-convergence/voice';
import {
  EP012_VOICE_LINES,
  VOICE_GENERATION_PLAN_SCHEMA,
  type Ep012VoiceLine,
  type VoiceGenerationPlan,
  type VoiceLinePlan,
} from './types';

function speakerFor(dialogueRef: Ep012VoiceLine): VoiceLinePlan['speaker'] {
  const plan = sampleEpisodeWithKnownHashes();
  const beat = plan.storyBeats.find((item) => item.dialogueRefs.includes(dialogueRef));
  if (beat?.primaryCharacter === 'GOAT') return 'GOAT';
  if (beat?.primaryCharacter === 'PIP') return 'PIP';
  if (beat?.primaryCharacter === 'PIP_AND_GOAT') return 'PIP_AND_GOAT';
  if (dialogueRef === 'DL_DECISION_01') return 'GOAT';
  if (dialogueRef === 'DL_BUTTON_01') return 'PIP_AND_GOAT';
  return 'PIP';
}

export function compileEp012RealVoiceGenerationPlan(): VoiceGenerationPlan {
  const receipts = bindEp012VoiceReceipts();
  const lines: VoiceLinePlan[] = EP012_VOICE_LINES.map((dialogueRef) => {
    const binding = receipts.bindings.find((item) => item.dialogueRef === dialogueRef);
    return {
      dialogueRef,
      speaker: speakerFor(dialogueRef),
      textSource: 'NO_CANONICAL_SPOKEN_TEXT_IN_EPISODE_PLAN',
      textHash: null,
      characterCount: null,
      voiceIdentityBound: true,
      expectedOutputFormat: 'real audio receipt plus at least line timing; wav or vendor-lossless sidecar, never a synthetic fixture relabeled real',
      timingRequirement: 'line timing required; word timing preferred; phoneme timing optional and never invented',
      historicalRealReceipt: false,
      synthesized: false,
      ...(binding?.realReceipt ? {} : {}),
    };
  });
  return {
    schemaVersion: VOICE_GENERATION_PLAN_SCHEMA,
    lines,
    lineCount: lines.length,
    pipLineCount: lines.filter((line) => line.speaker === 'PIP').length,
    goatLineCount: lines.filter((line) => line.speaker === 'GOAT').length,
    sharedLineCount: lines.filter((line) => line.speaker === 'PIP_AND_GOAT').length,
    generationPerformed: false,
  };
}

export function missingRealVoiceLines(plan: VoiceGenerationPlan = compileEp012RealVoiceGenerationPlan()): Ep012VoiceLine[] {
  return plan.lines.filter((line) => !line.historicalRealReceipt).map((line) => line.dialogueRef);
}
