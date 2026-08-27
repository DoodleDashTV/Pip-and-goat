import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001SceneryAdmissionReadiness } from '@/lib/tivvlejoy-ep001-scenery-admission-readiness';

export const EP001_REAL_SCENERY_SOURCE_INSPECTION_SCHEMA =
  'TIVVLEJOY_EP001_REAL_SCENERY_SOURCE_INSPECTION_V1' as const;

const SOURCES = [
  {
    sourceId: 'VILLAGE_FBX_V1',
    label: 'Village FBX export set',
    libraryPath: '/TivvleJoy Environment Assets/Village Environment/Village (FBX)(1).zip',
    exactByteSize: 2_148_090,
    sha256: '1d5eefbea277aeb9f2dcc546e72eeec5ca364b83468740c6d27285ac50c355ad',
    archiveEntryCount: 34,
    uncompressedBytes: 2_766_972,
    crcClean: true,
    suspiciousExecutableOrScriptEntries: 0,
    formatSummary: '33 FBX model files',
    blenderHeader: null,
    observedAssets: [
      'Barrel01','Bed01','Book01','Bookcase01','Bucket01','Cabin01A','Cabin01B','Cabin02A','Cabin02B','Cabin03A','Cabin03B','Cabin04A','Cabin04B','Cabin05A','Cabin05B','Candle01','Candle02','Cart01','Chair01','Chair02','Crate01','Fence01','Firewoods01','Gate01','Grass01','Nightstand01','Rack01','Shelf01','Table01','Table02','Tree01','Tree02','Tree03',
    ],
    candidateRoles: ['BUILDING_HERO','BUILDING_SUPPORT','STREET_PROP','BACKGROUND_FILL','GRASS','TREE_HERO','TREE_SUPPORT'] as const,
  },
  {
    sourceId: 'VILLAGE_BLEND_402_V1',
    label: 'Village Blender 4.2.2 asset set',
    libraryPath: '/TivvleJoy Environment Assets/Village Environment/Village (Blender 4.2.2)(2).zip',
    exactByteSize: 7_282_543,
    sha256: 'c836125e3f63bd7c1e9f992f919ccd903956ee43f8d9a3a0a84423e8365f8ee9',
    archiveEntryCount: 33,
    uncompressedBytes: 47_673_367,
    crcClean: true,
    suspiciousExecutableOrScriptEntries: 0,
    formatSummary: '33 Blender asset files',
    blenderHeader: 'BLENDER-v402',
    observedAssets: [
      'Barrel01','Bed01','Book01','Bookcase01','Bucket01','Cabin01A','Cabin01B','Cabin02A','Cabin02B','Cabin03A','Cabin03B','Cabin04A','Cabin04B','Cabin05A','Cabin05B','Candle01','Candle02','Cart01','Chair01','Chair02','Crate01','Fence01','Firewoods01','Gate01','Grass01','Nightstand01','Rack01','Shelf01','Table01','Table02','Tree01','Tree02','Tree03',
    ],
    candidateRoles: ['BUILDING_HERO','BUILDING_SUPPORT','STREET_PROP','BACKGROUND_FILL','GRASS','TREE_HERO','TREE_SUPPORT'] as const,
  },
  {
    sourceId: 'VILLAGE_TEXTURES_V1',
    label: 'Village texture set',
    libraryPath: '/TivvleJoy Environment Assets/Village Environment/Village (Textures).zip',
    exactByteSize: 72_051_550,
    sha256: 'eb24e201513963bbce5d5fca19ea7060a383b5891773321cad1e364f281f8bea',
    archiveEntryCount: 135,
    uncompressedBytes: 73_078_074,
    crcClean: true,
    suspiciousExecutableOrScriptEntries: 0,
    formatSummary: '77 PNG textures plus metadata sidecars',
    blenderHeader: null,
    observedAssets: ['Cabin','Barrel','Bed','Book','Bookcase','Candle','Cart','Chair','Crate','Fence','Firewoods','Gate','Grass','Nightstand','Rack','Shelf','Table','Tree'],
    candidateRoles: [] as const,
  },
  {
    sourceId: 'VILLAGE_PROJECT_V1',
    label: 'Village project source',
    libraryPath: '/TivvleJoy Environment Assets/Village Environment/Project File.zip',
    exactByteSize: 92_573_162,
    sha256: 'f6b54526339dcf9ead4e823f1b83d149fadcc60cbc8fad1c85f1487dc6a4a9ce',
    archiveEntryCount: 3,
    uncompressedBytes: 136_801_432,
    crcClean: true,
    suspiciousExecutableOrScriptEntries: 0,
    formatSummary: '1 Blender project + 1 PSD source',
    blenderHeader: 'BLENDER-v402',
    observedAssets: ['Project File.blend','Project File.psd'],
    candidateRoles: ['BUILDING_HERO','BUILDING_SUPPORT','STREET_PROP','BACKGROUND_FILL','GRASS','TREE_HERO','TREE_SUPPORT'] as const,
  },
  {
    sourceId: 'FOREST_TEXTURES_4096_V1',
    label: 'Stylized Forest 4096 texture set',
    libraryPath: '/TivvleJoy Environment Assets/Stylized Forest/4096.zip',
    exactByteSize: 431_312_447,
    sha256: 'ff2b2d921c5c68dd4d0f846a720a2c4a0229d578eb303845f90f3aa4740abeca',
    archiveEntryCount: 116,
    uncompressedBytes: 2_080_397_569,
    crcClean: true,
    suspiciousExecutableOrScriptEntries: 0,
    formatSummary: '102 TGA archive entries including macOS metadata; texture families for rocks, foliage, trunks, and leaves',
    blenderHeader: null,
    observedAssets: ['Rocks_A','Rocks_B','Foliage_01','Foliage_02','Trunks','Leaves'],
    candidateRoles: [] as const,
  },
  {
    sourceId: 'WORLD_SHADER_SKY_V1',
    label: 'Giveaway World Shaders sky source',
    libraryPath: '/TivvleJoy Environment Assets/Sky and HDRI Lighting/World Shaders/Giveaway_World Shaders.zip',
    exactByteSize: 711_398,
    sha256: 'a94ce1909aa77d97674c814f5a6f8a15fcafc67e9cdba7c8e53f52045ea41c7e',
    archiveEntryCount: 2,
    uncompressedBytes: 4_442_856,
    crcClean: true,
    suspiciousExecutableOrScriptEntries: 0,
    formatSummary: '1 Blender sky/world file',
    blenderHeader: 'BLENDER-v304',
    observedAssets: ['Sky_World.blend'],
    candidateRoles: ['SKY'] as const,
  },
] as const;

export function compileEp001RealScenerySourceInspection() {
  const admission = compileEp001SceneryAdmissionReadiness();
  const supportedRoles = new Set<string>(SOURCES.flatMap((source) => [...source.candidateRoles]));
  const slotAssessments = admission.slots.map((slot) => {
    const candidateSources = SOURCES.filter((source) => source.candidateRoles.includes(slot.semanticRole as never)).map((source) => source.sourceId);
    return {
      slotId: slot.slotId,
      locationId: slot.locationId,
      semanticRole: slot.semanticRole,
      sourceCapabilityObserved: candidateSources.length > 0,
      candidateSourceIds: candidateSources,
      sourceSelectionApproved: false as const,
      licenseVerified: false as const,
      humanVisualApprovalIssued: false as const,
      state: candidateSources.length > 0 ? 'REAL_SOURCE_CANDIDATE_OBSERVED_NOT_ADMITTED' as const : 'NO_OBSERVED_SOURCE_CAPABILITY_YET' as const,
    };
  });

  const body = {
    schemaVersion: EP001_REAL_SCENERY_SOURCE_INSPECTION_SCHEMA,
    episodeId: admission.episodeId,
    sceneryAdmissionReadinessSha256: admission.sceneryAdmissionReadinessSha256,
    state: 'REAL_SOURCE_BYTES_STATICALLY_INSPECTED_ADMISSION_STILL_CLOSED' as const,
    sources: SOURCES.map((source) => ({
      ...source,
      archiveIntegrityVerified: source.crcClean,
      pathTraversalObserved: false as const,
      embeddedExecutableOrScriptObserved: false as const,
      sourceBytesObserved: true as const,
      licenseVerified: false as const,
      humanApproved: false as const,
      admissionGranted: false as const,
    })),
    slotAssessments,
    unsupportedOrUnprovenRoles: admission.slots
      .filter((slot) => !supportedRoles.has(slot.semanticRole))
      .map((slot) => ({ slotId: slot.slotId, semanticRole: slot.semanticRole, locationId: slot.locationId })),
    observations: [
      'Village FBX and Blender archives expose the same 33 named asset families, including five cabin families, village props, grass, and three tree families.',
      'Village Blender files report BLENDER-v402 headers and were not executed during this inspection.',
      'Village texture archive contains PNG material maps; no code was executed.',
      'Stylized Forest 4096 archive is a texture payload only; the inspected folder does not contain forest geometry, so it cannot independently satisfy tree/grass geometry slots.',
      'World Shaders archive contains a BLENDER-v304 sky/world file; it is only a source candidate until license/provenance and visual approval are confirmed.',
      'Static source capability does not prove shot suitability, scale, material integrity, licensing, or human visual approval.',
    ],
    metrics: {
      inspectedSourceCount: SOURCES.length,
      totalObservedSourceBytes: SOURCES.reduce((sum, source) => sum + source.exactByteSize, 0),
      sourceCapabilitySlotCount: slotAssessments.filter((slot) => slot.sourceCapabilityObserved).length,
      unsupportedOrUnprovenSlotCount: slotAssessments.filter((slot) => !slot.sourceCapabilityObserved).length,
      licenseVerifiedSourceCount: 0 as const,
      humanApprovedSourceCount: 0 as const,
      admittedSourceCount: 0 as const,
    },
    authority: {
      staticInspectionComplete: true as const,
      realSourceBytesObserved: true as const,
      sourceSelectionApproved: false as const,
      licensesVerified: false as const,
      sceneryAdmissionGranted: false as const,
      blenderExecutionAllowed: false as const,
      paidComputeAllowed: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      embeddedScriptsExecuted: false as const,
      blenderLaunched: false as const,
      commercialSourceModified: false as const,
      paidRequests: 0 as const,
      productionMutations: 0 as const,
    },
  };
  return { ...body, realScenerySourceInspectionSha256: sha256Canonical(body) };
}

export type Ep001RealScenerySourceInspection = ReturnType<typeof compileEp001RealScenerySourceInspection>;
