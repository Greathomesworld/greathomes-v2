'use client';

import { useEffect, useRef, useState } from 'react';
import { scrollToProjectSection } from './scrollToProjectSection';

export interface NavItem {
  id: string;
  label: string;
}

interface ProjectSectionNavigationProps {
  items: NavItem[];
}

export function ProjectSectionNavigation({ items }: ProjectSectionNavigationProps) {
  const firstItemId = items?.[0]?.id || '';
  const [activeId, setActiveId] = useState<string>(firstItemId);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const manualScrollRef = useRef<{ id: string; until: number } | null>(null);

  useEffect(() => {
    setActiveId((prev) => (prev && items.some((i) => i.id === prev) ? prev : firstItemId));
  }, [firstItemId, items]);

  useEffect(() => {
    if (!items || items.length === 0) return;

    const handleScroll = () => {
      if (manualScrollRef.current) {
        if (Date.now() < manualScrollRef.current.until) {
          return;
        }
        manualScrollRef.current = null;
      }

      const scrollPosition = window.scrollY + 150;
      const isAtPageBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 24;

      let matchedId = items[0].id;

      for (let i = items.length - 1; i >= 0; i--) {
        const section = document.getElementById(items[i].id);
        if (section) {
          const rect = section.getBoundingClientRect();
          const top = rect.top + window.scrollY;
          if (
            scrollPosition >= top ||
            (isAtPageBottom && i === items.length - 1 && rect.top < window.innerHeight * 0.75)
          ) {
            matchedId = items[i].id;
            break;
          }
        }
      }

      setActiveId((prev) => (prev === matchedId ? prev : matchedId));
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [items]);

  // Keep the active tab visible inside the horizontal navigation bar when scrolling in either direction
  useEffect(() => {
    if (!activeId) return;
    const container = scrollContainerRef.current;
    const activeTab = tabRefs.current[activeId];
    if (!container || !activeTab) return;

    if (container.scrollWidth <= container.clientWidth) return;

    const containerRect = container.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();
    const tabLeftInTrack = tabRect.left - containerRect.left + container.scrollLeft;
    const desiredScrollLeft =
      tabLeftInTrack - container.clientWidth / 2 + tabRect.width / 2;
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    const clampedScrollLeft = Math.max(0, Math.min(maxScrollLeft, desiredScrollLeft));

    if (Math.abs(container.scrollLeft - clampedScrollLeft) > 4) {
      container.scrollTo({
        left: clampedScrollLeft,
        behavior: 'smooth',
      });
    }
  }, [activeId]);

  if (!items || items.length === 0) return null;

  const scrollToSection = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    const yOffset = -124; // Global Header (56px mobile / 68px desktop) + sticky section nav (~48px) + buffer
    manualScrollRef.current = { id, until: Date.now() + 700 };
    if (scrollToProjectSection(id, yOffset)) {
      setActiveId(id);
    }
  };

  return (
    <nav
      aria-label="Project section navigation"
      className="sticky top-14 sm:top-[68px] z-30 bg-[var(--color-background)]/95 backdrop-blur-md border-b border-[var(--color-border)] transition-colors"
    >
      <div className="w-full">
        <div
          ref={scrollContainerRef}
          className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-2.5 pr-6 scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none]"
        >
          {items.map(item => {
            const isActive = activeId === item.id;
            return (
              <a
                key={item.id}
                ref={(el) => {
                  tabRefs.current[item.id] = el;
                }}
                href={`#${item.id}`}
                onClick={(e) => scrollToSection(item.id, e)}
                className={`shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-medium font-display transition-colors whitespace-nowrap focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F] ${
                  isActive
                    ? 'bg-[#111111] text-white font-semibold shadow-xs'
                    : 'text-[var(--color-foreground)]/70 hover:text-[var(--color-foreground)] hover:bg-[var(--color-foreground)]/5'
                }`}
                aria-current={isActive ? 'true' : undefined}
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

