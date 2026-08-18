export const SCENERY_COLLECTION_IDS = [
  'village',
  'sky-hdri',
  'stylized-forest',
  'world-shaders',
] as const;

export const LEGACY_SCENERY_COLLECTION_IDS = ['procedural-nature'] as const;

export type SceneryCollectionId = (typeof SCENERY_COLLECTION_IDS)[number];
export type LegacySceneryCollectionId = (typeof LEGACY_SCENERY_COLLECTION_IDS)[number];
export type ManifestCollectionId = SceneryCollectionId | LegacySceneryCollectionId;

export const FILE_INSPECTION_CHECKPOINT = 'TIVVLEJOY_SCENERY_14_FILE_INSPECTION_V1';

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
  officialDownload: true;
  legacyCollectionIds: ManifestCollectionId[];
};

export type ArchiveContentExpectation = {
  contentId: string;
  formerSourceId: string;
  parentSourceId: string;
  collectionId: SceneryCollectionId;
  expectedFilename: string;
  aliases: string[];
  notes: string;
  formerInventory: '27-file' | '30-file';
  textureTier: '1024' | '2048' | '4096' | null;
  countsAsMissingDownload: false;
};

export const EXPECTED_SCENERY_SOURCE_FILES: ExpectedSourceFile[] = [
  {
    sourceId: 'SRC_VILLAGE_BLEND_ZIP',
    collectionId: 'village',
    collectionName: 'Village',
    expectedFilename: 'Village (Blender 4.2.2).zip',
    aliases: [
      'Village (Blender 4.2.2)(2).zip',
      'village blender 4.2.2 zip',
      'village blender 4.2.2',
      'village blender',
      'Village_Blender_4.2.2.zip',
      'Village Blender 4.2.2.zip',
    ],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'Confirmed purchase-site Village Blender 4.2.2 source package.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_VILLAGE_BLENDER',
    textureTier: null,
    officialDownload: true,
    legacyCollectionIds: [],
  },
  {
    sourceId: 'SRC_VILLAGE_TEXTURES_ZIP',
    collectionId: 'village',
    collectionName: 'Village',
    expectedFilename: 'Village (Textures).zip',
    aliases: ['village textures zip', 'village textures', 'Village_Textures.zip'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'Confirmed purchase-site Village texture package.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_VILLAGE_TEXTURES',
    textureTier: null,
    officialDownload: true,
    legacyCollectionIds: [],
  },
  {
    sourceId: 'SRC_VILLAGE_PROJECT_ZIP',
    collectionId: 'village',
    collectionName: 'Village',
    expectedFilename: 'Project File.zip',
    aliases: [
      'project file zip',
      'Village_Project_File.zip',
      'village project',
      'assembled project',
    ],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'Confirmed purchase-site Village assembled project package.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_VILLAGE_PROJECT',
    textureTier: null,
    officialDownload: true,
    legacyCollectionIds: [],
  },
  {
    sourceId: 'SRC_VILLAGE_FBX_ZIP',
    collectionId: 'village',
    collectionName: 'Village',
    expectedFilename: 'Village (FBX).zip',
    aliases: ['Village (FBX)(1).zip', 'village fbx zip', 'village fbx'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'Confirmed purchase-site Village FBX interchange backup.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_VILLAGE_FBX',
    textureTier: null,
    officialDownload: true,
    legacyCollectionIds: [],
  },
  {
    sourceId: 'SRC_VILLAGE_UNITY_BUILTIN',
    collectionId: 'village',
    collectionName: 'Village',
    expectedFilename: 'Village - Built-in (Unity 2022.3.16f1).unitypackage.gz',
    aliases: [
      'village built-in unity',
      'village builtin',
      'unity built-in',
      'Village_Built_in.unitypackage',
    ],
    extension: '.unitypackage.gz',
    mimeType: 'application/octet-stream',
    notes: 'Unity Built-in preservation backup. Not imported into the Blender pipeline.',
    unityPreservationOnly: true,
    inspectionJobId: 'INSPECT_VILLAGE_UNITY_BUILTIN',
    textureTier: null,
    officialDownload: true,
    legacyCollectionIds: [],
  },
  {
    sourceId: 'SRC_VILLAGE_UNITY_URP',
    collectionId: 'village',
    collectionName: 'Village',
    expectedFilename: 'Village - URP (Unity 2022.3.16f1).unitypackage.gz',
    aliases: ['village urp unity', 'village urp', 'Village_URP.unitypackage'],
    extension: '.unitypackage.gz',
    mimeType: 'application/octet-stream',
    notes: 'Unity URP preservation backup. Not imported into the Blender pipeline.',
    unityPreservationOnly: true,
    inspectionJobId: 'INSPECT_VILLAGE_UNITY_URP',
    textureTier: null,
    officialDownload: true,
    legacyCollectionIds: [],
  },
  {
    sourceId: 'SRC_VILLAGE_UNITY_HDRP',
    collectionId: 'village',
    collectionName: 'Village',
    expectedFilename: 'Village - HDRP (Unity 2022.3.16f1).unitypackage.gz',
    aliases: ['village hdrp unity', 'village hdrp', 'Village_HDRP.unitypackage'],
    extension: '.unitypackage.gz',
    mimeType: 'application/octet-stream',
    notes: 'Unity HDRP preservation backup. Not imported into the Blender pipeline.',
    unityPreservationOnly: true,
    inspectionJobId: 'INSPECT_VILLAGE_UNITY_HDRP',
    textureTier: null,
    officialDownload: true,
    legacyCollectionIds: [],
  },
  {
    sourceId: 'SRC_SKY_MACHINE_V1_ZIP',
    collectionId: 'sky-hdri',
    collectionName: 'Sky/HDRI',
    expectedFilename: 'SkyMachineV1.zip',
    aliases: ['SkyMachineV1(2).zip', 'skymachine v1 zip', 'skymachine v1', 'SkyMachine_V1.zip'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'Confirmed purchase-site SkyMachine V1 package.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_SKYMACHINE_V1',
    textureTier: null,
    officialDownload: true,
    legacyCollectionIds: [],
  },
  {
    sourceId: 'SRC_SKY_MACHINE_V2_ZIP',
    collectionId: 'sky-hdri',
    collectionName: 'Sky/HDRI',
    expectedFilename: 'SkyMachineV2.zip',
    aliases: ['skymachine v2 zip', 'skymachine v2', 'SkyMachine_V2.zip'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'Confirmed purchase-site SkyMachine V2 package.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_SKYMACHINE_V2',
    textureTier: null,
    officialDownload: true,
    legacyCollectionIds: [],
  },
  {
    sourceId: 'SRC_SKY_EXTRA_UPDATE_ZIP',
    collectionId: 'sky-hdri',
    collectionName: 'Sky/HDRI',
    expectedFilename: 'Extra Update 1.zip',
    aliases: [
      'Extra Update 1(3).zip',
      'extra sky update zip',
      'extra sky update',
      'extra update 1 zip',
      'extra update 1',
    ],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'Confirmed purchase-site extra sky update package.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_SKY_EXTRA_UPDATE',
    textureTier: null,
    officialDownload: true,
    legacyCollectionIds: [],
  },
  {
    sourceId: 'SRC_SKY_HDRI_JPG_PACK',
    collectionId: 'sky-hdri',
    collectionName: 'Sky/HDRI',
    expectedFilename: 'HDRi_JPG_Pack.zip',
    aliases: ['hdri jpg pack'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'Confirmed purchase-site JPG sky and HDRI package.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_SKY_HDRI_JPG_PACK',
    textureTier: null,
    officialDownload: true,
    legacyCollectionIds: [],
  },
  {
    sourceId: 'SRC_FOREST_MODEL_PACKAGE',
    collectionId: 'stylized-forest',
    collectionName: 'Stylized Forest/EcoKit',
    expectedFilename: 'Stylized_Forest_Nature_Kit.zip',
    aliases: [
      'stylized_forest_nature_kit.blend',
      'stylized forest nature kit',
      'forest model package',
      'stylized forest',
    ],
    extension: '.zip',
    mimeType: 'application/zip',
    notes:
      'Confirmed purchase-site Stylized Forest Nature Kit. Internal blend/FBX/OBJ/MTL and texture tiers are archive-content expectations, not separate downloads.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_STYLIZED_FOREST',
    textureTier: null,
    officialDownload: true,
    legacyCollectionIds: [],
  },
  {
    sourceId: 'SRC_FOREST_STYLISED_ECOKIT',
    collectionId: 'stylized-forest',
    collectionName: 'Stylized Forest/EcoKit',
    expectedFilename: 'Stylised EcoKit.zip',
    aliases: ['stylised ecokit', 'stylized ecokit'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes:
      'Confirmed purchase-site Stylised EcoKit. Former procedural-nature blend files stay archive-content expectations.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_STYLISED_ECOKIT',
    textureTier: null,
    officialDownload: true,
    legacyCollectionIds: ['procedural-nature'],
  },
  {
    sourceId: 'SRC_SKY_WORLD_SHADERS_GIVEAWAY',
    collectionId: 'world-shaders',
    collectionName: 'World Shaders',
    expectedFilename: 'Giveaway_World Shaders.zip',
    aliases: ['world shaders giveaway', 'Giveaway_World_Shaders.zip'],
    extension: '.zip',
    mimeType: 'application/zip',
    notes: 'Confirmed purchase-site World Shaders bonus package. It is one of the 14 official downloads.',
    unityPreservationOnly: false,
    inspectionJobId: 'INSPECT_WORLD_SHADERS',
    textureTier: null,
    officialDownload: true,
    legacyCollectionIds: ['sky-hdri'],
  },
];

export const ARCHIVE_CONTENT_EXPECTATIONS: ArchiveContentExpectation[] = [
  {
    contentId: 'AC_SKY_HDRI_SK1',
    formerSourceId: 'SRC_SKY_HDRI_SK1_ZIP',
    parentSourceId: 'SRC_SKY_HDRI_JPG_PACK',
    collectionId: 'sky-hdri',
    expectedFilename: 'sk1.zip',
    aliases: ['hdri part sk1 zip', 'hdri sk1', 'sk1', 'HDRI_part_sk1.zip'],
    notes: 'Former 27/30-file top-level HDRI part. Count only as archive content.',
    formerInventory: '27-file',
    textureTier: null,
    countsAsMissingDownload: false,
  },
  {
    contentId: 'AC_SKY_HDRI_SK2',
    formerSourceId: 'SRC_SKY_HDRI_SK2_ZIP',
    parentSourceId: 'SRC_SKY_HDRI_JPG_PACK',
    collectionId: 'sky-hdri',
    expectedFilename: 'sk2.zip',
    aliases: ['hdri part sk2 zip', 'hdri sk2', 'sk2'],
    notes: 'Former 27/30-file top-level HDRI part. Count only as archive content.',
    formerInventory: '27-file',
    textureTier: null,
    countsAsMissingDownload: false,
  },
  {
    contentId: 'AC_SKY_HDRI_SK3',
    formerSourceId: 'SRC_SKY_HDRI_SK3_ZIP',
    parentSourceId: 'SRC_SKY_HDRI_JPG_PACK',
    collectionId: 'sky-hdri',
    expectedFilename: 'sk3.zip',
    aliases: ['hdri part sk3 zip', 'hdri sk3', 'sk3'],
    notes: 'Former 27/30-file top-level HDRI part. Count only as archive content.',
    formerInventory: '27-file',
    textureTier: null,
    countsAsMissingDownload: false,
  },
  {
    contentId: 'AC_SKY_HDRI_SK4',
    formerSourceId: 'SRC_SKY_HDRI_SK4_ZIP',
    parentSourceId: 'SRC_SKY_HDRI_JPG_PACK',
    collectionId: 'sky-hdri',
    expectedFilename: 'sk4.zip',
    aliases: ['hdri part sk4 zip', 'hdri sk4', 'sk4'],
    notes: 'Former 27/30-file top-level HDRI part. Count only as archive content.',
    formerInventory: '27-file',
    textureTier: null,
    countsAsMissingDownload: false,
  },
  {
    contentId: 'AC_SKY_HDRI_PART_2',
    formerSourceId: 'SRC_FOREST_MODEL_PACKAGE_HDRI_PART_2',
    parentSourceId: 'SRC_SKY_HDRI_JPG_PACK',
    collectionId: 'sky-hdri',
    expectedFilename: 'HDRI_Part_2.zip',
    aliases: ['hdri part 2 zip', 'hdri part 2'],
    notes:
      'Previously mis-counted as the Stylized Forest top-level download. It is archive content, not a missing download.',
    formerInventory: '30-file',
    textureTier: null,
    countsAsMissingDownload: false,
  },
  {
    contentId: 'AC_FOREST_TEXTURES_1024',
    formerSourceId: 'SRC_FOREST_TEXTURES_1024',
    parentSourceId: 'SRC_FOREST_MODEL_PACKAGE',
    collectionId: 'stylized-forest',
    expectedFilename: '1024.zip',
    aliases: ['1024 texture zip', 'forest 1024', 'textures 1024', 'Stylized_Forest_Textures_1024.zip'],
    notes: '1024 texture tier inside the forest kit. Not a separate source download.',
    formerInventory: '27-file',
    textureTier: '1024',
    countsAsMissingDownload: false,
  },
  {
    contentId: 'AC_FOREST_TEXTURES_2048',
    formerSourceId: 'SRC_FOREST_TEXTURES_2048',
    parentSourceId: 'SRC_FOREST_MODEL_PACKAGE',
    collectionId: 'stylized-forest',
    expectedFilename: '2048.zip',
    aliases: ['2048 texture zip', 'forest 2048', 'textures 2048', 'Stylized_Forest_Textures_2048.zip'],
    notes: '2048 texture tier inside the forest kit. Not a separate source download.',
    formerInventory: '27-file',
    textureTier: '2048',
    countsAsMissingDownload: false,
  },
  {
    contentId: 'AC_FOREST_TEXTURES_4096',
    formerSourceId: 'SRC_FOREST_TEXTURES_4096',
    parentSourceId: 'SRC_FOREST_MODEL_PACKAGE',
    collectionId: 'stylized-forest',
    expectedFilename: '4096.zip',
    aliases: ['4096 texture zip', 'forest 4096', 'textures 4096'],
    notes: '4096 texture tier inside the forest kit. Not a separate source download.',
    formerInventory: '27-file',
    textureTier: '4096',
    countsAsMissingDownload: false,
  },
  {
    contentId: 'AC_NATURE_FLORA',
    formerSourceId: 'SRC_NATURE_FLORA_BLEND_ZIP',
    parentSourceId: 'SRC_FOREST_STYLISED_ECOKIT',
    collectionId: 'stylized-forest',
    expectedFilename: 'Flora_Mat&GN&Models.blend.zip',
    aliases: ['flora_mat&gn&models.blend.zip', 'flora', 'flora mat gn models'],
    notes: 'Former procedural-nature download. EcoKit archive content only.',
    formerInventory: '27-file',
    textureTier: null,
    countsAsMissingDownload: false,
  },
  {
    contentId: 'AC_NATURE_ROCK_MODELS',
    formerSourceId: 'SRC_NATURE_ROCK_MODELS',
    parentSourceId: 'SRC_FOREST_STYLISED_ECOKIT',
    collectionId: 'stylized-forest',
    expectedFilename: 'Rock_Models.blend',
    aliases: ['rock_models.blend', 'rock models'],
    notes: 'Former procedural-nature download. EcoKit archive content only.',
    formerInventory: '27-file',
    textureTier: null,
    countsAsMissingDownload: false,
  },
  {
    contentId: 'AC_NATURE_ROCK_MAT',
    formerSourceId: 'SRC_NATURE_ROCK_MAT',
    parentSourceId: 'SRC_FOREST_STYLISED_ECOKIT',
    collectionId: 'stylized-forest',
    expectedFilename: 'Rock_Mat.blend',
    aliases: ['rock_mat.blend', 'rock materials', 'rock mat'],
    notes: 'Former procedural-nature download. EcoKit archive content only.',
    formerInventory: '27-file',
    textureTier: null,
    countsAsMissingDownload: false,
  },
  {
    contentId: 'AC_NATURE_ROCK_GN',
    formerSourceId: 'SRC_NATURE_ROCK_GN',
    parentSourceId: 'SRC_FOREST_STYLISED_ECOKIT',
    collectionId: 'stylized-forest',
    expectedFilename: 'Rock_GN.blend',
    aliases: ['rock_gn.blend', 'rock geometry nodes', 'rock gn'],
    notes: 'Former procedural-nature download. EcoKit archive content only.',
    formerInventory: '27-file',
    textureTier: null,
    countsAsMissingDownload: false,
  },
  {
    contentId: 'AC_NATURE_WATER',
    formerSourceId: 'SRC_NATURE_WATER_MAT_GN',
    parentSourceId: 'SRC_FOREST_STYLISED_ECOKIT',
    collectionId: 'stylized-forest',
    expectedFilename: 'Water_Mat&GN.blend',
    aliases: ['water_mat&gn.blend', 'water mat gn', 'water'],
    notes: 'Former procedural-nature download. EcoKit archive content only.',
    formerInventory: '27-file',
    textureTier: null,
    countsAsMissingDownload: false,
  },
  {
    contentId: 'AC_NATURE_SWARM',
    formerSourceId: 'SRC_NATURE_SWARM',
    parentSourceId: 'SRC_FOREST_STYLISED_ECOKIT',
    collectionId: 'stylized-forest',
    expectedFilename: 'Swarm.blend',
    aliases: ['swarm.blend', 'swarm'],
    notes: 'Former procedural-nature download. EcoKit archive content only.',
    formerInventory: '27-file',
    textureTier: null,
    countsAsMissingDownload: false,
  },
  {
    contentId: 'AC_NATURE_TEXTURES',
    formerSourceId: 'SRC_NATURE_TEXTURES_ZIP',
    parentSourceId: 'SRC_FOREST_STYLISED_ECOKIT',
    collectionId: 'stylized-forest',
    expectedFilename: 'Textures.zip',
    aliases: ['textures.zip', 'nature textures'],
    notes: 'Former procedural-nature download. EcoKit archive content only.',
    formerInventory: '27-file',
    textureTier: null,
    countsAsMissingDownload: false,
  },
  {
    contentId: 'AC_NATURE_ASSETS_LIBRARY',
    formerSourceId: 'SRC_NATURE_ASSETS_LIBRARY_ZIP',
    parentSourceId: 'SRC_FOREST_STYLISED_ECOKIT',
    collectionId: 'stylized-forest',
    expectedFilename: 'assets library.zip',
    aliases: ['assets library.zip', 'assets library', 'asset preview library'],
    notes: 'Former procedural-nature download. EcoKit archive content only.',
    formerInventory: '27-file',
    textureTier: null,
    countsAsMissingDownload: false,
  },
  {
    contentId: 'AC_NATURE_ASSET_CATS',
    formerSourceId: 'SRC_NATURE_ASSET_CATS',
    parentSourceId: 'SRC_FOREST_STYLISED_ECOKIT',
    collectionId: 'stylized-forest',
    expectedFilename: 'blender_assets.cats.txt',
    aliases: ['blender_assets.cats.txt', 'asset catalog', 'cats.txt'],
    notes: 'Former procedural-nature download. EcoKit archive content only.',
    formerInventory: '27-file',
    textureTier: null,
    countsAsMissingDownload: false,
  },
];

export const EXPECTED_SOURCE_COUNT = 14;
export const EXPECTED_COLLECTION_COUNT = 4;
export const LEGACY_27_FILE_COUNT = 27;
export const LEGACY_30_FILE_COUNT = 30;

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

export function normalizeInventoryFilename(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMatch(value: string): string {
  return normalizeInventoryFilename(value);
}

function cloneExpected(item: ExpectedSourceFile): ExpectedSourceFile {
  return {
    ...item,
    aliases: [...item.aliases],
    legacyCollectionIds: [...item.legacyCollectionIds],
  };
}

function filenameMatches(item: { expectedFilename: string; aliases: string[] }, filename: string): boolean {
  const needle = normalizeMatch(filename);
  return (
    normalizeMatch(item.expectedFilename) === needle ||
    item.aliases.some((name) => normalizeMatch(name) === needle)
  );
}

export function listExpectedSourceFiles(): ExpectedSourceFile[] {
  return EXPECTED_SCENERY_SOURCE_FILES.map(cloneExpected);
}

export function listArchiveContentExpectations(): ArchiveContentExpectation[] {
  return ARCHIVE_CONTENT_EXPECTATIONS.map((item) => ({
    ...item,
    aliases: [...item.aliases],
    countsAsMissingDownload: false as const,
  }));
}

export function officialSourceIds(): string[] {
  return EXPECTED_SCENERY_SOURCE_FILES.map((item) => item.sourceId);
}

export function isOfficialSourceId(sourceId: string): boolean {
  return EXPECTED_SCENERY_SOURCE_FILES.some((item) => item.sourceId === sourceId);
}

export function getExpectedSourceFile(sourceId: string): ExpectedSourceFile {
  const found = EXPECTED_SCENERY_SOURCE_FILES.find((item) => item.sourceId === sourceId);
  if (!found) {
    throw new Error(`Unknown expected scenery source: ${sourceId}`);
  }
  return cloneExpected(found);
}

export function lookupSourceOrArchive(sourceId: string): {
  kind: 'official' | 'archive_content';
  official: ExpectedSourceFile | null;
  archive: ArchiveContentExpectation | null;
} {
  const official = EXPECTED_SCENERY_SOURCE_FILES.find((item) => item.sourceId === sourceId);
  if (official) {
    return { kind: 'official', official: cloneExpected(official), archive: null };
  }
  const archive = ARCHIVE_CONTENT_EXPECTATIONS.find((item) => item.formerSourceId === sourceId);
  if (archive) {
    return {
      kind: 'archive_content',
      official: null,
      archive: { ...archive, aliases: [...archive.aliases], countsAsMissingDownload: false },
    };
  }
  throw new Error(`Unknown scenery source or archive-content id: ${sourceId}`);
}

export function matchExactExpectedFilename(filename: string): ExpectedSourceFile | null {
  const needle = normalizeMatch(filename);
  const exact = EXPECTED_SCENERY_SOURCE_FILES.find(
    (item) => normalizeMatch(item.expectedFilename) === needle,
  );
  return exact ? cloneExpected(exact) : null;
}

export function matchAliasOnlyExpectedFilename(filename: string): ExpectedSourceFile | null {
  if (matchExactExpectedFilename(filename)) return null;
  const needle = normalizeMatch(filename);
  const alias = EXPECTED_SCENERY_SOURCE_FILES.find((item) =>
    item.aliases.some((name) => normalizeMatch(name) === needle),
  );
  return alias ? cloneExpected(alias) : null;
}

export function matchArchiveContentFilename(filename: string): ArchiveContentExpectation | null {
  const found = ARCHIVE_CONTENT_EXPECTATIONS.find((item) => filenameMatches(item, filename));
  return found
    ? { ...found, aliases: [...found.aliases], countsAsMissingDownload: false }
    : null;
}

export function collectionsCompatible(expected: ExpectedSourceFile, collectionId: string): boolean {
  return (
    expected.collectionId === collectionId || expected.legacyCollectionIds.includes(collectionId as ManifestCollectionId)
  );
}

export function matchExpectedSourceFile(input: {
  collectionId: ManifestCollectionId | string;
  filename: string;
  expectedSourceId?: string;
}): ExpectedSourceFile | null {
  if (input.expectedSourceId) {
    const exact = EXPECTED_SCENERY_SOURCE_FILES.find((item) => item.sourceId === input.expectedSourceId);
    if (exact && collectionsCompatible(exact, input.collectionId)) {
      return cloneExpected(exact);
    }
    return null;
  }
  const collectionMatches = EXPECTED_SCENERY_SOURCE_FILES.filter((item) =>
    collectionsCompatible(item, input.collectionId),
  );
  const exactName = collectionMatches.find((item) => filenameMatches(item, input.filename));
  if (exactName) return cloneExpected(exactName);
  return null;
}

export function matchOfficialDownloadAnywhere(filename: string): ExpectedSourceFile | null {
  return matchExactExpectedFilename(filename) ?? matchAliasOnlyExpectedFilename(filename);
}

export function assertInventoryCounts(): { sourceCount: number; collectionCount: number } {
  const sourceCount = EXPECTED_SCENERY_SOURCE_FILES.length;
  const collectionCount = new Set(EXPECTED_SCENERY_SOURCE_FILES.map((item) => item.collectionId)).size;
  if (sourceCount !== EXPECTED_SOURCE_COUNT) {
    throw new Error(`Expected ${EXPECTED_SOURCE_COUNT} official source downloads, found ${sourceCount}.`);
  }
  if (collectionCount !== EXPECTED_COLLECTION_COUNT) {
    throw new Error(`Expected ${EXPECTED_COLLECTION_COUNT} collections, found ${collectionCount}.`);
  }
  return { sourceCount, collectionCount };
}

export function collectionDisplayOrder(): SceneryCollectionId[] {
  return [...SCENERY_COLLECTION_IDS];
}
