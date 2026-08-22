import { sampleEpisodeWithKnownHashes } from '@/lib/tivvlejoy-episode-scene-planner';
import { assembleShot } from '@/lib/tivvlejoy-shot-assembly-manifest';
import { ep012AssemblyInputs } from '@/lib/tivvlejoy-shot-assembly-manifest/fixture';
import { compileEpisodeProductionPacket } from './packet';
import { hashContinuityFact } from './continuity';
import type { ContinuityFact } from './types';
import type { VoiceReceipt } from './types';

export function ep012VoiceReceipts(): VoiceReceipt[] {
  return [
    { dialogueRef: 'DL_HOOK_01', receiptRef: 'VR_HOOK', receiptSha256: 'aa'.repeat(32), characterId: 'PIP' },
    { dialogueRef: 'DL_DISCOVERY_01', receiptRef: 'VR_DISC', receiptSha256: 'ab'.repeat(32), characterId: 'PIP' },
    { dialogueRef: 'DL_DECISION_01', receiptRef: 'VR_DEC', receiptSha256: 'ac'.repeat(32), characterId: 'GOAT' },
    { dialogueRef: 'DL_ACTION_01', receiptRef: 'VR_ACT', receiptSha256: 'ad'.repeat(32), characterId: 'PIP' },
    { dialogueRef: 'DL_COMPLICATION_01', receiptRef: 'VR_COM', receiptSha256: 'ae'.repeat(32), characterId: 'PIP' },
    { dialogueRef: 'DL_TURN_01', receiptRef: 'VR_TURN', receiptSha256: 'af'.repeat(32), characterId: 'GOAT' },
    { dialogueRef: 'DL_CLIMAX_01', receiptRef: 'VR_CLI', receiptSha256: 'b1'.repeat(32), characterId: 'PIP' },
    { dialogueRef: 'DL_RESOLUTION_01', receiptRef: 'VR_RES', receiptSha256: 'b2'.repeat(32), characterId: 'PIP' },
  ];
}

export function ep012ContinuityFacts(): ContinuityFact[] {
  const drafts = [
    { continuityFactId: 'FACT_MAP_SH003', continuityVersion: '1', topic: 'PROP_CARRIER', subjectId: 'STORY_MAP', state: 'PIP', effectiveEpisode: 'EP012', effectiveShot: 'SH003', source: 'planner' },
    { continuityFactId: 'FACT_MAP_SH007', continuityVersion: '1', topic: 'PROP_CARRIER', subjectId: 'STORY_MAP', state: 'PIP', effectiveEpisode: 'EP012', effectiveShot: 'SH007', source: 'planner' },
    { continuityFactId: 'FACT_SIGN', continuityVersion: '1', topic: 'SIGNAGE', subjectId: 'BAKERY_SIGN', state: 'PIP_AND_GOAT_BAKERY', effectiveEpisode: 'EP012', effectiveShot: 'SH001', source: 'world-builder' },
    { continuityFactId: 'FACT_WEATHER_BAKERY', continuityVersion: '1', topic: 'WEATHER', subjectId: 'bakery', state: 'CLEAR', effectiveEpisode: 'EP012', effectiveShot: 'SH001', source: 'world-builder' },
    { continuityFactId: 'FACT_ENTRY', continuityVersion: '1', topic: 'SCREEN_DIRECTION', subjectId: 'GOAT', state: 'ENTER_RIGHT', effectiveEpisode: 'EP012', effectiveShot: 'SH002', source: 'planner' },
  ];
  return drafts.map((fact) => ({ ...fact, dependencySha256: hashContinuityFact(fact) }));
}

export function compileEp012ProductionPacket(
  voiceReceipts: VoiceReceipt[] = ep012VoiceReceipts(),
) {
  const plan = sampleEpisodeWithKnownHashes();
  const inputs = ep012AssemblyInputs();
  const manifests = inputs.map((input) => assembleShot(input));
  return compileEpisodeProductionPacket({
    episodeId: plan.episodeId,
    episodeVersion: plan.episodeVersion,
    scriptSha256: plan.dependencyHash,
    voiceReceipts,
    shots: manifests.map((manifest, index) => ({
      shotId: manifest.shotId,
      locationId: inputs[index]!.locationPresetId,
      cameraTemplateId: manifest.camera.cameraTemplateId,
      lightingPresetId: manifest.lighting.lightingPresetId,
      assemblyDependencySha256: manifest.assemblyDependencySha256,
      environmentDependencySha256: manifest.assemblyDependencySha256,
      dialogueRefs: inputs[index]!.dialogueRefs,
      charactersVisible: inputs[index]!.charactersVisible,
    })),
    continuityDependencySha256: 'cc'.repeat(32),
    characterRigsResolved: false,
    pipRigVersion: 'UNRESOLVED_PRODUCTION_RIG',
    goatRigVersion: 'UNRESOLVED_PRODUCTION_RIG',
  });
}
