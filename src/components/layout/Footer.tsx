'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCustomerAuth } from '../customer/CustomerAuthContext';
import { useVisitorTelemetry } from '../telemetry/VisitorTelemetryProvider';

export function Footer() {
  const pathname = usePathname();
  const { customer, openAuthModal } = useCustomerAuth();
  const { optedOut, setOptOut } = useVisitorTelemetry();

  if (pathname?.startsWith('/admin')) {
    return null;
  }

  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#111111] text-white border-t border-white/10 pt-16 pb-36 md:pb-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Column 1: DISCOVER */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-white/50 font-display mb-4">
              Discover
            </h4>
            <ul className="space-y-2.5 text-xs sm:text-sm font-body text-white/80">
              <li>
                <Link
                  href="/projects?stage=NEW_LAUNCH"
                  className="hover:text-white transition-colors"
                >
                  New Launch
                </Link>
              </li>
              <li>
                <Link
                  href="/buy?inventoryType=RESALE"
                  className="hover:text-white transition-colors"
                >
                  Buy Resale
                </Link>
              </li>
              <li>
                <Link href="/rent" className="hover:text-white transition-colors">
                  Rent
                </Link>
              </li>
              <li>
                <Link href="/projects" className="hover:text-white transition-colors">
                  All Projects
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 2: EXPLORE */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-white/50 font-display mb-4">
              Explore
            </h4>
            <ul className="space-y-2.5 text-xs sm:text-sm font-body text-white/80">
              <li>
                <Link href="/developers" className="hover:text-white transition-colors">
                  Developers
                </Link>
              </li>
              <li>
                <Link href="/locations" className="hover:text-white transition-colors">
                  Locations
                </Link>
              </li>
              <li>
                <Link href="/market" className="hover:text-white transition-colors">
                  Market Intelligence
                </Link>
              </li>
              <li>
                <Link href="/guides" className="hover:text-white transition-colors">
                  Guides
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: GREAT HOMES */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-white/50 font-display mb-4">
              Great Homes
            </h4>
            <ul className="space-y-2.5 text-xs sm:text-sm font-body text-white/80">
              <li>
                <Link href="/#why-great-homes" className="hover:text-white transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link href="/projects" className="hover:text-white transition-colors">
                  Property Discovery
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setOptOut(!optedOut)}
                  className="hover:text-white transition-colors text-left font-body cursor-pointer text-white/70"
                  title="Toggle first-party property discovery analytics"
                >
                  {optedOut ? 'Discovery Analytics: Off' : 'Discovery Analytics: On'}
                </button>
              </li>
            </ul>
          </div>

          {/* Column 4: ACCOUNT */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-white/50 font-display mb-4">
              Account
            </h4>
            <ul className="space-y-2.5 text-xs sm:text-sm font-body text-white/80">
              <li>
                {customer ? (
                  <Link href="/account/profile" className="hover:text-white transition-colors">
                    My Account ({customer.name.split(' ')[0]})
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => openAuthModal('login')}
                    className="hover:text-white transition-colors text-left font-body cursor-pointer"
                  >
                    Sign In
                  </button>
                )}
              </li>
              <li>
                <Link href="/account/saved" className="hover:text-white transition-colors">
                  Saved Homes
                </Link>
              </li>
              <li>
                <Link
                  href="/account/recently-viewed"
                  className="hover:text-white transition-colors"
                >
                  Recently Viewed
                </Link>
              </li>
              <li>
                <Link href="/account/preferences" className="hover:text-white transition-colors">
                  Preferences & Alerts
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/50 font-body">
          <div className="flex items-center gap-2">
            <span className="text-base font-serif font-bold text-white tracking-tight">
              Great Homes
            </span>
            <span>· Verified Kolkata Residential Property Discovery</span>
          </div>
          <p>© {currentYear} Great Homes. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
