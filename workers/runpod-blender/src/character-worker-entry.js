'use strict';

const { isCharacterMasterJob, runCharacterMaster } = require('./character-master');

async function dispatchCharacterMasterFromWorker(input = {}) {
  const env = input.env || process.env;
  if (!isCharacterMasterJob(env)) {
    return {
      ok: false,
      launched: false,
      paid: false,
      goatProductionReady: false,
      code: 'NOT_CHARACTER_JOB',
      reason: 'Worker entry is not a CHARACTER_MASTER_BUILD job.',
    };
  }
  return runCharacterMaster({
    env,
    log: input.log,
    sourceTransport: input.sourceTransport,
    authorizedTestTransport: input.authorizedTestTransport,
    testExpectedSize: input.testExpectedSize,
    testExpectedSha256: input.testExpectedSha256,
    authorizationReceipt: input.authorizationReceipt,
    authorizationReceiptPath: input.authorizationReceiptPath,
    authorizedImageDigest: input.authorizedImageDigest,
    imageRef: input.imageRef,
    executionId: input.executionId,
    objectKey: input.objectKey,
    workspaceDir: input.workspaceDir,
    artifactDir: input.artifactDir,
    root: input.root,
    pythonBin: input.pythonBin,
    blenderBin: input.blenderBin,
    manifestPath: input.manifestPath,
    runBlenderProbe: input.runBlenderProbe,
    createWorkingCopy: input.createWorkingCopy,
    timeoutMs: input.timeoutMs,
    injectStageFailure: input.injectStageFailure,
  });
}

module.exports = { dispatchCharacterMasterFromWorker };
