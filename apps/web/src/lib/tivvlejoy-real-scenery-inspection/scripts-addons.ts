import type { AddonState, ScriptState } from './types';

const PYTHON_HINT = /\.py$|\bbpy\b|text block|auto.?run|register\(|unregister\(/i;
const DRIVER_HINT = /driver|#frame|noise\.|os\.system|subprocess/i;
const SHELL_HINT = /\/bin\/sh|cmd\.exe|powershell|os\.system|subprocess|popen\(/i;
const NETWORK_HINT = /https?:\/\/|urllib|requests\.|socket\.|ftp:\/\//i;
const AUTORUN_HINT = /load_post|save_pre|handler|script_auto_execution|register_class/i;

export type ScriptSafetyReport = {
  state: ScriptState;
  pythonTextBlocks: string[];
  autoRunHandlers: string[];
  driverExpressions: string[];
  externalScriptPaths: string[];
  shellLikeReferences: string[];
  networkLikeReferences: string[];
  executed: false;
};

export function inspectScriptEvidence(texts: readonly string[]): ScriptSafetyReport {
  const pythonTextBlocks = texts.filter((item) => PYTHON_HINT.test(item));
  const autoRunHandlers = texts.filter((item) => AUTORUN_HINT.test(item));
  const driverExpressions = texts.filter((item) => DRIVER_HINT.test(item));
  const externalScriptPaths = texts.filter((item) => /\.py['"]|scripts\//i.test(item));
  const shellLikeReferences = texts.filter((item) => SHELL_HINT.test(item));
  const networkLikeReferences = texts.filter((item) => NETWORK_HINT.test(item));
  let state: ScriptState = 'NO_SCRIPT_EVIDENCE';
  if (shellLikeReferences.length || (pythonTextBlocks.length && networkLikeReferences.length)) {
    state = 'UNSAFE_EXECUTION_DEPENDENCY';
  } else if (autoRunHandlers.length || driverExpressions.length) {
    state = 'SCRIPT_REVIEW_REQUIRED';
  } else if (pythonTextBlocks.length || externalScriptPaths.length) {
    state = 'SCRIPT_CONTENT_PRESENT_NOT_EXECUTED';
  }
  return {
    state,
    pythonTextBlocks,
    autoRunHandlers,
    driverExpressions,
    externalScriptPaths,
    shellLikeReferences,
    networkLikeReferences,
    executed: false,
  };
}

const ADDON_HINTS: Array<{ name: string; pattern: RegExp; requiredIfPresent: boolean }> = [
  { name: 'Botaniq', pattern: /botaniq/i, requiredIfPresent: true },
  { name: 'Geo-Scatter', pattern: /geo[-_ ]?scatter|\.scatpack/i, requiredIfPresent: false },
  { name: 'Gaffer', pattern: /gaffer/i, requiredIfPresent: false },
  { name: 'Physical Starlight', pattern: /physical.?starlight|physical.?atmosphere/i, requiredIfPresent: false },
];

export type AddonDependencyReport = {
  state: AddonState;
  required: string[];
  optional: string[];
  unknown: string[];
  botaniq: 'NOT_ACTIVATED';
  geoScatter: 'NOT_INTEGRATED';
  gaffer: 'INSTALL_LATER' | 'OPTIONAL';
  physicalStarlight: 'OPTIONAL';
  activated: false;
};

export function inspectAddonDependencies(texts: readonly string[]): AddonDependencyReport {
  const required: string[] = [];
  const optional: string[] = [];
  const unknown = texts.filter((item) => /addon|add-on/i.test(item) && !ADDON_HINTS.some((hint) => hint.pattern.test(item)));
  for (const hint of ADDON_HINTS) {
    if (texts.some((item) => hint.pattern.test(item))) {
      (hint.requiredIfPresent ? required : optional).push(hint.name);
    }
  }
  let state: AddonState = 'NO_ADDON_DEPENDENCY';
  if (required.length) state = 'REQUIRED_ADDON';
  else if (optional.length) state = 'OPTIONAL_ADDON';
  else if (unknown.length) state = 'UNKNOWN_ADDON_DEPENDENCY';
  return {
    state,
    required,
    optional,
    unknown: unknown.slice(0, 12),
    botaniq: 'NOT_ACTIVATED',
    geoScatter: 'NOT_INTEGRATED',
    gaffer: optional.includes('Gaffer') ? 'OPTIONAL' : 'INSTALL_LATER',
    physicalStarlight: 'OPTIONAL',
    activated: false,
  };
}
