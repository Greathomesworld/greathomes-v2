import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import {
  getSelectableKolkataLocations,
  getProjectOptionsForLocation,
} from '@/src/domain/postProperty/page1Data';
import { PostPropertyWizard } from '@/src/components/post-property/PostPropertyWizard';

export const metadata: Metadata = {
  title: 'Submit Your Property | Five-Step Verification Wizard | Great Homes Kolkata',
  description:
    'Complete the Great Homes five-step residential property submission wizard for resale and rental properties in Kolkata.',
};

interface PostPropertyWizardPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PostPropertyWizardPage({
  searchParams,
}: PostPropertyWizardPageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const rawLocationId = Array.isArray(resolvedParams.locationId)
    ? resolvedParams.locationId[0]
    : resolvedParams.locationId;
  const rawLocality = Array.isArray(resolvedParams.locality)
    ? resolvedParams.locality[0]
    : resolvedParams.locality;
  const rawDraftId = Array.isArray(resolvedParams.draftId)
    ? resolvedParams.draftId[0]
    : resolvedParams.draftId ||
      (Array.isArray(resolvedParams.id) ? resolvedParams.id[0] : resolvedParams.id);

  const shouldPreloadProjects =
    Boolean(rawLocationId) && rawLocality !== 'custom' && !rawDraftId;

  const [initialLocations, initialProjects] = await Promise.all([
    getSelectableKolkataLocations().catch(() => []),
    shouldPreloadProjects && rawLocationId
      ? getProjectOptionsForLocation(rawLocationId, 50).catch(() => [])
      : Promise.resolve([]),
  ]);

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAFAF8] px-4 py-16 text-center text-sm text-[#6E6A65] font-body">
          Loading Property Submission Wizard...
        </div>
      }
    >
      <PostPropertyWizard
        initialLocations={initialLocations}
        initialProjects={initialProjects}
        initialProjectsLocationId={shouldPreloadProjects ? rawLocationId || null : null}
      />
    </Suspense>
  );
}
