export type ChangeImpact = {
  invalidatedRegistryResolutions: string[];
  invalidatedWorldBuilderSlots: string[];
  invalidatedShotAssemblyManifests: string[];
  invalidatedEpisodePackets: string[];
  voicesInvalidated: false;
  unrelatedCharacterAnimationInvalidated: false;
  unrelatedSceneryInvalidated: false;
};

export function sceneryVersionChangeImpact(input: {
  assetId: string;
  previousVersion: string;
  nextVersion: string;
  dependentResolutions: string[];
  dependentSlots: string[];
  dependentManifests: string[];
  dependentPackets: string[];
}): ChangeImpact {
  if (input.previousVersion === input.nextVersion) {
    return {
      invalidatedRegistryResolutions: [],
      invalidatedWorldBuilderSlots: [],
      invalidatedShotAssemblyManifests: [],
      invalidatedEpisodePackets: [],
      voicesInvalidated: false,
      unrelatedCharacterAnimationInvalidated: false,
      unrelatedSceneryInvalidated: false,
    };
  }
  return {
    invalidatedRegistryResolutions: [...input.dependentResolutions],
    invalidatedWorldBuilderSlots: [...input.dependentSlots],
    invalidatedShotAssemblyManifests: [...input.dependentManifests],
    invalidatedEpisodePackets: [...input.dependentPackets],
    voicesInvalidated: false,
    unrelatedCharacterAnimationInvalidated: false,
    unrelatedSceneryInvalidated: false,
  };
}
