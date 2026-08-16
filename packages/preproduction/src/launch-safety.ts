/**
 * Episode create / launch / paid-resource safety for the character-independent
 * workflow (Studio Milestone 5).
 *
 * Pure: no database, network, or clock. Callers (create-episode, generate-final,
 * cloud preflight) supply any persisted mode they already loaded.
 *
 * This never authorizes a paid GPU, never opens Steps 9–16, and never lets a
 * proxy occupant enter FINAL / THEATRICAL / production-library.
 */
import { z } from 'zod';
import { evaluateTheatricalGate } from '@doodle-dash/direction';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from './versions';
import { isProxyCode } from './proxy';
import { evaluateProductionOutputGate } from './gates';

export const LAUNCH_SAFETY_CODES = [
  'ALLOWED',
  'PROXY_CREATE_EPISODE_REFUSED',
  'PROXY_GENERATE_FINAL_REFUSED',
  'PROXY_IN_THEATRICAL_LAUNCH',
  'PAID_RESOURCE_REFUSED',
  'PRODUCTION_LIBRARY_WRITE_REFUSED',
  'THEATRICAL_LAUNCH_REFUSED',
  'STEPS_9_16_STILL_BLOCKED',
  'FINAL_RENDER_REFUSED',
  'PUBLISHING_REFUSED',
  'LOCKED_VOICE_SYNTHESIS_REFUSED',
] as const;
export type LaunchSafetyCode = (typeof LAUNCH_SAFETY_CODES)[number];

export const LaunchSafetyInputSchema = z.object({
  command: z.enum(['create-episode', 'generate-first-draft', 'generate-final', 'preflight']).optional(),
  intent: z.enum(['DRAFT', 'FINAL', 'THEATRICAL', 'PUBLISH']).optional(),
  characterMode: z.enum(['PROXY', 'CANONICAL']).optional(),
  persistedCharacterMode: z.enum(['PROXY', 'CANONICAL']).optional(),
  occupants: z.array(z.string()).optional(),
  characterCodes: z.array(z.string()).optional(),
  allowPaidGpu: z.boolean().default(false),
  cloudRenderEnabled: z.boolean().default(false),
  writeProductionLibrary: z.boolean().default(false),
  synthesizeLockedVoice: z.boolean().default(false),
  publish: z.boolean().default(false),
  estimateUsd: z.number().default(0),
});
export type LaunchSafetyInput = z.input<typeof LaunchSafetyInputSchema>;

export const LaunchSafetySchema = z.object({
  allowed: z.boolean(),
  code: z.enum(LAUNCH_SAFETY_CODES),
  reason: z.string(),
  blockers: z.array(z.string()),
  theatricalAllowed: z.boolean(),
  version: z.literal(PREPRODUCTION_SUBSYSTEM_VERSIONS.launchSafety),
});
export type LaunchSafety = z.infer<typeof LaunchSafetySchema>;

function occupantsOf(input: z.infer<typeof LaunchSafetyInputSchema>): string[] {
  return [...(input.occupants ?? []), ...(input.characterCodes ?? [])];
}

function modeOf(input: z.infer<typeof LaunchSafetyInputSchema>): 'PROXY' | 'CANONICAL' | undefined {
  if (input.characterMode === 'PROXY' || input.persistedCharacterMode === 'PROXY') return 'PROXY';
  if (occupantsOf(input).some(isProxyCode)) return 'PROXY';
  if (input.characterMode === 'CANONICAL' || input.persistedCharacterMode === 'CANONICAL') {
    return 'CANONICAL';
  }
  return undefined;
}

export function evaluatePaidResourcePolicy(input: {
  allowPaidGpu?: boolean;
  cloudRenderEnabled?: boolean;
  estimateUsd?: number;
}): { allowed: boolean; code: LaunchSafetyCode; reason: string } {
  if (input.allowPaidGpu || input.cloudRenderEnabled) {
    return {
      allowed: false,
      code: 'PAID_RESOURCE_REFUSED',
      reason: 'Paid GPU / cloud render is refused from the character-independent track.',
    };
  }
  if ((input.estimateUsd ?? 0) > 0) {
    return {
      allowed: false,
      code: 'PAID_RESOURCE_REFUSED',
      reason: 'Positive spend estimates are refused. Local draft cost must stay $0.',
    };
  }
  return { allowed: true, code: 'ALLOWED', reason: 'Local zero-cost path.' };
}

export function evaluateEpisodeCreateSafety(raw: LaunchSafetyInput): LaunchSafety {
  return evaluateEpisodeLaunchSafety({ ...raw, command: raw.command ?? 'create-episode' });
}

export function evaluateEpisodeLaunchSafety(raw: LaunchSafetyInput): LaunchSafety {
  const input = LaunchSafetyInputSchema.parse(raw);
  const blockers: string[] = [];
  let code: LaunchSafetyCode = 'ALLOWED';
  const theatrical = evaluateTheatricalGate();
  const mode = modeOf(input);
  const occupants = occupantsOf(input);
  const proxies = occupants.filter(isProxyCode);
  const command = input.command ?? 'preflight';
  const intent = input.intent ?? (command === 'generate-final' ? 'FINAL' : 'DRAFT');

  const paid = evaluatePaidResourcePolicy({
    allowPaidGpu: input.allowPaidGpu,
    cloudRenderEnabled: input.cloudRenderEnabled,
    estimateUsd: input.estimateUsd,
  });
  if (!paid.allowed) {
    code = paid.code;
    blockers.push(paid.reason);
  }

  if (input.writeProductionLibrary) {
    code = 'PRODUCTION_LIBRARY_WRITE_REFUSED';
    blockers.push('Pre-production and proxy paths must not write production-library/.');
  }

  if (input.synthesizeLockedVoice) {
    code = 'LOCKED_VOICE_SYNTHESIS_REFUSED';
    blockers.push('Locked voices cannot be synthesised, cloned, or replaced.');
  }

  if (input.publish || intent === 'PUBLISH') {
    code = 'PUBLISHING_REFUSED';
    blockers.push('Publishing is refused while the character-independent track is open and Steps 9–16 stay closed.');
  }

  if (
    (command === 'generate-final' || intent === 'FINAL') &&
    intent !== 'PUBLISH' &&
    intent !== 'THEATRICAL' &&
    !theatrical.allowed
  ) {
    if (code === 'ALLOWED') code = 'FINAL_RENDER_REFUSED';
    blockers.push(
      'generate-final / FINAL_RENDER is refused while evaluateTheatricalGate().allowed is false and currentStage is DDP_STEPS_1_8.',
    );
  }

  if (command === 'create-episode' && (intent === 'FINAL' || intent === 'THEATRICAL' || intent === 'PUBLISH')) {
    code = intent === 'FINAL' ? 'PROXY_GENERATE_FINAL_REFUSED' : 'THEATRICAL_LAUNCH_REFUSED';
    blockers.push('create-episode only accepts DRAFT intent. Final / theatrical / publishing are refused.');
  }

  if (intent === 'THEATRICAL' || intent === 'PUBLISH') {
    if (code === 'ALLOWED') code = 'THEATRICAL_LAUNCH_REFUSED';
    blockers.push('Theatrical / publishing launch is refused. Steps 9–16 stay closed.');
  }

  if (!theatrical.allowed && (intent === 'THEATRICAL' || intent === 'PUBLISH')) {
    blockers.push('evaluateTheatricalGate().allowed is false.');
  }

  if (mode === 'PROXY' && command === 'create-episode') {
    code = 'PROXY_CREATE_EPISODE_REFUSED';
    blockers.push(
      'Labeled noncanonical proxies cannot create a studio Episode row. Use /preproduction or /workflow.',
    );
  }

  if (proxies.length > 0 && command === 'create-episode') {
    code = 'PROXY_CREATE_EPISODE_REFUSED';
    blockers.push(`Proxy codes ${proxies.join(', ')} cannot be attached to create-episode.`);
  }

  if (mode === 'PROXY' && (command === 'generate-final' || intent === 'FINAL')) {
    code = 'PROXY_GENERATE_FINAL_REFUSED';
    blockers.push('Proxy occupants cannot enter generate-final / FINAL production output.');
  }

  if (mode === 'PROXY' && (intent === 'THEATRICAL' || intent === 'PUBLISH')) {
    code = 'PROXY_IN_THEATRICAL_LAUNCH';
    blockers.push('Proxy occupants cannot enter a theatrical or publishing launch.');
  }

  if (proxies.length > 0 && (intent === 'FINAL' || intent === 'THEATRICAL' || input.allowPaidGpu)) {
    const gate = evaluateProductionOutputGate({
      outputClass: intent === 'FINAL' ? 'FINAL_PRODUCTION' : 'PIPELINE_TEST',
      renderTier: intent === 'FINAL' ? 'FINAL' : 'DRAFT',
      assetQuality: intent === 'THEATRICAL' ? 'THEATRICAL' : 'PROTOTYPE',
      occupants: proxies,
      writeProductionLibrary: input.writeProductionLibrary,
      launchPaidGpu: input.allowPaidGpu,
      claimMaster: intent === 'FINAL',
    });
    blockers.push(...gate.blockers);
  }

  const allowed = blockers.length === 0;
  if (!allowed && code === 'ALLOWED') {
    code = 'THEATRICAL_LAUNCH_REFUSED';
  }

  return LaunchSafetySchema.parse({
    allowed,
    code: allowed ? 'ALLOWED' : code,
    reason: allowed
      ? command === 'create-episode'
        ? 'Studio episode create may proceed as DRAFT.'
        : 'Launch request has no proxy, paid, theatrical, or library-write markers.'
      : blockers[0] ?? 'Launch refused.',
    blockers,
    theatricalAllowed: theatrical.allowed,
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.launchSafety,
  });
}

export function evaluateWorkflowReadiness(input: {
  characterMode: 'PROXY' | 'CANONICAL';
  outputClass: string;
  qcTechnical: 'PASS' | 'FAIL';
  qcArtistic: 'NOT_RENDERED' | string;
  scenePlanEmitted: boolean;
}): {
  canCreateStudioEpisode: boolean;
  canEmitDraftScenePlan: boolean;
  canLaunchFinal: boolean;
  canLaunchPaidGpu: boolean;
  canOpenTheatrical: boolean;
  artistic: 'NOT_RENDERED';
} {
  const proxy = input.characterMode === 'PROXY';
  return {
    canCreateStudioEpisode: !proxy,
    canEmitDraftScenePlan: !proxy && input.scenePlanEmitted,
    canLaunchFinal: false,
    canLaunchPaidGpu: false,
    canOpenTheatrical: false,
    artistic: 'NOT_RENDERED',
  };
}
