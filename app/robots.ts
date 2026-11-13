import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/', '/account/'],
      },
    ],
    sitemap: 'https://www.greathomes.co.in/sitemap.xml',
    host: 'https://www.greathomes.co.in',
  };
}
