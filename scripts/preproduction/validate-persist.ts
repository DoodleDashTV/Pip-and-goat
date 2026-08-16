/**
 * Disposable local-database validation for durable preproduction persistence.
 *
 * Creates `doodle_dash_persist_validate`, migrates it, writes a real PERSISTED
 * row, reloads it with a fresh Prisma client, checks idempotency, then proves
 * PERSISTENCE_FAILED / durableRequired fail-closed. Drops the database after.
 *
 * Does not use the production database. Does not print or write credentials.
 *
 *   pnpm validate:persist
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { buildEpisode1DraftPackage, PROXY_PIPELINE_BRIEF, advanceWorkflow } from '../../packages/preproduction/src/index';
import {
  persistPreproductionRun,
  loadLatestPreproductionRun,
  loadPreproductionRunByCacheKey,
  assertDurableWorkflowPersisted,
  type PersistDb,
} from '../../packages/production/src/preproduction-persist';

const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(REPO_ROOT, 'artifacts/studio-hardening-17-24');
const DB_NAME = 'doodle_dash_persist_validate';

type CheckStatus = 'PASS' | 'FAIL';
const checks: Array<{ name: string; status: CheckStatus; detail: string }> = [];

function record(name: string, status: CheckStatus, detail: string): void {
  checks.push({ name, status, detail });
  console.log(`[${status}] ${name} — ${detail}`);
}

function write(relative: string, value: unknown): void {
  const target = path.join(OUT_DIR, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function loadLocalEnv(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function requireDatabaseUrl(): string {
  loadLocalEnv(path.join(REPO_ROOT, '.env'));
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required for disposable local persist validation.');
  }
  return url;
}

function rewriteDatabase(url: string, database: string, keepSearch = true): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  if (!keepSearch) parsed.search = '';
  return parsed.toString();
}

function redactUrl(url: string, database: string): string {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.username}@${parsed.host}/${database}`;
}

function sh(command: string, args: string[], env?: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, { encoding: 'utf8', env: env ?? process.env });
  if (result.status !== 0) {
    const safeArgs = args.map((arg) => (arg.includes('://') ? '[redacted-url]' : arg));
    throw new Error(`${command} ${safeArgs.join(' ')} failed: ${(result.stderr || result.stdout || '').slice(0, 400)}`);
  }
}

function asPersistDb(client: PrismaClient): PersistDb {
  return client as unknown as PersistDb;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const sourceUrl = requireDatabaseUrl();
  const adminUrl = rewriteDatabase(sourceUrl, 'postgres', false);
  const disposableUrl = rewriteDatabase(sourceUrl, DB_NAME, true);
  const redacted = redactUrl(sourceUrl, DB_NAME);

  sh('psql', [adminUrl, '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE IF EXISTS ${DB_NAME};`]);
  sh('psql', [adminUrl, '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE ${DB_NAME};`]);
  record('disposable-db-created', 'PASS', DB_NAME);

  sh('pnpm', ['--filter', '@doodle-dash/database', 'generate']);
  sh('pnpm', ['--filter', '@doodle-dash/database', 'exec', 'prisma', 'migrate', 'deploy'], {
    ...process.env,
    DATABASE_URL: disposableUrl,
  });
  record('migrated', 'PASS', 'prisma migrate deploy on disposable database');

  const first = new PrismaClient({ datasources: { db: { url: disposableUrl } } });
  const pack = buildEpisode1DraftPackage();
  const firstWrite = await persistPreproductionRun({
    episodeId: pack.workflow.episodeId,
    workflow: pack.workflow,
    durableRequired: true,
    ephemeralTestOnly: false,
    client: asPersistDb(first),
  });
  assertDurableWorkflowPersisted(firstWrite);
  record('persisted', firstWrite.status === 'PERSISTED' && firstWrite.persisted ? 'PASS' : 'FAIL', firstWrite.reason);

  await first.$disconnect();

  const second = new PrismaClient({ datasources: { db: { url: disposableUrl } } });
  const reloaded = await loadLatestPreproductionRun(pack.workflow.episodeId, asPersistDb(second));
  record(
    'fresh-client-retrieval',
    reloaded?.id === firstWrite.id && reloaded.cacheKey === pack.workflow.cacheKey ? 'PASS' : 'FAIL',
    reloaded ? `id=${reloaded.id}` : 'missing row after fresh client',
  );

  const secondWrite = await persistPreproductionRun({
    episodeId: pack.workflow.episodeId,
    workflow: pack.workflow,
    durableRequired: true,
    client: asPersistDb(second),
  });
  const byKey = await loadPreproductionRunByCacheKey(
    pack.workflow.episodeId,
    pack.workflow.cacheKey,
    asPersistDb(second),
  );
  record(
    'idempotent-reuse',
    secondWrite.id === firstWrite.id && secondWrite.reason.includes('Reused') && byKey?.id === firstWrite.id
      ? 'PASS'
      : 'FAIL',
    secondWrite.reason,
  );

  const fixture = advanceWorkflow(PROXY_PIPELINE_BRIEF);
  const ephemeral = await persistPreproductionRun({
    episodeId: fixture.episodeId,
    workflow: fixture,
    ephemeralTestOnly: true,
    client: asPersistDb(second),
  });
  record(
    'ephemeral-fixture',
    ephemeral.status === 'EPHEMERAL_TEST_ONLY' && ephemeral.persisted === false ? 'PASS' : 'FAIL',
    ephemeral.status,
  );

  const forbidden = {
    ...pack.workflow,
    mayContinueToFinal: true,
  } as typeof pack.workflow;
  const failedStatus = await persistPreproductionRun({
    episodeId: `${pack.workflow.episodeId}_forbidden`,
    workflow: forbidden,
    client: asPersistDb(second),
  });
  record(
    'persistence-failed-status',
    failedStatus.status === 'PERSISTENCE_FAILED' && failedStatus.persisted === false ? 'PASS' : 'FAIL',
    failedStatus.reason,
  );

  let failedClosed = false;
  try {
    await persistPreproductionRun({
      episodeId: pack.workflow.episodeId,
      workflow: pack.workflow,
      durableRequired: true,
      client: {},
    });
  } catch (error) {
    failedClosed = error instanceof Error && error.message.includes('PERSISTENCE_FAILED');
  }
  record(
    'durable-required-fail-closed',
    failedClosed ? 'PASS' : 'FAIL',
    'missing delegate throws PERSISTENCE_FAILED',
  );

  await second.$disconnect();
  sh('psql', [adminUrl, '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE IF EXISTS ${DB_NAME};`]);
  record('disposable-db-dropped', 'PASS', DB_NAME);

  write('persist-checks.json', checks);
  write('persist-summary.json', {
    title: 'Durable persistence validation',
    database: DB_NAME,
    url: redacted,
    productionDatabaseTouched: false,
    credentialsCommitted: false,
    persistedId: firstWrite.id,
    cacheKey: pack.workflow.cacheKey,
    label: pack.label,
  });

  const failed = checks.filter((check) => check.status === 'FAIL');
  if (failed.length > 0) {
    console.error(`Persist validation failed: ${failed.length} check(s).`);
    process.exit(1);
  }
  console.log('Persist validation passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  try {
    const sourceUrl = process.env.DATABASE_URL;
    if (sourceUrl) {
      const adminUrl = rewriteDatabase(sourceUrl, 'postgres', false);
      spawnSync('psql', [adminUrl, '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE IF EXISTS ${DB_NAME};`]);
    }
  } catch {
    // best-effort cleanup
  }
  process.exit(1);
});
