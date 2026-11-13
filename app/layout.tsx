import type { Metadata } from 'next';
import { Fjalla_One, Plus_Jakarta_Sans, Inter } from 'next/font/google';
import './../src/index.css';
import { Header } from './../src/components/layout/Header';
import { Footer } from './../src/components/layout/Footer';
import { EnquiryProvider } from './../src/components/enquiry/EnquiryContext';
import { GreatHomesEnquiryDialog } from './../src/components/enquiry/GreatHomesEnquiryDialog';
import { CustomerAuthProvider } from './../src/components/customer/CustomerAuthContext';
import { CustomerAuthModal } from './../src/components/customer/CustomerAuthModal';
import { MobileBottomNav } from './../src/components/layout/MobileBottomNav';
import { ComparisonTray } from './../src/components/comparison/ComparisonTray';
import { VisitorTelemetryProvider } from './../src/components/telemetry/VisitorTelemetryProvider';
import { SearchProvider } from './../src/context/SearchContext';
import { ImmersiveSearchModal } from './../src/components/search/ImmersiveSearchModal';

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
  metadataBase: new URL('https://www.greathomes.co.in'),
  title: 'Great Homes | Verified Residential Property Discovery in Kolkata',
  description: 'Discover verified projects, resale homes and rentals across Kolkata — with the property intelligence and assistance you need to make a confident decision.',
  icons: {
    icon: [
      { url: '/assets/aistudio/GH_siteicons_f43aa60c.png', type: 'image/png' },
      { url: '/icon.png', type: 'image/png' },
    ],
    shortcut: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Great Homes | Verified Residential Property Discovery in Kolkata',
    description: 'Discover verified projects, resale homes and rentals across Kolkata — with the property intelligence and assistance you need to make a confident decision.',
    url: 'https://www.greathomes.co.in',
    siteName: 'Great Homes',
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Great Homes | Verified Residential Property Discovery in Kolkata',
    description: 'Discover verified projects, resale homes and rentals across Kolkata in West Bengal.',
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
        '@id': 'https://www.greathomes.co.in/#website',
        url: 'https://www.greathomes.co.in',
        name: 'Great Homes',
        description: 'Verified residential property discovery and real estate intelligence in Kolkata',
        publisher: {
          '@id': 'https://www.greathomes.co.in/#organization',
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://www.greathomes.co.in/projects?q={search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'RealEstateAgent',
        '@id': 'https://www.greathomes.co.in/#organization',
        name: 'Great Homes',
        url: 'https://www.greathomes.co.in',
        logo: 'https://www.greathomes.co.in/icon.png',
        description: 'Residential property discovery and assisted home-buying web platform for Kolkata.',
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
                <GreatHomesEnquiryDialog />
                <CustomerAuthModal />
                <ImmersiveSearchModal />
              </SearchProvider>
            </CustomerAuthProvider>
          </EnquiryProvider>
        </VisitorTelemetryProvider>
      </body>
    </html>
  );
}
