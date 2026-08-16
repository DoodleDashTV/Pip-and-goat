/**
 * Recovery and provenance ledger.
 *
 * Rollback points stay recorded even while Pip geometry is frozen. Nothing here
 * authorizes a reset of Milestone 2/3 history or a write to production-library/.
 */
import { z } from 'zod';

export const RecoveryLedgerSchema = z.object({
  schema: z.literal('tivvlejoy.recovery_ledger.v1'),
  paidResources: z.literal(false),
  rollbackPoints: z
    .array(
      z.object({
        id: z.string().min(1),
        ref: z.string().optional(),
        sha256: z.string().optional(),
        note: z.string().min(1),
      }),
    )
    .min(1),
  rules: z.array(z.string().min(1)).min(1),
});
export type RecoveryLedger = z.infer<typeof RecoveryLedgerSchema>;

export function parseRecoveryLedger(raw: unknown): RecoveryLedger {
  return RecoveryLedgerSchema.parse(raw);
}

export function requiredRollbackIds(ledger: RecoveryLedger) {
  return ledger.rollbackPoints.map((point) => point.id);
}
