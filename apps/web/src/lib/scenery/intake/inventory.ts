export const SCENERY_COLLECTION_IDS = [
  'village',
  'sky-hdri',
  'stylized-forest',
  'procedural-nature',
] as const;

export type SceneryCollectionId = (typeof SCENERY_COLLECTION_IDS)[number];

export type ExpectedSourceFile = {
  sourceId: string;
  collectionId: SceneryCollectionId;
  collectionName: string;
  expectedFilename: string;
  aliases: string[];
  extension: string;
  mimeType: string;
  notes: string;
  unityPreservationOnly: boolean;
  inspectionJobId: string | null;
  textureTier: '1024' | '2048' | '4096' | null;
};

export const EXPECTED_SCENERY_SOURCE_FILES: ExpectedSourceFile[] = [
  {
    sourceId: 'SRC_VILLAGE_BLEND_ZIP',
    collectionId: 'village',
    collectionName: 'Village Environment',
    expectedFilename: 'Village_Blender_4.2.2.zip',
    aliases: ['village blender 4.2.2 zip', 'village blender 4.2.2', 'village blender'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'Village Blender 4.2.2 source package. Known native models include 33 village pieces.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_VILLAGE_BLENDER',
    textureTier: null,
  },
  {
    sourceId: 'SRC_VILLAGE_TEXTURES_ZIP',
    collectionId: 'village',
    collectionName: 'Village Environment',
    expectedFilename: 'Village_Textures.zip',
    aliases: ['village textures zip', 'village textures'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'Village texture package.',
    unityPreservationOnly: false,
    inspectionJobId: null,
    textureTier: null,
  },
  {
    sourceId: 'SRC_VILLAGE_PROJECT_ZIP',
    collectionId: 'village',
    collectionName: 'Village Environment',
    expectedFilename: 'Village_Project_File.zip',
    aliases: ['project file zip', 'village project', 'assembled project'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'Village assembled project file package.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_VILLAGE_PROJECT',
    textureTier: null,
  },
  {
    sourceId: 'SRC_VILLAGE_FBX_ZIP',
    collectionId: 'village',
    collectionName: 'Village Environment',
    expectedFilename: 'Village_FBX.zip',
    aliases: ['village fbx zip', 'village fbx'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'Village FBX interchange backup.',
    unityPreservationOnly: false,
    inspectionJobId: null,
    textureTier: null,
  },
  {
    sourceId: 'SRC_VILLAGE_UNITY_BUILTIN',
    collectionId: 'village',
    collectionName: 'Village Environment',
    expectedFilename: 'Village_Built_in.unitypackage',
    aliases: ['village built-in unity', 'village builtin', 'unity built-in'],
    extension: '.unitypackage',
    mimeType: 'application/octet-stream',
    notes: 'Unity Built-in preservation backup. Not imported into the Blender pipeline.',
    unityPreservationOnly: true,
    inspectionJobId: null,
    textureTier: null,
  },
  {
    sourceId: 'SRC_VILLAGE_UNITY_URP',
    collectionId: 'village',
    collectionName: 'Village Environment',
    expectedFilename: 'Village_URP.unitypackage',
    aliases: ['village urp unity', 'village urp'],
    extension: '.unitypackage',
    mimeType: 'application/octet-stream',
    notes: 'Unity URP preservation backup. Not imported into the Blender pipeline.',
    unityPreservationOnly: true,
    inspectionJobId: null,
    textureTier: null,
  },
  {
    sourceId: 'SRC_VILLAGE_UNITY_HDRP',
    collectionId: 'village',
    collectionName: 'Village Environment',
    expectedFilename: 'Village_HDRP.unitypackage',
    aliases: ['village hdrp unity', 'village hdrp'],
    extension: '.unitypackage',
    mimeType: 'application/octet-stream',
    notes: 'Unity HDRP preservation backup. Not imported into the Blender pipeline.',
    unityPreservationOnly: true,
    inspectionJobId: null,
    textureTier: null,
  },
  {
    sourceId: 'SRC_SKY_MACHINE_V1_ZIP',
    collectionId: 'sky-hdri',
    collectionName: 'Sky and HDRI Lighting',
    expectedFilename: 'SkyMachine_V1.zip',
    aliases: ['skymachine v1 zip', 'skymachine v1'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'SkyMachine V1 Blender source package.',
    unityPreservationOnly: false,
    inspectionJobId: null,
    textureTier: null,
  },
  {
    sourceId: 'SRC_SKY_MACHINE_V2_ZIP',
    collectionId: 'sky-hdri',
    collectionName: 'Sky and HDRI Lighting',
    expectedFilename: 'SkyMachine_V2.zip',
    aliases: ['skymachine v2 zip', 'skymachine v2'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'SkyMachine V2 Blender source package.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_SKYMACHINE_V2',
    textureTier: null,
  },
  {
    sourceId: 'SRC_SKY_EXTRA_UPDATE_ZIP',
    collectionId: 'sky-hdri',
    collectionName: 'Sky and HDRI Lighting',
    expectedFilename: 'Extra_Sky_Update.zip',
    aliases: ['extra sky update zip', 'extra sky update'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'Extra sky update package. Combined contents include stylized JPG skies.',
    unityPreservationOnly: false,
    inspectionJobId: null,
    textureTier: null,
  },
  {
    sourceId: 'SRC_SKY_HDRI_SK1_ZIP',
    collectionId: 'sky-hdri',
    collectionName: 'Sky and HDRI Lighting',
    expectedFilename: 'HDRI_part_sk1.zip',
    aliases: ['hdri part sk1 zip', 'hdri sk1', 'sk1'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'HDRI archive part sk1.',
    unityPreservationOnly: false,
    inspectionJobId: null,
    textureTier: null,
  },
  {
    sourceId: 'SRC_SKY_HDRI_SK2_ZIP',
    collectionId: 'sky-hdri',
    collectionName: 'Sky and HDRI Lighting',
    expectedFilename: 'HDRI_part_sk2.zip',
    aliases: ['hdri part sk2 zip', 'hdri sk2', 'sk2'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'HDRI archive part sk2.',
    unityPreservationOnly: false,
    inspectionJobId: null,
    textureTier: null,
  },
  {
    sourceId: 'SRC_SKY_HDRI_SK3_ZIP',
    collectionId: 'sky-hdri',
    collectionName: 'Sky and HDRI Lighting',
    expectedFilename: 'HDRI_part_sk3.zip',
    aliases: ['hdri part sk3 zip', 'hdri sk3', 'sk3'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'HDRI archive part sk3.',
    unityPreservationOnly: false,
    inspectionJobId: null,
    textureTier: null,
  },
  {
    sourceId: 'SRC_SKY_HDRI_SK4_ZIP',
    collectionId: 'sky-hdri',
    collectionName: 'Sky and HDRI Lighting',
    expectedFilename: 'HDRI_part_sk4.zip',
    aliases: ['hdri part sk4 zip', 'hdri sk4', 'sk4'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'HDRI archive part sk4.',
    unityPreservationOnly: false,
    inspectionJobId: null,
    textureTier: null,
  },
  {
    sourceId: 'SRC_FOREST_MODEL_PACKAGE',
    collectionId: 'stylized-forest',
    collectionName: 'Stylized Forest',
    expectedFilename: 'Stylized_Forest_Nature_Kit.zip',
    aliases: [
      'stylized_forest_nature_kit.blend',
      'stylized forest nature kit',
      'forest model package',
      'stylized forest',
    ],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'Forest model package expected to contain Stylized_Forest_Nature_Kit.blend plus FBX, OBJ, and MTL.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_STYLIZED_FOREST',
    textureTier: null,
  },
  {
    sourceId: 'SRC_FOREST_TEXTURES_1024',
    collectionId: 'stylized-forest',
    collectionName: 'Stylized Forest',
    expectedFilename: 'Stylized_Forest_Textures_1024.zip',
    aliases: ['1024 texture zip', 'forest 1024', 'textures 1024'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: '1024 texture tier. Preview and distant use only. Do not preload with other tiers.',
    unityPreservationOnly: false,
    inspectionJobId: null,
    textureTier: '1024',
  },
  {
    sourceId: 'SRC_FOREST_TEXTURES_2048',
    collectionId: 'stylized-forest',
    collectionName: 'Stylized Forest',
    expectedFilename: 'Stylized_Forest_Textures_2048.zip',
    aliases: ['2048 texture zip', 'forest 2048', 'textures 2048'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: '2048 texture tier. Standard final. Only one selected tier may materialize for ordinary assembly.',
    unityPreservationOnly: false,
    inspectionJobId: null,
    textureTier: '2048',
  },
  {
    sourceId: 'SRC_FOREST_TEXTURES_4096',
    collectionId: 'stylized-forest',
    collectionName: 'Stylized Forest',
    expectedFilename: 'Stylized_Forest_Textures_4096.zip',
    aliases: ['4096 texture zip', 'forest 4096', 'textures 4096'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: '4096 texture tier. Hero close-up only. Do not preload all tiers.',
    unityPreservationOnly: false,
    inspectionJobId: null,
    textureTier: '4096',
  },
  {
    sourceId: 'SRC_NATURE_FLORA_BLEND_ZIP',
    collectionId: 'procedural-nature',
    collectionName: 'Procedural Nature Library',
    expectedFilename: 'Flora_Mat&GN&Models.blend.zip',
    aliases: ['flora_mat&gn&models.blend.zip', 'flora', 'flora mat gn models'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'Flora materials, Geometry Nodes, and models.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_FLORA',
    textureTier: null,
  },
  {
    sourceId: 'SRC_NATURE_ROCK_MODELS',
    collectionId: 'procedural-nature',
    collectionName: 'Procedural Nature Library',
    expectedFilename: 'Rock_Models.blend',
    aliases: ['rock_models.blend', 'rock models'],
    extension: '.blend',
    mimeType: 'application/x-blender',
    notes: 'Rock models Blender source.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_ROCK_MODELS',
    textureTier: null,
  },
  {
    sourceId: 'SRC_NATURE_ROCK_MAT',
    collectionId: 'procedural-nature',
    collectionName: 'Procedural Nature Library',
    expectedFilename: 'Rock_Mat.blend',
    aliases: ['rock_mat.blend', 'rock materials', 'rock mat'],
    extension: '.blend',
    mimeType: 'application/x-blender',
    notes: 'Rock materials Blender source.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_ROCK_MATERIALS',
    textureTier: null,
  },
  {
    sourceId: 'SRC_NATURE_ROCK_GN',
    collectionId: 'procedural-nature',
    collectionName: 'Procedural Nature Library',
    expectedFilename: 'Rock_GN.blend',
    aliases: ['rock_gn.blend', 'rock geometry nodes', 'rock gn'],
    extension: '.blend',
    mimeType: 'application/x-blender',
    notes: 'Rock Geometry Nodes Blender source.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_ROCK_GN',
    textureTier: null,
  },
  {
    sourceId: 'SRC_NATURE_WATER_MAT_GN',
    collectionId: 'procedural-nature',
    collectionName: 'Procedural Nature Library',
    expectedFilename: 'Water_Mat&GN.blend',
    aliases: ['water_mat&gn.blend', 'water mat gn', 'water'],
    extension: '.blend',
    mimeType: 'application/x-blender',
    notes: 'Water material and Geometry Nodes Blender source.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_WATER_MAT_GN',
    textureTier: null,
  },
  {
    sourceId: 'SRC_NATURE_SWARM',
    collectionId: 'procedural-nature',
    collectionName: 'Procedural Nature Library',
    expectedFilename: 'Swarm.blend',
    aliases: ['swarm.blend', 'swarm'],
    extension: '.blend',
    mimeType: 'application/x-blender',
    notes: 'Swarm / insect Geometry Nodes Blender source.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_SWARM',
    textureTier: null,
  },
  {
    sourceId: 'SRC_NATURE_TEXTURES_ZIP',
    collectionId: 'procedural-nature',
    collectionName: 'Procedural Nature Library',
    expectedFilename: 'Textures.zip',
    aliases: ['textures.zip', 'nature textures'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'Procedural nature texture archive.',
    unityPreservationOnly: false,
    inspectionJobId: null,
    textureTier: null,
  },
  {
    sourceId: 'SRC_NATURE_ASSETS_LIBRARY_ZIP',
    collectionId: 'procedural-nature',
    collectionName: 'Procedural Nature Library',
    expectedFilename: 'assets_library.zip',
    aliases: ['assets library.zip', 'assets library', 'asset preview library'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'Blender Asset Browser preview library. Preservation only until inspected.',
    unityPreservationOnly: false,
    inspectionJobId: null,
    textureTier: null,
  },
  {
    sourceId: 'SRC_NATURE_ASSET_CATS',
    collectionId: 'procedural-nature',
    collectionName: 'Procedural Nature Library',
    expectedFilename: 'blender_assets.cats.txt',
    aliases: ['blender_assets.cats.txt', 'asset catalog', 'cats.txt'],
    extension: '.txt',
    mimeType: 'text/plain',
    notes: 'Blender Asset Browser catalog file.',
    unityPreservationOnly: false,
    inspectionJobId: null,
    textureTier: null,
  },
];

export const EXPECTED_SOURCE_COUNT = 27;
export const EXPECTED_COLLECTION_COUNT = 4;

export const VILLAGE_NATIVE_MODELS = [
  'Barrel01',
  'Bed01',
  'Book01',
  'Bookcase01',
  'Bucket01',
  'Cabin01A',
  'Cabin01B',
  'Cabin02A',
  'Cabin02B',
  'Cabin03A',
  'Cabin03B',
  'Cabin04A',
  'Cabin04B',
  'Cabin05A',
  'Cabin05B',
  'Candle01',
  'Candle02',
  'Cart01',
  'Chair01',
  'Chair02',
  'Crate01',
  'Fence01',
  'Firewoods01',
  'Gate01',
  'Grass01',
  'Nightstand01',
  'Rack01',
  'Shelf01',
  'Table01',
  'Table02',
  'Tree01',
  'Tree02',
  'Tree03',
] as const;

function normalizeMatch(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function listExpectedSourceFiles(): ExpectedSourceFile[] {
  return EXPECTED_SCENERY_SOURCE_FILES.map((item) => ({ ...item, aliases: [...item.aliases] }));
}

export function getExpectedSourceFile(sourceId: string): ExpectedSourceFile {
  const found = EXPECTED_SCENERY_SOURCE_FILES.find((item) => item.sourceId === sourceId);
  if (!found) {
    throw new Error(`Unknown expected scenery source: ${sourceId}`);
  }
  return { ...found, aliases: [...found.aliases] };
}

export function matchExpectedSourceFile(input: {
  collectionId: SceneryCollectionId;
  filename: string;
  expectedSourceId?: string;
}): ExpectedSourceFile | null {
  if (input.expectedSourceId) {
    const exact = EXPECTED_SCENERY_SOURCE_FILES.find((item) => item.sourceId === input.expectedSourceId);
    if (exact && exact.collectionId === input.collectionId) {
      return { ...exact, aliases: [...exact.aliases] };
    }
    return null;
  }
  const needle = normalizeMatch(input.filename);
  const collection = EXPECTED_SCENERY_SOURCE_FILES.filter((item) => item.collectionId === input.collectionId);
  const exactName = collection.find((item) => normalizeMatch(item.expectedFilename) === needle);
  if (exactName) return { ...exactName, aliases: [...exactName.aliases] };
  const alias = collection.find((item) => item.aliases.some((name) => normalizeMatch(name) === needle));
  return alias ? { ...alias, aliases: [...alias.aliases] } : null;
}

export function assertInventoryCounts(): { sourceCount: number; collectionCount: number } {
  const sourceCount = EXPECTED_SCENERY_SOURCE_FILES.length;
  const collectionCount = new Set(EXPECTED_SCENERY_SOURCE_FILES.map((item) => item.collectionId)).size;
  if (sourceCount !== EXPECTED_SOURCE_COUNT) {
    throw new Error(`Expected ${EXPECTED_SOURCE_COUNT} production files, found ${sourceCount}.`);
  }
  if (collectionCount !== EXPECTED_COLLECTION_COUNT) {
    throw new Error(`Expected ${EXPECTED_COLLECTION_COUNT} collections, found ${collectionCount}.`);
  }
  return { sourceCount, collectionCount };
}
