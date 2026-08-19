import { sha256Canonical } from './hash';
import {
  CONTINUITY_LEDGER_SCHEMA,
  type ContinuityFact,
  type ContinuityStatus,
} from './types';

export type ContinuityObservation = {
  episodeId: string;
  shotId: string;
  topic: string;
  subjectId: string;
  state: string;
  source?: string;
};

export type ContinuityIssue = {
  status: ContinuityStatus;
  topic: string;
  subjectId: string;
  episodeId: string;
  shotId: string;
  expected: string | null;
  observed: string;
  reason: string;
};

export type ContinuityLedger = {
  schemaVersion: typeof CONTINUITY_LEDGER_SCHEMA;
  facts: ContinuityFact[];
  factsById: Map<string, ContinuityFact>;
  ledgerSha256: string;
  indexes: {
    bySubject: Record<string, string[]>;
    byEpisode: Record<string, string[]>;
    byTopic: Record<string, string[]>;
  };
};

export function factKey(topic: string, subjectId: string): string {
  return `${topic}::${subjectId}`;
}

export type { ContinuityFact };

export function hashContinuityFact(input: Omit<ContinuityFact, 'dependencySha256'>): string {
  return sha256Canonical({
    id: input.continuityFactId,
    version: input.continuityVersion,
    topic: input.topic,
    subjectId: input.subjectId,
    state: input.state,
    episode: input.effectiveEpisode,
    shot: input.effectiveShot,
    source: input.source,
  });
}

export function buildContinuityLedger(facts: ContinuityFact[]): ContinuityLedger {
  const sorted = [...facts]
    .map((fact) => ({ ...fact, dependencySha256: fact.dependencySha256 || hashContinuityFact(fact) }))
    .sort((left, right) => left.continuityFactId.localeCompare(right.continuityFactId));
  const bySubject: Record<string, string[]> = {};
  const byEpisode: Record<string, string[]> = {};
  const byTopic: Record<string, string[]> = {};
  for (const fact of sorted) {
    const key = factKey(fact.topic, fact.subjectId);
    (bySubject[key] ??= []).push(fact.continuityFactId);
    (byEpisode[fact.effectiveEpisode] ??= []).push(fact.continuityFactId);
    (byTopic[fact.topic] ??= []).push(fact.continuityFactId);
  }
  for (const record of [bySubject, byEpisode, byTopic]) {
    for (const key of Object.keys(record)) record[key] = [...record[key]!].sort();
  }
  const ledgerSha256 = sha256Canonical({ facts: sorted.map((fact) => ({ id: fact.continuityFactId, sha: fact.dependencySha256 })) });
  return {
    schemaVersion: CONTINUITY_LEDGER_SCHEMA,
    facts: sorted,
    factsById: new Map(sorted.map((fact) => [fact.continuityFactId, fact])),
    ledgerSha256,
    indexes: { bySubject, byEpisode, byTopic },
  };
}

export function latestFact(ledger: ContinuityLedger, topic: string, subjectId: string, before?: { episodeId: string; shotId: string }): ContinuityFact | null {
  const ids = ledger.indexes.bySubject[factKey(topic, subjectId)] ?? [];
  const facts = ids.map((id) => ledger.factsById.get(id)).filter((fact): fact is ContinuityFact => Boolean(fact));
  const filtered = before
    ? facts.filter((fact) => fact.effectiveEpisode < before.episodeId || (fact.effectiveEpisode === before.episodeId && (fact.effectiveShot ?? '') <= before.shotId))
    : facts;
  filtered.sort((left, right) => {
    const episode = left.effectiveEpisode.localeCompare(right.effectiveEpisode);
    if (episode) return episode;
    return (left.effectiveShot ?? '').localeCompare(right.effectiveShot ?? '');
  });
  return filtered.at(-1) ?? null;
}

export function evaluateContinuity(ledger: ContinuityLedger, observations: ContinuityObservation[]): {
  issues: ContinuityIssue[];
  status: ContinuityStatus;
  continuityDependencySha256: string;
} {
  const issues: ContinuityIssue[] = [];
  const sorted = [...observations].sort((left, right) => `${left.episodeId}:${left.shotId}:${left.topic}`.localeCompare(`${right.episodeId}:${right.shotId}:${right.topic}`));
  for (const observed of sorted) {
    const previous = latestFact(ledger, observed.topic, observed.subjectId, { episodeId: observed.episodeId, shotId: observed.shotId });
    if (!previous && (observed.topic === 'PROP_CARRIER' || observed.topic === 'PROP_STATE' || observed.topic === 'SIGNAGE')) {
      issues.push({
        status: 'CONTINUITY_MISSING',
        topic: observed.topic,
        subjectId: observed.subjectId,
        episodeId: observed.episodeId,
        shotId: observed.shotId,
        expected: null,
        observed: observed.state,
        reason: `no prior ${observed.topic} fact for ${observed.subjectId}`,
      });
      continue;
    }
    if (!previous) continue;
    if (previous.dependencySha256 && previous.state !== observed.state) {
      const justified = observed.state.startsWith('TRANSFER:') || observed.state.startsWith('STORED') || observed.state.startsWith('TRANSITION:');
      if (!justified) {
        issues.push({
          status: previous.effectiveEpisode !== observed.episodeId ? 'CONTINUITY_STALE' : 'CONTINUITY_CONFLICT',
          topic: observed.topic,
          subjectId: observed.subjectId,
          episodeId: observed.episodeId,
          shotId: observed.shotId,
          expected: previous.state,
          observed: observed.state,
          reason: `${observed.subjectId} changed from ${previous.state} to ${observed.state} without explicit transfer/transition`,
        });
      }
    }
  }
  const status = issues.some((item) => item.status === 'CONTINUITY_CONFLICT')
    ? 'CONTINUITY_CONFLICT'
    : issues.some((item) => item.status === 'CONTINUITY_MISSING')
      ? 'CONTINUITY_MISSING'
      : issues.some((item) => item.status === 'CONTINUITY_STALE')
        ? 'CONTINUITY_STALE'
        : 'CONTINUITY_VALID';
  return {
    issues,
    status,
    continuityDependencySha256: sha256Canonical({ ledger: ledger.ledgerSha256, issues }),
  };
}

export function affectedEpisodesForSubject(ledger: ContinuityLedger, topic: string, subjectId: string): string[] {
  return [
    ...new Set(
      (ledger.indexes.bySubject[factKey(topic, subjectId)] ?? [])
        .map((id) => ledger.factsById.get(id)?.effectiveEpisode)
        .filter((episodeId): episodeId is string => Boolean(episodeId)),
    ),
  ].sort();
}
