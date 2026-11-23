import type { Metadata } from 'next';
import { AccountLayoutShell } from '@/src/components/customer/AccountLayoutShell';
import { buildNoIndexMetadata } from '@/src/domain/seo/metadataBuilder';

export const metadata: Metadata = buildNoIndexMetadata(
  'My Account',
  'Access your Great Homes saved properties, recently viewed homes, and personalized search preferences.'
);

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountLayoutShell>{children}</AccountLayoutShell>;
}
