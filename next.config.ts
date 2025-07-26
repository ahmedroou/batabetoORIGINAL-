/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // ✅ هذا هو الخيار المطلوب

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
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "handlebars": "handlebars/dist/handlebars.js",
    };
    return config;
  },
};

module.exports = nextConfig;

