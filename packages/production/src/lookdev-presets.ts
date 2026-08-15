/**
 * Non-destructive lookdev presets for intake and pipeline tests.
 *
 * These presets light and frame a subject. They do not replace uploaded
 * textures, lock a hero grade, or claim character-dependent FINAL framing.
 */
import { z } from 'zod';

export const LookdevPresetsSchema = z.object({
  schema: z.literal('tivvlejoy.lookdev_presets.v1'),
  destructive: z.literal(false),
  appliesToOriginalMeshes: z.literal(false),
  characterDependentFinalFraming: z.literal(false),
  colorManagement: z.object({
    viewTransform: z.literal('Khronos PBR Neutral'),
    look: z.literal('None'),
    exposure: z.number(),
    gamma: z.number(),
    displayDevice: z.literal('sRGB'),
  }),
  render: z.object({
    engine: z.literal('BLENDER_EEVEE_NEXT'),
    resolutionX: z.literal(1080),
    resolutionY: z.literal(1920),
    fps: z.literal(30),
    samplesDraft: z.number().int().positive(),
    samplesReview: z.number().int().positive(),
    samplesTurntable: z.number().int().positive(),
    paidCyclesHero: z.literal(false),
  }),
  materials: z.record(z.string(), z.record(z.unknown())),
  lighting: z.record(z.string(), z.record(z.unknown())),
  cameras: z.record(z.string(), z.record(z.unknown())),
});
export type LookdevPresets = z.infer<typeof LookdevPresetsSchema>;

export function parseLookdevPresets(raw: unknown): LookdevPresets {
  return LookdevPresetsSchema.parse(raw);
}

export const INTAKE_PREVIEW_VIEWS = [
  'front',
  'rear',
  'left',
  'right',
  'three_quarter',
  'face',
  'shoulder_right',
  'satchel_left',
] as const;
