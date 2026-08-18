/**
 * TivvleJoy scenery intake preview validation.
 * Uses a newly generated tiny text fixture only. Never uploads purchased files.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  createConfiguredMultipartStorage,
  handleSceneryIntakeAction,
  previewSyntheticBytes,
  previewSyntheticFilename,
  resetSceneryIntakeStore,
  sha256HexChunked,
  signedUrlTargetsVercel,
  validateSourceObjectManifest,
} from '../../apps/web/src/lib/scenery/intake';
import { resetIntakeRateLimit } from '../../apps/web/src/lib/scenery/intake/access';
import { countPurchasedSourceObjects } from '../../apps/web/src/lib/scenery/intake/durable-state';
import { describeSceneryStorageConfiguration } from '../../apps/web/src/lib/scenery/intake/config';
import { evaluateQuarantine } from '../../apps/web/src/lib/scenery/intake/quarantine';

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/tivvlejoy-scenery-intake-preview');

type CheckStatus = 'PASS' | 'FAIL' | 'SKIP';
const checks: Array<{ name: string; status: CheckStatus; detail: string }> = [];

function present(name: string): boolean {
  return Boolean(process.env[name] && String(process.env[name]).trim());
}

function record(name: string, status: CheckStatus, detail: string): void {
  checks.push({ name, status, detail });
  console.log(`[${status}] ${name} — ${detail}`);
}

function check(name: string, fn: () => void): void {
  try {
    fn();
    record(name, 'PASS', 'ok');
  } catch (error) {
    record(name, 'FAIL', error instanceof Error ? error.message : String(error));
  }
}

mkdirSync(OUT_DIR, { recursive: true });
resetSceneryIntakeStore();
resetIntakeRateLimit();

const localR2 = {
  R2_BUCKET: present('R2_BUCKET') ? 'present' : 'missing',
  R2_ENDPOINT: present('R2_ENDPOINT') ? 'present' : 'missing',
  R2_ACCESS_KEY_ID: present('R2_ACCESS_KEY_ID') ? 'present' : 'missing',
  R2_SECRET_ACCESS_KEY: present('R2_SECRET_ACCESS_KEY') ? 'present' : 'missing',
  TIVVLEJOY_SCENERY_ASSET_PREFIX: present('TIVVLEJOY_SCENERY_ASSET_PREFIX') ? 'present' : 'missing',
  TIVVLEJOY_SCENERY_INTAKE_TOKEN: present('TIVVLEJOY_SCENERY_INTAKE_TOKEN') ? 'present' : 'missing',
};

check('local R2 names are reported without values', () => {
  if (localR2.R2_BUCKET !== 'present' || localR2.R2_ENDPOINT !== 'present') {
    throw new Error('required R2 names are missing in this environment');
  }
});

check('invalid manifests are refused', () => {
  try {
    validateSourceObjectManifest({ schemaVersion: 'nope' });
    throw new Error('invalid manifest accepted');
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid manifest accepted') throw error;
  }
});

check('quarantine still flags executables', () => {
  const result = evaluateQuarantine({
    filename: 'payload.exe',
    collectionValid: true,
    byteSize: 1,
    sha256: 'aa',
    objectAvailable: true,
    sizeMatchesStored: true,
    unityPreservationOnly: false,
  });
  if (result.state !== 'quarantined') throw new Error(result.state);
});

const config = describeSceneryStorageConfiguration(process.env);
let purchasedBefore = 0;
let purchasedAfter = 0;
let synthetic: {
  created?: boolean;
  uploaded?: boolean;
  progress?: string;
  completed?: boolean;
  storedSize?: number;
  verificationState?: string;
  inspectionReady?: boolean;
  cleaned?: boolean;
  bytesPathDirect?: boolean;
} = {};

async function runLiveSynthetic(): Promise<void> {
  if (!config.configured) {
    record('live synthetic multipart', 'SKIP', 'storage is not configured');
    return;
  }
  const storage = await createConfiguredMultipartStorage(process.env);
  const before = await countPurchasedSourceObjects(storage, process.env);
  purchasedBefore = before.count;
  record('purchased source count before', before.count === 0 ? 'PASS' : 'FAIL', String(before.count));

  const bytes = previewSyntheticBytes(`preview-${Date.now()}`);
  const filename = previewSyntheticFilename(`preview-${Date.now()}`);
  const env = process.env as Record<string, string | undefined>;
  const created = (await handleSceneryIntakeAction({
    action: 'create-session',
    body: {
      purpose: 'preview-synthetic',
      collectionId: 'village',
      filename,
      byteSize: bytes.byteLength,
      sha256: sha256HexChunked(bytes),
    },
    env,
    publicPreview: false,
    storage,
  })) as { session: { sessionId: string; objectKey: string; parts: Array<{ partNumber: number; start: number; end: number }> } };
  synthetic.created = true;
  if (created.session.objectKey.includes('/source/')) {
    throw new Error('synthetic object was placed under source/');
  }

  const signed = (await handleSceneryIntakeAction({
    action: 'sign-part',
    body: { sessionId: created.session.sessionId, partNumber: 1 },
    env,
    publicPreview: false,
    storage,
  })) as { signedUrl: string };
  if (signedUrlTargetsVercel(signed.signedUrl)) {
    throw new Error('signed URL targeted Vercel');
  }
  synthetic.bytesPathDirect = true;
  synthetic.progress = '0 / 1';
  const uploaded = await fetch(signed.signedUrl, { method: 'PUT', body: bytes });
  if (!uploaded.ok) throw new Error(`direct storage PUT failed: ${uploaded.status}`);
  synthetic.uploaded = true;
  synthetic.progress = '1 / 1';
  const etag = uploaded.headers.get('ETag') ?? '"synthetic-part-1"';
  const completed = (await handleSceneryIntakeAction({
    action: 'complete',
    body: { sessionId: created.session.sessionId, parts: [{ partNumber: 1, etag }] },
    env,
    publicPreview: false,
    storage,
  })) as {
    storedSize: number;
    manifest: { verificationState: string; inspectionState: string };
    inspectionReadiness: { ready: boolean };
  };
  synthetic.completed = true;
  synthetic.storedSize = completed.storedSize;
  synthetic.verificationState = completed.manifest.verificationState;
  synthetic.inspectionReady = completed.inspectionReadiness.ready;
  if (completed.storedSize !== bytes.byteLength) throw new Error('stored size mismatch');
  if (completed.manifest.verificationState !== 'size_verified') throw new Error(completed.manifest.verificationState);
  if (completed.inspectionReadiness.ready) throw new Error('synthetic fixture must not be inspection-ready');

  const paused = (await handleSceneryIntakeAction({
    action: 'create-session',
    body: {
      purpose: 'preview-synthetic',
      collectionId: 'village',
      filename: previewSyntheticFilename(`pause-${Date.now()}`),
      byteSize: bytes.byteLength,
      sha256: sha256HexChunked(previewSyntheticBytes('pause')),
    },
    env,
    publicPreview: false,
    storage,
  })) as { session: { sessionId: string } };
  await handleSceneryIntakeAction({
    action: 'resume',
    body: { sessionId: paused.session.sessionId },
    env,
    publicPreview: false,
    storage,
  });
  await handleSceneryIntakeAction({
    action: 'abort',
    body: { sessionId: paused.session.sessionId },
    env,
    publicPreview: false,
    storage,
  });
  await handleSceneryIntakeAction({
    action: 'cleanup-preview-synthetic',
    body: { sessionId: paused.session.sessionId },
    env,
    publicPreview: false,
    storage,
  });

  const cleaned = await handleSceneryIntakeAction({
    action: 'cleanup-preview-synthetic',
    body: { sessionId: created.session.sessionId },
    env,
    publicPreview: false,
    storage,
  });
  synthetic.cleaned = Boolean(cleaned.cleaned);
  const after = await countPurchasedSourceObjects(storage, process.env);
  purchasedAfter = after.count;
  record('live synthetic multipart', 'PASS', `size=${completed.storedSize} cleaned=${synthetic.cleaned}`);
  record('purchased source count after', after.count === 0 ? 'PASS' : 'FAIL', String(after.count));
}

void (async () => {
  try {
    await runLiveSynthetic();
  } catch (error) {
    record('live synthetic multipart', 'FAIL', error instanceof Error ? error.message : String(error));
  }

  const failed = checks.filter((item) => item.status === 'FAIL').length;
  writeFileSync(
    path.join(OUT_DIR, 'validate.json'),
    `${JSON.stringify(
      {
        ok: failed === 0,
        passed: checks.filter((item) => item.status === 'PASS').length,
        failed,
        skipped: checks.filter((item) => item.status === 'SKIP').length,
        localR2,
        purchasedSourceCountBefore: purchasedBefore,
        purchasedSourceCountAfter: purchasedAfter,
        synthetic,
        checks,
      },
      null,
      2,
    )}\n`,
  );

  if (failed) {
    console.error(`scenery intake preview validation failed: ${failed}/${checks.length}`);
    process.exit(1);
  }
  console.log(`scenery intake preview validation passed: ${checks.filter((item) => item.status === 'PASS').length}/${checks.length}`);
})();
