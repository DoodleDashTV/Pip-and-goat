import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REQUIRED_BRANCH = 'cursor/tivvlejoy-ep012-preview-ledger-migration-73f1';
export const REQUIRED_ORG_ID = 'team_SKbKndUqqNWtp29jHlMG5Otl';
export const REQUIRED_PROJECT_ID = 'prj_yKQw8QFb9Bkzc9NoouV0cCHYn9SK';
export const REQUIRED_MIGRATION = '20260821010000_tivvlejoy_ep012_voice_execution';
export const REQUIRED_MIGRATION_SHA256 =
  '3432791735d5c561eda9e96dfb96b73b24d8cf832a4409765e02e418429f192c';

const SECRET_NAME = 'TIVVLEJOY_VOICE_LEDGER_DATABASE_URL';
const TARGET_TABLE = 'tivvlejoy_ep012_voice_executions';
const STATE_TABLE = 'tivvlejoy_preview_voice_ledger_state';
const ENTRY_TABLE = 'tivvlejoy_preview_voice_ledger_entries';
const EXPECTED_COLUMNS = [
  'alignment_present',
  'audio_bytes',
  'audio_object_key',
  'audio_sha256',
  'character',
  'character_count',
  'created_at',
  'deployment_id',
  'provider_attempted_at',
  'receipt_object_key',
  'receipt_ref',
  'request_id',
  'segment_id',
  'status',
  'storage_verified',
  'updated_at',
].sort();
const EXPECTED_INDEXES = [
  'tivvlejoy_ep012_voice_executions_pkey',
  'tivvlejoy_ep012_voice_executions_segment_id_key',
].sort();

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function databaseUrlIsEligible(value) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'postgresql:' || url.protocol === 'postgres:') &&
      Boolean(url.hostname) &&
      url.hostname !== '127.0.0.1' &&
      url.hostname !== 'localhost'
    );
  } catch {
    return false;
  }
}

export function planPreviewMigration(env) {
  if (String(env.VERCEL_GIT_COMMIT_REF ?? '').trim() !== REQUIRED_BRANCH) {
    return { action: 'skip', reason: 'BRANCH_NOT_AUTHORIZED' };
  }

  if (String(env.VERCEL_ENV ?? '').trim() !== 'preview') {
    return { action: 'skip', reason: 'NON_PREVIEW_RUNTIME' };
  }

  if (String(env.VERCEL_ORG_ID ?? '').trim() !== REQUIRED_ORG_ID) {
    fail('VERCEL_ORG_MISMATCH');
  }

  if (String(env.VERCEL_PROJECT_ID ?? '').trim() !== REQUIRED_PROJECT_ID) {
    fail('VERCEL_PROJECT_MISMATCH');
  }

  const databaseUrl = String(env[SECRET_NAME] ?? '').trim();
  if (!databaseUrl) {
    fail('PREVIEW_LEDGER_DATABASE_URL_MISSING');
  }

  if (!databaseUrlIsEligible(databaseUrl)) {
    fail('PREVIEW_LEDGER_DATABASE_URL_INVALID');
  }

  return { action: 'migrate', databaseUrl };
}

function migrationPath(repoRoot) {
  return join(repoRoot, 'packages/database/prisma/migrations', REQUIRED_MIGRATION, 'migration.sql');
}

export function verifyMigrationPayload(repoRoot) {
  const migrationsRoot = join(repoRoot, 'packages/database/prisma/migrations');
  const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (migrations.at(-1) !== REQUIRED_MIGRATION) {
    fail('EP012_MIGRATION_NOT_LATEST');
  }

  const digest = createHash('sha256')
    .update(readFileSync(migrationPath(repoRoot)))
    .digest('hex');
  if (digest !== REQUIRED_MIGRATION_SHA256) {
    fail('EP012_MIGRATION_DIGEST_MISMATCH');
  }
}

function exactMigrationStatements(repoRoot) {
  const statements = readFileSync(migrationPath(repoRoot), 'utf8')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  if (
    statements.length !== 2 ||
    !statements[0].includes(`CREATE TABLE "${TARGET_TABLE}"`) ||
    !statements[1].includes('CREATE UNIQUE INDEX')
  ) {
    fail('EP012_MIGRATION_STATEMENT_SET_UNEXPECTED');
  }

  return statements;
}

function normalizeCount(value) {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  fail('EP012_LEDGER_COUNT_UNREADABLE');
}

function equalSorted(actual, expected) {
  const normalized = [...actual].sort();
  return (
    normalized.length === expected.length &&
    normalized.every((value, index) => value === expected[index])
  );
}

function sanitizedPrismaCode(error) {
  const code = String(error?.code ?? '');
  return /^P\d{4}$/.test(code) ? code : 'UNKNOWN';
}

function sanitizedSqlState(error) {
  const code = String(error?.meta?.code ?? '');
  return /^[0-9A-Z]{5}$/.test(code) ? code : 'UNKNOWN';
}

async function safeQuery(client, stage, sql) {
  try {
    return await client.$queryRawUnsafe(sql);
  } catch (error) {
    fail(
      `EP012_PREVIEW_MIGRATION_${stage}_FAILED_${sanitizedPrismaCode(error)}_${sanitizedSqlState(error)}`,
    );
  }
}

async function safeExecute(client, stage, sql) {
  try {
    return await client.$executeRawUnsafe(sql);
  } catch (error) {
    fail(
      `EP012_PREVIEW_MIGRATION_${stage}_FAILED_${sanitizedPrismaCode(error)}_${sanitizedSqlState(error)}`,
    );
  }
}

async function tableNames(client, stage) {
  const rows = await safeQuery(
    client,
    stage,
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name IN ('${STATE_TABLE}', '${ENTRY_TABLE}', '${TARGET_TABLE}')
  `,
  );
  return rows.map((row) => String(row.table_name));
}

async function assertMonthlyLedgerIdentity(client, stage) {
  const rows = await safeQuery(
    client,
    stage,
    `
    SELECT paid_requests, paid_characters_used, failed_attempts,
           reserved_requests, reserved_characters, unfinalized_count, reconciled
    FROM "${STATE_TABLE}"
    WHERE id = 'preview-voice-ledger'
  `,
  );

  if (rows.length !== 1) fail('PREVIEW_LEDGER_STATE_IDENTITY_MISMATCH');
  const row = rows[0];
  if (
    normalizeCount(row.paid_requests) !== 4 ||
    normalizeCount(row.paid_characters_used) !== 235 ||
    normalizeCount(row.failed_attempts) !== 0 ||
    normalizeCount(row.reserved_requests) !== 0 ||
    normalizeCount(row.reserved_characters) !== 0 ||
    normalizeCount(row.unfinalized_count) !== 0 ||
    row.reconciled !== true
  ) {
    fail('PREVIEW_LEDGER_STATE_IDENTITY_MISMATCH');
  }
}

async function assertTargetTable(client, stagePrefix) {
  const countRows = await safeQuery(
    client,
    `${stagePrefix}_COUNT`,
    `SELECT COUNT(*) AS count FROM "${TARGET_TABLE}"`,
  );
  if (countRows.length !== 1 || normalizeCount(countRows[0].count) !== 0) {
    fail('EP012_EXECUTION_LEDGER_NOT_EMPTY');
  }

  const columnRows = await safeQuery(
    client,
    `${stagePrefix}_COLUMNS`,
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = '${TARGET_TABLE}'
  `,
  );
  if (
    !equalSorted(
      columnRows.map((row) => String(row.column_name)),
      EXPECTED_COLUMNS,
    )
  ) {
    fail('EP012_EXECUTION_LEDGER_COLUMN_MISMATCH');
  }

  const indexRows = await safeQuery(
    client,
    `${stagePrefix}_INDEXES`,
    `
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = current_schema() AND tablename = '${TARGET_TABLE}'
  `,
  );
  if (
    !equalSorted(
      indexRows.map((row) => String(row.indexname)),
      EXPECTED_INDEXES,
    )
  ) {
    fail('EP012_EXECUTION_LEDGER_INDEX_MISMATCH');
  }
}

async function probeSchema(client, stagePrefix) {
  const names = await tableNames(client, `${stagePrefix}_TABLES`);
  if (!names.includes(STATE_TABLE) || !names.includes(ENTRY_TABLE)) {
    fail('PREVIEW_LEDGER_SCHEMA_IDENTITY_MISMATCH');
  }
  await assertMonthlyLedgerIdentity(client, `${stagePrefix}_STATE`);

  if (names.includes(TARGET_TABLE)) {
    await assertTargetTable(client, `${stagePrefix}_TARGET`);
    return 'ALREADY_PRESENT';
  }
  return 'ABSENT';
}

function defaultClientFactory(repoRoot, databaseUrl) {
  const require = createRequire(join(repoRoot, 'packages/database/package.json'));
  const { PrismaClient } = require('@prisma/client');
  return new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [] });
}

export async function runPreviewMigration({
  env = process.env,
  repoRoot,
  clientFactory = defaultClientFactory,
} = {}) {
  const plan = planPreviewMigration(env);
  if (plan.action === 'skip') {
    return { status: 'SKIPPED', reason: plan.reason };
  }

  const root = resolve(repoRoot ?? join(dirname(fileURLToPath(import.meta.url)), '../..'));
  verifyMigrationPayload(root);
  const statements = exactMigrationStatements(root);
  const client = clientFactory(root, plan.databaseUrl);

  try {
    const before = await probeSchema(client, 'PRECHECK');
    if (before === 'ALREADY_PRESENT') {
      return { status: 'ALREADY_PRESENT', migration: REQUIRED_MIGRATION };
    }

    await client.$transaction(async (transaction) => {
      const lockRows = await safeQuery(
        transaction,
        'LOCK',
        `SELECT id FROM "${STATE_TABLE}" WHERE id = 'preview-voice-ledger' FOR UPDATE`,
      );
      if (lockRows.length !== 1 || lockRows[0].id !== 'preview-voice-ledger') {
        fail('PREVIEW_LEDGER_LOCK_IDENTITY_MISMATCH');
      }
      const names = await tableNames(transaction, 'LOCKED_TABLES');
      if (names.includes(TARGET_TABLE)) return;
      if (!names.includes(STATE_TABLE) || !names.includes(ENTRY_TABLE)) {
        fail('PREVIEW_LEDGER_SCHEMA_IDENTITY_MISMATCH');
      }
      await assertMonthlyLedgerIdentity(transaction, 'LOCKED_STATE');
      for (const [index, statement] of statements.entries()) {
        await safeExecute(transaction, index === 0 ? 'DDL_TABLE' : 'DDL_INDEX', statement);
      }
    });

    if ((await probeSchema(client, 'POSTCHECK')) !== 'ALREADY_PRESENT') {
      fail('EP012_EXECUTION_LEDGER_POSTCHECK_FAILED');
    }
    return { status: 'APPLIED', migration: REQUIRED_MIGRATION };
  } catch (error) {
    if (typeof error?.code === 'string' && error.code.startsWith('EP012_')) throw error;
    if (typeof error?.code === 'string' && error.code.startsWith('PREVIEW_')) throw error;
    fail(
      `EP012_PREVIEW_MIGRATION_FAILED_${sanitizedPrismaCode(error)}_${sanitizedSqlState(error)}`,
    );
  } finally {
    await client.$disconnect();
  }
}

function sanitizedMessage(result) {
  if (result.status === 'SKIPPED') {
    return `TIVVLEJOY_EP012_PREVIEW_LEDGER_MIGRATION ${result.status} ${result.reason}`;
  }
  return `TIVVLEJOY_EP012_PREVIEW_LEDGER_MIGRATION ${result.status} ${result.migration}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(sanitizedMessage(await runPreviewMigration()));
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
    console.error(`TIVVLEJOY_EP012_PREVIEW_LEDGER_MIGRATION BLOCKED ${code}`);
    process.exitCode = 1;
  }
}
