'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { History, Bookmark, Sliders, ArrowRight, ArrowUpRight } from 'lucide-react';
import { useCustomerAuth } from '../customer/CustomerAuthContext';
import { RecentlyViewedDto, SavedItemDto } from '@/src/domain/customer/entities';

export function HomePersonalizedSection() {
  const { customer, openAuthModal } = useCustomerAuth();
  const [recentItems, setRecentItems] = useState<RecentlyViewedDto[]>([]);
  const [savedItems, setSavedItems] = useState<SavedItemDto[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    if (!customer) return;

    let isMounted = true;
    async function loadCustomerHistory() {
      try {
        setDataLoading(true);
        const [recentRes, savedRes] = await Promise.all([
          fetch('/api/customer/recently-viewed?limit=4'),
          fetch('/api/customer/saved'),
        ]);

        if (recentRes.ok && isMounted) {
          const rData = await recentRes.json();
          setRecentItems(rData.items || []);
        }
        if (savedRes.ok && isMounted) {
          const sData = await savedRes.json();
          setSavedItems(sData.items || []);
        }
      } catch {
        // Silently fallback
      } finally {
        if (isMounted) setDataLoading(false);
      }
    }

    loadCustomerHistory();
    return () => {
      isMounted = false;
    };
  }, [customer]);

  // Logged-in State with Activity
  if (customer && (recentItems.length > 0 || savedItems.length > 0)) {
    return (
      <section className="py-24 bg-white border-b border-[rgba(17,17,17,0.08)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <span className="text-xs uppercase tracking-widest text-[#E85D3F] font-semibold font-display">
                Welcome Back, {customer.name.split(' ')[0]}
              </span>
              <h2 className="text-3xl font-display font-extrabold text-[#111111] tracking-tight mt-1">
                Continue Exploring
              </h2>
              <p className="text-sm text-slate-500 font-body mt-2">
                Pick up where you left off with your recently viewed properties and saved homes.
              </p>
            </div>

            <div className="flex items-center gap-4 font-display text-xs">
              <Link
                href="/account/saved"
                className="inline-flex items-center gap-1.5 text-slate-700 hover:text-[#111111] font-semibold"
              >
                <Bookmark className="w-4 h-4 text-[#E85D3F]" />
                <span>Saved ({savedItems.length})</span>
              </Link>
              <span className="text-slate-300">·</span>
              <Link
                href="/account/recently-viewed"
                className="inline-flex items-center gap-1.5 text-slate-700 hover:text-[#111111] font-semibold"
              >
                <History className="w-4 h-4 text-slate-400" />
                <span>History</span>
              </Link>
            </div>
          </div>

          {/* Grid of Recent/Saved */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {recentItems.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className="bg-[#FAFAF8] border border-[rgba(17,17,17,0.06)] rounded-lg p-5 flex flex-col justify-between hover:shadow-md transition-shadow"
              >
                <div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-display font-semibold mb-3 uppercase tracking-wider">
                    <span>Viewed {item.viewCount} {item.viewCount === 1 ? 'time' : 'times'}</span>
                    <History className="w-3.5 h-3.5" />
                  </div>

                  <h3 className="text-base font-display font-bold text-[#111111] line-clamp-1">
                    {item.resource.title}
                  </h3>

                  <p className="text-xs text-slate-500 font-body mt-1">
                    {item.resource.locationName || 'Kolkata'}
                  </p>

                  <div className="mt-4 text-base font-display font-bold text-[#E85D3F]">
                    {item.resource.priceDisplay || 'Price on Request'}
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-200/60">
                  <Link
                    href={item.resource.url}
                    className="w-full py-2 px-3 bg-white hover:bg-slate-100 text-[#111111] border border-slate-200 text-xs font-semibold rounded font-display flex items-center justify-center gap-1 transition-colors"
                  >
                    <span>View Property</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Anonymous: Subtle inline Preferences CTA
  return (
    <section className="py-12 bg-white border-b border-[rgba(17,17,17,0.08)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-[#FAFAF8] border border-[rgba(17,17,17,0.06)] rounded-lg p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-[#E85D3F]/10 p-3 rounded-lg text-[#E85D3F] hidden sm:block">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-display font-bold text-[#111111]">
                Want personalized search results?
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 font-body mt-1">
                Set your budget and preferred Kolkata neighbourhoods to customize your discovery.
              </p>
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="inline-flex items-center gap-1.5 text-xs font-display font-bold uppercase tracking-wider text-[#E85D3F] hover:text-[#D54D30] cursor-pointer"
            >
              <span>Set Your Preferences</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
