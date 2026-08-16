/**
 * Production-side enforcement of Milestone 5 launch safety.
 *
 * Every real FINAL / paid / publish / production-library path must call
 * `assertProductionLaunchSafe` so an unmarked generate-final cannot bypass
 * the proxy, paid, library, locked-voice, theatrical, FINAL_RENDER, or
 * publishing refusals.
 */
import { AppError } from '@doodle-dash/shared';
import {
  evaluateEpisodeLaunchSafety,
  type LaunchSafety,
  type LaunchSafetyInput,
} from '@doodle-dash/preproduction';
import { loadLatestPreproductionRun } from './preproduction-persist';

export function readLaunchEnvFlags(env: Record<string, string | undefined> = process.env): {
  allowPaidGpu: boolean;
  cloudRenderEnabled: boolean;
} {
  return {
    allowPaidGpu: env.ALLOW_PAID_GPU_LAUNCH === 'true',
    cloudRenderEnabled: env.CLOUD_RENDER_ENABLED === 'true',
  };
}

export async function evaluateProductionLaunchSafety(input: {
  episodeId?: string;
  command?: LaunchSafetyInput['command'];
  intent?: LaunchSafetyInput['intent'];
  characterMode?: 'PROXY' | 'CANONICAL';
  occupants?: string[];
  writeProductionLibrary?: boolean;
  synthesizeLockedVoice?: boolean;
  publish?: boolean;
  env?: Record<string, string | undefined>;
}): Promise<LaunchSafety> {
  const flags = readLaunchEnvFlags(input.env);
  const persisted = input.episodeId ? await loadLatestPreproductionRun(input.episodeId) : null;
  return evaluateEpisodeLaunchSafety({
    command: input.command ?? 'generate-final',
    intent: input.intent ?? 'FINAL',
    characterMode: input.characterMode ?? persisted?.characterMode,
    persistedCharacterMode: persisted?.characterMode,
    occupants: input.occupants ?? persisted?.occupants,
    allowPaidGpu: flags.allowPaidGpu,
    cloudRenderEnabled: flags.cloudRenderEnabled,
    writeProductionLibrary: input.writeProductionLibrary ?? false,
    synthesizeLockedVoice: input.synthesizeLockedVoice ?? false,
    publish: input.publish ?? false,
  });
}

export async function assertProductionLaunchSafe(input: {
  episodeId?: string;
  command?: LaunchSafetyInput['command'];
  intent?: LaunchSafetyInput['intent'];
  characterMode?: 'PROXY' | 'CANONICAL';
  occupants?: string[];
  writeProductionLibrary?: boolean;
  synthesizeLockedVoice?: boolean;
  publish?: boolean;
  env?: Record<string, string | undefined>;
}): Promise<LaunchSafety> {
  const safety = await evaluateProductionLaunchSafety(input);
  if (!safety.allowed) {
    throw new AppError(safety.reason, safety.code, 409);
  }
  return safety;
}
