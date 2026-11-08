'use client';

import React, { useState, useRef, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  Search,
  Menu,
  X,
  ChevronDown,
  ArrowRight,
  Phone,
  MessageSquare,
  Sparkles,
  MapPin,
  Building2,
  BookOpen,
  Bookmark,
  History,
  Sliders,
  User,
} from 'lucide-react';
import { CustomerNavControl } from '../customer/CustomerNavControl';
import { useCustomerAuth } from '../customer/CustomerAuthContext';
import { useEnquiry } from '../enquiry/EnquiryContext';
import { useSearch } from '@/src/context/SearchContext';

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
  const { openEnquiry } = useEnquiry();
  const { customer, openAuthModal } = useCustomerAuth();
  const { openSearchModal } = useSearch();


  const [exploreOpen, setExploreOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const exploreRef = useRef<HTMLDivElement>(null);

  // Click outside to dismiss Explore mega-dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exploreRef.current && !exploreRef.current.contains(e.target as Node)) {
        setExploreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Suppress consumer header on admin routes
  if (pathname?.startsWith('/admin')) {
    return null;
  }

  const handleOpenAssistance = () => {
    openEnquiry({
      contextType: 'GENERAL',
      title: 'Assisted Home-Buying Concierge',
      subtitle: 'Connect with a verified Kolkata residential advisor for shortlisting and site visits.',
    });
  };

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
    return pathname === basePath || (basePath !== '/' && pathname.startsWith(`${basePath}/`));
  };

  const isExploreActive =
    pathname?.startsWith('/locations') ||
    pathname?.startsWith('/developers') ||
    pathname?.startsWith('/guides') ||
    (pathname === '/buy' && searchParams?.get('inventoryType') === 'NEW_BOOKING');


  const exploreItems = [
    {
      title: 'New Launches',
      description: 'Newly launched master-planned residential projects',
      href: '/buy?inventoryType=NEW_BOOKING',
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-[68px] flex items-center justify-between gap-3 sm:gap-4">
          {/* LEFT ZONE: Brand Logo & Kolkata Identity Badge */}
          <div className="flex items-center gap-3 lg:gap-6 shrink-0">
            <Link
              href="/"
              className="group flex items-center gap-2.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F] rounded-md transition-opacity"
              aria-label="Great Homes — Home"
            >
              <div className="relative h-6 sm:h-7.5 w-auto aspect-[6.2/1] flex items-center">
                <Image
                  src="/assets/GH_logo.svg"
                  alt="Great Homes"
                  width={155}
                  height={25}
                  priority
                  className="h-6 sm:h-7.5 w-auto object-contain"
                />
              </div>

              {/* Correction 5: Refined Kolkata geographic badge */}
              <span className="hidden sm:inline-flex items-center text-[10px] font-bold tracking-[0.14em] uppercase text-[#6E6A65] bg-[#F4F1EA] border border-[#E5E0D8] px-2 py-0.5 rounded-full font-display">
                Kolkata
              </span>
            </Link>

            {/* CENTER ZONE: Primary Transactional Navigation Links */}
            <nav className="hidden lg:flex items-center gap-5 xl:gap-7 text-xs xl:text-sm font-semibold font-display text-neutral-700">
              <Link
                href="/projects"
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
                  onClick={() => setExploreOpen(!exploreOpen)}
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
                            onClick={() => setExploreOpen(false)}
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

          {/* RIGHT ZONE: Global Search Pill, Sign In, Get Assistance CTA */}
          <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 shrink-0">
            {/* Desktop Integrated Global Search Trigger Pill */}
            <button
              type="button"
              onClick={() => openSearchModal()}
              aria-label="Search Kolkata properties (Shortcut: ⌘K or /)"
              className="hidden md:flex items-center justify-between gap-2 w-32 lg:w-48 xl:w-60 h-9 sm:h-10 px-3 lg:px-3.5 rounded-full bg-[#F5F3F0] hover:bg-[#EFECE6] border border-[#E5E0D8] hover:border-[#D5CFCA] text-xs xl:text-sm text-[#6E6A65] transition-all shadow-2xs cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#E85D3F] shrink-0" />
                <span className="truncate group-hover:text-slate-900 transition-colors">Search Kolkata...</span>
              </div>
              <kbd className="hidden xl:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-[#8D8881] bg-white border border-[#DDD8D0] rounded shadow-2xs shrink-0">
                ⌘K
              </kbd>
            </button>

            {/* Mobile / Tablet Compact Search Trigger Icon */}
            <button
              type="button"
              onClick={() => openSearchModal()}
              aria-label="Open property search modal"
              className="md:hidden p-2 text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Customer User Account / Sign In */}
            <CustomerNavControl />

            {/* Primary 'Get Assistance' CTA Button (Terracotta) */}
            <button
              type="button"
              onClick={handleOpenAssistance}
              className="hidden lg:inline-flex items-center justify-center px-4 py-2 sm:px-4.5 sm:py-2.5 rounded-xl bg-[#E85D3F] text-white text-xs sm:text-sm font-display font-semibold hover:bg-[#D44E32] active:scale-[0.98] shadow-xs hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F] focus-visible:ring-offset-2 cursor-pointer whitespace-nowrap"
            >
              Get Assistance
            </button>

            {/* Mobile Hamburger Menu Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              className="lg:hidden p-2 text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* MOBILE NAVIGATION DRAWER — Comprehensive preservation of all destinations (Correction 2) */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 top-14 sm:top-[68px] z-30 bg-black/40 backdrop-blur-xs lg:hidden animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-full bg-white border-b border-neutral-200 shadow-2xl px-5 py-6 space-y-6 max-h-[calc(100vh-3.5rem)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Search Quick Trigger */}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                openSearchModal();
              }}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-sm font-display"
            >
              <div className="flex items-center gap-2.5">
                <Search className="w-4 h-4 text-[#E85D3F]" />
                <span>Search projects, resale, rentals...</span>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </button>

            {/* Primary Discovery Links */}
            <nav className="flex flex-col space-y-1 font-display">
              <Link
                href="/projects"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-semibold text-slate-800 hover:bg-slate-50 hover:text-[#E85D3F]"
              >
                <span>Projects</span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </Link>

              <Link
                href="/buy?inventoryType=RESALE"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-semibold text-slate-800 hover:bg-slate-50 hover:text-[#E85D3F]"
              >
                <span>Resale Homes</span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </Link>

              <Link
                href="/rent"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-semibold text-slate-800 hover:bg-slate-50 hover:text-[#E85D3F]"
              >
                <span>Rentals</span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </Link>

              <Link
                href="/buy?inventoryType=NEW_BOOKING"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-semibold text-slate-800 hover:bg-slate-50 hover:text-[#E85D3F]"
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
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-[#E85D3F]"
              >
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <span>Locations & Micro-Markets</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </Link>

              <Link
                href="/developers"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-[#E85D3F]"
              >
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <span>Verified Developers</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </Link>

              <Link
                href="/guides"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-[#E85D3F]"
              >
                <div className="flex items-center gap-2.5">
                  <BookOpen className="w-4 h-4 text-slate-400" />
                  <span>Buyer Guides & Advisory</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </Link>

              {/* Customer Account Strip in Mobile Drawer */}
              <div className="pt-2 pb-1">
                <div className="h-px bg-slate-100" />
              </div>

              {customer ? (
                <>
                  <Link
                    href="/account/saved"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2.5">
                      <Bookmark className="w-4 h-4 text-slate-400" />
                      <span>Saved Homes & Projects</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </Link>

                  <Link
                    href="/account/recently-viewed"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2.5">
                      <History className="w-4 h-4 text-slate-400" />
                      <span>Recently Viewed</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </Link>

                  <Link
                    href="/account/profile"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2.5">
                      <User className="w-4 h-4 text-slate-400" />
                      <span>My Profile ({customer.name})</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </Link>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openAuthModal('login');
                  }}
                  className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg text-sm font-semibold text-slate-800 hover:bg-slate-50 text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <User className="w-4 h-4 text-slate-500" />
                    <span>Sign In to Your Account</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </nav>

            {/* Assistance Advisory CTA */}
            <div className="pt-2 border-t border-neutral-100 space-y-3">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleOpenAssistance();
                }}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#E85D3F] text-white text-sm font-display font-semibold hover:bg-[#D44E32] transition-colors shadow-sm cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Get Assisted Advisory</span>
              </button>

              <div className="flex items-center justify-center gap-2 text-xs text-neutral-500 font-body py-1">
                <Phone className="w-3.5 h-3.5 text-[#E85D3F]" />
                <span>Kolkata Property Advisory Hotline</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
