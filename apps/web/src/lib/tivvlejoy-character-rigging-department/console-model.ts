import { evaluateGoatCharacterMasterGate } from './quality-gate';
import { runGoatCharacterBuildPipeline } from './pipeline';
import { buildFuturePipCharacterManifestStub } from './future-pip';

export const TIVVLEJOY_CHARACTER_RIGGING_CONSOLE_HREF = '/character-rigging' as const;

export type CharacterRiggingConsoleModel = ReturnType<typeof buildCharacterRiggingConsoleModel>;

export function buildCharacterRiggingConsoleModel() {
  const pipeline = runGoatCharacterBuildPipeline();
  const gate = evaluateGoatCharacterMasterGate();
  return {
    href: TIVVLEJOY_CHARACTER_RIGGING_CONSOLE_HREF,
    title: 'Character Rigging & Animation Department',
    subtitle:
      'Reusable TivvleJoy department for Goat now and Pip later. Goat is not production-ready until real-asset Blender gates pass.',
    status: gate.status,
    verdict: gate.verdict,
    characterId: 'CHAR_GOAT_001' as const,
    goatProductionReady: false,
    realAssetStatus: gate.realAssetStatus,
    nextInputRequired: gate.nextInputRequired,
    stageCount: pipeline.stages.length,
    blockedStageCount: pipeline.stages.filter((item) => item.disposition === 'BLOCKED').length,
    reports: gate.reports,
    futurePip: buildFuturePipCharacterManifestStub(),
    safety: gate.safety,
  };
}
