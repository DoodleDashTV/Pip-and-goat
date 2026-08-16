/**
 * Step 27 — Append-only hash-chained audit log.
 *
 * Detects edit, delete, insert, reorder, and broken chains.
 * Never stores secrets or raw credentials.
 */
import { createHash } from 'node:crypto';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { redactSecrets } from './security';
import { stamp } from './labels';

export type AuditEvent = {
  index: number;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
  correlationId: string;
  outcome: 'ALLOWED' | 'DENIED';
  denialReason: string | null;
  stage: string;
  branch: string;
  commit: string;
  inputHash: string;
  outputHash: string;
  provenanceRef: string;
  costClass: 'ZERO' | 'ESTIMATED' | 'PAID_REFUSED';
  authorized: false;
  policyDecision: string;
  prevHash: string;
  eventHash: string;
};

function hashEvent(event: Omit<AuditEvent, 'eventHash'>): string {
  return createHash('sha256').update(JSON.stringify(event)).digest('hex');
}

export function appendAuditEvent(
  chain: readonly AuditEvent[],
  input: Omit<AuditEvent, 'index' | 'prevHash' | 'eventHash' | 'authorized'> & { authorized?: false },
): AuditEvent[] {
  const prevHash = chain[chain.length - 1]?.eventHash ?? 'GENESIS';
  const redacted: Omit<AuditEvent, 'eventHash'> = {
    ...input,
    actor: redactSecrets(input.actor),
    target: redactSecrets(input.target),
    denialReason: input.denialReason ? redactSecrets(input.denialReason) : null,
    policyDecision: redactSecrets(input.policyDecision),
    index: chain.length,
    authorized: false,
    prevHash,
  };
  return [...chain, { ...redacted, eventHash: hashEvent(redacted) }];
}

export function verifyAuditChain(chain: readonly AuditEvent[]): {
  intact: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  let expectedPrev = 'GENESIS';
  chain.forEach((event, index) => {
    if (event.index !== index) issues.push(`reordered-or-inserted:${index}`);
    if (event.prevHash !== expectedPrev) issues.push(`broken-chain:${index}`);
    const { eventHash, ...rest } = event;
    if (hashEvent(rest) !== eventHash) issues.push(`edited:${index}`);
    expectedPrev = event.eventHash;
  });
  return { intact: issues.length === 0, issues };
}

export function detectAuditTamper(original: readonly AuditEvent[], candidate: readonly AuditEvent[]): {
  edited: boolean;
  deleted: boolean;
  inserted: boolean;
  reordered: boolean;
  broken: boolean;
} {
  const verification = verifyAuditChain(candidate);
  const originalHashes = original.map((event) => event.eventHash);
  const candidateHashes = candidate.map((event) => event.eventHash);
  const deleted = originalHashes.some((hash) => !candidateHashes.includes(hash));
  const inserted = candidateHashes.some((hash) => !originalHashes.includes(hash));
  const reordered =
    originalHashes.length === candidateHashes.length &&
    originalHashes.some((hash, index) => candidateHashes[index] !== hash) &&
    !deleted &&
    originalHashes.every((hash) => candidateHashes.includes(hash));
  const edited = verification.issues.some((issue) => issue.startsWith('edited'));
  return {
    edited,
    deleted,
    inserted,
    reordered,
    broken: !verification.intact,
  };
}

export function compileAuditIntegrityEvidence(chain: readonly AuditEvent[]) {
  const verification = verifyAuditChain(chain);
  return stamp({
    eventCount: chain.length,
    intact: verification.intact,
    issues: verification.issues,
    storesSecrets: false as const,
    cacheKey: createHash('sha256').update(chain.map((event) => event.eventHash).join('.')).digest('hex'),
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.audit,
  });
}
