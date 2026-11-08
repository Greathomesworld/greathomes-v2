'use client';

import React, { useState, useRef, useCallback } from 'react';
import {
  UploadCloud,
  FileImage,
  AlertCircle,
  X,
  CheckCircle2,
  RefreshCw,
  Eye,
  Loader2,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { getAdminHeaders } from '@/src/lib/adminAuth';

export interface UploadQueueItem {
  id: string;
  file: File;
  previewUrl: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  status: 'PENDING' | 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED';
  progress: number;
  errorMessage?: string;
  resultAsset?: any;
}

export interface MediaDropzoneProps {
  entityType?: 'PROJECT' | 'DEVELOPER' | 'RESALE' | 'RENTAL' | 'GENERAL';
  entityId?: string;
  category?: string;
  configurationId?: string;
  replaceAssetId?: string;
  multiple?: boolean;
  maxFiles?: number;
  maxSizeBytes?: number;
  watermarkMode?: 'AUTO' | 'ON' | 'OFF';
  onUploadSuccess?: (asset: any) => void;
  onBatchComplete?: (assets: any[]) => void;
  className?: string;
  title?: string;
  subtitle?: string;
  showQueue?: boolean;
}

export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.pdf'];
export const ALLOWED_LOGO_EXTENSIONS = ['.svg', '.png', '.webp', '.jpg', '.jpeg'];
export const MAX_DEFAULT_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function MediaDropzone({
  entityType = 'PROJECT',
  entityId = 'general',
  category = 'EXTERIOR',
  configurationId,
  replaceAssetId,
  multiple = true,
  maxFiles = 20,
  maxSizeBytes = MAX_DEFAULT_FILE_SIZE,
  watermarkMode = 'AUTO',
  onUploadSuccess,
  onBatchComplete,
  className = '',
  title = 'Drag & Drop Media',
  subtitle = 'Drop files here or click to browse from device',
  showQueue = true,
}: MediaDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const normalizedCategory = (category || '').toUpperCase().trim();
  const normalizedEntity = (entityType || '').toUpperCase().trim();
  const isLogoOrIdentity =
    normalizedEntity === 'DEVELOPER' ||
    normalizedCategory === 'LOGO' ||
    normalizedCategory === 'BRAND' ||
    normalizedCategory === 'OFFICE' ||
    normalizedCategory === 'EDITORIAL';
  const allowSvg =
    normalizedEntity === 'DEVELOPER' ||
    normalizedCategory === 'LOGO' ||
    normalizedCategory === 'BRAND';

  // Validate a single file client-side
  const validateFile = (file: File): { valid: boolean; error?: string } => {
    if (file.size <= 0) {
      return { valid: false, error: 'File is empty (0 bytes).' };
    }
    if (file.size > maxSizeBytes) {
      return {
        valid: false,
        error: `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit of ${(maxSizeBytes / (1024 * 1024)).toFixed(0)}MB.`,
      };
    }
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.svg')) {
      if (!allowSvg) {
        return {
          valid: false,
          error: 'SVG files are only supported for Developer, Builder, or Brand Logo uploads.',
        };
      }
      return { valid: true };
    }
    const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!hasValidExt) {
      return {
        valid: false,
        error: allowSvg
          ? 'Unsupported file type. Use SVG, PNG, WEBP, or JPG for logos.'
          : 'Unsupported file type. Use JPG, PNG, WEBP, AVIF, or PDF.',
      };
    }
    return { valid: true };
  };

  // Upload an individual queue item
  const uploadSingleItem = async (item: UploadQueueItem): Promise<any> => {
    setQueue((prev) =>
      prev.map((q) => (q.id === item.id ? { ...q, status: 'UPLOADING', progress: 30 } : q))
    );

    const formData = new FormData();
    formData.append('file', item.file);
    formData.append('category', category);
    formData.append('entityType', entityType);
    formData.append('entityId', entityId);
    if (configurationId) {
      formData.append('configurationId', configurationId);
    }
    formData.append('watermarkMode', isLogoOrIdentity ? 'OFF' : watermarkMode);

    try {
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, progress: 70, status: 'PROCESSING' } : q))
      );

      const headers = getAdminHeaders();
      delete (headers as any)['Content-Type'];

      const targetEndpoint = replaceAssetId
        ? `/api/admin/media/${replaceAssetId}/replace`
        : '/api/admin/media/upload';

      const res = await fetch(targetEndpoint, {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Upload failed');
      }

      const asset = data.data || data.media;

      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? { ...q, status: 'READY', progress: 100, resultAsset: asset }
            : q
        )
      );

      if (onUploadSuccess) {
        onUploadSuccess(asset);
      }

      return asset;
    } catch (err: any) {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? { ...q, status: 'FAILED', progress: 0, errorMessage: err.message || 'Upload error' }
            : q
        )
      );
      return null;
    }
  };

  // Handle incoming files from drop or file picker
  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const incoming = Array.from(fileList).slice(0, maxFiles);
      if (incoming.length === 0) return;

      const newItems: UploadQueueItem[] = incoming.map((file) => {
        const val = validateFile(file);
        const isImg =
          file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.svg');
        const previewUrl = isImg ? URL.createObjectURL(file) : '';

        return {
          id: `upload_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          file,
          previewUrl,
          filename: file.name,
          sizeBytes: file.size,
          mimeType: file.type || (file.name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : ''),
          status: val.valid ? 'PENDING' : 'FAILED',
          progress: 0,
          errorMessage: val.error,
        };
      });

      setQueue((prev) => [...prev, ...newItems]);
      setIsUploading(true);

      const successfulAssets: any[] = [];

      for (const item of newItems) {
        if (item.status === 'PENDING') {
          const res = await uploadSingleItem(item);
          if (res) successfulAssets.push(res);
        }
      }

      setIsUploading(false);

      if (onBatchComplete && successfulAssets.length > 0) {
        onBatchComplete(successfulAssets);
      }
    },
    [category, entityType, entityId, watermarkMode, maxFiles, maxSizeBytes, replaceAssetId]
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleTriggerClick = () => {
    fileInputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleTriggerClick();
    }
  };

  const handleRemove = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setQueue((prev) => {
      const item = prev.find((q) => q.id === id);
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter((q) => q.id !== id);
    });
  };

  const handleRetry = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const item = queue.find((q) => q.id === id);
    if (!item) return;
    const res = await uploadSingleItem(item);
    if (res && onBatchComplete) {
      onBatchComplete([res]);
    }
  };

  const acceptAttribute = allowSvg
    ? 'image/svg+xml,image/png,image/webp,image/jpeg,.svg'
    : 'image/jpeg,image/png,image/webp,image/avif,application/pdf';

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Universal Drag & Drop Zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`${title}. ${subtitle}`}
        onClick={handleTriggerClick}
        onKeyDown={handleKeyDown}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative border-2 border-dashed rounded-xl p-6 md:p-8 text-center transition-all cursor-pointer outline-none focus:ring-2 focus:ring-[#FF5E00] focus:border-[#FF5E00] select-none ${
          isDragOver
            ? 'border-[#FF5E00] bg-orange-50/60 dark:bg-orange-950/20 scale-[1.005]'
            : 'border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-100/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple={multiple}
          accept={acceptAttribute}
          onChange={(e) => {
            if (e.target.files) {
              handleFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform ${
              isDragOver
                ? 'bg-[#FF5E00] text-white scale-110 shadow-lg shadow-orange-500/30'
                : 'bg-white dark:bg-slate-800 text-[#FF5E00] border border-slate-200 dark:border-slate-700 shadow-sm'
            }`}
          >
            <UploadCloud className="w-7 h-7" />
          </div>

          <div>
            <h4 className="font-display font-bold text-base md:text-lg text-slate-900 dark:text-white">
              {title}
            </h4>
            <p className="font-body text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
              {subtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {allowSvg
                ? 'SVG • PNG • WEBP • JPG'
                : 'JPG • PNG • WEBP • AVIF • PDF'}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-body font-medium bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              Max {(maxSizeBytes / (1024 * 1024)).toFixed(0)}MB
            </span>
            {isLogoOrIdentity ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-body font-medium bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="w-3 h-3" /> Unwatermarked Brand Asset
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-body font-medium bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400">
                <Sparkles className="w-3 h-3" /> Great Homes Watermark (WebP)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Upload Queue Section */}
      {showQueue && queue.length > 0 && (
        <div className="space-y-2 mt-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400 px-1">
            <span>
              Upload Queue ({queue.filter((q) => q.status === 'READY').length} / {queue.length}{' '}
              completed)
            </span>
            {queue.some((q) => q.status === 'READY' || q.status === 'FAILED') && (
              <button
                type="button"
                onClick={() =>
                  setQueue((prev) =>
                    prev.filter((q) => q.status === 'UPLOADING' || q.status === 'PROCESSING')
                  )
                }
                className="text-[#FF5E00] hover:underline"
              >
                Clear Finished
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
            {queue.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs"
              >
                {/* Thumbnail Preview */}
                <div className="relative w-12 h-12 rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                  {item.previewUrl ? (
                    <img
                      src={item.previewUrl}
                      alt={item.filename}
                      className={`w-full h-full ${
                        item.filename.toLowerCase().endsWith('.svg') || isLogoOrIdentity
                          ? 'object-contain p-1'
                          : 'object-cover'
                      }`}
                    />
                  ) : (
                    <FileImage className="w-6 h-6 text-slate-400" />
                  )}
                  {item.status === 'PROCESSING' && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    </div>
                  )}
                </div>

                {/* Details & Progress */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="font-body text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                      {item.filename}
                    </p>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                      {(item.sizeBytes / 1024).toFixed(0)} KB
                    </span>
                  </div>

                  {/* Status Bar */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          item.status === 'READY'
                            ? 'bg-emerald-500 w-full'
                            : item.status === 'FAILED'
                            ? 'bg-rose-500 w-full'
                            : 'bg-[#FF5E00]'
                        }`}
                        style={{
                          width:
                            item.status === 'READY' || item.status === 'FAILED'
                              ? '100%'
                              : `${item.progress}%`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-body uppercase font-bold tracking-wider shrink-0">
                      {item.status === 'READY' && (
                        <span className="text-emerald-600 flex items-center gap-0.5">
                          <CheckCircle2 className="w-3 h-3" /> Ready
                        </span>
                      )}
                      {item.status === 'PROCESSING' && (
                        <span className="text-amber-600 flex items-center gap-0.5">
                          <Loader2 className="w-3 h-3 animate-spin" /> Processing
                        </span>
                      )}
                      {item.status === 'UPLOADING' && (
                        <span className="text-blue-600">{item.progress}%</span>
                      )}
                      {item.status === 'PENDING' && (
                        <span className="text-slate-400">Waiting</span>
                      )}
                      {item.status === 'FAILED' && (
                        <span className="text-rose-600 flex items-center gap-0.5">
                          <AlertCircle className="w-3 h-3" /> Failed
                        </span>
                      )}
                    </span>
                  </div>

                  {item.errorMessage && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 truncate">
                      {item.errorMessage}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {item.status === 'FAILED' && (
                    <button
                      type="button"
                      onClick={(e) => handleRetry(item.id, e)}
                      title="Retry upload"
                      className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {item.status === 'READY' && item.resultAsset?.url && (
                    <a
                      href={item.resultAsset.url}
                      target="_blank"
                      rel="noreferrer"
                      title="View public derivative"
                      className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-white rounded"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleRemove(item.id, e)}
                    title="Remove item"
                    className="p-1 text-slate-400 hover:text-rose-600 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
