import { ANIMATION_BATCH_SCHEMA } from './types';
import { sha256Canonical } from './hash';

export type AnimationBatchGroup = {
  batchId: string;
  characterId: 'PIP' | 'GOAT' | 'BOTH';
  rigVersion: string;
  locationId: string;
  dialogueReady: boolean;
  animationDependencyReady: boolean;
  sharedLocomotion: string | null;
  sharedActionPlan: string | null;
  shotIds: string[];
  blockedByRealRig: boolean;
};

export type AnimationBatchPlan = {
  schema: typeof ANIMATION_BATCH_SCHEMA;
  episodeHorizon: 1 | 10 | 30 | 60;
  groups: AnimationBatchGroup[];
  blockedRealRigWork: number;
  executableAfterAdmission: number;
  batchPlanSha256: string;
};

export type BatchableShot = {
  shotId: string;
  episodeId: string;
  characterIds: Array<'PIP' | 'GOAT'>;
  locationId: string;
  dialogueReady: boolean;
  animationDependencyReady: boolean;
  locomotionClass: string;
  actionFoundation: string;
  pipRigVersion: string;
  goatRigVersion: string;
  pipAdmitted: boolean;
  goatAdmitted: boolean;
};

export function planAnimationBatches(input: {
  shots: BatchableShot[];
  episodeHorizon: 1 | 10 | 30 | 60;
}): AnimationBatchPlan {
  const groups = new Map<string, AnimationBatchGroup>();
  for (const shot of input.shots) {
    const both = shot.characterIds.includes('PIP') && shot.characterIds.includes('GOAT');
    const characterId: AnimationBatchGroup['characterId'] = both ? 'BOTH' : shot.characterIds[0] ?? 'PIP';
    const rigVersion = characterId === 'GOAT' ? shot.goatRigVersion : characterId === 'PIP' ? shot.pipRigVersion : `${shot.pipRigVersion}+${shot.goatRigVersion}`;
    const blocked =
      (shot.characterIds.includes('PIP') && !shot.pipAdmitted) || (shot.characterIds.includes('GOAT') && !shot.goatAdmitted);
    const key = [characterId, rigVersion, shot.locationId, shot.dialogueReady, shot.locomotionClass, shot.actionFoundation, blocked].join('|');
    const existing = groups.get(key);
    if (existing) {
      existing.shotIds.push(shot.shotId);
      continue;
    }
    groups.set(key, {
      batchId: `ANIBATCH_${groups.size + 1}`,
      characterId,
      rigVersion,
      locationId: shot.locationId,
      dialogueReady: shot.dialogueReady,
      animationDependencyReady: shot.animationDependencyReady,
      sharedLocomotion: shot.locomotionClass === 'STATIONARY' ? null : shot.locomotionClass,
      sharedActionPlan: shot.actionFoundation,
      shotIds: [shot.shotId],
      blockedByRealRig: blocked,
    });
  }
  const list = [...groups.values()].sort((left, right) => left.batchId.localeCompare(right.batchId));
  const body = {
    schema: ANIMATION_BATCH_SCHEMA,
    episodeHorizon: input.episodeHorizon,
    groups: list,
    blockedRealRigWork: list.filter((group) => group.blockedByRealRig).reduce((sum, group) => sum + group.shotIds.length, 0),
    executableAfterAdmission: list.filter((group) => !group.blockedByRealRig).reduce((sum, group) => sum + group.shotIds.length, 0),
  };
  return { ...body, batchPlanSha256: sha256Canonical(body) };
}
