export const STORYBOOK_ENVIRONMENT_SCHEMA = 'TIVVLEJOY_STORYBOOK_ENVIRONMENT_V1' as const;
export const STYLIZATION_REPORT_SCHEMA = 'TIVVLEJOY_SCENERY_STYLIZATION_REPORT_V1' as const;
export const SHOT_VISUAL_REPORT_SCHEMA = 'TIVVLEJOY_SHOT_VISUAL_REPORT_V1' as const;
export const SHOT_VISUAL_APPROVAL_SCHEMA = 'TIVVLEJOY_SHOT_VISUAL_APPROVAL_V1' as const;

export const MATERIAL_CLASSES = [
  'wall',
  'roof',
  'wood',
  'glass',
  'metal',
  'stone',
  'road_path',
  'cloth',
  'foliage',
  'flower',
  'water',
  'sign',
  'window',
  'door',
  'prop',
  'ground',
] as const;
export type MaterialClass = (typeof MATERIAL_CLASSES)[number];

export const QUALITY_TIERS = ['HERO', 'SUPPORTING', 'BACKGROUND'] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

export const LIGHTING_PRESETS = [
  'TJ_MORNING_WARM',
  'TJ_DAY_ADVENTURE',
  'TJ_GOLDEN_HOUR',
  'TJ_OVERCAST_SOFT',
  'TJ_RAINY_COZY',
  'TJ_EVENING_FESTIVAL',
  'TJ_MAGICAL_NIGHT',
] as const;
export type LightingPresetId = (typeof LIGHTING_PRESETS)[number];

export const SIGN_TEMPLATES = [
  'TJ_SIGN_HANGING',
  'TJ_SIGN_WALL',
  'TJ_SIGN_ROUND',
  'TJ_SIGN_AWNING',
  'TJ_SIGN_WOOD_POST',
] as const;

export const SIGN_CLASSES = ['STORY_CRITICAL', 'WORLD_BUILDING', 'DECORATIVE'] as const;
export const SIGN_ICONS = [
  'bakery',
  'book_map',
  'market',
  'repair',
  'flower',
  'boat',
  'telescope',
  'paint',
  'food',
  'home',
  'adventure',
] as const;

export const DRESSING_ANCHORS = [
  'DOOR_LEFT',
  'DOOR_RIGHT',
  'WINDOW_BOX',
  'AWNING',
  'SHOP_FRONT',
  'SIDEWALK',
  'CORNER',
  'ROOFLINE',
  'PATH_EDGE',
  'GARDEN',
  'BACKGROUND',
] as const;

export const DRESSING_CATEGORIES = [
  'flowers',
  'flower_boxes',
  'bunting',
  'lanterns',
  'benches',
  'baskets',
  'crates',
  'watering_cans',
  'birdhouses',
  'pinwheels',
  'stepping_stones',
  'fences',
  'mailboxes',
  'market_displays',
  'wind_spinners',
  'kites',
  'butterflies',
  'mushrooms',
  'vines',
  'world_motifs',
] as const;

export const FOCAL_TARGETS = ['PIP', 'GOAT', 'PIP_AND_GOAT', 'STORY_PROP', 'HERO_SCENERY', 'SIGN'] as const;
export type FocalTarget = (typeof FOCAL_TARGETS)[number];

export const HARD_VISUAL_BLOCKERS = [
  'PIP_EYES_OCCLUDED',
  'GOAT_EYES_OCCLUDED',
  'SPEAKING_FACE_OCCLUDED',
  'FOCAL_TARGET_UNCLEAR',
  'FOCAL_COMPETITION',
  'FOCAL_TANGENCY',
  'FOCAL_BACKGROUND_MERGE',
  'CAMERA_SAFE_9_16',
  'CHARACTER_CLEARANCE',
  'CRITICAL_SIGN_UNREADABLE',
  'PALETTE_MISMATCH',
  'FACE_TOO_DARK',
  'BROKEN_HERO_MATERIAL',
  'MISSING_TEXTURE',
  'VISIBLE_STOCK_BRANDING',
  'HERO_ASSET_NOT_HERO_SAFE',
  'VISUAL_HIERARCHY_FAILED',
  'ACCIDENTAL_HEAD_CROP',
] as const;
export type HardVisualBlocker = (typeof HARD_VISUAL_BLOCKERS)[number];

export const VISUAL_RESULTS = [
  'VISUALLY_EXCELLENT',
  'VISUALLY_APPROVED',
  'REVISION_REQUIRED',
  'VISUAL_REJECT',
] as const;
export type VisualResult = (typeof VISUAL_RESULTS)[number];

export const STORYBOOK_APPROVAL_STATES = [
  'UNSTYLIZED',
  'STYLIZED_REVIEW',
  'STYLIZED_APPROVED',
  'SHOT_REVISION_REQUIRED',
  'SHOT_VISUALLY_APPROVED',
  'SHOT_VISUALLY_EXCELLENT',
  'REJECTED',
] as const;
export type StorybookApprovalState = (typeof STORYBOOK_APPROVAL_STATES)[number];

export const SOURCE_PIPELINE_STATES = [
  'registered',
  'inspected',
  'normalized',
  'stylized_review',
  'stylized_approved',
  'approved',
] as const;

export const SCATTER_PROVIDER = 'NATIVE_BLENDER' as const;

export const LOCATION_PRESET_IDS = [
  'home_village',
  'main_street',
  'bakery',
  'map_shop',
  'forest_exit',
  'river_road',
  'amusement_entrance',
] as const;

export const WORLD_NODE_IDS = [
  'HOME_NEIGHBORHOOD',
  'ENCHANTED_OUTSKIRTS',
  'WATERFRONT_DISTRICT',
  'AMUSEMENT_PARK',
  'SKY_GATE',
  'CITY_IN_THE_SKY',
] as const;

export const RENDER_PROFILES = ['PLANNING', 'THUMBNAIL', 'REVIEW', 'FINAL'] as const;
export type RenderProfile = (typeof RENDER_PROFILES)[number];

export const PROVENANCE_STATUSES = ['VERIFIED_ALLOWED', 'VERIFIED_RESTRICTED', 'UNKNOWN_REVIEW_REQUIRED'] as const;
export type ProvenanceStatus = (typeof PROVENANCE_STATUSES)[number];

export const VISUAL_WEIGHTS = Object.freeze({
  focalReadability: 20,
  characterReadability: 20,
  composition916: 15,
  lighting: 15,
  palette: 10,
  dressing: 7,
  tierQuality: 7,
  signage: 3,
  kidReadability: 3,
});
