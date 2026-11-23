import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { MyPropertiesDashboard } from '@/src/components/post-property/MyPropertiesDashboard';
import { buildNoIndexMetadata } from '@/src/domain/seo/metadataBuilder';

export const metadata: Metadata = buildNoIndexMetadata(
  'My Property Submissions',
  'Manage your saved property drafts, review verification feedback, and track your Kolkata resale and rental submissions on Great Homes.'
);

export default function MyPropertiesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
          <div className="text-sm text-[#6E6A65] font-body">
            Loading your property submissions...
          </div>
        </div>
      }
    >
      <MyPropertiesDashboard />
    </Suspense>
  );
}
