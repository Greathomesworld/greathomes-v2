'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bookmark, Trash2, ArrowUpRight, AlertCircle, Loader2, Building, Home, Key } from 'lucide-react';
import { SavedItemDto, SavedItemResourceType } from '@/src/domain/customer/entities';
import { EmptyStateIllustration } from '@/src/components/illustrations';

export default function SavedHomesPage() {
  const [items, setItems] = useState<SavedItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | SavedItemResourceType>('ALL');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchSaved = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/customer/saved');
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
    fetchSaved();
  }, []);

  const handleRemove = async (savedItemId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      setActionLoading(savedItemId);
      const res = await fetch(`/api/customer/saved?id=${encodeURIComponent(savedItemId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== savedItemId));
      }
    } finally {
      setActionLoading(null);
    }
  };

  const filteredItems = items.filter((item) => {
    if (filter === 'ALL') return true;
    return item.resourceType === filter;
  });

  const getResourceTypeIcon = (type: SavedItemResourceType) => {
    switch (type) {
      case 'PROJECT':
        return <Building className="w-3.5 h-3.5" />;
      case 'RESALE_LISTING':
        return <Home className="w-3.5 h-3.5" />;
      case 'RENTAL_LISTING':
        return <Key className="w-3.5 h-3.5" />;
    }
  };

  const getResourceTypeLabel = (type: SavedItemResourceType) => {
    switch (type) {
      case 'PROJECT':
        return 'Project';
      case 'RESALE_LISTING':
        return 'Resale Home';
      case 'RENTAL_LISTING':
        return 'Rental Home';
    }
  };

  return (
    <div>
      {/* Filter Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <div className="flex gap-2">
          {(['ALL', 'PROJECTS', 'BUY', 'RENT'] as const).map((type) => {
            const mappedType: 'ALL' | SavedItemResourceType =
              type === 'ALL'
                ? 'ALL'
                : type === 'PROJECTS'
                ? 'PROJECT'
                : type === 'BUY'
                ? 'RESALE_LISTING'
                : 'RENTAL_LISTING';

            const count =
              mappedType === 'ALL'
                ? items.length
                : items.filter((i) => i.resourceType === mappedType).length;

            const label =
              type === 'ALL'
                ? 'All Saved'
                : type === 'PROJECTS'
                ? 'Projects'
                : type === 'BUY'
                ? 'Resale'
                : 'Rentals';

            return (
              <button
                key={type}
                onClick={() => setFilter(mappedType)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors font-display cursor-pointer ${
                  filter === mappedType
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300'
                }`}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>

        <p className="text-xs text-slate-500 font-body">
          {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'} saved
        </p>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl my-8 overflow-hidden shadow-xs">
          <EmptyStateIllustration
            type="SAVED"
            headline="Nothing saved yet"
            supporting="Save homes and projects to find them here later."
            ctaText="Explore Homes"
            ctaHref="/projects"
            size="EMPTY"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => {
            const { resource } = item;
            return (
              <div
                key={item.id}
                className="group bg-white border border-slate-200 rounded-lg overflow-hidden shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  {/* Image / Thumbnail */}
                  <div className="relative aspect-16/10 bg-slate-100 overflow-hidden">
                    {resource.imageUrl ? (
                      <img
                        src={resource.imageUrl}
                        alt={resource.title}
                        className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        {getResourceTypeIcon(item.resourceType)}
                      </div>
                    )}

                    {/* Type Tag */}
                    <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded text-xs font-semibold text-slate-800 font-display flex items-center gap-1.5 shadow-xs">
                      {getResourceTypeIcon(item.resourceType)}
                      <span>{getResourceTypeLabel(item.resourceType)}</span>
                    </div>

                    {/* Unsave Button */}
                    <button
                      onClick={(e) => handleRemove(item.id, e)}
                      disabled={actionLoading === item.id}
                      aria-label="Remove from saved"
                      className="absolute top-3 right-3 p-1.5 bg-white/90 hover:bg-red-50 text-slate-600 hover:text-red-600 rounded-md transition-colors shadow-xs cursor-pointer"
                    >
                      {actionLoading === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    {/* Unavailable banner if applicable */}
                    {!resource.isAvailable && (
                      <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-center gap-1.5 font-body">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                        <span>{resource.unavailableReason || 'Listing is no longer active.'}</span>
                      </div>
                    )}

                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <h3 className="text-lg font-serif text-slate-900 group-hover:text-slate-700 transition-colors line-clamp-1">
                        {resource.title}
                      </h3>
                    </div>

                    {/* Location & Developer Metadata */}
                    <div className="text-xs text-slate-500 font-body mb-3">
                      {resource.locationName && <span>{resource.locationName}</span>}
                      {resource.locationName && resource.developerName && <span> · </span>}
                      {resource.developerName && <span>By {resource.developerName}</span>}
                    </div>

                    {/* Price and Status */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <div>
                        <span className="text-xs text-slate-400 font-body block">Price</span>
                        <span className="text-base font-bold text-slate-900 font-display">
                          {resource.priceDisplay || 'Price on Request'}
                        </span>
                      </div>

                      {resource.stageOrStatus && (
                        <span className="text-xs font-semibold text-slate-700 font-display uppercase tracking-wide">
                          {resource.stageOrStatus}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Action */}
                <div className="px-5 pb-5 pt-0">
                  <Link
                    href={resource.url}
                    className="w-full py-2 px-3 bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 font-display"
                  >
                    <span>View Details</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-500" />
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
