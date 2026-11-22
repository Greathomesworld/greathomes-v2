'use client';

import React from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Camera,
  RotateCcw,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  MAX_SUBMISSION_PHOTOS,
  MIN_SUBMISSION_PHOTOS,
  SUBMISSION_PHOTO_CATEGORIES,
  type PropertySubmissionPayload,
} from '@/src/domain/propertySubmission/validation';

export type StepPhotoItem = NonNullable<PropertySubmissionPayload['photos']>[number];

export interface StepUploadQueueItem {
  id: string;
  filename: string;
  sizeBytes: number;
  status: 'uploading' | 'error';
  progress: number;
  errorMessage?: string;
  previewUrl: string;
  file: File;
  category: string;
  caption: string;
}

export interface PhotographsStepProps {
  photos: StepPhotoItem[];
  photoUploadError: string | null;
  photoCategoryInput: string;
  onPhotoCategoryChange: (value: string) => void;
  photoCaptionInput: string;
  onPhotoCaptionChange: (value: string) => void;
  isDraggingPhotos: boolean;
  onDraggingChange: (dragging: boolean) => void;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDropPhotos: (e: React.DragEvent<HTMLDivElement>) => void;
  uploadQueue: StepUploadQueueItem[];
  onRetryUpload: (queueId: string) => void;
  onDismissUpload: (queueId: string) => void;
  isMutatingGallery: boolean;
  onSetFeaturedPhoto: (photoId: string) => void;
  onMovePhoto: (index: number, direction: 'UP' | 'DOWN') => void;
  onRemovePhoto: (photoId: string) => void;
}

export const PhotographsStep = React.memo(function PhotographsStep({
  photos,
  photoUploadError,
  photoCategoryInput,
  onPhotoCategoryChange,
  photoCaptionInput,
  onPhotoCaptionChange,
  isDraggingPhotos,
  onDraggingChange,
  onFileInputChange,
  onDropPhotos,
  uploadQueue,
  onRetryUpload,
  onDismissUpload,
  isMutatingGallery,
  onSetFeaturedPhoto,
  onMovePhoto,
  onRemovePhoto,
}: PhotographsStepProps) {
  const showEmptyState = photos.length === 0 && uploadQueue.length === 0;

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#E5E0D8] bg-[#FAFAF8] p-4 sm:p-5">
        <div>
          <p className="font-display text-sm font-bold text-[#111111] tabular-nums">
            Photograph Progress:{' '}
            <span
              className={
                photos.length >= MIN_SUBMISSION_PHOTOS ? 'text-[#218C5A]' : 'text-[#E85D3F]'
              }
            >
              {photos.length} of {MAX_SUBMISSION_PHOTOS} uploaded
            </span>{' '}
            <span className="text-xs font-normal text-[#6E6A65]">
              (minimum {MIN_SUBMISSION_PHOTOS} required)
            </span>
          </p>
          <p className="mt-0.5 text-xs text-[#6E6A65] font-body">
            Images only (JPEG, PNG, WebP, AVIF · max 10 MB each). Watermarking and WebP
            optimization are applied automatically on upload.
          </p>
        </div>

        <label
          className={`min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold text-white font-display whitespace-nowrap ${
            photos.length >= MAX_SUBMISSION_PHOTOS
              ? 'bg-[#8D8881] cursor-not-allowed opacity-70'
              : 'bg-[#111111] hover:bg-[#2A2A2A] cursor-pointer'
          }`}
        >
          <Upload className="h-4 w-4 shrink-0" />
          <span>Select Photographs</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            disabled={photos.length >= MAX_SUBMISSION_PHOTOS}
            onChange={onFileInputChange}
            className="hidden"
          />
        </label>
      </div>

      {photoUploadError && (
        <div
          role="alert"
          className="rounded-xl border border-[#E85D3F]/40 bg-[#FFF5F2] p-4 text-xs sm:text-sm text-[#E85D3F] font-body flex items-start gap-2.5"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{photoUploadError}</span>
        </div>
      )}

      {/* Room Category & Caption Tagging + Drag-and-Drop Dropzone */}
      <div className="rounded-xl border border-[#E5E0D8] bg-white p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-5">
            <label
              htmlFor="wizard-photo-category"
              className="block font-display text-[11px] font-bold uppercase tracking-wider text-[#555555] mb-1.5"
            >
              Room / View Label for Next Upload
            </label>
            <select
              id="wizard-photo-category"
              aria-label="Photograph category"
              value={photoCategoryInput}
              onChange={(e) => onPhotoCategoryChange(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-[#D9D5D0] bg-white px-3 py-2 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
            >
              {SUBMISSION_PHOTO_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-7">
            <label
              htmlFor="wizard-photo-caption"
              className="block font-display text-[11px] font-bold uppercase tracking-wider text-[#555555] mb-1.5"
            >
              Optional Caption
            </label>
            <input
              id="wizard-photo-caption"
              type="text"
              maxLength={200}
              placeholder="e.g., South-facing living room overlooking landscaped garden"
              value={photoCaptionInput}
              onChange={(e) => onPhotoCaptionChange(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-[#D9D5D0] bg-white px-3.5 py-2 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
            />
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isDraggingPhotos) onDraggingChange(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDraggingChange(false);
          }}
          onDrop={onDropPhotos}
          className={`rounded-xl border-2 border-dashed p-6 sm:p-8 text-center transition ${
            isDraggingPhotos
              ? 'border-[#E85D3F] bg-[#FFF5F2]'
              : 'border-[#D9D5D0] bg-[#FAFAF8]'
          }`}
        >
          <Camera className="mx-auto h-7 w-7 text-[#8D8881]" />
          <p className="mt-2 font-display text-sm font-semibold text-[#111111]">
            Drag and drop property photographs here
          </p>
          <p className="mt-1 text-xs text-[#6E6A65] font-body">
            or{' '}
            <label className="font-semibold text-[#E85D3F] hover:underline cursor-pointer">
              browse from your device
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                multiple
                disabled={photos.length >= MAX_SUBMISSION_PHOTOS}
                onChange={onFileInputChange}
                className="hidden"
              />
            </label>{' '}
            · JPEG, PNG, WebP, or AVIF up to 10 MB each
          </p>
        </div>
      </div>

      {/* Active / Failed Upload Queue */}
      {uploadQueue.length > 0 && (
        <div className="space-y-2.5">
          <p className="font-display text-xs font-bold uppercase tracking-wider text-[#555555]">
            Upload Queue
          </p>
          {uploadQueue.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-[#E5E0D8] bg-white p-3"
            >
              <img
                src={item.previewUrl}
                alt={item.filename}
                className="h-12 w-16 rounded-lg object-cover border border-[#E5E0D8] shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-[#111111] font-body">
                    {item.filename}
                  </p>
                  <span className="text-[11px] font-medium text-[#6E6A65] font-display tabular-nums shrink-0">
                    {item.status === 'uploading' ? `${item.progress}%` : 'Failed'}
                  </span>
                </div>
                {item.status === 'uploading' ? (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#F0EDE8]">
                    <div
                      className="h-full bg-[#E85D3F] transition-all"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-[#E85D3F] font-body">{item.errorMessage}</p>
                )}
              </div>
              {item.status === 'error' && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onRetryUpload(item.id)}
                    aria-label={`Retry uploading ${item.filename}`}
                    className="min-h-[44px] inline-flex items-center gap-1 rounded-lg border border-[#D9D5D0] px-3 py-1.5 text-xs font-semibold text-[#111111] hover:bg-[#F5F3F0] font-display cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Retry</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismissUpload(item.id)}
                    aria-label={`Dismiss ${item.filename}`}
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-[#6E6A65] hover:bg-[#F5F3F0] cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Server-Persisted Photo Gallery Grid */}
      {showEmptyState ? (
        <div className="rounded-2xl border border-dashed border-[#D9D5D0] bg-[#FAFAF8] p-10 text-center">
          <Camera className="mx-auto h-8 w-8 text-[#8D8881]" />
          <p className="mt-3 font-display text-sm font-semibold text-[#111111]">
            No property photographs uploaded yet
          </p>
          <p className="mt-1 text-xs text-[#6E6A65] font-body max-w-md mx-auto">
            Upload at least {MIN_SUBMISSION_PHOTOS} clear photographs of the interior, exterior, or
            plot so Great Homes can verify your property.
          </p>
        </div>
      ) : photos.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              className={`rounded-xl border bg-white overflow-hidden flex flex-col justify-between ${
                photo.isFeatured
                  ? 'border-[#111111] ring-2 ring-[#111111]/10'
                  : 'border-[#E5E0D8]'
              }`}
            >
              <div className="relative h-44 w-full bg-[#F4F1EA] flex items-center justify-center overflow-hidden">
                <img
                  src={photo.url}
                  alt={photo.caption || `Property photograph ${index + 1}`}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
                <div className="absolute top-2 left-2 rounded-md bg-black/75 px-2 py-0.5 text-[11px] font-semibold text-white font-display tabular-nums">
                  #{index + 1} · {photo.category}
                </div>
                {photo.isFeatured && (
                  <div className="absolute top-2 right-2 rounded-md bg-[#E85D3F] px-2 py-0.5 text-[11px] font-semibold text-white font-display">
                    Cover Photo
                  </div>
                )}
              </div>

              <div className="p-3 space-y-2">
                <p className="truncate text-xs font-medium text-[#111111] font-body">
                  {photo.caption || photo.filename || `Photograph ${index + 1}`}
                </p>

                <div className="flex items-center justify-between gap-1 pt-2 border-t border-[#F0EDE8]">
                  <button
                    type="button"
                    onClick={() => onSetFeaturedPhoto(photo.id)}
                    disabled={photo.isFeatured || isMutatingGallery}
                    className={`min-h-[44px] inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold font-display cursor-pointer ${
                      photo.isFeatured
                        ? 'text-[#218C5A] cursor-default'
                        : 'text-[#555555] hover:bg-[#F5F3F0] hover:text-[#111111] disabled:opacity-40'
                    }`}
                  >
                    <Star className="h-3.5 w-3.5" />
                    <span>{photo.isFeatured ? 'Featured' : 'Set Cover'}</span>
                  </button>

                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => onMovePhoto(index, 'UP')}
                      disabled={index === 0 || isMutatingGallery}
                      aria-label="Move photo earlier"
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-[#F5F3F0] disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowUp className="h-4 w-4 text-[#555555]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMovePhoto(index, 'DOWN')}
                      disabled={index === photos.length - 1 || isMutatingGallery}
                      aria-label="Move photo later"
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-[#F5F3F0] disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowDown className="h-4 w-4 text-[#555555]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemovePhoto(photo.id)}
                      disabled={isMutatingGallery}
                      aria-label="Remove photograph"
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-40 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
});
