const REQUIRED_BRANCH = 'cursor/tivvlejoy-ep012-preview-ledger-migration-73f1';
const REQUIRED_ORG_ID = 'team_SKbKndUqqNWtp29jHlMG5Otl';
const REQUIRED_PROJECT_ID = 'prj_yKQw8QFb9Bkzc9NoouV0cCHYn9SK';

function present(name) {
  return Boolean(String(process.env[name] ?? '').trim());
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function diagnose() {
  if (String(process.env.VERCEL_GIT_COMMIT_REF ?? '').trim() !== REQUIRED_BRANCH) {
    return { status: 'SKIPPED', reason: 'BRANCH_NOT_AUTHORIZED' };
  }
  if (String(process.env.VERCEL_ENV ?? '').trim() !== 'preview') {
    return { status: 'SKIPPED', reason: 'NON_PREVIEW_RUNTIME' };
  }
  if (String(process.env.VERCEL_ORG_ID ?? '').trim() !== REQUIRED_ORG_ID) fail('VERCEL_ORG_MISMATCH');
  if (String(process.env.VERCEL_PROJECT_ID ?? '').trim() !== REQUIRED_PROJECT_ID) fail('VERCEL_PROJECT_MISMATCH');

  const bucketConfigured = present('TIVVLEJOY_EP012_AUDIO_BUCKET') || present('R2_BUCKET');
  const endpointConfigured = present('TIVVLEJOY_EP012_AUDIO_ENDPOINT') || present('R2_ENDPOINT');
  const accessKeyConfigured = present('TIVVLEJOY_EP012_AUDIO_ACCESS_KEY_ID') || present('R2_ACCESS_KEY_ID');
  const secretKeyConfigured =
    present('TIVVLEJOY_EP012_AUDIO_SECRET_ACCESS_KEY') || present('R2_SECRET_ACCESS_KEY');

  return {
    status: 'READ_ONLY',
    storageConfigured:
      bucketConfigured && endpointConfigured && accessKeyConfigured && secretKeyConfigured,
    bucketConfigured,
    endpointConfigured,
    accessKeyConfigured,
    secretKeyConfigured,
    elevenLabsApiKeyConfigured: present('ELEVENLABS_API_KEY'),
    voiceTestTokenConfigured: present('TIVVLEJOY_VOICE_TEST_TOKEN'),
    ledgerDatabaseConfigured: present('TIVVLEJOY_VOICE_LEDGER_DATABASE_URL'),
    providerContacted: false,
    providerRequestsMade: 0,
    storageReads: 0,
    storageWrites: 0,
  };
}

try {
  console.log(`TIVVLEJOY_EP012_CANARY_DIAGNOSTIC ${JSON.stringify(diagnose())}`);
} catch (error) {
  const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
  console.error(`TIVVLEJOY_EP012_CANARY_DIAGNOSTIC BLOCKED ${code}`);
  process.exitCode = 1;
}
