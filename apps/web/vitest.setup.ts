import path from 'node:path';
import { config as loadEnv } from 'dotenv';

// Load monorepo root .env for DATABASE_URL during tests.
loadEnv({ path: path.resolve(__dirname, '../../.env') });

process.env.DATABASE_URL =
  process.env.DATABASE_URL?.replace(/doodle_dash(\?|$)/, 'doodle_dash_test$1') ??
  'postgresql://doodle:doodle@localhost:5432/doodle_dash_test?schema=public';
