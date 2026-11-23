import type { Metadata } from 'next';
import { Fjalla_One, Plus_Jakarta_Sans, Inter } from 'next/font/google';
import './../src/index.css';
import { Header } from './../src/components/layout/Header';
import { Footer } from './../src/components/layout/Footer';
import { EnquiryProvider } from './../src/components/enquiry/EnquiryContext';
import { CustomerAuthProvider } from './../src/components/customer/CustomerAuthContext';
import { MobileBottomNav } from './../src/components/layout/MobileBottomNav';
import { ComparisonTray } from './../src/components/comparison/ComparisonTray';
import { VisitorTelemetryProvider } from './../src/components/telemetry/VisitorTelemetryProvider';
import { SearchProvider } from './../src/context/SearchContext';
import { GlobalModalsHost } from './../src/components/layout/GlobalModalsHost';
import { safeJsonLd } from './../src/lib/safeJsonLd';

import {
  DEFAULT_OG_IMAGE,
  SITE_LOGO_URL,
  SITE_NAME,
  SITE_ORIGIN,
} from './../src/domain/seo/metadataBuilder';

const fjallaOne = Fjalla_One({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-fjalla',
  display: 'swap',
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: `${SITE_NAME} | Verified Residential Property Discovery in Kolkata`,
  description:
    'Discover verified projects, resale homes and rentals across Kolkata — with the property intelligence and assistance you need to make a confident decision.',
  icons: {
    icon: [
      { url: '/assets/aistudio/GH_siteicons_f43aa60c.png', type: 'image/png' },
      { url: '/icon.png', type: 'image/png' },
    ],
    shortcut: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_ORIGIN}/#website`,
        url: SITE_ORIGIN,
        name: SITE_NAME,
        description:
          'Verified residential property discovery and real estate intelligence in Kolkata',
        publisher: {
          '@id': `${SITE_ORIGIN}/#organization`,
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${SITE_ORIGIN}/projects?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'RealEstateAgent',
        '@id': `${SITE_ORIGIN}/#organization`,
        name: SITE_NAME,
        url: SITE_ORIGIN,
        logo: SITE_LOGO_URL,
        image: DEFAULT_OG_IMAGE,
        description:
          'Residential property discovery and assisted home-buying web platform for Kolkata.',
        areaServed: {
          '@type': 'City',
          name: 'Kolkata',
          addressCountry: 'IN',
        },
        address: {
          '@type': 'PostalAddress',
          streetAddress: 'Sector V, Salt Lake',
          addressLocality: 'Kolkata',
          addressRegion: 'West Bengal',
          postalCode: '700091',
          addressCountry: 'IN',
        },
        geo: {
          '@type': 'GeoCoordinates',
          latitude: 22.5726,
          longitude: 88.3639,
        },
        currenciesAccepted: 'INR',
        priceRange: '₹30 Lakh - ₹15 Crore',
      },
    ],
  };

  return (
    <html lang="en" className={`${fjallaOne.variable} ${plusJakartaSans.variable} ${inter.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-background text-foreground font-body antialiased" suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
        />
        <VisitorTelemetryProvider>
          <EnquiryProvider>
            <CustomerAuthProvider>
              <SearchProvider>
                <Header />
                <main className="flex-grow">{children}</main>
                <Footer />
                <MobileBottomNav />
                <ComparisonTray />
                <GlobalModalsHost />
              </SearchProvider>
            </CustomerAuthProvider>
          </EnquiryProvider>
        </VisitorTelemetryProvider>
      </body>
    </html>
  );
}
