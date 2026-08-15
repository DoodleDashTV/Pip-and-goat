/**
 * Canon / reference database structure.
 *
 * This is a file-backed index of binding views and identity facts. It does not
 * write Prisma canon rows and it does not unlock or replace locked canon.
 */
import { z } from 'zod';

export const BindingAuthoritySchema = z.object({
  rule: z.string().min(1),
  directory: z.string().min(1),
  pip: z.array(z.string().min(1)).min(5),
  goat: z.array(z.string().min(1)).min(5),
});

export const CanonReferenceDbSchema = z.object({
  schema: z.literal('tivvlejoy.canon_reference_db.v1'),
  studio: z.literal('TivvleJoy'),
  mutatesLockedCanon: z.literal(false),
  theatricalGate: z.object({
    assetFoundationComplete: z.literal(false),
    goldenSceneRendered: z.literal(false),
    justinApproved: z.literal(false),
    referenceQualityLockEngaged: z.literal(false),
  }),
  bindingAuthority: BindingAuthoritySchema,
  orientation: z.object({
    charactersFace: z.literal('+X'),
    characterLeft: z.literal('+Y'),
    characterRight: z.literal('-Y'),
  }),
  characters: z.record(z.string(), z.record(z.unknown())),
  referenceSlots: z.array(z.string()).min(1),
  rule: z.string().min(1),
});
export type CanonReferenceDb = z.infer<typeof CanonReferenceDbSchema>;

export function parseCanonReferenceDb(raw: unknown): CanonReferenceDb {
  return CanonReferenceDbSchema.parse(raw);
}

export function assertCanonReferenceIsNonMutating(db: CanonReferenceDb) {
  if (db.mutatesLockedCanon) {
    throw new Error('Canon reference database must not mutate locked canon.');
  }
  if (db.theatricalGate.assetFoundationComplete || db.theatricalGate.justinApproved) {
    throw new Error('Canon reference database must not flip the theatrical gate.');
  }
  return true;
}
