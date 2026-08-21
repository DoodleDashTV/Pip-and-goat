import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REQUIRED_BRANCH,
  REQUIRED_ORG_ID,
  REQUIRED_PROJECT_ID,
  planPreviewMigration,
  runPreviewMigration,
  verifyMigrationPayload,
} from './tivvlejoy-ep012-preview-ledger-migration.mjs';

const authorizedEnv = {
  VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: REQUIRED_BRANCH,
  VERCEL_ORG_ID: REQUIRED_ORG_ID,
  VERCEL_PROJECT_ID: REQUIRED_PROJECT_ID,
  TIVVLEJOY_VOICE_LEDGER_DATABASE_URL: 'postgresql://preview-only.invalid/tivvlejoy',
};

test('skips every branch except the one-time migration carrier', () => {
  assert.deepEqual(planPreviewMigration({ ...authorizedEnv, VERCEL_GIT_COMMIT_REF: 'main' }), {
    action: 'skip',
    reason: 'BRANCH_NOT_AUTHORIZED',
  });
});

test('skips production even if the carrier branch is promoted', () => {
  assert.deepEqual(planPreviewMigration({ ...authorizedEnv, VERCEL_ENV: 'production' }), {
    action: 'skip',
    reason: 'NON_PREVIEW_RUNTIME',
  });
});

test('fails closed on the wrong Vercel project or organization', () => {
  assert.throws(() => planPreviewMigration({ ...authorizedEnv, VERCEL_ORG_ID: 'team_wrong' }), {
    message: 'VERCEL_ORG_MISMATCH',
  });
  assert.throws(() => planPreviewMigration({ ...authorizedEnv, VERCEL_PROJECT_ID: 'prj_wrong' }), {
    message: 'VERCEL_PROJECT_MISMATCH',
  });
});

test('fails closed on missing, malformed, or local database URLs', () => {
  for (const databaseUrl of ['', 'not-a-url', 'postgresql://preview@127.0.0.1:5432/preview']) {
    assert.throws(
      () =>
        planPreviewMigration({
          ...authorizedEnv,
          TIVVLEJOY_VOICE_LEDGER_DATABASE_URL: databaseUrl,
        }),
      /PREVIEW_LEDGER_DATABASE_URL_(MISSING|INVALID)/,
    );
  }
});

test('pins the exact latest migration payload', () => {
  verifyMigrationPayload(new URL('../..', import.meta.url).pathname);
});

test('passes the secret only through the child environment and suppresses provider output', () => {
  const invocations = [];
  const result = runPreviewMigration({
    env: authorizedEnv,
    repoRoot: new URL('../..', import.meta.url).pathname,
    spawn(command, args, options) {
      invocations.push({ command, args, options });
      if (invocations.length === 1) {
        return {
          status: 1,
          stdout: `Following migration has not yet been applied:\n20260821010000_tivvlejoy_ep012_voice_execution`,
          stderr: '',
        };
      }
      return { status: 0, stdout: 'sensitive provider output', stderr: '' };
    },
  });

  assert.equal(result.status, 'APPLIED');
  assert.equal(invocations.length, 3);
  assert.equal(invocations[1].command, 'pnpm');
  assert.equal(
    invocations[1].options.env.DATABASE_URL,
    authorizedEnv.TIVVLEJOY_VOICE_LEDGER_DATABASE_URL,
  );
  assert.equal(invocations[1].args.includes('deploy'), true);
  assert.equal(JSON.stringify(result).includes('postgresql://'), false);
});

test('refuses to deploy more than the one exact pending migration', () => {
  assert.throws(
    () =>
      runPreviewMigration({
        env: authorizedEnv,
        repoRoot: new URL('../..', import.meta.url).pathname,
        spawn() {
          return {
            status: 1,
            stdout:
              '20260820010000_tivvlejoy_durable_production_persistence\n20260821010000_tivvlejoy_ep012_voice_execution',
            stderr: '',
          };
        },
      }),
    { message: 'EP012_PREVIEW_MIGRATION_UNEXPECTED_PENDING_SET' },
  );
});

test('treats an up-to-date migration history as an idempotent success', () => {
  const result = runPreviewMigration({
    env: authorizedEnv,
    repoRoot: new URL('../..', import.meta.url).pathname,
    spawn() {
      return { status: 0, stdout: 'Database schema is up to date!', stderr: '' };
    },
  });
  assert.equal(result.status, 'ALREADY_PRESENT');
});

test('sanitizes Prisma failures', () => {
  assert.throws(
    () =>
      runPreviewMigration({
        env: authorizedEnv,
        repoRoot: new URL('../..', import.meta.url).pathname,
        spawn() {
          return { status: 2, stdout: '', stderr: 'P1001 hidden connection details' };
        },
      }),
    { message: 'EP012_PREVIEW_MIGRATION_STATUS_FAILED_P1001' },
  );
});
