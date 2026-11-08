'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useTransition, Suspense } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { PublicEnquiryContextDto } from '@/src/domain/enquiry/dto/enquiryDto';

interface EnquiryContextType {
  isOpen: boolean;
  contextData: PublicEnquiryContextDto | null;
  openEnquiry: (data: PublicEnquiryContextDto) => void;
  closeEnquiry: () => void;
}

const EnquiryContext = createContext<EnquiryContextType | undefined>(undefined);

function EnquiryUrlWatcher({
  onUrlEnquire,
}: {
  onUrlEnquire: (slugOrContext: string, pathname: string) => void;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    const enquireParam = searchParams.get('enquire');
    if (enquireParam) {
      onUrlEnquire(enquireParam, pathname);
    }
  }, [searchParams, pathname, onUrlEnquire]);

  return null;
}

export function EnquiryProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [contextData, setContextData] = useState<PublicEnquiryContextDto | null>(null);

  const openEnquiry = useCallback((data: PublicEnquiryContextDto) => {
    setContextData(data);
    setIsOpen(true);
  }, []);

  const closeEnquiry = useCallback(() => {
    setIsOpen(false);

    // Cleanly strip ?enquire from URL if present without page reload
    if (typeof window !== 'undefined' && window.location.search.includes('enquire=')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('enquire');
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
    }
  }, []);

  const handleUrlEnquire = useCallback(
    (paramValue: string, currentPath: string) => {
      // Determine context based on pathname
      if (currentPath.startsWith('/buy')) {
        const slug = paramValue !== 'true' ? paramValue : currentPath.split('/buy/')[1] || '';
        openEnquiry({
          contextType: 'RESALE',
          listingSlug: slug,
          title: 'Resale Property Advisory',
          subtitle: 'Verified property purchase assistance & site visit coordination',
        });
      } else if (currentPath.startsWith('/rent')) {
        const slug = paramValue !== 'true' ? paramValue : currentPath.split('/rent/')[1] || '';
        openEnquiry({
          contextType: 'RENTAL',
          listingSlug: slug,
          title: 'Rental Concierge Service',
          subtitle: 'Verified rental assistance, viewing schedule & lease onboarding',
        });
      } else if (currentPath.startsWith('/projects/')) {
        const segments = currentPath.split('/projects/')[1]?.split('/') || [];
        const projectSlug = segments[0] || '';
        const subRoute = segments[1] || '';

        if (subRoute === 'resale') {
          openEnquiry({
            contextType: 'RESALE',
            projectSlug,
            listingSlug: paramValue !== 'true' ? paramValue : undefined,
            title: 'Project Resale Advisory',
            subtitle: 'Verified resale availability, price negotiation & site visit coordination',
          });
        } else if (subRoute === 'rent') {
          openEnquiry({
            contextType: 'RENTAL',
            projectSlug,
            listingSlug: paramValue !== 'true' ? paramValue : undefined,
            title: 'Project Rental Concierge',
            subtitle: 'Verified rental availability, viewing schedule & lease onboarding',
          });
        } else {
          openEnquiry({
            contextType: 'PROJECT',
            projectSlug,
            title: 'Project Details & Advisory',
            subtitle: 'Verified project configurations, pricing intelligence & site visit',
          });
        }
      }
    },
    [openEnquiry]
  );

  return (
    <EnquiryContext.Provider value={{ isOpen, contextData, openEnquiry, closeEnquiry }}>
      <Suspense fallback={null}>
        <EnquiryUrlWatcher onUrlEnquire={handleUrlEnquire} />
      </Suspense>
      {children}
    </EnquiryContext.Provider>
  );
}

export function useEnquiry() {
  const context = useContext(EnquiryContext);
  if (!context) {
    throw new Error('useEnquiry must be used within an EnquiryProvider');
  }
  return context;
}
