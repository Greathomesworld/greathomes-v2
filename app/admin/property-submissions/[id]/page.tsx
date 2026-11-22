import { StaffSubmissionDetailWorkspace } from '@/src/components/admin/StaffSubmissionDetailWorkspace';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Property Review Detail | Great Homes Admin',
  description: 'Detailed staff review workspace for customer residential property submissions.',
};

export default async function AdminPropertySubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StaffSubmissionDetailWorkspace submissionId={id} />;
}
