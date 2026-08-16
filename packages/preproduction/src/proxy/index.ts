/**
 * Noncanonical proxy characters for pipeline testing.
 *
 * These stand-ins exist so story, storyboard, animatic, camera, lighting, VFX,
 * audio and QC systems can be exercised while Pip and Goat retopology is
 * unfinished. They are not characters. They are not Pip. They are not Goat.
 *
 * Every proxy is labeled in three independent places so a single missed check
 * cannot hide the status:
 *
 *   1. `id` starts with `PROXY_NONCANONICAL_`
 *   2. `label` is the literal `NONCANONICAL_PROXY`
 *   3. `watermark` is burned into every storyboard / animatic / QC record
 *
 * `productionEligible`, `theatricalEligible` and `mayEnterFinalOutput` are
 * always false. There is no setter. Promoting a proxy requires adding a new
 * canonical character through the character-approval process, not flipping a
 * flag here.
 */
import { z } from 'zod';
import { PROXY_CHARACTER_CODES, type ProxyCharacterCode } from '../schema';

export const PROXY_LABEL = 'NONCANONICAL_PROXY' as const;
export const PROXY_WATERMARK = 'PROXY — NOT FOR FINAL PRODUCTION' as const;
export const PROXY_VOICE_PLACEHOLDER = 'proxy_voice_placeholder_v1' as const;

export const LOCKED_VOICE_IDS = ['pip_default_v1', 'goat_default_v1'] as const;

export const ProxyRecordSchema = z.object({
  id: z.enum(PROXY_CHARACTER_CODES),
  displayName: z.string(),
  label: z.literal(PROXY_LABEL),
  watermark: z.literal(PROXY_WATERMARK),
  canonical: z.literal(false),
  productionEligible: z.literal(false),
  theatricalEligible: z.literal(false),
  mayEnterFinalOutput: z.literal(false),
  mayBindLockedVoice: z.literal(false),
  mayWriteProductionLibrary: z.literal(false),
  speciesStandIn: z.string(),
  silhouette: z.string(),
  voicePlaceholderId: z.literal(PROXY_VOICE_PLACEHOLDER),
  notes: z.string(),
});
export type ProxyRecord = z.infer<typeof ProxyRecordSchema>;

export const PROXY_REGISTRY: Record<ProxyCharacterCode, ProxyRecord> = {
  PROXY_NONCANONICAL_BIRD_A: ProxyRecordSchema.parse({
    id: 'PROXY_NONCANONICAL_BIRD_A',
    displayName: 'Proxy Bird A',
    label: PROXY_LABEL,
    watermark: PROXY_WATERMARK,
    canonical: false,
    productionEligible: false,
    theatricalEligible: false,
    mayEnterFinalOutput: false,
    mayBindLockedVoice: false,
    mayWriteProductionLibrary: false,
    speciesStandIn: 'generic small bird volume',
    silhouette: 'rounded two-leg bird blocker, no crest, no satchel, no Pip markings',
    voicePlaceholderId: PROXY_VOICE_PLACEHOLDER,
    notes:
      'Pipeline-test occupant only. Must never be framed, labeled, voiced or rendered as Pip.',
  }),
  PROXY_NONCANONICAL_QUADRUPED_A: ProxyRecordSchema.parse({
    id: 'PROXY_NONCANONICAL_QUADRUPED_A',
    displayName: 'Proxy Quadruped A',
    label: PROXY_LABEL,
    watermark: PROXY_WATERMARK,
    canonical: false,
    productionEligible: false,
    theatricalEligible: false,
    mayEnterFinalOutput: false,
    mayBindLockedVoice: false,
    mayWriteProductionLibrary: false,
    speciesStandIn: 'generic four-leg blocker',
    silhouette: 'boxy quadruped blocker, no horns, no cinnamon patch, no Goat markings',
    voicePlaceholderId: PROXY_VOICE_PLACEHOLDER,
    notes:
      'Pipeline-test occupant only. Must never be framed, labeled, voiced or rendered as Goat.',
  }),
};

export const PROXY_IDS = Object.keys(PROXY_REGISTRY) as ProxyCharacterCode[];

export function isProxyCode(code: string): code is ProxyCharacterCode {
  return code in PROXY_REGISTRY;
}

export function isCanonicalFoundingCode(code: string): boolean {
  return code === 'CHAR_PIP_001' || code === 'CHAR_GOAT_001';
}

export function proxyRecord(id: ProxyCharacterCode): ProxyRecord {
  return PROXY_REGISTRY[id];
}

export function assertProxyNotNamedAsCanon(name: string): void {
  const lowered = name.trim().toLowerCase();
  if (lowered === 'pip' || lowered === 'goat' || lowered.includes('pip ') || lowered.includes('goat ')) {
    throw new Error(
      `Proxy display names may not include Pip or Goat. Received "${name}".`,
    );
  }
}

for (const record of Object.values(PROXY_REGISTRY)) {
  assertProxyNotNamedAsCanon(record.displayName);
}
