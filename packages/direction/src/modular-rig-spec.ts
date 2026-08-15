/**
 * Modular theatrical Pip rig specification — unbound.
 *
 * This is a contract for a future approved mesh. It is not registered in
 * RIG_PROFILES, is not the default Pip rig, and must not be bound to the
 * current fused candidate.
 */
import { z } from 'zod';
import { CharacterCodeSchema, NonEmptyStringSchema } from './schema/common';

export const ModularRigModuleSchema = z.object({
  id: NonEmptyStringSchema,
  bones: z.array(NonEmptyStringSchema).min(1),
});

export const ModularDeformationTestSchema = z.object({
  id: NonEmptyStringSchema,
  module: NonEmptyStringSchema,
  proxyOnly: z.literal(true),
  blockedOnFusedMesh: z.boolean().default(false),
});

export const ModularRigSpecSchema = z.object({
  schema: z.literal('tivvlejoy.modular_rig_spec.v1'),
  rigId: NonEmptyStringSchema,
  rigVersion: NonEmptyStringSchema,
  characterCode: CharacterCodeSchema,
  boundToCurrentCandidate: z.literal(false),
  boundToReplacementCandidate: z.literal(false),
  quality: z.literal('SPEC_ONLY'),
  inRigRegistry: z.literal(false),
  defaultForPip: z.literal(false),
  modules: z.array(ModularRigModuleSchema).min(1),
  requiredCapabilities: z.array(NonEmptyStringSchema).min(1),
  deformationTests: z.array(ModularDeformationTestSchema).min(1),
  rules: z.array(NonEmptyStringSchema).min(1),
});
export type ModularRigSpec = z.infer<typeof ModularRigSpecSchema>;

export function parseModularRigSpec(raw: unknown): ModularRigSpec {
  return ModularRigSpecSchema.parse(raw);
}

export function assertModularRigUnbound(spec: ModularRigSpec) {
  if (spec.boundToCurrentCandidate || spec.boundToReplacementCandidate || spec.defaultForPip || spec.inRigRegistry) {
    throw new Error('Modular Pip rig spec must stay unbound and out of the live rig registry.');
  }
  if (spec.deformationTests.some((test) => test.proxyOnly !== true)) {
    throw new Error('Modular deformation tests must run on a labeled proxy only.');
  }
  return true;
}

export const PROXY_CHARACTER_LABEL = 'PROXY_PIPELINE_BIRD';
