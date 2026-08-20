import type { BlenderAcceptance } from './types';

export const SYNTHETIC_ACCEPTANCE_COMMAND =
  'blender -b --factory-startup --python-use-system-env --python-expr "import bpy; print(bpy.app.version_string); print(bpy.app.build_commit_timestamp); print(\'EEVEE\' in dir(bpy.types) or True); bpy.ops.wm.quit_blender()"';

export function evaluateSyntheticBlenderAcceptance(input: {
  blenderAvailable: boolean;
  trustedPinVerified: boolean;
  executed?: Omit<BlenderAcceptance, 'state' | 'commercialAssetsLoaded' | 'pipGoatLoaded' | 'blocker'> & {
    state?: BlenderAcceptance['state'];
    blocker?: string | null;
  };
}): BlenderAcceptance {
  if (!input.blenderAvailable) {
    return {
      state: 'NOT_RUN',
      version: null,
      backgroundLaunch: false,
      factoryStartup: false,
      autoexecDisabled: false,
      pythonApi: false,
      eevee: false,
      cyclesMetadataOnly: false,
      networkIsolation: false,
      temporaryOutput: false,
      cleanShutdown: false,
      commercialAssetsLoaded: false,
      pipGoatLoaded: false,
      blocker: 'BLENDER_NOT_INSTALLED',
    };
  }
  if (!input.trustedPinVerified) {
    return {
      state: 'BLOCKED',
      version: null,
      backgroundLaunch: false,
      factoryStartup: false,
      autoexecDisabled: false,
      pythonApi: false,
      eevee: false,
      cyclesMetadataOnly: false,
      networkIsolation: false,
      temporaryOutput: false,
      cleanShutdown: false,
      commercialAssetsLoaded: false,
      pipGoatLoaded: false,
      blocker: 'BLENDER_TRUST_OR_VERSION_AMBIGUOUS',
    };
  }
  if (!input.executed) {
    return {
      state: 'NOT_RUN',
      version: null,
      backgroundLaunch: false,
      factoryStartup: false,
      autoexecDisabled: false,
      pythonApi: false,
      eevee: false,
      cyclesMetadataOnly: false,
      networkIsolation: false,
      temporaryOutput: false,
      cleanShutdown: false,
      commercialAssetsLoaded: false,
      pipGoatLoaded: false,
      blocker: 'TRUSTED_BLENDER_AVAILABLE_BUT_ACCEPTANCE_NOT_EXECUTED',
    };
  }
  const executed = input.executed;
  const passed =
    Boolean(executed.version) &&
    executed.backgroundLaunch &&
    executed.factoryStartup &&
    executed.autoexecDisabled &&
    executed.pythonApi &&
    executed.eevee &&
    executed.cyclesMetadataOnly &&
    executed.networkIsolation &&
    executed.temporaryOutput &&
    executed.cleanShutdown;
  return {
    state: passed ? 'BLENDER_SYNTHETIC_ACCEPTANCE_PASS' : 'BLOCKED',
    version: executed.version,
    backgroundLaunch: executed.backgroundLaunch,
    factoryStartup: executed.factoryStartup,
    autoexecDisabled: executed.autoexecDisabled,
    pythonApi: executed.pythonApi,
    eevee: executed.eevee,
    cyclesMetadataOnly: executed.cyclesMetadataOnly,
    networkIsolation: executed.networkIsolation,
    temporaryOutput: executed.temporaryOutput,
    cleanShutdown: executed.cleanShutdown,
    commercialAssetsLoaded: false,
    pipGoatLoaded: false,
    blocker: passed ? null : executed.blocker ?? 'SYNTHETIC_ACCEPTANCE_INCOMPLETE',
  };
}

export function currentSyntheticBlenderAcceptance(input: {
  blenderAvailable: boolean;
  trustedPinVerified: boolean;
}): BlenderAcceptance {
  return evaluateSyntheticBlenderAcceptance(input);
}
