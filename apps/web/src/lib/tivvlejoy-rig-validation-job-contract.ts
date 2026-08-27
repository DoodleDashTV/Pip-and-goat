import { createHash } from 'node:crypto';
import { compileRigAnimationCompatibilitySuite } from './tivvlejoy-rig-animation-compatibility-suite';
import type { AdapterCharacterId } from './tivvlejoy-rig-control-adapter';

export const TIVVLEJOY_RIG_VALIDATION_JOB_SCHEMA = 'TIVVLEJOY_RIG_VALIDATION_JOB_V1' as const;

export type RigValidationJobInput = {
  characterId: AdapterCharacterId;
  rigVersionId: string;
  rigSourceSha256: string;
  rigReceiptSha256: string;
  adapterSha256: string;
  requestedTestIds?: readonly string[];
};

export function compileRigValidationJob(input: RigValidationJobInput) {
  const suite = compileRigAnimationCompatibilitySuite();
  const availableTests = input.characterId === 'CHAR_PIP_001' ? suite.pip : suite.goat;
  const requested = input.requestedTestIds?.length
    ? availableTests.filter((test) => input.requestedTestIds!.includes(test.id))
    : availableTests;
  const errors: string[] = [];
  if (!/^[a-f0-9-]{36}$/i.test(input.rigVersionId)) errors.push('RIG_VALIDATION_JOB_VERSION_ID_INVALID');
  for (const [label, value] of [
    ['RIG_SOURCE', input.rigSourceSha256],
    ['RIG_RECEIPT', input.rigReceiptSha256],
    ['ADAPTER', input.adapterSha256],
  ] as const) {
    if (!/^[a-f0-9]{64}$/i.test(value)) errors.push(`RIG_VALIDATION_JOB_${label}_SHA_INVALID`);
  }
  if (input.requestedTestIds?.length && requested.length !== input.requestedTestIds.length) errors.push('RIG_VALIDATION_JOB_UNKNOWN_TEST_ID');
  if (requested.length === 0) errors.push('RIG_VALIDATION_JOB_NO_TESTS');

  const outputPrefix = `tivvlejoy-assets/characters/${input.characterId}/rig-deliveries/${input.rigVersionId}/validation`;
  const payload = {
    schemaVersion: TIVVLEJOY_RIG_VALIDATION_JOB_SCHEMA,
    episodeId: 'EP001' as const,
    characterId: input.characterId,
    rigVersionId: input.rigVersionId,
    bindings: {
      rigSourceSha256: input.rigSourceSha256.toLowerCase(),
      rigReceiptSha256: input.rigReceiptSha256.toLowerCase(),
      adapterSha256: input.adapterSha256.toLowerCase(),
      compatibilitySuiteSha256: suite.suiteSha256,
    },
    blender: {
      requiredVersion: '4.2',
      fps: 30,
      headlessAllowed: true,
      networkAccessDuringValidation: false,
      externalScriptsAllowed: false,
      autoSaveIntoSource: false,
      sourceMountedReadOnly: true,
    },
    limits: {
      maxTests: availableTests.length,
      maxFramesPerTest: 180,
      maxTotalFrames: requested.reduce((sum, test) => sum + test.durationFrames, 0),
      maxWallClockMinutes: 45,
      maxGpuSpendUsd: 0,
      paidExecutionAuthorized: false,
    },
    tests: requested.map((test) => ({
      testId: test.id,
      durationFrames: test.durationFrames,
      requiredControls: test.requiredControls,
      acceptance: test.acceptance,
      output: {
        manifestKey: `${outputPrefix}/${test.id}/manifest.json`,
        playblastKey: `${outputPrefix}/${test.id}/playblast.mp4`,
        metricsKey: `${outputPrefix}/${test.id}/metrics.json`,
        stillsPrefix: `${outputPrefix}/${test.id}/stills/`,
      },
    })),
    authority: {
      canLaunchWorker: false,
      canCreatePaidPod: false,
      canWriteProduction: false,
      canApproveRig: false,
      requiresExplicitExecutionAuthorization: true,
      requiresHumanApprovalAfterExecution: true,
    },
  };
  const jobSha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return { valid: errors.length === 0, errors, payload, jobSha256 };
}
