'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Scale, ArrowLeft, Trash2, Home, MapPin, ExternalLink } from 'lucide-react';
import { ResaleComparisonDto } from '@/src/domain/comparison/entities';

function CompareResaleContent() {
  const searchParams = useSearchParams();
  const idsParam = searchParams.get('ids');

  const [items, setItems] = useState<ResaleComparisonDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!idsParam) {
      setLoading(false);
      setError('No resale listing IDs provided for comparison.');
      return;
    }

    async function fetchComparison() {
      try {
        setLoading(true);
        const res = await fetch(`/api/compare/resale?ids=${encodeURIComponent(idsParam || '')}`);
        const data = await res.json();
        if (data.success) {
          setItems(data.items);
        } else {
          setError(data.error || 'Failed to load resale comparison');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load resale comparison');
      } finally {
        setLoading(false);
      }
    }

    fetchComparison();
  }, [idsParam]);

  const removeItem = (id: string) => {
    if (!idsParam) return;
    const currentIds = idsParam.split(',').map(i => i.trim()).filter(Boolean);
    const updated = currentIds.filter(i => i !== id);
    if (updated.length === 0) {
      window.location.href = '/buy';
    } else {
      window.location.href = `/compare/resale?ids=${updated.join(',')}`;
    }
  };

  return (
    <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link
            href="/buy"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Resale Discovery</span>
          </Link>
          <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">Compare Resale Homes</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
            Compare asking prices, carpet area, furnishings and details side-by-side.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-stone-500">Loading resale comparison...</div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-6 rounded-2xl text-center text-red-700 dark:text-red-400">
          <p>{error}</p>
          <Link href="/buy" className="mt-4 inline-block px-4 py-2 bg-stone-900 text-white dark:bg-white dark:text-stone-900 rounded-xl text-xs font-medium">
            Explore Resale Homes
          </Link>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-12 text-center max-w-lg mx-auto">
          <div className="w-12 h-12 bg-emerald-500/10 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Scale className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-display font-bold mb-2">No Resale Homes to Compare</h2>
          <p className="text-sm text-stone-500 dark:text-stone-400 mb-6">Select 2 to 4 resale homes from discovery to compare.</p>
          <Link href="/buy" className="px-5 py-2.5 bg-stone-900 text-white dark:bg-white dark:text-stone-900 rounded-xl text-xs font-medium">
            Explore Resale Homes
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto pb-12">
          <div className="min-w-[800px] grid grid-cols-5 gap-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-6 shadow-sm">
            {/* Attribute Header Column */}
            <div className="col-span-1 space-y-6 pt-32 font-display font-bold text-sm text-stone-500 border-r border-stone-100 dark:border-stone-800 pr-4">
              <div className="h-10 flex items-center">Asking Price</div>
              <div className="h-10 flex items-center">Configuration</div>
              <div className="h-10 flex items-center">Location</div>
              <div className="h-10 flex items-center">Carpet Area</div>
              <div className="h-10 flex items-center">Furnishing</div>
              <div className="h-10 flex items-center">Floor Category</div>
              <div className="h-10 flex items-center">Facing</div>
              <div className="h-10 flex items-center">Listing Party</div>
              <div className="h-12 flex items-center">Actions</div>
            </div>

            {/* Property Columns */}
            {items.map((item) => (
              <div key={item.id} className="col-span-1 flex flex-col space-y-6 bg-stone-50/50 dark:bg-stone-800/30 p-4 rounded-2xl border border-stone-100 dark:border-stone-800/80 relative">
                <div>
                  <div className="h-28 bg-stone-200 dark:bg-stone-800 rounded-xl overflow-hidden mb-3 relative flex items-center justify-center">
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <Home className="w-8 h-8 text-stone-400" />
                    )}
                    <button
                      onClick={() => removeItem(item.id)}
                      className="absolute top-2 right-2 p-1.5 bg-stone-900/70 hover:bg-red-600 text-white rounded-lg transition-colors"
                      title="Remove from comparison"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <h3 className="font-display font-bold text-base truncate" title={item.title}>{item.title}</h3>
                  {!item.isAvailable && (
                    <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 text-[10px] font-semibold rounded-md">
                      No longer available
                    </span>
                  )}
                </div>

                <div className="h-10 flex items-center font-semibold text-emerald-600 dark:text-emerald-400">
                  {item.askingPriceDisplay}
                </div>
                <div className="h-10 flex items-center text-sm">{item.configuration}</div>
                <div className="h-10 flex items-center text-sm truncate" title={item.locationName}>
                  <MapPin className="w-3.5 h-3.5 text-stone-400 mr-1 shrink-0" />
                  <span className="truncate">{item.locationName}</span>
                </div>
                <div className="h-10 flex items-center text-sm">{item.carpetArea ? `${item.carpetArea} sq.ft.` : '—'}</div>
                <div className="h-10 flex items-center text-sm">{item.furnishing}</div>
                <div className="h-10 flex items-center text-sm">{item.floorCategory}</div>
                <div className="h-10 flex items-center text-sm">{item.facing || '—'}</div>
                <div className="h-10 flex items-center text-xs font-medium text-stone-600 dark:text-stone-400">
                  {item.listingPartyType}
                </div>
                <div className="h-12 flex items-center pt-2">
                  <Link
                    href={`/buy/${item.slug}`}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-stone-900 text-white dark:bg-white dark:text-stone-900 rounded-xl text-xs font-medium font-display hover:opacity-90 transition-opacity"
                  >
                    <span>View Home</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

export default function CompareResalePage() {
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex flex-col font-sans">
      <Suspense fallback={<div className="py-20 text-center">Loading comparison...</div>}>
        <CompareResaleContent />
      </Suspense>
    </div>
  );
}
