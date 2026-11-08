'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bookmark, History, Sliders, User, LogIn, Loader2 } from 'lucide-react';
import { useCustomerAuth } from '@/src/components/customer/CustomerAuthContext';

const NAV_TABS = [
  { href: '/account/saved', label: 'Saved Homes', icon: Bookmark },
  { href: '/account/recently-viewed', label: 'Recently Viewed', icon: History },
  { href: '/account/preferences', label: 'Preferences & Alerts', icon: Sliders },
  { href: '/account/profile', label: 'Profile', icon: User },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const { customer, loading, openAuthModal } = useCustomerAuth();
  const pathname = usePathname();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="max-w-xl mx-auto py-20 px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-6 text-slate-700">
          <LogIn className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-serif text-slate-900 mb-3">Sign In Required</h1>
        <p className="text-slate-600 font-body mb-8">
          Please sign in to your Great Homes account to access your saved homes, view history, and
          manage search preferences.
        </p>
        <button
          onClick={() => openAuthModal('login')}
          className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-md transition-colors font-display cursor-pointer"
        >
          Sign In to Your Account
        </button>
      </div>
    );
  }

  const memberSinceYear = new Date(customer.createdAt).getFullYear();

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      {/* Account Hero Bar */}
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold font-display">
                Buyer Account
              </p>
              <h1 className="text-3xl sm:text-4xl font-serif text-slate-900 mt-1">
                {customer.name}
              </h1>
              <p className="text-sm text-slate-500 mt-1 font-body">
                {customer.email} · Member since {memberSinceYear}
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex gap-2 sm:gap-6 mt-8 overflow-x-auto border-b border-slate-200 pb-px">
            {NAV_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive =
                pathname === tab.href ||
                (tab.href === '/account/saved' && pathname === '/account');

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex items-center gap-2 pb-3 px-1 text-sm font-medium whitespace-nowrap transition-colors font-display ${
                    isActive
                      ? 'border-b-2 border-slate-900 text-slate-900 font-semibold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Account Viewport */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8">{children}</main>
    </div>
  );
}
