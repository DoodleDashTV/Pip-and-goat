export const INFRASTRUCTURE_TEST = 'INFRASTRUCTURE_TEST' as const;
export const DRAFT_NONCANONICAL = 'DRAFT_NONCANONICAL' as const;
export const NOT_FOR_FINAL_PRODUCTION = 'NOT FOR FINAL PRODUCTION' as const;
export const PIPELINE_TEST_ONLY = 'PIPELINE_TEST_ONLY' as const;

export const STUDIO_COMPLETION_STAMP = {
  classification: INFRASTRUCTURE_TEST,
  label: DRAFT_NONCANONICAL,
  watermark: NOT_FOR_FINAL_PRODUCTION,
  outputClass: PIPELINE_TEST_ONLY,
  canonical: false as const,
  productionEligible: false as const,
  final: false as const,
  publishable: false as const,
} as const;

export function stamp<T extends Record<string, unknown>>(value: T): T & typeof STUDIO_COMPLETION_STAMP {
  return { ...STUDIO_COMPLETION_STAMP, ...value };
}
