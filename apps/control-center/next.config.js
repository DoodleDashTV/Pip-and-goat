/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@doodle-dash/control-center"],
  experimental: {
    externalDir: true,
  },
};

module.exports = nextConfig;
