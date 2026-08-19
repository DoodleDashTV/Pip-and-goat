import { sha256Canonical, stableSorted } from './hash';
import { maxRisk, raiseRisk, riskRank } from './pressure';
import { environmentVisualSignatureSha256 } from './signature';
import { variationStrength } from './variation';
import {
  DEFAULT_RECENT_WINDOW_SIZE,
  REPETITION_RISK_SCHEMA,
  type EpisodeUsageRecord,
  type RepetitionRiskReport,
  type RiskLevel,
} from './types';

export function consecutiveIdenticalRun(signatures: string[]): number {
  let longest = 0;
  let current = 0;
  let previous = '';
  for (const signature of signatures) {
    if (signature === previous) current += 1;
    else current = 1;
    previous = signature;
    longest = Math.max(longest, current);
  }
  return longest;
}

export function buildRepetitionRisk(input: {
  recent: EpisodeUsageRecord[];
  windowSize: number;
  locationReuseRisk: RiskLevel;
  archetypeReuseRisk: RiskLevel;
  heroSetReuseRisk: RiskLevel;
  interiorReuseRisk: RiskLevel;
  backgroundReuseRisk: RiskLevel;
  dressingReuseRisk: RiskLevel;
  semanticRolePressure: RiskLevel;
  highPressureLocations: string[];
  highPressureArchetypes: string[];
  reasons: string[];
  suggestions: string[];
}): RepetitionRiskReport {
  const windowSize = input.windowSize > 0 ? input.windowSize : DEFAULT_RECENT_WINDOW_SIZE;
  const recent = input.recent.slice(-windowSize);
  const signatures = recent.map(environmentVisualSignatureSha256);
  const longest = consecutiveIdenticalRun(signatures);
  let consecutive: RiskLevel = 'VERY_LOW';
  if (longest >= 3) consecutive = 'VERY_HIGH';
  else if (longest === 2) consecutive = 'HIGH';

  const majorVariantCount = recent.slice(1).filter((item, index) => variationStrength(recent[index]!, item) === 'MAJOR').length;
  const repeated = signatures.filter((signature, index) => signatures.indexOf(signature) !== index);
  const uniqueRepeated = [...new Set(repeated)].sort();

  let overall = maxRisk([
    input.locationReuseRisk,
    input.archetypeReuseRisk,
    input.heroSetReuseRisk,
    input.interiorReuseRisk,
    input.backgroundReuseRisk,
    input.dressingReuseRisk,
    input.semanticRolePressure,
    consecutive,
  ]);
  if (consecutive === 'VERY_HIGH') overall = raiseRisk(overall, 1);
  if (majorVariantCount >= Math.max(2, Math.floor(recent.length / 3)) && consecutive === 'VERY_LOW') {
    if (overall === 'HIGH') overall = 'MODERATE';
    if (overall === 'VERY_HIGH' && uniqueRepeated.length === 0) overall = 'HIGH';
  }
  const distinctLocations = new Set(recent.map((item) => item.locationId)).size;
  const distinctSignatures = new Set(signatures).size;
  if (
    distinctLocations >= 3 &&
    distinctSignatures >= Math.ceil(recent.length * 0.8) &&
    longest < 2 &&
    riskRank(overall) > riskRank(input.locationReuseRisk)
  ) {
    overall = maxRisk(['LOW', input.locationReuseRisk]);
  }

  const reasons = [...input.reasons];
  if (longest >= 3) reasons.push(`${longest} consecutive identical visual signatures`);
  else reasons.push('no consecutive identical visual signatures');
  if (majorVariantCount) reasons.push(`${majorVariantCount} major seasonal/location/archetype variants in the recent window`);

  const body = {
    schemaVersion: REPETITION_RISK_SCHEMA,
    overallRisk: overall,
    locationReuseRisk: input.locationReuseRisk,
    archetypeReuseRisk: input.archetypeReuseRisk,
    heroSetReuseRisk: input.heroSetReuseRisk,
    interiorReuseRisk: input.interiorReuseRisk,
    backgroundReuseRisk: input.backgroundReuseRisk,
    dressingReuseRisk: input.dressingReuseRisk,
    semanticRolePressure: input.semanticRolePressure,
    consecutiveSimilarityRisk: consecutive,
    highPressureLocations: stableSorted(input.highPressureLocations),
    highPressureArchetypes: stableSorted(input.highPressureArchetypes),
    repeatedVisualSignatures: uniqueRepeated,
    recentWindowAnalysis: {
      windowSize,
      analyzedEpisodeCount: recent.length,
      distinctLocations: new Set(recent.map((item) => item.locationId)).size,
      distinctArchetypes: new Set(recent.map((item) => item.archetypeId)).size,
      distinctSignatures: new Set(signatures).size,
      longestConsecutiveIdenticalSignatures: longest,
    },
    suggestions: [...input.suggestions].sort(),
    reasons: reasons.sort(),
  };
  return { ...body, scoreSha256: sha256Canonical(body) };
}
