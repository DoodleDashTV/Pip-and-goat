/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@doodle-dash/database',
    '@doodle-dash/domain',
    '@doodle-dash/shared',
    '@doodle-dash/universe',
    '@doodle-dash/characters',
  ],
  experimental: {
    externalDir: true,
  },
};

module.exports = nextConfig;
