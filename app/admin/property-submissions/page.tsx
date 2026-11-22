import { StaffSubmissionsWorkspace } from '@/src/components/admin/StaffSubmissionsWorkspace';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Property Verification Workspace | Great Homes Admin',
  description: 'Internal staff workspace for reviewing, verifying, and moderating customer property submissions.',
};

export default function AdminPropertySubmissionsPage() {
  return <StaffSubmissionsWorkspace />;
}
