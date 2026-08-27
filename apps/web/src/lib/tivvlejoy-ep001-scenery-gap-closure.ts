import { sha256Canonical } from '@/lib/tivvlejoy-character-animation';
import { compileEp001RealScenerySourceInspection } from '@/lib/tivvlejoy-ep001-real-scenery-source-inspection';

export const EP001_SCENERY_GAP_CLOSURE_SCHEMA = 'TIVVLEJOY_EP001_SCENERY_GAP_CLOSURE_V1' as const;

const FLORA_SOURCE = {
  sourceId: 'PROCEDURAL_FLORA_LIBRARY_V1',
  libraryPath: '/TivvleJoy Environment Assets/Procedural Nature Library/Flora_Mat&GN&Models.blend.zip',
  exactByteSize: 186_285_372,
  sha256: '2bdd3e6e5fb9c56071c75a3a0536d57642a9733c4bca8f3be088ae1599ba0acb',
  archiveEntryCount: 2,
  crcClean: true,
  blenderHeader: 'BLENDER-v304',
  executed: false,
} as const;

const ASSET_LIBRARY = {
  sourceId: 'PROCEDURAL_ASSET_LIBRARY_V1',
  libraryPath: '/TivvleJoy Environment Assets/Procedural Nature Library/assets library.zip',
  exactByteSize: 358_443_616,
  sha256: '0958117e2bb8c7081af406f52ccbdaaf4c0bc581ff8410003bebf9d08dc390a1',
  archiveEntryCount: 2_215,
  crcClean: true,
  previewPngCount: 1_107,
  observedFamilies: {
    Floral: 37,
    Grass: 187,
    Fern: 100,
    Bushes: 40,
    Tree: 30,
    Rock_Model_Medium: 260,
    Rock_Model_Small: 250,
    Butterfly: 3,
  },
  executed: false,
} as const;

const NATIVE_RECIPES = [
  {
    recipeId: 'NATIVE_SIGNAGE_V1',
    semanticRole: 'SIGNAGE',
    method: 'Create a beveled rectangular sign board from native mesh primitives, parent it to the chosen approved Village facade, and use Blender-native text converted to mesh only after wording is approved.',
    deterministicInputs: ['facade anchor transform','board width/height/depth','approved sign wording','font asset identity','material identity'],
    requiresExternalPurchase: false,
    requiresBlenderExecution: true,
    humanApprovalRequired: true,
  },
  {
    recipeId: 'NATIVE_PATH_V1',
    semanticRole: 'PATH',
    method: 'Construct a native curve centerline, generate path width with Geometry Nodes or bevel geometry, conform to approved terrain, and assign a controlled path material without external geometry.',
    deterministicInputs: ['curve control points','width','terrain identity','material identity','edge-softening profile'],
    requiresExternalPurchase: false,
    requiresBlenderExecution: true,
    humanApprovalRequired: true,
  },
] as const;

export function compileEp001SceneryGapClosure() {
  const inspected = compileEp001RealScenerySourceInspection();
  const nativeRoleSet = new Set<string>(NATIVE_RECIPES.map((recipe) => recipe.semanticRole));

  const slots = inspected.slotAssessments.map((slot) => {
    if (slot.sourceCapabilityObserved) {
      return {
        ...slot,
        capabilityState: 'REAL_SOURCE_CANDIDATE_OBSERVED' as const,
        closureRef: slot.candidateSourceIds,
        capabilityReadyForLaterReview: true as const,
      };
    }
    if (slot.semanticRole === 'FLOWERS') {
      return {
        ...slot,
        sourceCapabilityObserved: true,
        candidateSourceIds: [FLORA_SOURCE.sourceId, ASSET_LIBRARY.sourceId],
        capabilityState: 'REAL_SOURCE_CANDIDATE_OBSERVED' as const,
        closureRef: [FLORA_SOURCE.sourceId, ASSET_LIBRARY.sourceId],
        capabilityReadyForLaterReview: true as const,
      };
    }
    if (nativeRoleSet.has(slot.semanticRole)) {
      const recipe = NATIVE_RECIPES.find((candidate) => candidate.semanticRole === slot.semanticRole)!;
      return {
        ...slot,
        capabilityState: 'NATIVE_RECIPE_PREPARED' as const,
        closureRef: [recipe.recipeId],
        capabilityReadyForLaterReview: true as const,
      };
    }
    return {
      ...slot,
      capabilityState: 'UNRESOLVED' as const,
      closureRef: [] as string[],
      capabilityReadyForLaterReview: false as const,
    };
  });

  const body = {
    schemaVersion: EP001_SCENERY_GAP_CLOSURE_SCHEMA,
    episodeId: inspected.episodeId,
    realSourceInspectionSha256: inspected.realScenerySourceInspectionSha256,
    state: 'ALL_EP001_SCENERY_ROLES_HAVE_SOURCE_OR_NATIVE_CAPABILITY_NOT_ADMITTED' as const,
    additionalObservedSources: [FLORA_SOURCE, ASSET_LIBRARY],
    nativeRecipes: NATIVE_RECIPES,
    slots,
    metrics: {
      totalSlots: slots.length,
      realSourceCandidateSlots: slots.filter((slot) => slot.capabilityState === 'REAL_SOURCE_CANDIDATE_OBSERVED').length,
      nativeRecipeSlots: slots.filter((slot) => slot.capabilityState === 'NATIVE_RECIPE_PREPARED').length,
      unresolvedCapabilitySlots: slots.filter((slot) => slot.capabilityState === 'UNRESOLVED').length,
      admittedSlots: 0 as const,
    },
    remainingGates: [
      'Confirm commercial license/provenance for selected purchased source packages.',
      'Open selected Blender sources in an authorized isolated inspection session.',
      'Execute the native signage/path recipes against the exact approved scene package.',
      'Review materials, scale, silhouette, density, composition, and child-audience visual fit.',
      'Issue explicit human visual approval bound to exact source/scene hashes.',
    ],
    authority: {
      capabilityPlanningComplete: true as const,
      licensesVerified: false as const,
      blenderExecutionCompleted: false as const,
      humanVisualApprovalIssued: false as const,
      sceneryAdmissionGranted: false as const,
      productionWritesAllowed: false as const,
      autoApprovalAllowed: false as const,
    },
    safety: {
      sourceArchivesModified: false as const,
      blenderLaunched: false as const,
      embeddedScriptsExecuted: false as const,
      paidRequests: 0 as const,
      productionMutations: 0 as const,
    },
  };

  return { ...body, sceneryGapClosureSha256: sha256Canonical(body) };
}

export type Ep001SceneryGapClosure = ReturnType<typeof compileEp001SceneryGapClosure>;
