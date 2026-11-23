import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

export default function (phase) {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;

  /** @type {import('next').NextConfig} */
  const nextConfig = {
    distDir: isDev ? '.next-dev' : '.next',
    reactStrictMode: true,
    devIndicators: false,
    // Ensure search engine, AI, and social crawlers receive blocking <head> metadata instead of streamed <body> tags
    htmlLimitedBots:
      /Googlebot|Google-InspectionTool|Storebot-Google|AdsBot-Google|Mediapartners-Google|Bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|Applebot|GPTBot|ClaudeBot|PerplexityBot|OAI-SearchBot|facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|WhatsApp|Discordbot|TelegramBot/i,
    async headers() {
      const noIndexHeader = [
        {
          key: 'X-Robots-Tag',
          value: 'noindex, nofollow',
        },
      ];

      return [
        {
          source: '/(.*)',
          headers: [
            {
              key: 'X-Content-Type-Options',
              value: 'nosniff',
            },
            {
              key: 'Referrer-Policy',
              value: 'strict-origin-when-cross-origin',
            },
            {
              key: 'Permissions-Policy',
              value: 'camera=(), microphone=(), geolocation=(), payment=()',
            },
            {
              key: 'Strict-Transport-Security',
              value: 'max-age=31536000; includeSubDomains',
            },
          ],
        },
        { source: '/api/:path*', headers: noIndexHeader },
        { source: '/admin/:path*', headers: noIndexHeader },
        { source: '/account/:path*', headers: noIndexHeader },
        { source: '/my-properties/:path*', headers: noIndexHeader },
        { source: '/compare/:path*', headers: noIndexHeader },
        { source: '/post-property/new/:path*', headers: noIndexHeader },
        { source: '/compression-gallery/:path*', headers: noIndexHeader },
      ];
    },
    async redirects() {
      return [
        {
          source: '/resale/:slug',
          destination: '/buy/:slug',
          permanent: true,
        },
        {
          source: '/locations/newtown',
          destination: '/locations/new-town',
          permanent: true,
        },
        {
          source: '/locations/new-town-kolkata',
          destination: '/locations/new-town',
          permanent: true,
        },
        {
          source: '/locations/rajarhat-main-road',
          destination: '/locations/rajarhat',
          permanent: true,
        },
        {
          source: '/locations/rajarhat-chowmatha',
          destination: '/locations/rajarhat',
          permanent: true,
        },
        {
          source: '/locations/calcutta',
          destination: '/locations/kolkata',
          permanent: true,
        },
        {
          source: '/locations/greater-kolkata',
          destination: '/locations/kolkata',
          permanent: true,
        },
      ];
    },
    images: {
      loader: 'custom',
      loaderFile: './src/lib/imageLoader.ts',
      remotePatterns: [
        {
          protocol: 'https',
          hostname: 'images.unsplash.com',
          port: '',
          pathname: '/**',
        },
        {
          protocol: 'https',
          hostname: 'picsum.photos',
          port: '',
          pathname: '/**',
        },
        {
          protocol: 'https',
          hostname: 'media.greathomes.co.in',
          port: '',
          pathname: '/**',
        },
        {
          protocol: 'https',
          hostname: 'pub-8e680bcad96e4b29adac1756755a344b.r2.dev',
          port: '',
          pathname: '/**',
        },
        {
          protocol: 'https',
          hostname: '*.r2.dev',
          port: '',
          pathname: '/**',
        },
        {
          protocol: 'https',
          hostname: '*.r2.cloudflarestorage.com',
          port: '',
          pathname: '/**',
        },
        {
          protocol: 'https',
          hostname: 'www.propvestors.in',
          port: '',
          pathname: '/**',
        },
        {
          protocol: 'https',
          hostname: 'propvestors.in',
          port: '',
          pathname: '/**',
        },
      ],
    },
    serverExternalPackages: [
      '@aws-sdk/client-s3',
      '@aws-sdk/s3-request-presigner',
      'sharp',
      'pg',
    ],
    eslint: {
      ignoreDuringBuilds: false,
    },
    typescript: {
      ignoreBuildErrors: false,
    },
    experimental: {
      webpackMemoryOptimizations: true,
      cpus: 1,
      workerThreads: false,
      optimizePackageImports: ['lucide-react', 'recharts'],
      serverActions: {
        allowedOrigins: [
          '*.run.app',
          '*.asia-east1.run.app',
          '*.asia-southeast1.run.app',
          'localhost:3000',
          '127.0.0.1:3000',
        ],
      },
    },
    transpilePackages: ['motion'],
  };

  return nextConfig;
}
