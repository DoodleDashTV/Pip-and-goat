import type { VoiceTimingWorkflow } from './types';

export function compileVoiceTimingWorkflow(): VoiceTimingWorkflow {
  return {
    realGenerationWouldProvide: ['audio only', 'line timing', 'word timing'],
    additionalProcessing: [
      'Phoneme timing is not guaranteed by a vendor receipt and must not be invented.',
      'Map real line/word timing onto the existing viseme table. Do not invent visemes from synthetic placeholders.',
      'Drive mouth/beak and jaw from visemes only after real audio exists.',
      'Editorial cuts and captions must consume the same real timing receipt. Synthetic timing may not be relabeled real.',
    ],
    workflow: ['REAL_AUDIO', 'TIMING_EXTRACTION', 'VISEME', 'ANIMATION', 'EDITORIAL', 'CAPTIONS'],
    syntheticTimingMayBeRelabeledReal: false,
  };
}
