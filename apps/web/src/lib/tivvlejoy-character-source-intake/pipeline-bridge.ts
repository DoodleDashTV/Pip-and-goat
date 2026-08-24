import { BUILD_STAGES, runGoatCharacterBuildPipeline } from '@/lib/tivvlejoy-character-rigging-department';
import { verifyGoatSourceHash } from './validation';
import type { GoatSourceReceipt } from './receipt';

export function connectReceiptToCharacterPipeline(receipt: GoatSourceReceipt) {
  const pipeline = runGoatCharacterBuildPipeline();
  const hash = verifyGoatSourceHash(receipt.sourceSha256);
  const sourceReady = receipt.sourceLocked && hash.ok && receipt.hashVerified;
  const stages = pipeline.stages.map((stage) => {
    if (!sourceReady) return stage;
    if (stage.stage === 'SOURCE_INTAKE' || stage.stage === 'SOURCE_HASH_LOCK') {
      return {
        ...stage,
        disposition: 'REUSED' as const,
        status: 'PLANNED' as const,
        reason: 'R2 SOURCE is hash-locked. Local worker materialization is still required before Blender stages.',
      };
    }
    return stage;
  });
  return {
    department: 'TIVVLEJOY_CHARACTER_RIGGING_ANIMATION_DEPARTMENT_V1',
    duplicatePipelineCreated: false,
    stageCount: BUILD_STAGES.length,
    stages,
    goatProductionReady: false,
    workingCopyReady: receipt.workingCopyStatus === 'WORKING_COPY_READY',
    nextDepartmentAction: sourceReady
      ? 'Materialize SOURCE in an authorized worker, then continue existing stages without false PASS.'
      : 'Upload and hash-verify Goat_FINN.zip before SOURCE_INTAKE can advance.',
    noFalsePass: true,
  };
}
