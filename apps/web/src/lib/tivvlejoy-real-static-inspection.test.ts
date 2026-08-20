import { describe, expect, it } from 'vitest';
import { inspectZipArchive, buildStoredZip } from './tivvlejoy-real-scenery-inspection';
import {
  blendHeaderOnly,
  inspectRealSourceBytes,
  mountainGlbBytes,
  sha256Stream,
  tavernFbxBytes,
  verifySourceHash,
} from './tivvlejoy-real-input-convergence';

describe('TIVVLEJOY_REAL_SCENERY_STATIC_INSPECTION_PASS_V1', () => {
  it('inspects a real GLB pass without treating it as a fixture class', async () => {
    const bytes = mountainGlbBytes();
    const hash = await verifySourceHash({ sourceId: 'SRC_MOUNTAIN_GLB', objectIdentity: 'obj', bytes });
    const report = inspectRealSourceBytes({
      sourceId: 'SRC_MOUNTAIN_GLB',
      objectIdentity: 'obj',
      formatHint: '.glb',
      bytes,
      hash,
      objectNames: ['MountainHero'],
    });
    expect(report.evidenceClass).toBe('REAL_SOURCE_INSPECTION');
    expect(report.format).toBe('GLB');
    expect(report.glb).toBeTruthy();
    expect(report.glb?.malformed).toBe(false);
    expect(report.deepBlenderInspectionPending).toBe(true);
  });

  it('inspects FBX conservatively and reports confidence', async () => {
    const bytes = tavernFbxBytes();
    const hash = await verifySourceHash({ sourceId: 'SRC_TAVERN_FBX', objectIdentity: 'fbx', bytes });
    const report = inspectRealSourceBytes({
      sourceId: 'SRC_TAVERN_FBX',
      objectIdentity: 'fbx',
      formatHint: '.fbx',
      bytes,
      hash,
    });
    expect(report.fbx?.confidence).toBeTruthy();
    expect(report.notes.join(' ')).not.toMatch(/full geometry validated/i);
  });

  it('reads blend headers only and keeps deep inspection pending', async () => {
    const bytes = blendHeaderOnly();
    const hash = await verifySourceHash({ sourceId: 'SRC_BLEND', objectIdentity: 'blend', bytes });
    const report = inspectRealSourceBytes({
      sourceId: 'SRC_BLEND',
      objectIdentity: 'blend',
      formatHint: '.blend',
      bytes,
      hash,
    });
    expect(report.blendHeader?.deepInspectionPending).toBe(true);
    expect(report.blendHeader?.headerValid).toBe(true);
  });

  it('runs archive security without executing scripts', () => {
    const safe = inspectZipArchive(
      buildStoredZip([
        { name: 'models/tavern.blend', data: 'BLENDER' },
        { name: 'textures/wood.png', data: 'png' },
      ]),
    );
    expect(safe.state).toBe('ARCHIVE_SAFE');
    expect(safe.executedEmbeddedScripts).toBe(false);
    const unsafe = inspectZipArchive(buildStoredZip([{ name: '../escape.fbx', data: 'x' }]));
    expect(unsafe.state).toBe('ARCHIVE_UNSAFE_PATH');
  });

  it('marks hash missing expected when no receipt hash exists', async () => {
    const bytes = mountainGlbBytes();
    const hash = await verifySourceHash({ sourceId: 'SRC', objectIdentity: 'x', bytes, expectedSha256: null });
    expect(hash.state).toBe('HASH_MISSING_EXPECTED');
    const mismatch = await verifySourceHash({
      sourceId: 'SRC',
      objectIdentity: 'x',
      bytes,
      expectedSha256: 'ab'.repeat(32),
    });
    expect(mismatch.state).toBe('HASH_MISMATCH');
    expect(await sha256Stream(bytes)).toMatch(/^[a-f0-9]{64}$/);
  });
});
