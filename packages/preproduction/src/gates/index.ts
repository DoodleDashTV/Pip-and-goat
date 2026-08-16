/**
 * Fail-closed gates that keep proxy characters out of final production output.
 *
 * This is the load-bearing file of Milestone 4. A proxy may exist in a
 * PIPELINE_TEST or STORY_DRAFT bundle. It may not:
 *
 *   - enter a FINAL or THEATRICAL render
 *   - be labeled master / production ready / theatrical
 *   - write to production-library/
 *   - bind a locked Pip or Goat voice
 *   - emit a story-approved ScenePlan
 *   - authorize a paid GPU launch
 *
 * There is no override flag. A caller that wants a proxy in a final has to
 * change this file in review, which is the point.
 */
import { z } from 'zod';
import { evaluateTheatricalGate } from '@doodle-dash/direction';
import { PlanIssueSchema, type OccupantCode, type OutputClass, type PlanIssue } from '../schema';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { isProxyCode, LOCKED_VOICE_IDS, PROXY_VOICE_PLACEHOLDER } from '../proxy';

export const GATE_CODES = [
  'PROXY_IN_FINAL_RENDER',
  'PROXY_IN_THEATRICAL_BINDING',
  'PROXY_IN_PRODUCTION_LIBRARY',
  'PROXY_IN_MASTER_LABEL',
  'PROXY_IN_PAID_LAUNCH',
  'PROXY_IN_STORY_APPROVED_SCENE_PLAN',
  'PROXY_VOICE_AS_LOCKED_IDENTITY',
  'PROXY_AS_CANONICAL_CHARACTER',
  'THEATRICAL_GATE_STILL_CLOSED',
  'STEPS_9_16_STILL_BLOCKED',
] as const;
export type GateCode = (typeof GATE_CODES)[number];

export const OutputIntentSchema = z.object({
  outputClass: z.enum(['PIPELINE_TEST', 'STORY_DRAFT', 'STORY_APPROVED_PLAN', 'FINAL_PRODUCTION']),
  renderTier: z.enum(['DRAFT', 'REVIEW', 'FINAL']),
  assetQuality: z.enum(['PROTOTYPE', 'THEATRICAL']),
  occupants: z.array(z.string()).min(1),
  voiceBindings: z.record(z.string()).default({}),
  writeProductionLibrary: z.boolean().default(false),
  claimMaster: z.boolean().default(false),
  launchPaidGpu: z.boolean().default(false),
  emitScenePlan: z.boolean().default(false),
  storyApproved: z.boolean().default(false),
});
export type OutputIntent = z.infer<typeof OutputIntentSchema>;

export const GateEvaluationSchema = z.object({
  allowed: z.boolean(),
  blockers: z.array(z.string()),
  codes: z.array(z.enum(GATE_CODES)),
  version: z.literal(PREPRODUCTION_SUBSYSTEM_VERSIONS.gates),
});
export type ProductionOutputGate = z.infer<typeof GateEvaluationSchema>;

function proxiesOf(occupants: readonly string[]): string[] {
  return occupants.filter(isProxyCode);
}

export function evaluateProductionOutputGate(raw: z.input<typeof OutputIntentSchema>): ProductionOutputGate {
  const intent = OutputIntentSchema.parse(raw);
  const proxies = proxiesOf(intent.occupants);
  const codes: GateCode[] = [];
  const blockers: string[] = [];

  const theatrical = evaluateTheatricalGate();
  if (!theatrical.allowed) {
    codes.push('THEATRICAL_GATE_STILL_CLOSED');
    codes.push('STEPS_9_16_STILL_BLOCKED');
  }

  if (proxies.length > 0 && (intent.renderTier === 'FINAL' || intent.outputClass === 'FINAL_PRODUCTION')) {
    codes.push('PROXY_IN_FINAL_RENDER');
    blockers.push(
      `Proxy occupants ${proxies.join(', ')} cannot enter FINAL production output.`,
    );
  }

  if (proxies.length > 0 && intent.assetQuality === 'THEATRICAL') {
    codes.push('PROXY_IN_THEATRICAL_BINDING');
    blockers.push('Proxy occupants cannot bind THEATRICAL asset quality.');
  }

  if (intent.writeProductionLibrary) {
    codes.push('PROXY_IN_PRODUCTION_LIBRARY');
    blockers.push('Pre-production must not write production-library/.');
  }

  if (intent.claimMaster) {
    codes.push('PROXY_IN_MASTER_LABEL');
    blockers.push('Pre-production output cannot be labeled master, final, or production ready.');
  }

  if (intent.launchPaidGpu) {
    codes.push('PROXY_IN_PAID_LAUNCH');
    blockers.push('Paid GPU launch is refused from this package. Justin’s explicit approval is required elsewhere.');
  }

  if (proxies.length > 0 && (intent.emitScenePlan || intent.storyApproved || intent.outputClass === 'STORY_APPROVED_PLAN')) {
    codes.push('PROXY_IN_STORY_APPROVED_SCENE_PLAN');
    blockers.push('A proxy bundle cannot emit a story-approved ScenePlan or be marked storyApproved.');
  }

  for (const [occupant, voiceId] of Object.entries(intent.voiceBindings)) {
    if (isProxyCode(occupant) && (LOCKED_VOICE_IDS as readonly string[]).includes(voiceId)) {
      codes.push('PROXY_VOICE_AS_LOCKED_IDENTITY');
      blockers.push(`Proxy ${occupant} cannot bind locked voice ${voiceId}.`);
    }
    if (isProxyCode(occupant) && voiceId !== PROXY_VOICE_PLACEHOLDER) {
      codes.push('PROXY_VOICE_AS_LOCKED_IDENTITY');
      blockers.push(`Proxy ${occupant} may only use ${PROXY_VOICE_PLACEHOLDER}.`);
    }
    if (!isProxyCode(occupant) && voiceId === PROXY_VOICE_PLACEHOLDER) {
      codes.push('PROXY_AS_CANONICAL_CHARACTER');
      blockers.push(`Canonical ${occupant} cannot be reassigned to the proxy placeholder voice.`);
    }
  }

  if (proxies.some((id) => id === 'CHAR_PIP_001' || id === 'CHAR_GOAT_001')) {
    codes.push('PROXY_AS_CANONICAL_CHARACTER');
    blockers.push('A proxy id collided with a founding character code.');
  }

  const uniqueCodes = [...new Set(codes)];
  const allowed =
    blockers.length === 0 &&
    intent.outputClass !== 'FINAL_PRODUCTION' &&
    intent.renderTier !== 'FINAL' &&
    !intent.claimMaster &&
    !intent.launchPaidGpu &&
    !intent.writeProductionLibrary;

  return GateEvaluationSchema.parse({
    allowed,
    blockers,
    codes: uniqueCodes,
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.gates,
  });
}

export function assertNoProxyInFinalOutput(occupants: readonly OccupantCode[], renderTier: 'DRAFT' | 'REVIEW' | 'FINAL'): void {
  const proxies = occupants.filter(isProxyCode);
  if (proxies.length === 0) return;
  if (renderTier !== 'FINAL') return;
  throw new Error(
    `Proxy characters are forbidden in final production output: ${proxies.join(', ')}.`,
  );
}

export function mayEmitScenePlan(input: {
  characterMode: 'PROXY' | 'CANONICAL';
  storyApproved: boolean;
  occupants: readonly string[];
  issues: readonly PlanIssue[];
}): { allowed: boolean; reason: string } {
  if (input.characterMode === 'PROXY' || input.occupants.some(isProxyCode)) {
    return { allowed: false, reason: 'Proxy occupants cannot emit a ScenePlan for the director.' };
  }
  if (!input.storyApproved) {
    return { allowed: false, reason: 'ScenePlan emission requires an approved canonical story.' };
  }
  if (input.issues.some((issue) => issue.severity === 'ERROR')) {
    return { allowed: false, reason: 'ScenePlan emission is refused while ERROR issues remain.' };
  }
  return { allowed: true, reason: 'Canonical approved story may emit a DRAFT ScenePlan.' };
}

export function gateIssuesFrom(evaluation: ProductionOutputGate): PlanIssue[] {
  return evaluation.blockers.map((message, index) =>
    PlanIssueSchema.parse({
      code: evaluation.codes[index] ?? 'PROXY_IN_FINAL_RENDER',
      severity: 'ERROR',
      system: 'gates',
      message,
    }),
  );
}

export function isPipelineTestOutputClass(outputClass: OutputClass): boolean {
  return outputClass === 'PIPELINE_TEST' || outputClass === 'STORY_DRAFT';
}
