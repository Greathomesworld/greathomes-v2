import { MetadataRoute } from 'next';
import { SITE_ORIGIN } from '@/src/domain/seo/metadataBuilder';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/account/',
          '/my-properties',
          '/post-property/new',
          '/compression-gallery',
          '/compare',
        ],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
