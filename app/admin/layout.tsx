import type { Metadata } from 'next';
import { AdminShell } from '@/src/components/admin/AdminShell';

export const metadata: Metadata = {
  title: 'Admin Workspace | Great Homes',
  description: 'Internal operational application for Great Homes residential property discovery, project intelligence, and listings management.',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
