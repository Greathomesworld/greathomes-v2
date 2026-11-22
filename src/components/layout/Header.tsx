'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  Search,
  Menu,
  X,
  ChevronDown,
  ArrowRight,
  Sparkles,
  MapPin,
  Building2,
  BookOpen,
} from 'lucide-react';
import { CustomerNavControl } from '../customer/CustomerNavControl';
import { useCustomerAuth } from '../customer/CustomerAuthContext';
import { useSearch } from '@/src/context/SearchContext';

type ActiveNavMenu = 'none' | 'explore' | 'mobile' | 'account';

function FreeBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`pointer-events-none absolute -top-[9px] right-0 z-10 inline-flex items-center justify-center overflow-hidden rounded-full bg-white border border-[#E85D3F] px-2 py-[2.5px] text-[9.5px] sm:text-[10px] font-bold uppercase tracking-[0.06em] leading-none text-[#E04D2B] font-display select-none shadow-[0_1px_3px_rgba(0,0,0,0.10)] ${className}`}
    >
      <span
        aria-hidden="true"
        className="gh-free-badge-sheen pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-[#FDE2D6]/90 to-transparent"
      />
      <span className="relative z-10">FREE</span>
    </span>
  );
}

export function Header() {
  return (
    <React.Suspense fallback={
      <header className="sticky top-0 z-40 w-full border-b border-neutral-200/80 bg-white/95 backdrop-blur-md h-14 sm:h-[68px]" />
    }>
      <HeaderContent />
    </React.Suspense>
  );
}

function HeaderContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthModalOpen } = useCustomerAuth();
  const { openSearchModal, isSearchModalOpen } = useSearch();

  const [activeMenu, setActiveMenu] = useState<ActiveNavMenu>('none');
  const exploreRef = useRef<HTMLDivElement>(null);

  const exploreOpen = activeMenu === 'explore';
  const mobileMenuOpen = activeMenu === 'mobile';
  const accountMenuOpen = activeMenu === 'account';

  const closeAllMenus = useCallback(() => {
    setActiveMenu('none');
  }, []);

  const handleAccountOpenChange = useCallback((nextOpen: boolean) => {
    setActiveMenu(nextOpen ? 'account' : 'none');
  }, []);

  const handleOpenSearch = useCallback(() => {
    setActiveMenu('none');
    openSearchModal();
  }, [openSearchModal]);

  const searchKey = searchParams?.toString() ?? '';

  // Close all navigation overlays whenever the route or query parameters change
  useEffect(() => {
    setActiveMenu('none');
  }, [pathname, searchKey]);

  // Close all navigation overlays when Search or Auth modal opens (e.g., via ⌘K, '/', or BottomNav)
  useEffect(() => {
    if (isSearchModalOpen || isAuthModalOpen) {
      setActiveMenu('none');
    }
  }, [isSearchModalOpen, isAuthModalOpen]);

  // Click outside to dismiss Explore mega-dropdown
  useEffect(() => {
    if (!exploreOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (exploreRef.current && !exploreRef.current.contains(e.target as Node)) {
        setActiveMenu((prev) => (prev === 'explore' ? 'none' : prev));
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exploreOpen]);

  // Escape key closes Explore dropdown or Mobile Main Drawer without interfering with open modals
  useEffect(() => {
    if (!exploreOpen && !mobileMenuOpen) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isSearchModalOpen && !isAuthModalOpen) {
        setActiveMenu('none');
      }
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [exploreOpen, mobileMenuOpen, isSearchModalOpen, isAuthModalOpen]);

  // Prevent background page scroll while Mobile Main Drawer is open, and auto-close on desktop breakpoint
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const desktopMedia = window.matchMedia('(min-width: 1024px)');
    const handleBreakpointChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setActiveMenu((prev) => (prev === 'mobile' ? 'none' : prev));
      }
    };
    desktopMedia.addEventListener('change', handleBreakpointChange);

    return () => {
      document.body.style.overflow = prevOverflow;
      desktopMedia.removeEventListener('change', handleBreakpointChange);
    };
  }, [mobileMenuOpen]);

  // Suppress consumer header on admin routes
  if (pathname?.startsWith('/admin')) {
    return null;
  }

  const isLinkActive = (href: string) => {
    if (!pathname) return false;
    const [basePath, queryStr] = href.split('?');
    if (queryStr) {
      if (pathname !== basePath) return false;
      const targetParams = new URLSearchParams(queryStr);
      for (const [key, value] of targetParams.entries()) {
        if (searchParams?.get(key) !== value) return false;
      }
      return true;
    }
    if (basePath === '/projects' && pathname === '/projects' && searchParams?.get('stage') === 'NEW_LAUNCH') {
      return false;
    }
    return pathname === basePath || (basePath !== '/' && pathname.startsWith(`${basePath}/`));
  };

  const isExploreActive =
    pathname?.startsWith('/locations') ||
    pathname?.startsWith('/developers') ||
    pathname?.startsWith('/guides') ||
    (pathname === '/projects' && searchParams?.get('stage') === 'NEW_LAUNCH');

  const exploreItems = [
    {
      title: 'New Launches',
      description: 'Newly launched master-planned residential projects',
      href: '/projects?stage=NEW_LAUNCH',
      icon: Sparkles,
      badge: 'Fresh',
    },
    {
      title: 'Locations & Micro-Markets',
      description: 'Kolkata micro-markets, infrastructure & price insights',
      href: '/locations',
      icon: MapPin,
    },
    {
      title: 'Developers & Builders',
      description: 'Verified builder track records and RERA portfolios',
      href: '/developers',
      icon: Building2,
    },
    {
      title: 'Guides & Legal Advisory',
      description: 'Buyer checklists, stamp duty, legal verification',
      href: '/guides',
      icon: BookOpen,
    },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-neutral-200/80 bg-white/95 backdrop-blur-md transition-shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 xl:px-8 h-14 sm:h-[68px] flex items-center justify-between gap-2 sm:gap-3 xl:gap-4">
          {/* LEFT ZONE: Brand Logo & Kolkata Identity Badge */}
          <div className="flex items-center gap-2.5 lg:gap-4 xl:gap-6 shrink-0">
            <Link
              href="/"
              onClick={closeAllMenus}
              className="group flex items-center gap-2 sm:gap-2.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F] rounded-md transition-opacity"
              aria-label="Great Homes — Home"
            >
              <div className="relative h-5.5 sm:h-7 lg:h-6.5 xl:h-7.5 w-auto aspect-[6.2/1] flex items-center">
                <Image
                  src="/assets/GH_logo.svg"
                  alt="Great Homes"
                  width={155}
                  height={25}
                  priority
                  className="h-5.5 sm:h-7 lg:h-6.5 xl:h-7.5 w-auto object-contain"
                />
              </div>

              <span className="hidden sm:inline-flex items-center text-[10px] font-bold tracking-[0.14em] uppercase text-[#6E6A65] bg-[#F4F1EA] border border-[#E5E0D8] px-2 py-0.5 rounded-full font-display">
                Kolkata
              </span>
            </Link>

            {/* CENTER ZONE: Primary Discovery Navigation Links */}
            <nav className="hidden lg:flex items-center gap-4 xl:gap-7 text-xs xl:text-sm font-semibold font-display text-neutral-700">
              <Link
                href="/projects"
                onClick={closeAllMenus}
                className={`relative py-1 transition-colors whitespace-nowrap hover:text-[#E85D3F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F] rounded ${
                  isLinkActive('/projects') ? 'text-[#E85D3F] font-bold' : 'text-neutral-700'
                }`}
              >
                <span>Projects</span>
                {isLinkActive('/projects') && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E85D3F] rounded-full animate-fade-in" />
                )}
              </Link>

              <Link
                href="/buy?inventoryType=RESALE"
                onClick={closeAllMenus}
                className={`relative py-1 transition-colors whitespace-nowrap hover:text-[#E85D3F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F] rounded ${
                  isLinkActive('/buy?inventoryType=RESALE') ? 'text-[#E85D3F] font-bold' : 'text-neutral-700'
                }`}
              >
                <span>Resale</span>
                {isLinkActive('/buy?inventoryType=RESALE') && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E85D3F] rounded-full animate-fade-in" />
                )}
              </Link>

              <Link
                href="/rent"
                onClick={closeAllMenus}
                className={`relative py-1 transition-colors whitespace-nowrap hover:text-[#E85D3F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F] rounded ${
                  isLinkActive('/rent') ? 'text-[#E85D3F] font-bold' : 'text-neutral-700'
                }`}
              >
                <span>Rent</span>
                {isLinkActive('/rent') && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E85D3F] rounded-full animate-fade-in" />
                )}
              </Link>

              {/* Explore Mega-Dropdown */}
              <div className="relative" ref={exploreRef}>
                <button
                  type="button"
                  onClick={() => setActiveMenu(exploreOpen ? 'none' : 'explore')}
                  className={`flex items-center gap-1.5 py-1 transition-colors whitespace-nowrap hover:text-[#E85D3F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F] rounded cursor-pointer ${
                    isExploreActive ? 'text-[#E85D3F] font-bold' : 'text-neutral-700'
                  }`}
                  aria-expanded={exploreOpen}
                  aria-haspopup="true"
                >
                  <span>Explore</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${
                      exploreOpen ? 'rotate-180 text-[#E85D3F]' : ''
                    }`}
                  />
                </button>

                {exploreOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 mt-3 w-80 bg-white border border-slate-200 shadow-2xl rounded-2xl p-2.5 z-50 animate-fade-in"
                  >
                    <div className="px-3 py-1.5 border-b border-slate-100 mb-1">
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 font-display">
                        Property Intelligence
                      </p>
                    </div>

                    <div className="space-y-1">
                      {exploreItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.title}
                            href={item.href}
                            onClick={closeAllMenus}
                            role="menuitem"
                            className="group flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                          >
                            <div className="p-2 rounded-lg bg-slate-50 group-hover:bg-[#FFF5EE] text-slate-600 group-hover:text-[#E85D3F] transition-colors shrink-0 mt-0.5">
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs sm:text-sm font-semibold text-slate-800 group-hover:text-[#E85D3F] transition-colors font-display">
                                  {item.title}
                                </span>
                                {item.badge && (
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#E85D3F] bg-[#FFF0EB] px-1.5 py-0.2 rounded font-display">
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 font-body leading-normal line-clamp-1 mt-0.5">
                                {item.description}
                              </p>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </nav>
          </div>

          {/* RIGHT ZONE: Global Search Pill, Account / Sign In, Post Property CTA */}
          <div className="flex items-center gap-1.5 sm:gap-2 xl:gap-3 shrink-0">
            {/* Desktop Integrated Global Search Trigger Pill */}
            <button
              type="button"
              onClick={handleOpenSearch}
              aria-label="Search Kolkata properties (Shortcut: ⌘K or /)"
              className="hidden md:flex items-center justify-between gap-2 w-36 lg:w-40 xl:w-56 h-9 sm:h-10 px-3 lg:px-3.5 rounded-full bg-[#F5F3F0] hover:bg-[#EFECE6] border border-[#E5E0D8] hover:border-[#D5CFCA] text-xs xl:text-sm text-[#6E6A65] transition-all shadow-2xs cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#E85D3F] shrink-0" />
                <span className="truncate group-hover:text-slate-900 transition-colors">Search Kolkata...</span>
              </div>
              <kbd className="hidden xl:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-[#8D8881] bg-white border border-[#DDD8D0] rounded shadow-2xs shrink-0">
                ⌘K
              </kbd>
            </button>

            {/* Mobile Compact Search Trigger Icon */}
            <button
              type="button"
              onClick={handleOpenSearch}
              aria-label="Open property search modal"
              className="md:hidden p-2 text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Customer User Account / Sign In */}
            <CustomerNavControl
              isOpen={accountMenuOpen}
              onOpenChange={handleAccountOpenChange}
              onSignInClick={closeAllMenus}
            />

            {/* Primary Desktop 'Post Property' CTA Button (Terracotta) with attached FREE corner tag */}
            <div className="relative hidden lg:inline-flex items-center shrink-0">
              <Link
                href="/post-property"
                onClick={closeAllMenus}
                className="inline-flex items-center justify-center px-3.5 py-2 xl:px-4.5 xl:py-2.5 rounded-xl bg-[#E85D3F] text-white text-xs xl:text-sm font-display font-semibold hover:bg-[#D44E32] active:scale-[0.98] shadow-xs hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F] focus-visible:ring-offset-2 whitespace-nowrap"
              >
                Post Property
              </Link>
              <FreeBadge />
            </div>

            {/* Mobile / Tablet Hamburger Menu Toggle */}
            <button
              type="button"
              onClick={() => setActiveMenu(mobileMenuOpen ? 'none' : 'mobile')}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              className="lg:hidden p-2 text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* MOBILE / TABLET MAIN DRAWER — Property Discovery Only */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 top-14 sm:top-[68px] z-30 bg-black/40 backdrop-blur-xs lg:hidden animate-fade-in"
          onClick={closeAllMenus}
        >
          <div
            className="w-full bg-white border-b border-neutral-200 shadow-2xl px-5 pt-5 pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:pb-6 space-y-5 max-h-[calc(100dvh-3.5rem)] sm:max-h-[calc(100dvh-68px)] overflow-y-auto overscroll-contain"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Search Quick Trigger */}
            <button
              type="button"
              onClick={handleOpenSearch}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-sm font-display cursor-pointer hover:bg-slate-100/80 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Search className="w-4 h-4 text-[#E85D3F] shrink-0" />
                <span className="truncate">Search Projects, Resale &amp; Rentals</span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>

            {/* Primary & Secondary Discovery Navigation */}
            <nav aria-label="Property discovery navigation" className="flex flex-col space-y-1 font-display">
              <Link
                href="/projects"
                onClick={closeAllMenus}
                className={`flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-semibold hover:bg-slate-50 hover:text-[#E85D3F] transition-colors ${
                  isLinkActive('/projects') ? 'text-[#E85D3F] bg-[#FFF8F5]' : 'text-slate-800'
                }`}
              >
                <span>Projects</span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </Link>

              <Link
                href="/buy?inventoryType=RESALE"
                onClick={closeAllMenus}
                className={`flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-semibold hover:bg-slate-50 hover:text-[#E85D3F] transition-colors ${
                  isLinkActive('/buy?inventoryType=RESALE') ? 'text-[#E85D3F] bg-[#FFF8F5]' : 'text-slate-800'
                }`}
              >
                <span>Resale Homes</span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </Link>

              <Link
                href="/rent"
                onClick={closeAllMenus}
                className={`flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-semibold hover:bg-slate-50 hover:text-[#E85D3F] transition-colors ${
                  isLinkActive('/rent') ? 'text-[#E85D3F] bg-[#FFF8F5]' : 'text-slate-800'
                }`}
              >
                <span>Rentals</span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </Link>

              <Link
                href="/projects?stage=NEW_LAUNCH"
                onClick={closeAllMenus}
                className={`flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-semibold hover:bg-slate-50 hover:text-[#E85D3F] transition-colors ${
                  isLinkActive('/projects?stage=NEW_LAUNCH') ? 'text-[#E85D3F] bg-[#FFF8F5]' : 'text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>New Launches</span>
                  <span className="text-[10px] font-bold text-[#E85D3F] bg-[#FFF0EB] px-1.5 py-0.2 rounded">Fresh</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </Link>

              <div className="pt-2 pb-1">
                <div className="h-px bg-slate-100" />
              </div>

              <Link
                href="/locations"
                onClick={closeAllMenus}
                className={`flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-medium hover:bg-slate-50 hover:text-[#E85D3F] transition-colors ${
                  isLinkActive('/locations') ? 'text-[#E85D3F] bg-[#FFF8F5] font-semibold' : 'text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <span>Locations &amp; Micro-Markets</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </Link>

              <Link
                href="/developers"
                onClick={closeAllMenus}
                className={`flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-medium hover:bg-slate-50 hover:text-[#E85D3F] transition-colors ${
                  isLinkActive('/developers') ? 'text-[#E85D3F] bg-[#FFF8F5] font-semibold' : 'text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <span>Verified Developers</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </Link>

              <Link
                href="/guides"
                onClick={closeAllMenus}
                className={`flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-medium hover:bg-slate-50 hover:text-[#E85D3F] transition-colors ${
                  isLinkActive('/guides') ? 'text-[#E85D3F] bg-[#FFF8F5] font-semibold' : 'text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <BookOpen className="w-4 h-4 text-slate-400" />
                  <span>Buyer Guides &amp; Advisory</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </Link>
            </nav>

            {/* Post Property Primary CTA with attached FREE corner tag */}
            <div className="pt-4 border-t border-neutral-100">
              <div className="relative w-full">
                <Link
                  href="/post-property"
                  onClick={closeAllMenus}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#E85D3F] text-white text-sm font-display font-semibold hover:bg-[#D44E32] active:scale-[0.99] transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F] focus-visible:ring-offset-2"
                >
                  <span>Post Property</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <FreeBadge />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

