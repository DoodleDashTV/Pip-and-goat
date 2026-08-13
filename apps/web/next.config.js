/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@doodle-dash/database',
    '@doodle-dash/domain',
    '@doodle-dash/shared',
    '@doodle-dash/universe',
    '@doodle-dash/characters',
    '@doodle-dash/story',
    '@doodle-dash/direction',
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
