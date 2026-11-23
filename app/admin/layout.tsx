import type { Metadata } from 'next';
import { AdminShell } from '@/src/components/admin/AdminShell';
import { buildNoIndexMetadata } from '@/src/domain/seo/metadataBuilder';

export const metadata: Metadata = buildNoIndexMetadata(
  'Admin Workspace',
  'Internal operational application for Great Homes residential property discovery, project intelligence, and listings management.'
);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
