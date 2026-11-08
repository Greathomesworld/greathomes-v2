'use client';

import React, { useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { UniversalSearch } from '../search/UniversalSearch';
import { useSearch } from '@/src/context/SearchContext';

interface HomeHeroProps {
  popularLocations?: { name: string; slug: string }[];
}

const DEFAULT_POPULAR_LOCATIONS = [
  { name: 'Rajarhat', slug: 'rajarhat' },
  { name: 'New Town', slug: 'new-town' },
  { name: 'EM Bypass', slug: 'em-bypass' },
  { name: 'Tollygunge', slug: 'tollygunge' },
  { name: 'Southern Bypass', slug: 'southern-bypass' },
];

export function HomeHero({ popularLocations }: HomeHeroProps = {}) {
  const prefersReducedMotion = useReducedMotion();
  const {
    activeMode,
    setActiveMode,
    selectedBhk,
    selectedBudgetIndex,
    currentBudgetOptions,
    setIsStickyVisible,
  } = useSearch();

  const sentinelRef = useRef<HTMLDivElement>(null);

  const locationsToDisplay =
    popularLocations && popularLocations.length > 0
      ? popularLocations
      : DEFAULT_POPULAR_LOCATIONS;

  // Track hero search exit/entry using IntersectionObserver with zero layout shift
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // When hero search scrolls past the top header area
        const isPastHero = !entry.isIntersecting && entry.boundingClientRect.top <= 100;
        setIsStickyVisible(isPastHero);
      },
      {
        root: null,
        threshold: [0, 1],
        rootMargin: '-70px 0px 0px 0px',
      }
    );

    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      setIsStickyVisible(false);
    };
  }, [setIsStickyVisible]);

  // Preserve active discovery mode, BHK, and budget filters when clicking popular location tags
  const getLocationHref = (slug: string) => {
    const params = new URLSearchParams();
    params.append('location', slug);
    if (selectedBhk) {
      params.append('bhk', selectedBhk);
    }
    const budget = currentBudgetOptions[selectedBudgetIndex];
    if (budget?.min) {
      params.append('minPrice', budget.min);
    }
    if (budget?.max) {
      params.append('maxPrice', budget.max);
    }

    let basePath = '/projects';
    if (activeMode === 'BUY') {
      basePath = '/buy';
      params.append('inventoryType', 'RESALE');
    } else if (activeMode === 'RENT') {
      basePath = '/rent';
    }

    return `${basePath}?${params.toString()}`;
  };

  const animateProps = prefersReducedMotion
    ? { initial: { opacity: 1, y: 0 }, animate: { opacity: 1, y: 0 } }
    : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, ease: 'easeOut' as const } };

  return (
    <section className="relative z-20 w-full bg-[#FAFAF8] text-[#111111] min-h-[580px] sm:min-h-[620px] lg:min-h-[660px] flex items-center border-b border-neutral-200/80">
      {/* 1. Victoria Memorial Golden Hour Background Image with White Faded Editorial Scrim */}
      <div className="absolute inset-0 z-0 select-none pointer-events-none overflow-hidden">
        <Image
          src="https://images.unsplash.com/photo-1558431382-27e303142255?auto=format&fit=crop&w=2000&q=85"
          alt="Victoria Memorial Kolkata at Golden Hour"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center opacity-80 sm:opacity-85"
          referrerPolicy="no-referrer"
        />
        {/* Soft White Faded Scrim Layers */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/45 to-[#FAFAF8]/95" />
        <div className="absolute inset-0 bg-gradient-to-r from-white/60 via-transparent to-white/60" />
      </div>

      {/* 2. Content & Centred Universal Search Container */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-16 flex flex-col items-center">
        <div className="w-full max-w-3xl lg:max-w-4xl text-center space-y-5 sm:space-y-6 flex flex-col items-center">
          {/* Top Brand Kicker */}
          <motion.div {...animateProps} className="space-y-3 sm:space-y-4 flex flex-col items-center">
            <div className="inline-flex items-center gap-2 text-xs font-display font-bold uppercase tracking-[0.22em] text-[#E85D3F] bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-neutral-200/90 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E85D3F] shrink-0" />
              <span>Kolkata’s Residential Expert</span>
            </div>

            {/* Main Editorial Hero Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-editorial font-bold text-[#111111] tracking-tight leading-[1.08] sm:leading-[1.05] text-center">
              Find Your <br className="hidden sm:inline" />
              <span className="text-[#E85D3F]">Great Place</span>
            </h1>

            {/* Clear Value Proposition */}
            <p className="text-sm sm:text-base lg:text-lg text-neutral-700 font-body leading-relaxed max-w-2xl font-normal text-center">
              Discover verified homes, residential projects and real property intelligence across Kolkata — and make your next move with confidence.
            </p>
          </motion.div>

          {/* 3. Centred Universal Search Component */}
          <motion.div
            {...(prefersReducedMotion
              ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
              : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, delay: 0.1, ease: 'easeOut' as const } })}
            className="w-full max-w-3xl lg:max-w-4xl mx-auto pt-1 relative z-30"
          >
            <UniversalSearch
              placeholder="Search by project, location, developer or keyword"
              showDiscoveryModes={true}
              onModeChange={setActiveMode}
            />
          </motion.div>

          {/* Observer Sentinel Element placed immediately below the hero search bar */}
          <div ref={sentinelRef} className="w-full h-1 pointer-events-none opacity-0" aria-hidden="true" />

          {/* 4. Centred Popular Location Shortcuts */}
          <motion.div
            {...(prefersReducedMotion
              ? { initial: { opacity: 1 }, animate: { opacity: 1 } }
              : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4, delay: 0.2 } })}
            className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 text-xs font-body pt-1"
          >
            <span className="text-neutral-700 font-display font-semibold mr-1 text-xs">
              Popular Locations:
            </span>
            {locationsToDisplay.map((loc) => (
              <Link
                key={loc.slug}
                href={getLocationHref(loc.slug)}
                className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full bg-white/90 hover:bg-white text-neutral-800 hover:text-[#E85D3F] border border-neutral-300/80 hover:border-[#E85D3F] text-[11px] sm:text-xs font-display font-medium shadow-2xs transition-all duration-150 active:scale-95"
              >
                {loc.name}
              </Link>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
