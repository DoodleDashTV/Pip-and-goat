/** @type {import('next').NextConfig} */
const path = require('path');

const prismaRuntimeFiles = [
  '../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**/*',
  '../../node_modules/.pnpm/@prisma+client@*/node_modules/@prisma/client/**/*',
];

const nextConfig = {
  // Trace from the monorepo root so Vercel serverless bundles can include
  // runtime files for workspace packages such as @doodle-dash/database.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  outputFileTracingIncludes: {
    '/api/voice-production/ep012/preflight': prismaRuntimeFiles,
    '/api/voice-production/ep012/generate': prismaRuntimeFiles,
    '/api/voice-production/ep012/ledger/reconcile': prismaRuntimeFiles,
  },
  transpilePackages: [
    '@doodle-dash/database',
    '@doodle-dash/domain',
    '@doodle-dash/shared',
    '@doodle-dash/universe',
    '@doodle-dash/characters',
    '@doodle-dash/story',
    '@doodle-dash/direction',
    '@doodle-dash/preproduction',
    '@doodle-dash/production',
    '@doodle-dash/rendering',
    '@doodle-dash/audio',
    '@doodle-dash/providers',
  ],
  experimental: {
    externalDir: true,
  },
};

module.exports = nextConfig;
