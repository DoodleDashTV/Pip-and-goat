export type TopologyAuditInput = {
  vertices: number | null;
  faces: number | null;
  triangles: number | null;
  mainBodyVertices: number | null;
  mainBodyFaces: number | null;
  predominantlyQuads: boolean | null;
  uvsPresent: boolean | null;
};

export type TopologyAuditReport = {
  policy: 'PRESERVE_DEFORMATION_QUALITY_FIRST';
  blindDecimateForbidden: true;
  oldTargetRange: '15k-30k';
  oldTargetIsNotAutomatic: true;
  losslessMasterRequired: true;
  recommendedTier: 'HERO_MASTER';
  optimizeOnlyAfterProfiling: true;
  state: 'PLANNED' | 'BLOCKED_REAL_EXECUTION_REQUIRED';
  notes: string[];
};

export const EXPECTED_GOAT_PACKAGE_HINTS = {
  blenderSourceApproxMb: 298,
  authoredBlender: '4.3',
  fbxApproxMb: 5.4,
  textureMapsApprox: 21,
  textureRes: '2K',
  exportedFbxMeshObjectsApprox: 19,
  verticesApprox: 99056,
  facesApprox: 97866,
  trianglesApprox: 195648,
  mainBodyVerticesApprox: 66238,
  mainBodyFacesApprox: 65704,
} as const;

export function auditTopology(input: TopologyAuditInput | null): TopologyAuditReport {
  if (!input || input.vertices == null) {
    return {
      policy: 'PRESERVE_DEFORMATION_QUALITY_FIRST',
      blindDecimateForbidden: true,
      oldTargetRange: '15k-30k',
      oldTargetIsNotAutomatic: true,
      losslessMasterRequired: true,
      recommendedTier: 'HERO_MASTER',
      optimizeOnlyAfterProfiling: true,
      state: 'BLOCKED_REAL_EXECUTION_REQUIRED',
      notes: [
        'Goat_FINN.zip is heavier than the old 15–30k target and appears clean.',
        'Do not automatically destroy delivered retopology.',
        'HERO_MASTER may remain relatively dense until profiling proves a benefit.',
      ],
    };
  }
  return {
    policy: 'PRESERVE_DEFORMATION_QUALITY_FIRST',
    blindDecimateForbidden: true,
    oldTargetRange: '15k-30k',
    oldTargetIsNotAutomatic: true,
    losslessMasterRequired: true,
    recommendedTier: 'HERO_MASTER',
    optimizeOnlyAfterProfiling: true,
    state: 'PLANNED',
    notes: [
      `Observed ${input.vertices} vertices / ${input.faces} faces.`,
      'Optimization is allowed only when silhouette, UVs, textures, deformation, and facial acting stay equal or better.',
    ],
  };
}
