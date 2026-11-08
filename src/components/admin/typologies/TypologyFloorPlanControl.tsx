'use client';

import React, { useState, useRef, useMemo } from 'react';
import {
  FileImage,
  Upload,
  RefreshCw,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Star,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import { PublicProjectConfigurationDto, PublicProjectMediaDto } from '@/src/domain/projects/dto/projectDto';

export interface TypologyFloorPlanControlProps {
  projectId: string;
  projectName: string;
  configuration: PublicProjectConfigurationDto;
  projectMedia?: PublicProjectMediaDto[];
  onUpdated: () => void;
  onOpenViewer?: (configId: string) => void;
}

export function TypologyFloorPlanControl({
  projectId,
  projectName,
  configuration,
  projectMedia = [],
  onUpdated,
  onOpenViewer,
}: TypologyFloorPlanControlProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isManageMode, setIsManageMode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Authoritatively resolve ALL floor plans for this specific configuration
  const allFloorPlans = useMemo(() => {
    const list: any[] = [];
    const seenIds = new Set<string>();

    // 1. Direct floorPlans from configuration DTO
    if (configuration.floorPlans && configuration.floorPlans.length > 0) {
      for (const fp of configuration.floorPlans) {
        const idKey = fp.mediaId || fp.id;
        if (idKey && !seenIds.has(idKey)) {
          seenIds.add(idKey);
          list.push(fp);
        }
      }
    }

    // 2. Search projectMedia matching configurationId or floorPlanMediaId
    if (projectMedia.length > 0) {
      const configMedia = projectMedia.filter(
        (m) =>
          (m.configurationId === configuration.id ||
            (configuration.floorPlanMediaId &&
              (m.id === configuration.floorPlanMediaId || m.mediaId === configuration.floorPlanMediaId))) &&
          m.category === 'FLOOR_PLANS'
      );

      for (const m of configMedia) {
        const idKey = m.mediaId || m.id;
        if (idKey && !seenIds.has(idKey)) {
          seenIds.add(idKey);
          list.push(m);
        }
      }
    }

    // Determine primary floor plan ID
    const primaryId = configuration.floorPlanMediaId;

    // Sort: Primary first, then sortOrder ASC
    list.sort((a, b) => {
      const aId = a.mediaId || a.id;
      const bId = b.mediaId || b.id;
      const aIsPrimary = Boolean((primaryId && aId === primaryId) || a.isFeatured);
      const bIsPrimary = Boolean((primaryId && bId === primaryId) || b.isFeatured);

      if (aIsPrimary !== bIsPrimary) return aIsPrimary ? -1 : 1;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });

    return list;
  }, [configuration, projectMedia]);

  const visibleThumbnails = allFloorPlans.slice(0, 3);
  const overflowCount = allFloorPlans.length > 3 ? allFloorPlans.length - 3 : 0;

  const primaryPlan = allFloorPlans.find((fp) => {
    const fpId = fp.mediaId || fp.id;
    return (configuration.floorPlanMediaId && fpId === configuration.floorPlanMediaId) || fp.isFeatured;
  }) || allFloorPlans[0] || null;

  const handleFilesSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      await uploadFilesBatch(files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      await uploadFilesBatch(files);
    }
  };

  const uploadFilesBatch = async (files: File[]) => {
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.pdf'];
    const invalidFile = files.find((f) => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      return !validExtensions.includes(ext);
    });

    if (invalidFile) {
      setErrorMessage(`Invalid file format '${invalidFile.name}'. Allowed: ${validExtensions.join(', ')}`);
      return;
    }

    const oversizedFile = files.find((f) => f.size > 10 * 1024 * 1024);
    if (oversizedFile) {
      setErrorMessage(`File '${oversizedFile.name}' exceeds the 10MB limit.`);
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setUploadProgress(`Uploading ${files.length} floor plan layout${files.length > 1 ? 's' : ''}...`);

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      formData.append('category', 'FLOOR_PLANS');
      formData.append('altText', `${projectName} - ${configuration.name} Floor Plan`);
      formData.append('caption', `${configuration.name} Architectural Layout`);
      formData.append('watermarkMode', 'AUTO');

      setUploadProgress('Processing WebP/AVIF derivatives & watermarks...');

      const headers = getAdminHeaders() as Record<string, string>;
      delete headers['Content-Type'];

      const res = await fetch(
        `/api/projects/${projectId}/configurations/${configuration.id}/floor-plan`,
        {
          method: 'POST',
          headers,
          body: formData,
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload floor plan images.');
      }

      setSuccessMessage(`${files.length} floor plan${files.length > 1 ? 's' : ''} uploaded & added to gallery!`);
      setTimeout(() => setSuccessMessage(null), 3500);
      onUpdated();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error uploading floor plans.');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleSetPrimary = async (item: any) => {
    const mediaId = item.mediaId || item.id;
    setActiveActionId(mediaId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(
        `/api/projects/${projectId}/configurations/${configuration.id}/floor-plan`,
        {
          method: 'PATCH',
          headers: {
            ...getAdminHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'SET_PRIMARY',
            mediaId,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to set primary floor plan.');
      }

      setSuccessMessage('Primary floor plan updated.');
      setTimeout(() => setSuccessMessage(null), 3000);
      onUpdated();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error updating primary floor plan.');
    } finally {
      setActiveActionId(null);
    }
  };

  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= allFloorPlans.length) return;

    const itemsCopy = [...allFloorPlans];
    const temp = itemsCopy[index];
    itemsCopy[index] = itemsCopy[targetIdx];
    itemsCopy[targetIdx] = temp;

    const payloadItems = itemsCopy.map((item, i) => ({
      mediaId: item.mediaId || item.id,
      sortOrder: i,
    }));

    setActiveActionId('reorder');
    setErrorMessage(null);

    try {
      const res = await fetch(
        `/api/projects/${projectId}/configurations/${configuration.id}/floor-plan`,
        {
          method: 'PATCH',
          headers: {
            ...getAdminHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'REORDER',
            items: payloadItems,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to reorder floor plans.');
      }

      onUpdated();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error reordering floor plans.');
    } finally {
      setActiveActionId(null);
    }
  };

  const handleDeleteItem = async (item: any) => {
    const mediaId = item.mediaId || item.id;
    if (!confirm(`Remove floor plan layout from ${configuration.name}?`)) return;

    setActiveActionId(mediaId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(
        `/api/projects/${projectId}/configurations/${configuration.id}/floor-plan?mediaId=${mediaId}`,
        {
          method: 'DELETE',
          headers: getAdminHeaders(),
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove floor plan.');
      }

      setSuccessMessage('Floor plan removed.');
      setTimeout(() => setSuccessMessage(null), 3000);
      onUpdated();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error removing floor plan.');
    } finally {
      setActiveActionId(null);
    }
  };

  return (
    <div className="relative flex flex-col gap-1 w-full">
      {/* Hidden multi-file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.avif,.pdf"
        className="hidden"
        onChange={handleFilesSelect}
      />

      {/* Alerts */}
      {errorMessage && (
        <div className="flex items-start gap-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 p-2 rounded-lg">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="flex-1">
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 p-1.5 rounded-lg">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Compact Horizontal Layout (Height is strictly fixed to h-11 / 44px) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {allFloorPlans.length > 0 ? (
          <>
            {/* Floor Plan Thumbnails Row */}
            <div className="flex items-center gap-1.5">
              {visibleThumbnails.map((item, idx) => {
                const itemMediaId = item.mediaId || item.id;
                const isPrimaryItem =
                  (configuration.floorPlanMediaId && itemMediaId === configuration.floorPlanMediaId) ||
                  item.isFeatured ||
                  (idx === 0 && !configuration.floorPlanMediaId);

                return (
                  <div
                    key={itemMediaId || idx}
                    className={`relative group w-11 h-11 rounded-lg overflow-hidden border bg-neutral-50 shrink-0 cursor-pointer transition ${
                      isPrimaryItem
                        ? 'border-amber-400 ring-2 ring-amber-400/20'
                        : 'border-neutral-200 hover:border-indigo-400'
                    }`}
                    onClick={() => {
                      if (onOpenViewer) {
                        onOpenViewer(configuration.id);
                      } else {
                        setPreviewIndex(idx);
                      }
                    }}
                    title={item.altText || `${configuration.name} Layout ${idx + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.url}
                      alt={item.altText || `${configuration.name} layout ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />

                    {/* Primary Badge */}
                    {isPrimaryItem && (
                      <span className="absolute top-0.5 left-0.5 bg-amber-500 text-white p-0.5 rounded-md shadow-xs" title="Primary Floor Plan">
                        <Star className="h-2 w-2 fill-white text-white" />
                      </span>
                    )}

                    {/* Quick Action Hover Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity p-0.5">
                      <Eye className="h-3 w-3 text-white" />
                    </div>
                  </div>
                );
              })}

              {/* Overflow Count Tile */}
              {overflowCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenViewer) {
                      onOpenViewer(configuration.id);
                    } else {
                      setPreviewIndex(3);
                    }
                  }}
                  className="w-11 h-11 rounded-lg bg-neutral-100 hover:bg-neutral-200 border border-neutral-200/80 flex flex-col items-center justify-center transition shrink-0"
                  title="View all floor plan layouts"
                >
                  <span className="text-[11px] font-bold text-neutral-800 font-display">+{overflowCount}</span>
                  <span className="text-[8px] font-bold text-neutral-500 uppercase tracking-wider font-sans">More</span>
                </button>
              )}
            </div>

            {/* Action Buttons: Add & Manage */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="w-11 h-11 rounded-lg border-2 border-dashed border-neutral-200 hover:border-indigo-400 hover:bg-indigo-50/50 flex flex-col items-center justify-center text-neutral-400 hover:text-indigo-600 transition shrink-0 disabled:opacity-50"
                title="Add floor plan layout image"
              >
                {isUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsManageMode(!isManageMode)}
                className={`w-11 h-11 rounded-lg border flex flex-col items-center justify-center transition shrink-0 ${
                  isManageMode
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-600 shadow-sm'
                    : 'border-neutral-200 hover:border-neutral-300 bg-white text-neutral-500 hover:text-neutral-800'
                }`}
                title="Manage layouts"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        ) : (
          /* Empty Dropzone button (aligned with thumbnails height) */
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`flex items-center justify-center h-11 px-3 w-full max-w-[150px] border border-dashed rounded-lg transition cursor-pointer ${
              isDragOver
                ? 'border-indigo-500 bg-indigo-50/50 text-indigo-700'
                : 'border-neutral-300 hover:border-indigo-500 bg-neutral-50 hover:bg-indigo-50/30 text-neutral-600 hover:text-indigo-600'
            }`}
            onClick={() => !isUploading && fileInputRef.current?.click()}
          >
            {isUploading ? (
              <div className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 text-indigo-600 animate-spin" />
                <span className="text-[10px] font-bold uppercase tracking-wider font-display">Uploading</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider font-display">Add Plan</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expanded Manage Mode Dropdown (Desktop absolute / Mobile relative card) */}
      {allFloorPlans.length > 0 && isManageMode && (
        <div className="static md:absolute md:right-0 md:top-[48px] md:z-50 w-full md:w-80 bg-white rounded-xl border border-neutral-200 shadow-xl p-3 space-y-2.5 text-left transition-all duration-150">
          <div className="flex items-center justify-between pb-1.5 border-b border-neutral-100">
            <span className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider font-display">
              Manage Layouts ({allFloorPlans.length})
            </span>
            <button
              type="button"
              onClick={() => setIsManageMode(false)}
              className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-1">
            {allFloorPlans.map((item, idx) => {
              const itemMediaId = item.mediaId || item.id;
              const isPrimaryItem =
                (configuration.floorPlanMediaId && itemMediaId === configuration.floorPlanMediaId) ||
                item.isFeatured ||
                (idx === 0 && !configuration.floorPlanMediaId);
              const isBusy = activeActionId === itemMediaId;

              return (
                <div
                  key={itemMediaId || idx}
                  className={`flex items-center justify-between gap-2 p-1.5 rounded-lg border text-xs transition ${
                    isPrimaryItem
                      ? 'bg-amber-50/60 border-amber-200'
                      : 'bg-white border-neutral-100 hover:border-neutral-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div
                      onClick={() => {
                        if (onOpenViewer) {
                          onOpenViewer(configuration.id);
                        } else {
                          setPreviewIndex(idx);
                        }
                      }}
                      className="w-9 h-8 rounded overflow-hidden bg-neutral-200 shrink-0 cursor-pointer relative"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        {isPrimaryItem && (
                          <span className="text-[8px] font-bold text-amber-800 bg-amber-100 px-1 rounded uppercase font-display">
                            Primary
                          </span>
                        )}
                        <span className="text-[9px] text-neutral-400 font-mono">#{idx + 1}</span>
                      </div>
                      <p className="text-[11px] font-semibold text-neutral-700 truncate font-display">
                        {item.altText || `Layout ${idx + 1}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    {!isPrimaryItem && (
                      <button
                        type="button"
                        disabled={isBusy || isUploading}
                        onClick={() => handleSetPrimary(item)}
                        className="p-1 text-amber-500 hover:bg-amber-100/50 rounded transition disabled:opacity-50"
                        title="Set as Primary"
                      >
                        {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={idx === 0 || isUploading}
                      onClick={() => handleMoveOrder(idx, 'up')}
                      className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded disabled:opacity-30"
                      title="Move Up"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === allFloorPlans.length - 1 || isUploading}
                      onClick={() => handleMoveOrder(idx, 'down')}
                      className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded disabled:opacity-30"
                      title="Move Down"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>

                    <button
                      type="button"
                      disabled={isBusy || isUploading}
                      onClick={() => handleDeleteItem(item)}
                      className="p-1 text-rose-500 hover:bg-rose-50 rounded transition disabled:opacity-50"
                      title="Delete layout"
                    >
                      {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/50 rounded-lg transition font-display disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Layout Image</span>
          </button>
        </div>
      )}

      {/* Lightbox Preview Modal */}
      {previewIndex !== null && allFloorPlans[previewIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewIndex(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-neutral-50">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 font-display">
                  {projectName} — {configuration.name} Floor Plan ({previewIndex + 1} of {allFloorPlans.length})
                </h3>
                <p className="text-xs text-neutral-500 font-sans">
                  {allFloorPlans[previewIndex].altText || `${configuration.name} Layout`}
                </p>
              </div>
              <button
                onClick={() => setPreviewIndex(null)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Lightbox Main Image */}
            <div className="relative p-4 overflow-auto flex items-center justify-center bg-neutral-900/5 min-h-[350px]">
              {previewIndex > 0 && (
                <button
                  onClick={() => setPreviewIndex((prev) => (prev !== null ? prev - 1 : 0))}
                  className="absolute left-4 z-10 p-2 rounded-full bg-white/80 hover:bg-white text-neutral-800 shadow-md transition"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={allFloorPlans[previewIndex].url}
                alt={allFloorPlans[previewIndex].altText || `${configuration.name} floor plan`}
                className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm"
              />

              {previewIndex < allFloorPlans.length - 1 && (
                <button
                  onClick={() => setPreviewIndex((prev) => (prev !== null ? prev + 1 : 0))}
                  className="absolute right-4 z-10 p-2 rounded-full bg-white/80 hover:bg-white text-neutral-800 shadow-md transition"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-neutral-200 bg-neutral-50 text-xs text-neutral-500 font-sans">
              <span>Phase 08 Sharp WebP/AVIF Watermarked Asset</span>
              <button
                onClick={() => setPreviewIndex(null)}
                className="px-4 py-1.5 text-xs font-bold text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-100 font-display transition"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
