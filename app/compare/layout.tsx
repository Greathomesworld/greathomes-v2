import type { Metadata } from 'next';
import { buildNoIndexMetadata } from '@/src/domain/seo/metadataBuilder';

export const metadata: Metadata = buildNoIndexMetadata(
  'Compare Properties & Locations',
  'Side-by-side comparison tool for shortlisted Kolkata residential projects, resale homes, rentals, and localities on Great Homes.'
);

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
