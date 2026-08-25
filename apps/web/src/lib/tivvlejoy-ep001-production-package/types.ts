import type { ProductionSemanticRole } from '@/lib/tivvlejoy-approved-asset-registry/types';
import type { ActionId } from '@/lib/tivvlejoy-character-animation';
import type { CameraTemplateId } from '@/lib/tivvlejoy-episode-scene-planner/types';
import type { LightingPresetId } from '@/lib/tivvlejoy-storybook-environment/types';
import type {
  AmbienceLayer,
  BeatType,
  CameraMotion,
  MusicRole,
  SfxType,
  ShotIntent,
} from '@/lib/tivvlejoy-nightshift-production/types';

export const EP001_PRODUCTION_PACKAGE_SCHEMA = 'TIVVLEJOY_EP001_PRODUCTION_PACKAGE_V1' as const;
export const EP001_READINESS_SCHEMA = 'TIVVLEJOY_EP001_READINESS_V1' as const;
export const EP001_EPISODE_ID = 'EP001' as const;
export const EP001_WORKING_TITLE = 'Meadow Map Mystery' as const;
export const EP001_TOTAL_FRAMES = 1_800 as const;
export const EP001_FPS = 30 as const;

export type Ep001CharacterId = 'PIP' | 'GOAT';
export type Ep001WorldNode = 'HOME_NEIGHBORHOOD' | 'ENCHANTED_OUTSKIRTS';
export type Ep001LocationId = 'bakery' | 'main_street' | 'forest_exit';

export type Ep001PerformanceCue = {
  emotion: 'curious' | 'warm' | 'surprised' | 'determined' | 'happy' | 'playful';
  storyGoal: string;
  attentionTarget:
    'STORY_MAP' | 'MAP_FRAGMENT' | 'PIP' | 'GOAT' | 'DESTINATION' | 'ENVIRONMENT_FEATURE';
  locomotion: 'stationary' | 'walk' | 'run' | 'turn' | 'approach';
  gesture: string;
  intendedActions: ActionId[];
  propAction?: 'PICK_UP' | 'HOLD_PROP' | 'PUT_DOWN' | 'HAND_OVER' | 'RECEIVE';
};

export type Ep001ShotBlueprint = {
  shotId: string;
  inFrame: number;
  outFrame: number;
  durationFrames: number;
  beat: BeatType;
  storyPurpose: string;
  action: string;
  locationId: Ep001LocationId;
  worldNode: Ep001WorldNode;
  archetypeId: 'BAKERY_EXTERIOR' | 'VILLAGE_SIDE_STREET' | 'SPRING_MEADOW';
  shotIntent: ShotIntent;
  cameraTemplateId: CameraTemplateId;
  cameraMotion: CameraMotion;
  focalTarget: 'PIP' | 'GOAT' | 'PIP_AND_GOAT' | 'STORY_PROP' | 'HERO_SCENERY';
  lightingPresetId: LightingPresetId;
  lightingIntent: 'WARM_INVITING' | 'BRIGHT_ADVENTURE' | 'GOLDEN_DISCOVERY' | 'REVEAL_ACCENT';
  charactersVisible: Ep001CharacterId[];
  performance: Partial<Record<Ep001CharacterId, Ep001PerformanceCue>>;
  dialogueLineIds: string[];
  sfx: SfxType[];
  ambience: AmbienceLayer;
  musicRole: MusicRole;
  continuity: string[];
};

export type Ep001DialogueLine = {
  lineId: string;
  shotId: string;
  speaker: Ep001CharacterId;
  text: string;
  startFrame: number;
  endFrame: number;
  delivery: string;
  voiceReceiptRef: null;
  audioIncluded: false;
};

export type Ep001SceneryIntent = {
  locationId: Ep001LocationId;
  worldNode: Ep001WorldNode;
  archetypeId: Ep001ShotBlueprint['archetypeId'];
  requiredRoles: ProductionSemanticRole[];
  bindingState: 'LOGICAL_ROLES_ONLY_AWAITING_APPROVED_RESOLUTION';
  sourceBytesIncluded: false;
  productionWriteAllowed: false;
};

export type Ep001ReadinessInput = {
  pipRigApproved?: boolean;
  goatRigApproved?: boolean;
  sceneryBindingsApproved?: boolean;
  exactVoiceReceiptsBound?: boolean;
  humanStoryApproval?: boolean;
  humanVisualApproval?: boolean;
  paidFinalRenderAuthorized?: boolean;
};

export type Ep001ReadinessState =
  | 'WAITING_FOR_CHARACTER_RIGS'
  | 'WAITING_FOR_SCENERY_BINDINGS'
  | 'WAITING_FOR_VOICE_RECEIPTS'
  | 'WAITING_FOR_HUMAN_STORY_APPROVAL'
  | 'WAITING_FOR_HUMAN_VISUAL_APPROVAL'
  | 'WAITING_FOR_PAID_RENDER_AUTHORIZATION'
  | 'CONTROLLED_EXECUTION_PREFLIGHT_READY';

export type Ep001BlockerCode =
  | 'PIP_APPROVED_RIG_REQUIRED'
  | 'GOAT_APPROVED_RIG_REQUIRED'
  | 'APPROVED_SCENERY_BINDINGS_REQUIRED'
  | 'EXACT_VOICE_RECEIPTS_REQUIRED'
  | 'HUMAN_STORY_APPROVAL_REQUIRED'
  | 'HUMAN_VISUAL_APPROVAL_REQUIRED'
  | 'PAID_FINAL_RENDER_AUTHORIZATION_REQUIRED';

export type Ep001Readiness = {
  schemaVersion: typeof EP001_READINESS_SCHEMA;
  state: Ep001ReadinessState;
  blockers: Array<{ code: Ep001BlockerCode; label: string }>;
  planningComplete: true;
  controlledPreflightAllowed: boolean;
  launchAllowed: false;
  characterAnimationExecutionAllowed: false;
  voiceProviderCallsAllowed: false;
  paidComputeAllowed: false;
  productionWritesAllowed: false;
  autoApprovalAllowed: false;
  readinessSha256: string;
};
