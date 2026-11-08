import React from 'react';
import { SkeletonHeading, SkeletonCard, SkeletonLine, SkeletonInput } from '../common/Skeleton';

export const AdminDashboardSkeleton = () => (
  <div className="space-y-6 pb-12 px-6">
    {/* Page Header Placeholder */}
    <div className="space-y-2">
      <SkeletonHeading className="w-1/3" />
      <SkeletonLine className="w-2/3 h-4" />
    </div>

    {/* Metrics Grid Placeholder */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <SkeletonCard key={i} className="h-32" />
      ))}
    </div>

    {/* Quick Actions Placeholder */}
    <div className="bg-white p-5 rounded-xl border border-neutral-200">
      <SkeletonHeading className="w-1/4 mb-4" />
      <div className="flex gap-4">
        {[1, 2, 3, 4].map((i) => (
          <SkeletonInput key={i} className="w-40" />
        ))}
      </div>
    </div>
  </div>
);
