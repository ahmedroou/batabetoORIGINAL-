/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  allowedDevOrigins: ['*.cloudworkstations.dev'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "handlebars": "handlebars/dist/handlebars.js",
    };
    return config;
  },
};

module.exports = nextConfig;
