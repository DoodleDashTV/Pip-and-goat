/**
 * Dry-run Goat source materialization for the existing RunPod worker.
 * This module never launches a pod and never downloads bytes unless a later
 * authorized paid-execution gate explicitly calls a different path.
 */
const OBJECT_KEY = 'tivvlejoy-assets/characters/CHAR_GOAT_001/source/Goat_FINN.zip';
const EXPECTED_SHA = 'f5e85122f5af476e07df58c884b16a9663e05aaeef668f4d218fb7a410162ea5';

function planCharacterSourceMaterialize(input = {}) {
  const authorized = input.paidExecutionAuthorized === true && input.dryRun === false;
  if (authorized) {
    return {
      ok: false,
      launched: false,
      paid: false,
      status: 'REFUSED',
      reason: 'Paid Goat materialization is not authorized in this task.',
    };
  }
  return {
    ok: true,
    launched: false,
    paid: false,
    gpuRequested: false,
    jobKind: 'CHARACTER_SOURCE_MATERIALIZE',
    objectKey: OBJECT_KEY,
    expectedSha256: EXPECTED_SHA,
    verifyHashAfterDownload: true,
    overwriteSourceForbidden: true,
    blenderConversionClaimed: false,
    secureGpuPolicy: 'SECURE_GPU_PRESERVED',
    status: 'DRY_RUN',
    goatProductionReady: false,
  };
}

module.exports = { planCharacterSourceMaterialize, OBJECT_KEY, EXPECTED_SHA };
