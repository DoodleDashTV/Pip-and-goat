import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export const REQUIRED_BRANCH = 'cursor/tivvlejoy-ep012-preview-ledger-migration-73f1';
export const REQUIRED_ORG_ID = 'team_SKbKndUqqNWtp29jHlMG5Otl';
export const REQUIRED_PROJECT_ID = 'prj_yKQw8QFb9Bkzc9NoouV0cCHYn9SK';
export const REQUIRED_MIGRATION = '20260821010000_tivvlejoy_ep012_voice_execution';
export const REQUIRED_MIGRATION_SHA256 =
  '3432791735d5c561eda9e96dfb96b73b24d8cf832a4409765e02e418429f192c';

const SECRET_NAME = 'TIVVLEJOY_VOICE_LEDGER_DATABASE_URL';

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

export function verifyMigrationPayload(repoRoot) {
  const migrationsRoot = join(repoRoot, 'packages/database/prisma/migrations');
  const migrations = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (migrations.at(-1) !== REQUIRED_MIGRATION) {
    fail('EP012_MIGRATION_NOT_LATEST');
  }

  const migrationPath = join(migrationsRoot, REQUIRED_MIGRATION, 'migration.sql');
  const digest = createHash('sha256').update(readFileSync(migrationPath)).digest('hex');
  if (digest !== REQUIRED_MIGRATION_SHA256) {
    fail('EP012_MIGRATION_DIGEST_MISMATCH');
  }
}

function classifyPrismaFailure(result) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  for (const code of ['P1000', 'P1001', 'P1002', 'P1010', 'P3005', 'P3009', 'P3018']) {
    if (output.includes(code)) return code;
  }
  return 'UNKNOWN';
}

function prismaCommand(spawn, root, env, args) {
  return spawn(
    'pnpm',
    [
      '--filter',
      '@doodle-dash/database',
      'exec',
      'prisma',
      'migrate',
      ...args,
      '--schema',
      'prisma/schema.prisma',
    ],
    {
      cwd: root,
      env,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

function pendingMigrations(result) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return [...new Set(output.match(/\b\d{14}_[a-z0-9_]+\b/g) ?? [])];
}

export function runPreviewMigration({ env = process.env, repoRoot, spawn = spawnSync } = {}) {
  const plan = planPreviewMigration(env);
  if (plan.action === 'skip') {
    return { status: 'SKIPPED', reason: plan.reason };
  }

  const root = resolve(repoRoot ?? join(dirname(fileURLToPath(import.meta.url)), '../..'));
  verifyMigrationPayload(root);

  const childEnv = { ...env, DATABASE_URL: plan.databaseUrl };
  const before = prismaCommand(spawn, root, childEnv, ['status']);
  if (before.error) {
    fail(`EP012_PREVIEW_MIGRATION_STATUS_FAILED_${classifyPrismaFailure(before)}`);
  }

  if (before.status === 0) {
    return { status: 'ALREADY_PRESENT', migration: REQUIRED_MIGRATION };
  }

  const pending = pendingMigrations(before);
  if (before.status !== 1 || pending.length !== 1 || pending[0] !== REQUIRED_MIGRATION) {
    const failure = classifyPrismaFailure(before);
    if (failure !== 'UNKNOWN') {
      fail(`EP012_PREVIEW_MIGRATION_STATUS_FAILED_${failure}`);
    }
    fail('EP012_PREVIEW_MIGRATION_UNEXPECTED_PENDING_SET');
  }

  const result = prismaCommand(spawn, root, childEnv, ['deploy']);

  if (result.error || result.status !== 0) {
    fail(`EP012_PREVIEW_MIGRATION_FAILED_${classifyPrismaFailure(result)}`);
  }

  const after = prismaCommand(spawn, root, childEnv, ['status']);
  if (after.error || after.status !== 0) {
    fail(`EP012_PREVIEW_MIGRATION_POSTCHECK_FAILED_${classifyPrismaFailure(after)}`);
  }

  return { status: 'APPLIED', migration: REQUIRED_MIGRATION };
}

function sanitizedMessage(result) {
  if (result.status === 'SKIPPED') {
    return `TIVVLEJOY_EP012_PREVIEW_LEDGER_MIGRATION ${result.status} ${result.reason}`;
  }
  return `TIVVLEJOY_EP012_PREVIEW_LEDGER_MIGRATION ${result.status} ${result.migration}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(sanitizedMessage(runPreviewMigration()));
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
    console.error(`TIVVLEJOY_EP012_PREVIEW_LEDGER_MIGRATION BLOCKED ${code}`);
    process.exitCode = 1;
  }
}
