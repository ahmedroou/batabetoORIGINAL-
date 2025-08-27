// next.config.mjs
// @ts-check

const isCI = !!process.env.CI;
const isProd = process.env.NODE_ENV === 'production';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // صرامة رياكت وفوائده في اكتشاف المشاكل مبكرًا
  reactStrictMode: true,

  // شوية تحصينات وأفضلية للنشر
  poweredByHeader: false,
  compress: true,
  output: 'standalone',

  // خليك صارم في CI، مرن محليًا
  typescript: {
    // يمنع تجاهل أخطاء الـ TS في CI، ويسمح محليًا لو CI مش مفعّل
    ignoreBuildErrors: !isCI,
  },
  eslint: {
    // فشل البناء في CI لو في أخطاء لينت؛ محليًا يسمح يكمل
    ignoreDuringBuilds: !isCI,
  },

  images: {
    // صيغ حديثة للصور عند الإمكان
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
    // تقدر تزود deviceSizes أو imageSizes حسب احتياجك
  },

  experimental: {
    // The new correct way to handle server packages
    serverComponentsExternalPackages: ['@opentelemetry/instrumentation', '@genkit-ai/core', 'dotprompt', 'firebase'],
  },
};

module.exports = nextConfig;
