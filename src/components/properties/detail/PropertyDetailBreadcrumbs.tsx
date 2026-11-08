import React from 'react';
import Link from 'next/link';
import { Home, ChevronRight } from 'lucide-react';
import { PropertyDetailViewModel } from '@/src/domain/projects/viewModels/listingDetailViewModel';
import { SaveButton } from '@/src/components/customer/SaveButton';
import { PropertyDetailShareButton } from './PropertyDetailShareButton';

interface PropertyDetailBreadcrumbsProps {
  listing: PropertyDetailViewModel;
}

export function PropertyDetailBreadcrumbs({ listing }: PropertyDetailBreadcrumbsProps) {
  const isResale = listing.mode === 'RESALE';
  const indexHref = isResale ? '/buy' : '/rent';
  const indexLabel = isResale ? 'Buy' : 'Rent';
  const currentLeafLabel = isResale
    ? `${listing.configuration} Resale`
    : `${listing.configuration} For Rent`;

  return (
    <nav
      aria-label="Breadcrumb"
      className="border-b border-[#E6E2DC] bg-white"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex items-center justify-between gap-3">
        <ol className="flex items-center flex-wrap gap-1.5 text-xs text-[#111111]/65 font-body min-w-0">
          <li>
            <Link
              href="/"
              className="hover:text-[#111111] transition-colors inline-flex items-center gap-1"
            >
              <Home className="w-3.5 h-3.5 text-[#111111]/55" />
              <span>Home</span>
            </Link>
          </li>

          <li>
            <ChevronRight className="w-3.5 h-3.5 text-[#111111]/30" />
          </li>

          <li>
            <Link
              href={indexHref}
              className="hover:text-[#111111] transition-colors font-medium"
            >
              {indexLabel}
            </Link>
          </li>

          {listing.location && (
            <>
              <li className="hidden sm:list-item">
                <ChevronRight className="w-3.5 h-3.5 text-[#111111]/30" />
              </li>
              <li className="hidden sm:list-item">
                <Link
                  href={listing.location.url}
                  className="hover:text-[#111111] transition-colors truncate max-w-[140px]"
                >
                  {listing.location.name}
                </Link>
              </li>
            </>
          )}

          {listing.project && (
            <>
              <li>
                <ChevronRight className="w-3.5 h-3.5 text-[#111111]/30" />
              </li>
              <li>
                <Link
                  href={listing.project.url}
                  className="hover:text-[#111111] transition-colors truncate max-w-[150px] sm:max-w-[220px]"
                >
                  {listing.project.name}
                </Link>
              </li>
            </>
          )}

          <li>
            <ChevronRight className="w-3.5 h-3.5 text-[#111111]/30" />
          </li>

          <li
            aria-current="page"
            className="text-[#111111] font-display font-semibold truncate max-w-[180px] sm:max-w-xs"
          >
            {currentLeafLabel}
          </li>
        </ol>

        <div className="flex items-center gap-2 shrink-0">
          <SaveButton
            resourceType={isResale ? 'RESALE_LISTING' : 'RENTAL_LISTING'}
            resourceId={listing.id}
            showLabel
            className="!rounded-lg !px-3 !py-1.5 !text-xs !font-display !font-semibold !shadow-2xs"
          />
          <PropertyDetailShareButton
            title={listing.title}
            canonicalPath={listing.canonicalUrl}
            showLabel
          />
        </div>
      </div>
    </nav>
  );
}
