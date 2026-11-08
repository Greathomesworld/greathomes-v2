'use client';

import React, { useState, useEffect } from 'react';

export interface NavItem {
  id: string;
  label: string;
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'sub-locations', label: 'Sub-Areas' },
  { id: 'projects', label: 'Projects' },
  { id: 'configurations', label: 'Configurations' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'resale', label: 'Resale' },
  { id: 'rent', label: 'Rent' },
  { id: 'rera', label: 'RERA' },
  { id: 'connectivity', label: 'Connectivity' },
  { id: 'activity', label: 'Activity' },
  { id: 'trends', label: 'Trends' },
  { id: 'nearby', label: 'Nearby' },
];

interface LocationSectionNavProps {
  items?: NavItem[];
}

export function LocationSectionNav({ items }: LocationSectionNavProps) {
  const navItems = items && items.length > 0 ? items : DEFAULT_NAV_ITEMS;
  const [activeSection, setActiveSection] = useState<string>(navItems[0]?.id || 'overview');

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 120;
      for (const item of navItems) {
        const el = document.getElementById(item.id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActiveSection(item.id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [navItems]);

  const scrollTo = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) {
      const offset = 76; // 68px header + buffer
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = el.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="sticky top-14 sm:top-[68px] z-30 bg-white/95 backdrop-blur-md border-y border-[rgba(17,17,17,0.08)] py-2 sm:py-2.5 shadow-2xs w-full min-w-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav
          aria-label="Location Section Navigation"
          className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth"
        >
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollTo(item.id)}
                className={`whitespace-nowrap px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-[#111111] text-white shadow-xs font-semibold'
                    : 'bg-[#FAFAF8] text-[#111111]/70 hover:bg-neutral-100 hover:text-[#111111] border border-[rgba(17,17,17,0.06)]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
