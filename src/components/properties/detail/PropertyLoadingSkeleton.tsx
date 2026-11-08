import React from 'react';

export function PropertyLoadingSkeleton() {
  return (
    <main className="min-h-screen bg-[#FAFAF8] pb-24 lg:pb-16 animate-pulse">
      {/* Breadcrumb Bar Skeleton */}
      <div className="border-b border-[#E6E2DC] bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="h-4 w-56 bg-[#E6E2DC]/70 rounded" />
          <div className="flex items-center gap-2">
            <div className="h-7 w-16 bg-[#E6E2DC]/70 rounded-lg" />
            <div className="h-7 w-16 bg-[#E6E2DC]/70 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Left 8 Columns */}
          <div className="lg:col-span-8 space-y-5">
            {/* Gallery Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
              <div className="md:col-span-9 h-[260px] sm:h-[380px] lg:h-[420px] rounded-2xl bg-[#E6E2DC]/70" />
              <div className="hidden md:flex md:col-span-3 flex-col gap-3.5 h-[380px] lg:h-[420px]">
                <div className="flex-1 rounded-2xl bg-[#E6E2DC]/70" />
                <div className="flex-1 rounded-2xl bg-[#E6E2DC]/70" />
                <div className="flex-1 rounded-2xl bg-[#E6E2DC]/70" />
              </div>
            </div>

            {/* Title & Location Skeleton */}
            <div className="space-y-2.5 pt-1">
              <div className="h-8 w-3/4 bg-[#E6E2DC]/80 rounded-lg" />
              <div className="h-4 w-1/2 bg-[#E6E2DC]/60 rounded" />
            </div>

            {/* Quick Highlights Strip Skeleton */}
            <div className="h-16 w-full rounded-2xl bg-white border border-[#E6E2DC]" />

            {/* Section Tabs Skeleton */}
            <div className="h-10 w-full border-b border-[#E6E2DC] flex items-center gap-6">
              <div className="h-4 w-20 bg-[#E6E2DC]/70 rounded" />
              <div className="h-4 w-24 bg-[#E6E2DC]/70 rounded" />
              <div className="h-4 w-20 bg-[#E6E2DC]/70 rounded" />
              <div className="h-4 w-32 bg-[#E6E2DC]/70 rounded" />
            </div>

            {/* Overview Card Skeleton */}
            <div className="h-48 w-full rounded-2xl bg-white border border-[#E6E2DC]" />

            {/* Specifications Card Skeleton */}
            <div className="h-64 w-full rounded-2xl bg-white border border-[#E6E2DC]" />
          </div>

          {/* Right 4 Columns Sidebar Skeleton */}
          <div className="hidden lg:block lg:col-span-4 space-y-4">
            <div className="h-80 rounded-2xl bg-white border border-[#E6E2DC]" />
            <div className="h-36 rounded-2xl bg-[#F2FAF6] border border-[#218C5A]/20" />
            <div className="h-20 rounded-2xl bg-white border border-[#E6E2DC]" />
          </div>
        </div>
      </div>
    </main>
  );
}
