import { assetsWithRole, uniqueCanonicalGroups } from './selectable';
import type { ApprovedEnvironmentAsset } from '@/lib/tivvlejoy-approved-asset-registry/types';
import type { RiskLevel, RolePressure } from './types';

export function rolePressureFromDemand(demand: number, supplyCanonicalGroups: number): RolePressure {
  if (demand <= 0) return 'UNDERUSED';
  const ratio = demand / Math.max(supplyCanonicalGroups, 1);
  if (ratio < 1.15) return 'HEALTHY';
  if (ratio < 2.4) return 'BUSY';
  return 'OVERUSED';
}

export function pressureToRisk(pressure: RolePressure): RiskLevel {
  if (pressure === 'UNDERUSED' || pressure === 'HEALTHY') return 'VERY_LOW';
  if (pressure === 'BUSY') return 'MODERATE';
  return 'HIGH';
}

export function riskRank(level: RiskLevel): number {
  return { VERY_LOW: 0, LOW: 1, MODERATE: 2, HIGH: 3, VERY_HIGH: 4 }[level];
}

export function maxRisk(levels: RiskLevel[]): RiskLevel {
  return levels.reduce((highest, level) => (riskRank(level) > riskRank(highest) ? level : highest), 'VERY_LOW');
}

export function raiseRisk(level: RiskLevel, steps: number): RiskLevel {
  const next = Math.min(4, riskRank(level) + steps);
  return (['VERY_LOW', 'LOW', 'MODERATE', 'HIGH', 'VERY_HIGH'] as const)[next]!;
}

export function lowerRisk(level: RiskLevel, steps: number): RiskLevel {
  const next = Math.max(0, riskRank(level) - steps);
  return (['VERY_LOW', 'LOW', 'MODERATE', 'HIGH', 'VERY_HIGH'] as const)[next]!;
}

export function reuseRiskFromShare(share: number, distinctVariants: number): RiskLevel {
  if (share <= 0) return 'VERY_LOW';
  if (share < 0.22 && distinctVariants >= 3) return 'VERY_LOW';
  if (share < 0.28) return distinctVariants >= 3 ? 'LOW' : 'MODERATE';
  if (share < 0.45) return distinctVariants >= 3 ? 'LOW' : 'MODERATE';
  if (share < 0.65) return distinctVariants >= 2 ? 'MODERATE' : 'HIGH';
  return distinctVariants >= 3 ? 'HIGH' : 'VERY_HIGH';
}

export function demandRiskFromLoad(usesPerUnit: number, variationFamilies: number): RiskLevel {
  const dampened = usesPerUnit / Math.max(1, variationFamilies >= 8 ? 1.15 : 1);
  if (dampened <= 5) return 'VERY_LOW';
  if (dampened <= 9) return 'LOW';
  if (dampened <= 15) return 'MODERATE';
  if (dampened <= 22) return 'HIGH';
  return 'VERY_HIGH';
}

export function canonicalSupplyForRole(assets: ApprovedEnvironmentAsset[], role: string): number {
  return uniqueCanonicalGroups(assetsWithRole(assets, role)).length;
}
