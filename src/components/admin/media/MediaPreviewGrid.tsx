'use client';

import React, { useState } from 'react';
import {
  Star,
  Trash2,
  Edit2,
  RefreshCw,
  MoveUp,
  MoveDown,
  ExternalLink,
  Sparkles,
  Eye,
  Check,
  FileText,
  Play,
  Video,
} from 'lucide-react';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import { parseVideoUrl, getVideoThumbnail } from '@/src/lib/videoUtils';

export interface MediaGridItem {
  id: string;
  url: string;
  mediaType?: string;
  originalUrl?: string;
  thumbnailUrl?: string;
  webpUrl?: string;
  avifUrl?: string;
  watermarkedUrl?: string;
  watermarkApplied?: boolean;
  category?: string;
  altText?: string | null;
  caption?: string | null;
  sortOrder: number;
  isFeatured: boolean;
  filename?: string;
  mimeType?: string;
}

export interface MediaPreviewGridProps {
  items: MediaGridItem[];
  onItemsChange?: (items: MediaGridItem[]) => void;
  onDeleteItem?: (id: string) => void;
  onEditItem?: (item: MediaGridItem) => void;
  onReplaceItem?: (item: MediaGridItem) => void;
  showWatermarkToggle?: boolean;
  readonly?: boolean;
}

export function MediaPreviewGrid({
  items,
  onItemsChange,
  onDeleteItem,
  onEditItem,
  onReplaceItem,
  showWatermarkToggle = true,
  readonly = false,
}: MediaPreviewGridProps) {
  const [viewWatermarked, setViewWatermarked] = useState(true);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);

  // Toggle Featured/Hero image
  const handleToggleFeatured = async (id: string) => {
    if (readonly) return;
    setLoadingActionId(id);
    try {
      const headers = getAdminHeaders();
      const res = await fetch(`/api/admin/media/${id}/featured`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ isFeatured: true }),
      });
      if (res.ok) {
        const updated = items.map((item) => ({
          ...item,
          isFeatured: item.id === id,
        }));
        if (onItemsChange) onItemsChange(updated);
      }
    } catch (err) {
      console.error('Failed to set featured image:', err);
    } finally {
      setLoadingActionId(null);
    }
  };

  // Move item up or down in sort order
  const handleMove = async (index: number, direction: 'UP' | 'DOWN') => {
    if (readonly) return;
    const newIndex = direction === 'UP' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= items.length) return;

    const copy = [...items];
    const temp = copy[index];
    copy[index] = copy[newIndex];
    copy[newIndex] = temp;

    // Re-assign sort orders
    const reordered = copy.map((item, idx) => ({ ...item, sortOrder: idx }));

    if (onItemsChange) {
      onItemsChange(reordered);
    }

    try {
      const headers = getAdminHeaders();
      await fetch('/api/admin/media/reorder', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          items: reordered.map((r) => ({ id: r.id, sortOrder: r.sortOrder })),
        }),
      });
    } catch (err) {
      console.error('Failed to persist reorder:', err);
    }
  };

  if (items.length === 0) {
    return (
      <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/20">
        <p className="text-sm font-body text-slate-500">No media assets in gallery yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showWatermarkToggle && (
        <div className="flex items-center justify-between text-xs px-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-600 dark:text-slate-400">View Mode:</span>
            <div className="inline-flex rounded-lg p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setViewWatermarked(true)}
                className={`px-2.5 py-1 rounded-md font-body text-xs font-medium transition-colors ${
                  viewWatermarked
                    ? 'bg-white dark:bg-slate-900 text-[#FF5E00] shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Public Preview (Watermarked)
              </button>
              <button
                type="button"
                onClick={() => setViewWatermarked(false)}
                className={`px-2.5 py-1 rounded-md font-body text-xs font-medium transition-colors ${
                  !viewWatermarked
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Original Source
              </button>
            </div>
          </div>
          <span className="text-slate-400 text-xs font-mono">
            {items.length} {items.length === 1 ? 'asset' : 'assets'}
          </span>
        </div>
      )}

      {/* Grid of Media Assets */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
        {items.map((item, index) => {
          const parsedVideo = parseVideoUrl(item.url);
          const isVideo =
            item.mediaType === 'VIDEO' ||
            item.category === 'WALKTHROUGH' ||
            parsedVideo.isValid;
          const isPdf = !isVideo && (item.mimeType === 'application/pdf' || item.url.endsWith('.pdf'));
          const videoThumb = isVideo ? (item.thumbnailUrl || getVideoThumbnail(parsedVideo)) : null;
          const displayUrl =
            viewWatermarked && item.watermarkedUrl ? item.watermarkedUrl : item.url;

          return (
            <div
              key={item.id}
              className={`group relative rounded-xl overflow-hidden border bg-white dark:bg-slate-900 transition-all ${
                item.category === 'WALKTHROUGH' || item.mediaType === 'VIDEO'
                  ? 'border-[#E5484D] ring-2 ring-red-500/20 shadow-sm'
                  : item.isFeatured
                  ? 'border-[#FF5E00] ring-2 ring-orange-500/20 shadow-md'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {/* Media Thumbnail Container */}
              <div className="relative aspect-4/3 bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                {isVideo ? (
                  <div className="relative w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-950 text-white overflow-hidden">
                    {videoThumb ? (
                      <>
                        <img
                          src={videoThumb}
                          alt={item.altText || 'Video thumbnail'}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-80"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                          <div className="w-10 h-10 rounded-full bg-[#E5484D] text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                            <Play className="w-5 h-5 fill-white ml-0.5" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-3 text-center">
                        <div className="w-10 h-10 rounded-full bg-[#E5484D] text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform mb-1.5">
                          <Play className="w-5 h-5 fill-white ml-0.5" />
                        </div>
                        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-neutral-300">
                          {parsedVideo.providerLabel || 'Video'}
                        </span>
                      </div>
                    )}
                  </div>
                ) : isPdf ? (
                  <div className="flex flex-col items-center justify-center p-3 text-center">
                    <FileText className="w-8 h-8 text-rose-500 mb-1" />
                    <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400 truncate max-w-[120px]">
                      {item.filename || 'PDF Document'}
                    </span>
                  </div>
                ) : (
                  <img
                    src={displayUrl}
                    alt={item.altText || item.filename || 'Gallery image'}
                    className={`w-full h-full group-hover:scale-105 transition-transform duration-300 ${
                      item.category === 'LOGO' ||
                      item.mimeType === 'image/svg+xml' ||
                      displayUrl?.endsWith('.svg')
                        ? 'object-contain p-3 bg-white'
                        : 'object-cover'
                    }`}
                    loading="lazy"
                  />
                )}

                {/* Badges: Walkthrough Video / Featured / Category */}
                {item.category === 'WALKTHROUGH' || item.mediaType === 'VIDEO' ? (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-[#E5484D] text-white shadow-xs z-10 font-display">
                    <Video className="w-3 h-3" /> Walkthrough Video
                  </span>
                ) : item.isFeatured ? (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FF5E00] text-white shadow-xs">
                    <Star className="w-3 h-3 fill-white" /> Hero Image
                  </span>
                ) : item.category ? (
                  <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-black/60 text-white backdrop-blur-xs">
                    {item.category}
                  </span>
                ) : null}

                {/* Provider badge on bottom-left for video */}
                {isVideo && (
                  <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-black/75 text-neutral-200 backdrop-blur-xs z-10">
                    {parsedVideo.providerLabel || 'Video'}
                  </span>
                )}

                {/* Watermark Applied Indicator (for images only) */}
                {!isVideo && item.watermarkApplied && viewWatermarked && (
                  <span className="absolute bottom-2 right-2 p-1 rounded bg-black/50 text-white text-[9px] font-mono backdrop-blur-xs flex items-center gap-0.5">
                    <Sparkles className="w-2.5 h-2.5 text-orange-400" /> WM
                  </span>
                )}

                {/* Hover Action Overlay */}
                {!readonly && (
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 p-2 z-20">
                    {!isVideo && (
                      <button
                        type="button"
                        onClick={() => handleToggleFeatured(item.id)}
                        disabled={loadingActionId === item.id}
                        title={item.isFeatured ? 'Hero Image' : 'Set as Hero Image'}
                        className={`p-1.5 rounded-lg transition-colors ${
                          item.isFeatured
                            ? 'bg-[#FF5E00] text-white'
                            : 'bg-white/80 hover:bg-white text-slate-800'
                        }`}
                      >
                        <Star className={`w-4 h-4 ${item.isFeatured ? 'fill-white' : ''}`} />
                      </button>
                    )}

                    {onEditItem && (
                      <button
                        type="button"
                        onClick={() => onEditItem(item)}
                        title="Edit Metadata"
                        className="p-1.5 rounded-lg bg-white/80 hover:bg-white text-slate-800 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}

                    {!isVideo && onReplaceItem && (
                      <button
                        type="button"
                        onClick={() => onReplaceItem(item)}
                        title="Replace Asset"
                        className="p-1.5 rounded-lg bg-white/80 hover:bg-white text-slate-800 transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}

                    <a
                      href={displayUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={isVideo ? 'Open video link' : 'Open full size'}
                      className="p-1.5 rounded-lg bg-white/80 hover:bg-white text-slate-800 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>

                    {onDeleteItem && (
                      <button
                        type="button"
                        onClick={() => onDeleteItem(item.id)}
                        title="Delete Media"
                        className="p-1.5 rounded-lg bg-white/80 hover:bg-rose-600 hover:text-white text-rose-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Footer Details & Ordering Controls */}
              <div className="p-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span className="truncate max-w-[100px]" title={item.altText || item.caption || item.filename || ''}>
                  {item.altText || item.caption || item.filename || (isVideo ? 'Walkthrough Video' : `Image ${index + 1}`)}
                </span>

                {!readonly && (
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMove(index, 'UP')}
                      className="p-1 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 rounded"
                      title="Move Earlier"
                    >
                      <MoveUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={index === items.length - 1}
                      onClick={() => handleMove(index, 'DOWN')}
                      className="p-1 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 rounded"
                      title="Move Later"
                    >
                      <MoveDown className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
