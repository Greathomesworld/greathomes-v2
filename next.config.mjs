import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

export default function (phase) {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;

  /** @type {import('next').NextConfig} */
  const nextConfig = {
    distDir: isDev ? '.next-dev' : '.next',
    reactStrictMode: true,
    async headers() {
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
      ];
    },
    async redirects() {
      return [
        {
          source: '/resale/:slug',
          destination: '/buy/:slug',
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
    experimental: {
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
