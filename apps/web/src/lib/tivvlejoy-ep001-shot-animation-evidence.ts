import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001PerShotCharacterIntegration } from '@/lib/tivvlejoy-ep001-per-shot-character-integration';
import { compileEp001MapPropHandoff } from '@/lib/tivvlejoy-ep001-map-prop-handoff';
import { compileEp001DialogueAnimationManifest } from '@/lib/tivvlejoy-ep001-dialogue-animation-manifest';

export const EP001_SHOT_ANIMATION_EVIDENCE_SCHEMA = 'TIVVLEJOY_EP001_SHOT_ANIMATION_EVIDENCE_V1' as const;

export function compileEp001ShotAnimationEvidence() {
  const integration = compileEp001PerShotCharacterIntegration();
  const prop = compileEp001MapPropHandoff();
  const dialogue = compileEp001DialogueAnimationManifest();

  const shots = integration.shots.map((shot) => {
    const shotDialogue = dialogue.lines.filter((line) => line.shotId === shot.shotId);
    const mapSwitches = [
      ...prop.storyMap.transitions.filter((item) => item.shotId === shot.shotId),
      ...prop.mapFragment.transitions.filter((item) => item.shotId === shot.shotId),
    ];
    const reviewFrames = [...new Set([
      shot.inFrame,
      Math.max(shot.inFrame, shot.inFrame + Math.floor(shot.durationFrames * 0.25)),
      Math.max(shot.inFrame, shot.inFrame + Math.floor(shot.durationFrames * 0.5)),
      Math.max(shot.inFrame, shot.outFrame - 1),
      ...shotDialogue.flatMap((line) => [line.startFrame, Math.max(line.startFrame, line.endFrame - 1)]),
      ...mapSwitches.flatMap((item) => [Math.max(shot.inFrame, item.frame - 1), item.frame, Math.min(shot.outFrame - 1, item.frame + 1)]),
    ])].filter((frame) => frame >= shot.inFrame && frame < shot.outFrame).sort((a,b) => a - b);

    const body = {
      shotId: shot.shotId,
      inFrame: shot.inFrame,
      outFrame: shot.outFrame,
      shotIntegrationSha256: shot.shotIntegrationSha256,
      dialogueLineIds: shotDialogue.map((line) => line.lineId),
      mapTransitionIds: mapSwitches.map((item) => item.transitionId),
      outputs: {
        playblast: {
          key: `tivvlejoy-assets/episodes/EP001/shots/${shot.shotId}/review/character-playblast.mp4`,
          width: 540 as const,
          height: 960 as const,
          fps: 30 as const,
          codec: 'H264_REVIEW' as const,
          burnInRequired: ['episodeId','shotId','frame','characterPackageHashes','animationManifestSha256'] as const,
          audioMode: 'APPROVED_DIALOGUE_IF_BOUND_OTHERWISE_SILENT' as const,
        },
        stills: reviewFrames.map((frame) => ({
          frame,
          key: `tivvlejoy-assets/episodes/EP001/shots/${shot.shotId}/review/stills/frame-${String(frame).padStart(4,'0')}.png`,
        })),
        metricsKey: `tivvlejoy-assets/episodes/EP001/shots/${shot.shotId}/review/animation-metrics.json`,
        manifestKey: `tivvlejoy-assets/episodes/EP001/shots/${shot.shotId}/review/animation-evidence-manifest.json`,
      },
      machineChecks: [
        'all required canonical controls resolve through exact adapters',
        'no non-finite transforms or constraint evaluation errors',
        'feet/hooves remain within configured contact tolerance during planted intervals',
        'no unintended root/master scale animation',
        'prop owner/constraint state agrees with the approved prop state machine at every explicit switch',
        'dialogue action curves stay inside assigned line and picture-handle windows',
        'source rig library remains unmodified',
        'rendered frame range exactly matches shot range',
      ],
      humanChecks: [
        'character likeness and silhouette remain on model',
        'pose readability at phone-scale 9:16 framing',
        'eye-lines and attention clearly support the story beat',
        'dialogue performance reads naturally rather than mechanically',
        'wing/body gestures support intent without over-animation',
        'feet/hooves do not visibly slide, pop or penetrate ground',
        'scarf/backpack/collar/tag/horns/crest remain stable and free of distracting clipping',
        'map/fragment handoffs preserve world-space continuity',
        'no character-character or character-scenery penetration that distracts from the shot',
        'entry/exit pose continuity matches adjacent shots',
      ],
      currentState: 'OUTPUT_CONTRACT_READY_REAL_ANIMATION_NOT_EXECUTED' as const,
      evidenceManifestSha256: null,
      humanReviewReceiptSha256: null,
      approved: false as const,
    };
    return { ...body, shotEvidenceContractSha256: sha256Canonical(body) };
  });

  const body = {
    schemaVersion: EP001_SHOT_ANIMATION_EVIDENCE_SCHEMA,
    episodeId: 'EP001' as const,
    fps: 30 as const,
    perShotCharacterIntegrationSha256: integration.perShotCharacterIntegrationSha256,
    mapPropHandoffSha256: prop.mapPropHandoffSha256,
    dialogueAnimationManifestSha256: dialogue.dialogueAnimationManifestSha256,
    shots,
    metrics: {
      shotCount: shots.length,
      requiredStillCount: shots.reduce((total, shot) => total + shot.outputs.stills.length, 0),
      playblastCountRequired: shots.length,
      evidenceManifestCountRequired: shots.length,
      receivedEvidenceManifestCount: 0 as const,
      humanApprovedShotCount: 0 as const,
    },
    authority: {
      animationRendered: false as const,
      evidenceReceived: false as const,
      shotApprovalIssued: false as const,
      finalRenderAllowed: false as const,
      paidComputeAllowed: false as const,
      productionWritesAllowed: false as const,
    },
  };
  return { ...body, shotAnimationEvidenceSha256: sha256Canonical(body) };
}
