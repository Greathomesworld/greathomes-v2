'use client';

import React, { useState, useEffect } from 'react';

export interface PropertySectionTab {
  id: string;
  label: string;
}

interface PropertyDetailTabsProps {
  hasProject: boolean;
  hasSimilar: boolean;
}

export function PropertyDetailTabs({ hasProject, hasSimilar }: PropertyDetailTabsProps) {
  const tabs = React.useMemo<PropertySectionTab[]>(() => [
    { id: 'overview', label: 'Overview' },
    { id: 'specifications', label: 'Specifications' },
    { id: 'amenities', label: 'Amenities' },
    { id: 'location', label: 'Location & Connectivity' },
    ...(hasProject ? [{ id: 'project', label: 'Project' }] : []),
    { id: 'verification', label: 'Verification' },
    ...(hasSimilar ? [{ id: 'similar-properties', label: 'Similar Properties' }] : []),
  ], [hasProject, hasSimilar]);

  const [activeTab, setActiveTab] = useState<string>('overview');

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 180;
      let currentId = 'overview';

      for (const tab of tabs) {
        const el = document.getElementById(tab.id);
        if (el && el.offsetTop <= scrollPosition) {
          currentId = tab.id;
        }
      }
      setActiveTab(currentId);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [tabs]);

  const scrollToSection = (id: string) => {
    setActiveTab(id);
    const el = document.getElementById(id);
    if (!el) return;
    const offset = 120; // 68px header + 44px tabs + buffer
    const elementPosition = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: elementPosition - offset,
      behavior: 'smooth',
    });
  };

  return (
    <div className="sticky top-14 sm:top-[68px] z-30 bg-[#FAFAF8]/95 backdrop-blur-md border-b border-[#E6E2DC] -mx-4 px-4 sm:mx-0 sm:px-0">
      <nav
        aria-label="Property sections"
        className="flex items-center gap-5 sm:gap-7 overflow-x-auto no-scrollbar"
      >
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => scrollToSection(tab.id)}
              className={`py-3 text-xs sm:text-sm font-display font-semibold whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                isActive
                  ? 'border-[#E85D3F] text-[#E85D3F]'
                  : 'border-transparent text-[#111111]/65 hover:text-[#111111]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
