'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { History, Trash2, ArrowUpRight, Loader2, Building, Home, Key } from 'lucide-react';
import { RecentlyViewedDto, SavedItemResourceType } from '@/src/domain/customer/entities';
import { EmptyStateIllustration } from '@/src/components/illustrations';

export default function RecentlyViewedPage() {
  const [items, setItems] = useState<RecentlyViewedDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/customer/recently-viewed');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleClear = async () => {
    if (!confirm('Are you sure you want to clear your recently viewed history?')) return;
    try {
      setClearing(true);
      const res = await fetch('/api/customer/recently-viewed', { method: 'DELETE' });
      if (res.ok) {
        setItems([]);
      }
    } finally {
      setClearing(false);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-serif text-slate-900">Recently Viewed Properties</h2>
          <p className="text-xs text-slate-500 font-body mt-0.5">
            Your recent browsing history across Great Homes (up to 20 items).
          </p>
        </div>

        {items.length > 0 && (
          <button
            onClick={handleClear}
            disabled={clearing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-md border border-slate-200 transition-colors font-display cursor-pointer"
          >
            {clearing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            <span>Clear History</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl my-8 overflow-hidden shadow-xs">
          <EmptyStateIllustration
            type="RECENT"
            headline="Start exploring"
            supporting="Projects and homes you view will appear here."
            ctaText="Explore Projects"
            ctaHref="/projects"
            size="EMPTY"
          />
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden shadow-xs">
          {items.map((item) => {
            const { resource } = item;
            return (
              <div
                key={item.id}
                className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:bg-slate-50/60 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {/* Thumbnail */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded bg-slate-100 overflow-hidden shrink-0">
                    {resource.imageUrl ? (
                      <img
                        src={resource.imageUrl}
                        alt={resource.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        {item.resourceType === 'PROJECT' ? (
                          <Building className="w-6 h-6" />
                        ) : (
                          <Home className="w-6 h-6" />
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider font-display">
                      {item.resourceType === 'PROJECT' ? 'Project' : 'Listing'} · Viewed{' '}
                      {item.viewCount} {item.viewCount === 1 ? 'time' : 'times'}
                    </span>
                    <h4 className="text-base font-serif text-slate-900 font-medium">
                      {resource.title}
                    </h4>
                    <p className="text-xs text-slate-500 font-body mt-0.5">
                      {resource.locationName && <span>{resource.locationName}</span>}
                      {resource.locationName && resource.developerName && <span> · </span>}
                      {resource.developerName && <span>By {resource.developerName}</span>}
                    </p>
                    <div className="mt-2 text-xs font-bold text-slate-900 font-display">
                      {resource.priceDisplay || 'Price on Request'}
                    </div>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100">
                  <span className="text-xs text-slate-400 font-body">
                    {formatTimeAgo(item.lastViewedAt)}
                  </span>
                  <Link
                    href={resource.url}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded font-display transition-colors flex items-center gap-1"
                  >
                    <span>View</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
