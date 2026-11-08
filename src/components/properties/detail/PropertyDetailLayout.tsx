import React from 'react';
import { PropertyDetailViewModel } from '@/src/domain/projects/viewModels/listingDetailViewModel';
import {
  ResaleDiscoveryCardDto,
  RentDiscoveryCardDto,
  ProjectDiscoveryCardDto,
} from '@/src/domain/projects/dto/discoveryDto';
import { PropertyDetailBreadcrumbs } from './PropertyDetailBreadcrumbs';
import { PropertyDetailGallery } from './PropertyDetailGallery';
import { PropertyDetailHeader } from './PropertyDetailHeader';
import { PropertyQuickHighlights } from './PropertyQuickHighlights';
import { PropertyDetailTabs } from './PropertyDetailTabs';
import { PropertyOverviewSection } from './PropertyOverviewSection';
import { PropertyRentalTermsCard } from './PropertyRentalTermsCard';
import { PropertySpecificationsSection } from './PropertySpecificationsSection';
import { PropertyAmenitiesSection } from './PropertyAmenitiesSection';
import { PropertyLocationSection } from './PropertyLocationSection';
import { PropertyProjectSection } from './PropertyProjectSection';
import { PropertyVerificationSection } from './PropertyVerificationSection';
import { PropertyEnquirySidebar } from './PropertyEnquirySidebar';
import { PropertyMobileStickyBar } from './PropertyMobileStickyBar';
import { PropertySimilarSection } from './PropertySimilarSection';

interface PropertyDetailLayoutProps {
  listing: PropertyDetailViewModel;
  discovery: {
    similarResale: ResaleDiscoveryCardDto[];
    similarRental: RentDiscoveryCardDto[];
    relatedProjects: ProjectDiscoveryCardDto[];
    locationInfo: {
      id: string;
      name: string;
      slug: string;
      shortDescription: string | null;
      description: string | null;
    } | null;
  };
}

export function PropertyDetailLayout({
  listing,
  discovery,
}: PropertyDetailLayoutProps) {
  const hasSimilar =
    listing.mode === 'RESALE'
      ? discovery.similarResale.length > 0 || discovery.relatedProjects.length > 0
      : discovery.similarRental.length > 0 || discovery.relatedProjects.length > 0;

  return (
    <main className="min-h-screen bg-[#FAFAF8] text-[#111111] pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))] lg:pb-16">
      {/* A. Top Breadcrumb & Save / Share Row */}
      <PropertyDetailBreadcrumbs listing={listing} />

      {/* B. Primary 12-Column Desktop + Mobile Content Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-7 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Left 8 Columns: Gallery, Header, Highlights, Tabs, Content Sections */}
          <div className="lg:col-span-8 space-y-5 sm:space-y-6 min-w-0">
            {/* 1. Property Gallery */}
            <PropertyDetailGallery
              media={listing.media}
              title={listing.title}
              mode={listing.mode}
              isVerified={listing.isVerified}
              listingPartyLabel={listing.listingPartyLabel}
              projectName={listing.project?.name}
              locationDisplay={listing.locationDisplay}
            />

            {/* 2. Property Title & Location / Mobile Price Header */}
            <PropertyDetailHeader listing={listing} />

            {/* 3. Quick Highlights Bar (Desktop 6-col strip / Mobile compact strip + Need Assistance card) */}
            <PropertyQuickHighlights listing={listing} />

            {/* 4. Sticky Section Navigation Tabs */}
            <PropertyDetailTabs
              hasProject={Boolean(listing.project)}
              hasSimilar={hasSimilar}
            />

            {/* 5. Overview Section (About This Home + Key Highlights) */}
            <PropertyOverviewSection listing={listing} />

            {/* 6. Rental-Only Commercial Terms Card */}
            {listing.mode === 'RENTAL' && (
              <PropertyRentalTermsCard listing={listing} />
            )}

            {/* 7. Specifications Section */}
            <PropertySpecificationsSection listing={listing} />

            {/* 8. Amenities & Facilities Section */}
            <PropertyAmenitiesSection
              amenities={listing.amenities}
              mode={listing.mode}
              projectName={listing.project?.name}
            />

            {/* 9. Location & Connectivity Section */}
            <PropertyLocationSection
              listing={listing}
              locationInfo={discovery.locationInfo}
            />

            {/* 10. Parent Project Section (when linked to a Project) */}
            {listing.project && (
              <PropertyProjectSection project={listing.project} />
            )}

            {/* 11. Verification & Trust Section */}
            <PropertyVerificationSection listing={listing} />
          </div>

          {/* Right 4 Columns: Sticky Desktop Enquiry & Verification Sidebar */}
          <aside className="hidden lg:block lg:col-span-4 lg:sticky lg:top-20">
            <PropertyEnquirySidebar listing={listing} />
          </aside>
        </div>

        {/* C. Bottom Discovery Row: Similar Properties, Explore Project, Other Projects in Location */}
        <PropertySimilarSection
          listing={listing}
          similarResale={discovery.similarResale}
          similarRental={discovery.similarRental}
          relatedProjects={discovery.relatedProjects}
        />
      </div>

      {/* D. Mobile Sticky Bottom Conversion Bar */}
      <PropertyMobileStickyBar listing={listing} />
    </main>
  );
}
