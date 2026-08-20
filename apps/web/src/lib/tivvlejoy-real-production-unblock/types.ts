export const FIRST_READ_PLAN_SCHEMA = 'TIVVLEJOY_FIRST_REAL_SOURCE_READ_PLAN_V1' as const;
export const TRUSTED_BLENDER_SCHEMA = 'TIVVLEJOY_TRUSTED_BLENDER_BOOTSTRAP_V1' as const;
export const COMMERCIAL_GATE_SCHEMA = 'TIVVLEJOY_COMMERCIAL_BLENDER_INSPECTION_GATE_V1' as const;
export const VOICE_GENERATION_PLAN_SCHEMA = 'TIVVLEJOY_EP012_REAL_VOICE_GENERATION_PLAN_V1' as const;
export const UNBLOCK_ORDER_SCHEMA = 'TIVVLEJOY_FIRST_EPISODE_UNBLOCK_ORDER_V1' as const;
export const DO_NOT_REBUILD_SCHEMA = 'TIVVLEJOY_DO_NOT_REBUILD_MATRIX_V1' as const;
export const REAL_TODO_LEDGER_SCHEMA = 'TIVVLEJOY_REAL_PRODUCTION_TODO_LEDGER_V1' as const;
export const UNBLOCK_REPORT_SCHEMA = 'TIVVLEJOY_REAL_PRODUCTION_UNBLOCK_V1' as const;

export const COST_STATES = ['PROVEN_ZERO', 'ESTIMATED', 'UNKNOWN'] as const;
export type CostState = (typeof COST_STATES)[number];

export const COST_CONFIDENCE = ['NONE', 'LOW', 'MEDIUM', 'HIGH'] as const;
export type CostConfidence = (typeof COST_CONFIDENCE)[number];

export const SCENERY_NEED_KINDS = ['required', 'optional', 'native-procedural-capable', 'must-come-from-approved-library'] as const;
export type SceneryNeedKind = (typeof SCENERY_NEED_KINDS)[number];

export const EP012_SCENERY_ROLES = [
  'BUILDING_HERO',
  'INTERIOR_SHELL',
  'INTERIOR_PROP',
  'SIGNAGE',
  'STREET_PROP',
  'PATH',
  'TREE_SUPPORT',
  'TREE_HERO',
  'SKY',
  'BACKGROUND_FILL',
  'STORY_PROP',
  'TERRAIN_SURFACE',
  'FOREGROUND_FRAME',
] as const;
export type Ep012SceneryRole = (typeof EP012_SCENERY_ROLES)[number];

export const SOURCE_FAMILIES = [
  'direct_glb',
  'mountain',
  'tavern_fbx',
  'tavern_texture',
  'village',
  'forest',
  'sky_hdri',
] as const;
export type SourceFamily = (typeof SOURCE_FAMILIES)[number];

export const UNBLOCK_BUCKETS = [
  'DO_NOW',
  'DO_WHILE_WAITING',
  'DO_AFTER_RIGS',
  'DO_BEFORE_FIRST_RENDER',
  'DO_ONLY_AFTER_PAID_AUTHORIZATION',
] as const;
export type UnblockBucket = (typeof UNBLOCK_BUCKETS)[number];

export const OWNER_CLASSES = ['CURSOR', 'JUSTIN', 'RIGGER', 'VOICE_SYSTEM', 'PAID_RENDER'] as const;
export type OwnerClass = (typeof OWNER_CLASSES)[number];

export const COST_CLASSES = ['ZERO', 'UNKNOWN', 'REQUIRES_HUMAN_CONSENT', 'PAID'] as const;
export type CostClass = (typeof COST_CLASSES)[number];

export const EP012_VOICE_LINES = [
  'DL_HOOK_01',
  'DL_DISCOVERY_01',
  'DL_DECISION_01',
  'DL_ACTION_01',
  'DL_COMPLICATION_01',
  'DL_PAYOFF_01',
  'DL_BUTTON_01',
] as const;
export type Ep012VoiceLine = (typeof EP012_VOICE_LINES)[number];

export const COMMERCIAL_GATE_KEYS = [
  'sourceHashVerified',
  'temporaryImmutableCopy',
  'factoryStartup',
  'autoExecDisabled',
  'networkBlocked',
  'timeoutArmed',
  'sourceSaveForbidden',
  'addonActivationForbidden',
  'scriptExecutionForbidden',
  'driverPolicyDefined',
  'cleanupArmed',
] as const;
export type CommercialGateKey = (typeof COMMERCIAL_GATE_KEYS)[number];

export type FirstReadCandidate = {
  sourceId: string;
  objectIdentity: string;
  operatorLabel: string;
  size: number;
  format: string;
  family: SourceFamily;
  reasonSelected: string;
  expectedEvidenceGained: string[];
  expectedSemanticRoles: Ep012SceneryRole[];
  expectedDownloadBytes: number;
  expectedRequestCount: number;
  estimatedStorageOperationCost: 'UNKNOWN';
  estimatedDataTransferCost: 'UNKNOWN';
  costConfidence: CostConfidence;
  requiresUserAuthorization: true;
  avoided: false;
};

export type FirstReadPlan = {
  schemaVersion: typeof FIRST_READ_PLAN_SCHEMA;
  listedObjectCount: number;
  listedTotalBytes: number;
  hardcodedObjectTotal: false;
  selected: FirstReadCandidate[];
  avoided: Array<{ objectIdentity: string; operatorLabel: string; reason: string }>;
  selectedObjectCount: number;
  selectedTotalBytes: number;
  commercialBytesDownloaded: 0;
  secretUrlsExposed: false;
};

export type RealReadAuthorization = {
  state: 'REAL_READ_AUTHORIZATION_REQUIRED' | 'PROVEN_ZERO';
  provenZero: boolean;
  costState: CostState;
  totalBytes: number;
  objectCount: number;
  bestEstimate: 'UNKNOWN';
  worstReasonableEstimate: 'UNKNOWN';
  unknownCostVariables: string[];
  downloadPerformed: false;
  mutation: false;
  commercialBytesDownloaded: 0;
};

export type SceneryNeed = {
  role: Ep012SceneryRole;
  kind: SceneryNeedKind;
  why: string;
};

export type FirstEpisodeSceneryMinimum = {
  episodeId: 'EP012';
  locationIds: string[];
  needs: SceneryNeed[];
  required: Ep012SceneryRole[];
  optional: Ep012SceneryRole[];
  nativeProceduralCapable: Ep012SceneryRole[];
  mustComeFromApprovedLibrary: Ep012SceneryRole[];
  interiorRequired: false;
  storyPropIds: string[];
};

export type InspectionOrderItem = {
  order: number;
  objectIdentity: string;
  sourceId: string;
  bytes: number;
  cumulativeBytes: number;
  rolesAdded: Ep012SceneryRole[];
  expectedRoleCoverage: Ep012SceneryRole[];
};

export type InspectionOrder = {
  inspectionOrder: InspectionOrderItem[];
  cumulativeBytes: number;
  expectedRoleCoverage: Ep012SceneryRole[];
  stopAfterEvidenceCondition: string;
};

export type BlenderBootstrap = {
  schemaVersion: typeof TRUSTED_BLENDER_SCHEMA;
  targetVersion: string;
  projectCompatibility: string;
  trustedSource: string;
  checksumApproach: string;
  installMethod: string;
  installSize: string;
  estimatedDiskRequirement: string;
  adminRootNeeded: boolean;
  persistent: boolean;
  installationCostsMoney: false;
  installedNow: boolean;
  trustedPinPresent: boolean;
  reasonNotInstalled: string | null;
  laterAuthorizationPlaybook: string[];
};

export type BlenderAcceptance = {
  state: 'BLENDER_SYNTHETIC_ACCEPTANCE_PASS' | 'BLOCKED' | 'NOT_RUN';
  version: string | null;
  backgroundLaunch: boolean;
  factoryStartup: boolean;
  autoexecDisabled: boolean;
  pythonApi: boolean;
  eevee: boolean;
  cyclesMetadataOnly: boolean;
  networkIsolation: boolean;
  temporaryOutput: boolean;
  cleanShutdown: boolean;
  commercialAssetsLoaded: false;
  pipGoatLoaded: false;
  blocker: string | null;
};

export type CommercialInspectionGate = {
  schemaVersion: typeof COMMERCIAL_GATE_SCHEMA;
  requirements: Record<CommercialGateKey, boolean>;
  ready: boolean;
  blocker: string;
};

export type VoiceLinePlan = {
  dialogueRef: Ep012VoiceLine;
  speaker: 'PIP' | 'GOAT' | 'PIP_AND_GOAT';
  textSource: string;
  textHash: string | null;
  characterCount: number | null;
  voiceIdentityBound: true;
  expectedOutputFormat: string;
  timingRequirement: string;
  historicalRealReceipt: false;
  synthesized: false;
};

export type VoiceGenerationPlan = {
  schemaVersion: typeof VOICE_GENERATION_PLAN_SCHEMA;
  lines: VoiceLinePlan[];
  lineCount: number;
  pipLineCount: number;
  goatLineCount: number;
  sharedLineCount: number;
  generationPerformed: false;
};

export type VoiceCostPreflight = {
  state: 'VOICE_COST_UNKNOWN_REQUIRES_AUTHORIZATION';
  pipCharacters: number | null;
  goatCharacters: number | null;
  totalCharacters: number | null;
  expectedGenerationRequests: number;
  pricingInvented: false;
  generated: false;
};

export type VoiceTimingWorkflow = {
  realGenerationWouldProvide: Array<'audio only' | 'line timing' | 'word timing' | 'phoneme timing'>;
  additionalProcessing: string[];
  workflow: Array<'REAL_AUDIO' | 'TIMING_EXTRACTION' | 'VISEME' | 'ANIMATION' | 'EDITORIAL' | 'CAPTIONS'>;
  syntheticTimingMayBeRelabeledReal: false;
};

export type RigHandoffFile = {
  label: string;
  required: boolean;
  reason: string;
};

export type RigArrivalChecklistRow = {
  id: string;
  label: string;
  complete: false;
  autoApproval: false;
};

export type ExternalDependency = {
  category: 'FROM RIGGER' | 'FROM VOICE SYSTEM' | 'FROM SCENERY REVIEW' | 'FROM BLENDER ENVIRONMENT' | 'FROM USER' | 'FROM PAID RENDER LATER';
  items: string[];
};

export type UnblockOrder = {
  schemaVersion: typeof UNBLOCK_ORDER_SCHEMA;
  buckets: Record<UnblockBucket, string[]>;
};

export type DoNotRebuildRow = {
  system: string;
  alreadySufficient: true;
  rebuildOnlyIf: string;
};

export type RealProductionTodo = {
  id: string;
  category: string;
  status: 'OPEN';
  blocking: boolean;
  ownerClass: OwnerClass;
  costClass: CostClass;
  requiresHuman: boolean;
  requiresExternalInput: boolean;
  evidenceRequired: string;
  nextAction: string;
};

export type MorningOperatorPage = {
  title: 'FIRST REAL EPISODE';
  numberOneBlocker: string;
  rigStatus: string;
  voiceReceiptStatus: string;
  sceneryRealInspectionStatus: string;
  blenderStatus: string;
  humanReviewStatus: string;
  paidRenderStatus: string;
  next5Actions: string[];
  spendBanner: 'DO NOT SPEND MONEY YET' | 'AUTHORIZATION REQUIRED';
};

export type FirstEpisodeUnblockReport = {
  schemaVersion: typeof UNBLOCK_REPORT_SCHEMA;
  firstReadPlan: FirstReadPlan;
  cost: RealReadAuthorization;
  sceneryMinimum: FirstEpisodeSceneryMinimum;
  inspection: InspectionOrder;
  blender: BlenderBootstrap;
  blenderAcceptance: BlenderAcceptance;
  commercialGate: CommercialInspectionGate;
  voicePlan: VoiceGenerationPlan;
  voiceCost: VoiceCostPreflight;
  voiceTiming: VoiceTimingWorkflow;
  rigHandoff: {
    pip: RigHandoffFile[];
    goat: RigHandoffFile[];
    operatorHandoffReady: true;
    filesPresent: false;
  };
  rigChecklist: RigArrivalChecklistRow[];
  externalDependencies: ExternalDependency[];
  unblockOrder: UnblockOrder;
  doNotRebuild: DoNotRebuildRow[];
  ledger: RealProductionTodo[];
  morning: MorningOperatorPage;
  commercialBytesDownloaded: 0;
  voiceGenerationPerformed: false;
  runPodContacted: false;
};
