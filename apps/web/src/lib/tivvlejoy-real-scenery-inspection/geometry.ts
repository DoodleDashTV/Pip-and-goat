import type { BudgetBand, QualityTier, ScaleState } from './types';

export type ScaleAnalysis = {
  dimensions: { x: number; y: number; z: number } | null;
  unitScale: string | null;
  probableScaleCategory: 'PROP' | 'CHARACTER' | 'BUILDING' | 'TERRAIN' | 'UNKNOWN';
  state: ScaleState;
  suspicious: boolean;
  rescaled: false;
};

export type TransformAnalysis = {
  origin: { x: number; y: number; z: number } | null;
  unappliedScale: boolean;
  rotation: { x: number; y: number; z: number } | null;
  negativeScale: boolean;
  extremeTransforms: boolean;
  boundingBoxOffset: { x: number; y: number; z: number } | null;
  sourceAltered: false;
};

export type BudgetAnalysis = {
  band: BudgetBand;
  triangleEstimate: number | null;
  materialCount: number;
  textureMemoryEstimateBytes: number | null;
  qualityContext: QualityTier;
  gpuPerformanceClaimed: false;
};

export function analyzeScale(input: {
  dimensions?: { x: number; y: number; z: number } | null;
  unitScale?: string | null;
}): ScaleAnalysis {
  const dimensions = input.dimensions ?? null;
  if (!dimensions) {
    return {
      dimensions: null,
      unitScale: input.unitScale ?? null,
      probableScaleCategory: 'UNKNOWN',
      state: 'SCALE_UNKNOWN',
      suspicious: false,
      rescaled: false,
    };
  }
  const max = Math.max(dimensions.x, dimensions.y, dimensions.z);
  const min = Math.min(dimensions.x, dimensions.y, dimensions.z);
  let probableScaleCategory: ScaleAnalysis['probableScaleCategory'] = 'UNKNOWN';
  if (max <= 2) probableScaleCategory = 'PROP';
  else if (max <= 4) probableScaleCategory = 'CHARACTER';
  else if (max <= 40) probableScaleCategory = 'BUILDING';
  else probableScaleCategory = 'TERRAIN';
  const suspicious = max > 10_000 || min < 0 || max <= 0;
  return {
    dimensions,
    unitScale: input.unitScale ?? 'UNKNOWN',
    probableScaleCategory,
    state: suspicious ? 'SCALE_REVIEW_REQUIRED' : 'SCALE_PLAUSIBLE',
    suspicious,
    rescaled: false,
  };
}

export function analyzeTransform(input: {
  origin?: { x: number; y: number; z: number } | null;
  scale?: { x: number; y: number; z: number } | null;
  rotation?: { x: number; y: number; z: number } | null;
  boundingBoxOffset?: { x: number; y: number; z: number } | null;
}): TransformAnalysis {
  const scale = input.scale ?? null;
  const negativeScale = Boolean(scale && (scale.x < 0 || scale.y < 0 || scale.z < 0));
  const unappliedScale = Boolean(scale && (Math.abs(scale.x - 1) > 0.01 || Math.abs(scale.y - 1) > 0.01 || Math.abs(scale.z - 1) > 0.01));
  const extremeTransforms = Boolean(
    scale && (Math.abs(scale.x) > 100 || Math.abs(scale.y) > 100 || Math.abs(scale.z) > 100),
  );
  return {
    origin: input.origin ?? null,
    unappliedScale,
    rotation: input.rotation ?? null,
    negativeScale,
    extremeTransforms,
    boundingBoxOffset: input.boundingBoxOffset ?? null,
    sourceAltered: false,
  };
}

export function analyzeBudget(input: {
  triangleEstimate?: number | null;
  materialCount?: number;
  textureBytes?: number | null;
  quality: QualityTier;
}): BudgetAnalysis {
  const triangles = input.triangleEstimate ?? 0;
  let band: BudgetBand = 'LIGHT';
  if (triangles > 250_000 || (input.textureBytes ?? 0) > 80 * 1024 * 1024) band = 'VERY_HEAVY';
  else if (triangles > 80_000 || (input.textureBytes ?? 0) > 32 * 1024 * 1024) band = 'HEAVY';
  else if (triangles > 12_000) band = 'NORMAL';
  if (input.quality === 'BACKGROUND' && band === 'VERY_HEAVY') band = 'HEAVY';
  return {
    band,
    triangleEstimate: input.triangleEstimate ?? null,
    materialCount: input.materialCount ?? 0,
    textureMemoryEstimateBytes: input.textureBytes ?? null,
    qualityContext: input.quality,
    gpuPerformanceClaimed: false,
  };
}
