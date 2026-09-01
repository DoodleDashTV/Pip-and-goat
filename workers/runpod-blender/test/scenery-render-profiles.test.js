'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { PROFILES, resolveProfile, ffmpegEncodeArgs, ffmpegHasUpscale } = require('../src/scenery-render-profiles');

test('LOOKDEV_FAST is the default and cannot be labeled FINAL', () => {
  const profile = resolveProfile({});
  assert.equal(profile.id, 'LOOKDEV_FAST');
  assert.equal(profile.canLabelFinal, false);
  assert.equal(profile.resolution, '540x960');
  assert.throws(
    () => resolveProfile({ SCENERY_SHOWCASE_RENDER_PROFILE: 'LOOKDEV_FAST', SCENERY_SHOWCASE_OUTPUT_LABEL: 'FINAL_1080P' }),
    (error) => error.code === 'LOOKDEV_CANNOT_LABEL_FINAL',
  );
});

test('FINAL requires native 1080x1920 and forbids upscale', () => {
  assert.equal(PROFILES.FINAL.resolution, '1080x1920');
  assert.equal(PROFILES.FINAL.allowUpscale, false);
  assert.throws(
    () => resolveProfile({ SCENERY_SHOWCASE_RENDER_PROFILE: 'FINAL', SCENERY_SHOWCASE_INTERNAL_RESOLUTION: '540x960' }),
    (error) => error.code === 'FINAL_RESOLUTION_NOT_NATIVE',
  );
  assert.throws(
    () => resolveProfile({ SCENERY_SHOWCASE_RENDER_PROFILE: 'FINAL', SCENERY_SHOWCASE_INTERNAL_RESOLUTION: '1080x1920', SCENERY_SHOWCASE_ALLOW_UPSCALE: 'true' }),
    (error) => error.code === 'FINAL_UPSCALE_FORBIDDEN',
  );
  const ok = resolveProfile({ SCENERY_SHOWCASE_RENDER_PROFILE: 'FINAL', SCENERY_SHOWCASE_INTERNAL_RESOLUTION: '1080x1920' });
  assert.equal(ok.resolution, '1080x1920');
  const args = ffmpegEncodeArgs({ fps: 30, inputPattern: 'frame_%04d.png', outputPath: 'out.mp4', profile: ok });
  assert.equal(ffmpegHasUpscale(args), false);
});

test('legacy Lanczos scale is not used for FINAL encode args', () => {
  const final = resolveProfile({ SCENERY_SHOWCASE_RENDER_PROFILE: 'FINAL' });
  const args = ffmpegEncodeArgs({ inputPattern: '/tmp/frame_%04d.png', outputPath: '/tmp/out.mp4', profile: final });
  assert.ok(!args.includes('-vf'));
  assert.ok(!args.some((part) => String(part).includes('lanczos')));
});
