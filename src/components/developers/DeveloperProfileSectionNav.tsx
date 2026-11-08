'use client';

import React, { useEffect, useState } from 'react';

interface DeveloperProfileSectionNavProps {
  projectCount: number;
  locationCount: number;
}

type SectionId = 'overview' | 'projects' | 'locations' | 'about';

const SECTION_IDS: SectionId[] = ['overview', 'projects', 'locations', 'about'];

export function DeveloperProfileSectionNav({
  projectCount,
  locationCount,
}: DeveloperProfileSectionNavProps) {
  const [activeSection, setActiveSection] = useState<SectionId>('overview');

  useEffect(() => {
    const computeActiveSection = () => {
      const scrollY = window.scrollY;
      const viewportHeight = window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;

      if (scrollY < 120) {
        setActiveSection('overview');
        return;
      }

      // If scrolled near the bottom of the page, highlight the last available section
      if (scrollY + viewportHeight >= docHeight - 48) {
        setActiveSection('about');
        return;
      }

      const triggerOffset = 150;
      let current: SectionId = 'overview';

      for (const id of SECTION_IDS) {
        const el = document.getElementById(id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= triggerOffset) {
          current = id;
        }
      }

      setActiveSection(current);
    };

    computeActiveSection();

    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          computeActiveSection();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const navItems: { id: SectionId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'projects', label: `Projects (${projectCount})` },
    { id: 'locations', label: `Locations (${locationCount})` },
    { id: 'about', label: 'About' },
  ];

  return (
    <nav
      aria-label="Section Navigation"
      className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-neutral-200/80 shadow-xs"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-6 sm:space-x-8 text-sm font-display font-medium overflow-x-auto no-scrollbar py-3.5">
          {navItems.map(item => {
            const isActive = activeSection === item.id;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={() => setActiveSection(item.id)}
                aria-current={isActive ? 'location' : undefined}
                className={
                  isActive
                    ? 'text-orange-600 border-b-2 border-orange-600 pb-1 font-semibold whitespace-nowrap transition-colors'
                    : 'text-neutral-600 hover:text-neutral-900 border-b-2 border-transparent pb-1 whitespace-nowrap transition-colors'
                }
              >
                {item.label}
              </a>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
