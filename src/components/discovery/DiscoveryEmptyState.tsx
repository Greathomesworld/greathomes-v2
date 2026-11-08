'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { SearchX, RotateCcw, Building2, MessageSquare, MapPin } from 'lucide-react';
import { useEnquiry } from '@/src/components/enquiry/EnquiryContext';

interface DiscoveryEmptyStateProps {
  title?: string;
  description?: string;
  mode?: 'buy' | 'rent' | 'projects';
}

const SUPPORTED_POPULAR_LOCATIONS = [
  { name: 'Rajarhat', slug: 'rajarhat' },
  { name: 'New Town', slug: 'new-town' },
  { name: 'Salt Lake', slug: 'salt-lake' },
  { name: 'Ballygunge', slug: 'ballygunge' },
];

export function DiscoveryEmptyState({
  title = 'No homes found matching your criteria',
  description = 'We could not find properties matching all of your specified criteria. Try widening your price range, choosing all BHK configurations, or removing selected filters.',
  mode = 'buy',
}: DiscoveryEmptyStateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { openEnquiry } = useEnquiry();

  const handleReset = () => {
    if (pathname.includes('/buy')) {
      router.push('/buy?inventoryType=RESALE');
    } else if (pathname.includes('/rent')) {
      router.push('/rent');
    } else if (pathname.includes('/projects')) {
      router.push('/projects');
    } else {
      router.push(pathname);
    }
  };

  const handleOpenAssistance = () => {
    openEnquiry({
      contextType: 'GENERAL',
      title: 'Assisted Home Shortlisting',
      subtitle: 'Connect with an executive Kolkata residential advisor for verified property options.',
    });
  };

  return (
    <div className="py-12 px-6 text-center max-w-xl mx-auto bg-white rounded-2xl border border-[rgba(17,17,17,0.08)] shadow-2xs my-8">
      <div className="w-12 h-12 rounded-full bg-[#FFF5EE] border border-[#E85D3F]/20 flex items-center justify-center mx-auto mb-4 text-[#E85D3F]">
        <SearchX className="w-6 h-6" />
      </div>

      <h3 className="font-display font-semibold text-xl text-[#111111] mb-2">
        {title}
      </h3>

      <p className="text-sm text-neutral-600 leading-relaxed mb-6 font-body">
        {description}
      </p>

      {/* Primary Action Row */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#111111] hover:bg-neutral-800 text-white text-xs font-display font-semibold transition-colors shadow-2xs cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Clear All Filters</span>
        </button>

        <button
          type="button"
          onClick={handleOpenAssistance}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FFF5EE] hover:bg-[#FFE8DC] text-[#E85D3F] border border-[#E85D3F]/30 text-xs font-display font-semibold transition-colors cursor-pointer"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Get Assistance</span>
        </button>

        <Link
          href="/projects"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-display font-semibold transition-colors"
        >
          <Building2 className="w-3.5 h-3.5 text-neutral-600" />
          <span>Browse New Launch Projects</span>
        </Link>
      </div>

      {/* Alternative Location Suggestions */}
      <div className="pt-5 border-t border-neutral-100">
        <p className="text-xs font-display font-semibold text-neutral-500 uppercase tracking-wider mb-3 flex items-center justify-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-[#E85D3F]" />
          <span>Explore Major Micro-Markets</span>
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {SUPPORTED_POPULAR_LOCATIONS.map((loc) => {
            const targetUrl =
              mode === 'rent' || pathname.includes('/rent')
                ? `/rent?location=${loc.slug}`
                : `/buy?inventoryType=RESALE&location=${loc.slug}`;

            return (
              <Link
                key={loc.slug}
                href={targetUrl}
                className="px-3 py-1 rounded-full bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-xs font-display text-neutral-700 hover:text-[#E85D3F] transition-colors"
              >
                {loc.name}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

