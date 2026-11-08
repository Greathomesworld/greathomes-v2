'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Check,
  Image as ImageIcon,
  Loader2,
  FileText,
  Filter,
} from 'lucide-react';
import { getAdminHeaders } from '@/src/lib/adminAuth';

export interface MediaLibraryPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (asset: any) => void;
  entityType?: string;
  category?: string;
  title?: string;
}

export function MediaLibraryPicker({
  isOpen,
  onClose,
  onSelect,
  entityType = 'ALL',
  category = 'ALL',
  title = 'Select Media from Library',
}: MediaLibraryPickerProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(category);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function fetchMedia() {
      setLoading(true);
      try {
        const headers = getAdminHeaders();
        const params = new URLSearchParams();
        if (entityType && entityType !== 'ALL') params.set('entityType', entityType);
        if (selectedCategory && selectedCategory !== 'ALL') params.set('category', selectedCategory);
        if (search) params.set('search', search);

        const res = await fetch(`/api/admin/media?${params.toString()}`, { headers });
        const data = await res.json();
        if (isMounted && data.success) {
          setItems(data.data || data.items || []);
        }
      } catch (err) {
        console.error('Failed to load media in picker:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchMedia();
    return () => {
      isMounted = false;
    };
  }, [isOpen, entityType, selectedCategory, search]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    const selected = items.find((i) => i.id === selectedId);
    if (selected) {
      onSelect(selected);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-[#FF5E00]" />
            <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters & Search */}
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-wrap gap-2.5 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search filename or caption..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-[#FF5E00]"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="py-1.5 px-3 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            <option value="ALL">All Categories</option>
            <option value="FLOOR_PLANS">Floor Plans</option>
            <option value="MASTER_PLAN">Master Plan</option>
            <option value="EXTERIOR">Exterior</option>
            <option value="INTERIOR">Interior</option>
            <option value="AMENITIES">Amenities</option>
            <option value="LOGO">Logo</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        {/* Grid Body */}
        <div className="flex-1 overflow-y-auto p-6 min-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 space-y-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-[#FF5E00]" />
              <p className="text-xs">Loading media assets...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center text-slate-400">
              <p className="text-sm">No media assets found matching filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {items.map((item) => {
                const isSelected = selectedId === item.id;
                const isPdf = item.mimeType === 'application/pdf' || item.url?.endsWith('.pdf');

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`relative rounded-xl overflow-hidden border cursor-pointer transition-all aspect-4/3 flex items-center justify-center bg-slate-100 dark:bg-slate-800 ${
                      isSelected
                        ? 'border-[#FF5E00] ring-2 ring-[#FF5E00] scale-[1.02]'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'
                    }`}
                  >
                    {isPdf ? (
                      <div className="flex flex-col items-center justify-center p-2 text-center">
                        <FileText className="w-8 h-8 text-rose-500 mb-1" />
                        <span className="text-[10px] font-mono text-slate-600 dark:text-slate-300 truncate max-w-[100px]">
                          {item.filename || 'PDF'}
                        </span>
                      </div>
                    ) : (
                      <img
                        src={item.thumbnailUrl || item.url}
                        alt={item.filename || 'Media'}
                        className={`w-full h-full ${
                          item.category === 'LOGO' ||
                          item.mimeType === 'image/svg+xml' ||
                          item.url?.endsWith('.svg')
                            ? 'object-contain p-3 bg-white'
                            : 'object-cover'
                        }`}
                        loading="lazy"
                      />
                    )}

                    {isSelected && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="w-7 h-7 rounded-full bg-[#FF5E00] text-white flex items-center justify-center shadow-md">
                          <Check className="w-4 h-4" />
                        </div>
                      </div>
                    )}

                    <div className="absolute bottom-0 inset-x-0 bg-black/60 backdrop-blur-xs p-1 text-[10px] text-white truncate px-1.5">
                      {item.caption || item.filename || item.category}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <span className="text-xs text-slate-500">
            {selectedId ? '1 asset selected' : 'Select an asset to continue'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selectedId}
              onClick={handleConfirm}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#FF5E00] hover:bg-[#E05300] text-white disabled:opacity-40 transition-colors"
            >
              Select Asset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
