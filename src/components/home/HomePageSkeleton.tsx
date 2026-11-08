import React from 'react';

export function HomePageSkeleton() {
  return (
    <div className="space-y-16 py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto animate-pulse">
      {/* 1. Hero Skeleton */}
      <div className="h-[440px] md:h-[520px] w-full bg-neutral-200/80 rounded-2xl relative overflow-hidden flex flex-col justify-end p-8 sm:p-12">
        <div className="space-y-4 max-w-2xl">
          <div className="h-4 w-32 bg-neutral-300 rounded" />
          <div className="h-12 w-3/4 bg-neutral-300 rounded" />
          <div className="h-4 w-1/2 bg-neutral-300 rounded" />
          <div className="h-14 w-full bg-neutral-300/90 rounded-xl mt-6" />
        </div>
      </div>

      {/* 2. Primary Pillars Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 bg-neutral-200/70 rounded-xl p-4 flex flex-col justify-between">
            <div className="h-4 w-24 bg-neutral-300 rounded" />
            <div className="h-3 w-32 bg-neutral-300/80 rounded" />
          </div>
        ))}
      </div>

      {/* 3. Project Spotlight Skeleton */}
      <div className="bg-[#111111] rounded-2xl p-8 md:p-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-5 space-y-5">
          <div className="h-5 w-36 bg-neutral-800 rounded" />
          <div className="h-10 w-4/5 bg-neutral-700 rounded" />
          <div className="h-4 w-2/3 bg-neutral-800 rounded" />
          <div className="flex gap-2">
            <div className="h-6 w-20 bg-neutral-800 rounded" />
            <div className="h-6 w-28 bg-neutral-800 rounded" />
          </div>
          <div className="h-8 w-40 bg-neutral-800 rounded mt-4" />
          <div className="h-12 w-48 bg-neutral-700 rounded mt-2" />
        </div>
        <div className="lg:col-span-7">
          <div className="aspect-16/10 w-full bg-neutral-800/80 rounded-xl" />
        </div>
      </div>

      {/* 4. Project Stages Discovery Skeleton */}
      <div className="space-y-6 pt-4">
        <div className="space-y-2 max-w-xl">
          <div className="h-4 w-36 bg-neutral-200 rounded" />
          <div className="h-9 w-80 bg-neutral-300 rounded" />
          <div className="h-4 w-96 bg-neutral-200 rounded" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-80 rounded-2xl bg-white border border-neutral-200/80 p-6 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="h-32 -mx-6 -mt-6 bg-neutral-100 rounded-t-2xl" />
                <div className="h-5 w-32 bg-neutral-300 rounded" />
                <div className="h-3 w-44 bg-neutral-200 rounded" />
                <div className="h-3 w-20 bg-neutral-200 rounded" />
              </div>
              <div className="h-5 w-28 bg-neutral-200 rounded pt-3 border-t border-neutral-100" />
            </div>
          ))}
        </div>
      </div>

      {/* 5. Explore Projects Section Skeleton */}
      <div className="space-y-8 pt-4">
        <div className="flex justify-between items-end">
          <div className="space-y-2">
            <div className="h-4 w-32 bg-neutral-200 rounded" />
            <div className="h-8 w-64 bg-neutral-300 rounded" />
            <div className="h-4 w-80 bg-neutral-200 rounded" />
          </div>
          <div className="h-9 w-36 bg-neutral-200 rounded-lg hidden sm:block" />
        </div>

        {/* Filter Tab Skeleton */}
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 w-28 bg-neutral-200 rounded-lg" />
          ))}
        </div>

        {/* Project Cards Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="border border-neutral-200 rounded-xl overflow-hidden bg-white shadow-xs">
              <div className="aspect-16/10 bg-neutral-200" />
              <div className="p-6 space-y-3">
                <div className="flex justify-between">
                  <div className="h-3 w-28 bg-neutral-200 rounded" />
                  <div className="h-3 w-20 bg-neutral-200 rounded" />
                </div>
                <div className="h-6 w-3/4 bg-neutral-300 rounded" />
                <div className="h-3 w-1/2 bg-neutral-200 rounded" />
                <div className="h-6 w-1/3 bg-neutral-200 rounded mt-4" />
                <div className="pt-4 border-t border-neutral-100 flex justify-between items-center">
                  <div className="h-6 w-24 bg-neutral-300 rounded" />
                  <div className="h-8 w-24 bg-neutral-200 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
