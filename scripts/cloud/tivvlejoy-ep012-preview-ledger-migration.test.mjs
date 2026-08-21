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

const targetColumns = [
  'request_id',
  'segment_id',
  'character',
  'character_count',
  'status',
  'provider_attempted_at',
  'audio_sha256',
  'audio_bytes',
  'storage_verified',
  'audio_object_key',
  'receipt_object_key',
  'receipt_ref',
  'alignment_present',
  'deployment_id',
  'created_at',
  'updated_at',
];

function fakeClient({
  targetPresent = false,
  targetCount = 0,
  stateOverrides = {},
  failWith,
} = {}) {
  let hasTarget = targetPresent;
  const executed = [];
  const client = {
    executed,
    disconnected: false,
    async $queryRawUnsafe(sql) {
      if (failWith) throw failWith;
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('information_schema.tables')) {
        return [
          { table_name: 'tivvlejoy_preview_voice_ledger_state' },
          { table_name: 'tivvlejoy_preview_voice_ledger_entries' },
          ...(hasTarget ? [{ table_name: 'tivvlejoy_ep012_voice_executions' }] : []),
        ];
      }
      if (sql.includes('paid_requests')) {
        return [
          {
            paid_requests: 4,
            paid_characters_used: 235,
            failed_attempts: 0,
            reserved_requests: 0,
            reserved_characters: 0,
            unfinalized_count: 0,
            reconciled: true,
            ...stateOverrides,
          },
        ];
      }
      if (sql.includes('COUNT(*)')) return [{ count: BigInt(targetCount) }];
      if (sql.includes('information_schema.columns')) {
        return targetColumns.map((column_name) => ({ column_name }));
      }
      if (sql.includes('pg_indexes')) {
        return [
          { indexname: 'tivvlejoy_ep012_voice_executions_pkey' },
          { indexname: 'tivvlejoy_ep012_voice_executions_segment_id_key' },
        ];
      }
      throw new Error('UNEXPECTED_TEST_QUERY');
    },
    async $executeRawUnsafe(statement) {
      executed.push(statement);
      if (statement.includes('CREATE TABLE')) hasTarget = true;
      return 0;
    },
    async $transaction(callback) {
      return callback(client);
    },
    async $disconnect() {
      client.disconnected = true;
    },
  };
  return client;
}

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

test('applies only the two pinned SQL statements and verifies an empty ledger', async () => {
  const client = fakeClient();
  const result = await runPreviewMigration({
    env: authorizedEnv,
    repoRoot: new URL('../..', import.meta.url).pathname,
    clientFactory() {
      return client;
    },
  });

  assert.equal(result.status, 'APPLIED');
  assert.equal(client.executed.length, 2);
  assert.match(client.executed[0], /CREATE TABLE/);
  assert.match(client.executed[1], /CREATE UNIQUE INDEX/);
  assert.equal(client.disconnected, true);
  assert.equal(JSON.stringify(result).includes('postgresql://'), false);
});

test('treats a healthy existing empty target table as idempotent success', async () => {
  const client = fakeClient({ targetPresent: true });
  const result = await runPreviewMigration({
    env: authorizedEnv,
    repoRoot: new URL('../..', import.meta.url).pathname,
    clientFactory() {
      return client;
    },
  });
  assert.equal(result.status, 'ALREADY_PRESENT');
  assert.equal(client.executed.length, 0);
});

test('refuses to touch a nonempty execution ledger', async () => {
  const client = fakeClient({ targetPresent: true, targetCount: 1 });
  await assert.rejects(
    runPreviewMigration({
      env: authorizedEnv,
      repoRoot: new URL('../..', import.meta.url).pathname,
      clientFactory() {
        return client;
      },
    }),
    { message: 'EP012_EXECUTION_LEDGER_NOT_EMPTY' },
  );
  assert.equal(client.executed.length, 0);
});

test('refuses a ledger whose reconciled counters do not match the checkpoint', async () => {
  const client = fakeClient({ stateOverrides: { reserved_requests: 1 } });
  await assert.rejects(
    runPreviewMigration({
      env: authorizedEnv,
      repoRoot: new URL('../..', import.meta.url).pathname,
      clientFactory() {
        return client;
      },
    }),
    { message: 'PREVIEW_LEDGER_STATE_IDENTITY_MISMATCH' },
  );
  assert.equal(client.executed.length, 0);
});

test('sanitizes database failures', async () => {
  const hidden = new Error('hidden connection details');
  hidden.code = 'P1001';
  await assert.rejects(
    runPreviewMigration({
      env: authorizedEnv,
      repoRoot: new URL('../..', import.meta.url).pathname,
      clientFactory() {
        return fakeClient({ failWith: hidden });
      },
    }),
    { message: 'EP012_PREVIEW_MIGRATION_FAILED_P1001' },
  );
});
