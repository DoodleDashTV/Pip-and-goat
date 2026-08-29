import { describe, expect, it } from 'vitest';
import {
  AUTOMATED_FINISHING_SCHEMA,
  compileAutomatedFinishing,
  finishingFrameState,
  type FinishingInput,
} from './tivvlejoy-nightshift-production';

function validInput(): FinishingInput {
  return {
    episodeId: 'TJ-EP-001',
    source: {
      artifactPath: 'approved/ep001/master.mov',
      sha256: 'a'.repeat(64),
      width: 1080,
      height: 1920,
      fps: 30,
      totalFrames: 900,
      verified: true,
      visualGate: 'PASS',
    },
    overlays: [
      {
        overlayId: 'TITLE',
        kind: 'TITLE',
        startFrame: 0,
        endFrame: 60,
        bounds: { x: 0.1, y: 0.08, width: 0.8, height: 0.1 },
        text: 'TivvleJoy',
      },
      {
        overlayId: 'CAP_1',
        kind: 'CAPTION',
        startFrame: 90,
        endFrame: 150,
        bounds: { x: 0.1, y: 0.78, width: 0.8, height: 0.12 },
        text: 'Look!',
      },
    ],
    protectedRegions: [
      {
        regionId: 'FACE_1',
        kind: 'FACE',
        startFrame: 80,
        endFrame: 160,
        bounds: { x: 0.35, y: 0.3, width: 0.3, height: 0.2 },
      },
    ],
    captionsQcPassed: true,
    deliveries: [
      { profileId: 'VERTICAL_9_16', framing: 'SAFE_CONTAIN' },
      { profileId: 'LANDSCAPE_16_9', framing: 'SAFE_CONTAIN' },
    ],
  };
}

describe('TIVVLEJOY_AUTOMATED_FINISHING_V1', () => {
  it('compiles a deterministic, free-local, frame-driven manifest', () => {
    const first = compileAutomatedFinishing(validInput());
    const second = compileAutomatedFinishing(validInput());
    expect(first.schemaVersion).toBe(AUTOMATED_FINISHING_SCHEMA);
    expect(first.status).toBe('READY_FOR_FREE_LOCAL_FINISHING');
    expect(first.finishingManifestSha256).toBe(second.finishingManifestSha256);
    expect(first.rendererContract.timing).toBe('FRAME_DRIVEN');
    expect(first.authority.paidComputeAllowed).toBe(false);
    expect(first.authority.finalApprovalIssued).toBe(false);
  });

  it('uses contain for cross-aspect variants so faces are not silently cropped', () => {
    const manifest = compileAutomatedFinishing(validInput());
    const landscape = manifest.deliveries.find((item) => item.profileId === 'LANDSCAPE_16_9');
    expect(landscape?.fit).toBe('CONTAIN');
    expect(landscape?.preservesFullSourceFrame).toBe(true);
  });

  it('fails closed on unapproved source, bad captions, collision, and unreviewed crop', () => {
    const input = validInput();
    input.source.visualGate = 'PARTIAL';
    input.captionsQcPassed = false;
    input.overlays[1]!.bounds = { x: 0.35, y: 0.3, width: 0.3, height: 0.2 };
    input.deliveries.push({ profileId: 'SQUARE_1_1', framing: 'REVIEWED_CROP' });
    const manifest = compileAutomatedFinishing(input);
    expect(manifest.status).toBe('BLOCKED');
    expect(manifest.blockers).toEqual([
      'CAPTION_QC_NOT_PASS',
      'OVERLAY_PROTECTED_REGION_COLLISION',
      'SOURCE_VISUAL_GATE_NOT_PASS',
      'UNREVIEWED_CROP_REQUESTED',
    ]);
  });

  it('resolves overlays from integer frames rather than wall-clock time', () => {
    const manifest = compileAutomatedFinishing(validInput());
    expect(finishingFrameState(manifest, 89).activeOverlayIds).toEqual([]);
    expect(finishingFrameState(manifest, 90).activeOverlayIds).toEqual(['CAP_1']);
    expect(finishingFrameState(manifest, 149).activeOverlayIds).toEqual(['CAP_1']);
    expect(finishingFrameState(manifest, 150).activeOverlayIds).toEqual([]);
  });
});
