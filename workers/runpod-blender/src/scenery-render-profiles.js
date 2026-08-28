'use strict';

/** Fail-closed TivvleJoy render profiles. LOOKDEV cannot be labeled FINAL. */

const PROFILES = Object.freeze({
  BLOCKOUT: {
    id: 'BLOCKOUT',
    resolution: '360x640',
    engine: 'BLENDER_EEVEE_NEXT',
    samples: 8,
    canLabelFinal: false,
    allowUpscale: false,
    imageSequenceRequired: false,
    stillsOnlyDefault: true,
  },
  LOOKDEV_FAST: {
    id: 'LOOKDEV_FAST',
    resolution: '540x960',
    engine: 'BLENDER_EEVEE_NEXT',
    samples: 48,
    canLabelFinal: false,
    allowUpscale: false,
    imageSequenceRequired: false,
    stillsOnlyDefault: true,
  },
  HERO_STILL: {
    id: 'HERO_STILL',
    resolution: '1080x1920',
    engine: 'CYCLES',
    samples: 256,
    canLabelFinal: false,
    allowUpscale: false,
    imageSequenceRequired: true,
    stillsOnlyDefault: true,
    cyclesDevice: 'GPU',
    denoise: true,
    masterBitDepth: '16',
  },
  FINAL: {
    id: 'FINAL',
    resolution: '1080x1920',
    engine: 'CYCLES',
    samples: 256,
    canLabelFinal: true,
    allowUpscale: false,
    imageSequenceRequired: true,
    stillsOnlyDefault: false,
    cyclesDevice: 'GPU',
    denoise: true,
    masterBitDepth: '16',
    fps: 30,
    frameCount: 900,
  },
});

function strip(value) {
  return String(value || '').replace(/[\r\n]+/g, '').trim();
}

function resolveProfile(env = {}) {
  const raw = strip(env.SCENERY_SHOWCASE_RENDER_PROFILE || env.TIVVLEJOY_RENDER_PROFILE || 'LOOKDEV_FAST').toUpperCase().replace(/-/g, '_');
  const profile = PROFILES[raw];
  if (!profile) {
    throw Object.assign(new Error(`Unknown render profile ${raw}`), { code: 'UNKNOWN_RENDER_PROFILE' });
  }
  const requestedRes = strip(env.SCENERY_SHOWCASE_INTERNAL_RESOLUTION || profile.resolution);
  const label = strip(env.SCENERY_SHOWCASE_OUTPUT_LABEL || (profile.canLabelFinal ? 'FINAL' : profile.id)).toUpperCase();
  if (profile.id !== 'FINAL' && (label === 'FINAL' || label === 'FINAL_1080P')) {
    throw Object.assign(new Error(`${profile.id} cannot be labeled FINAL`), { code: 'LOOKDEV_CANNOT_LABEL_FINAL' });
  }
  if (profile.id === 'FINAL') {
    if (requestedRes !== '1080x1920') {
      throw Object.assign(new Error(`FINAL internal resolution must be 1080x1920, got ${requestedRes}`), { code: 'FINAL_RESOLUTION_NOT_NATIVE' });
    }
    if (String(env.SCENERY_SHOWCASE_ALLOW_UPSCALE || '').toLowerCase() === 'true') {
      throw Object.assign(new Error('FINAL must not contain an upscale stage'), { code: 'FINAL_UPSCALE_FORBIDDEN' });
    }
  }
  return {
    ...profile,
    resolution: profile.id === 'FINAL' ? '1080x1920' : (requestedRes || profile.resolution),
    outputLabel: profile.id === 'FINAL' ? 'FINAL' : profile.id,
  };
}

function ffmpegEncodeArgs({ fps = 30, inputPattern, outputPath, profile }) {
  const resolved = profile && profile.id ? profile : resolveProfile({ SCENERY_SHOWCASE_RENDER_PROFILE: profile });
  if (resolved.id === 'FINAL' && resolved.allowUpscale) {
    throw Object.assign(new Error('FINAL must not contain an upscale stage'), { code: 'FINAL_UPSCALE_FORBIDDEN' });
  }
  const args = ['-y', '-framerate', String(fps), '-i', inputPattern, '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outputPath];
  if (resolved.id !== 'FINAL' && resolved.resolution !== '1080x1920' && resolved.allowUpscale) {
    args.splice(5, 0, '-vf', 'scale=1080:1920:flags=lanczos');
  }
  return args;
}

function ffmpegHasUpscale(args) {
  return args.some((part) => String(part).toLowerCase().includes('scale=') || String(part).toLowerCase().includes('lanczos'));
}

module.exports = { PROFILES, resolveProfile, ffmpegEncodeArgs, ffmpegHasUpscale };
