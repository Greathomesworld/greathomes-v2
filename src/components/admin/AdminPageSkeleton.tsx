import React from 'react';
import { SkeletonLine, SkeletonHeading, SkeletonCard } from '../common/Skeleton';

export const AdminPageSkeleton = ({ type = 'list' }: { type?: 'list' | 'detail' }) => (
  <div className="p-6 space-y-6">
    <div className="flex justify-between items-center">
      <SkeletonHeading className="w-1/4" />
      <SkeletonLine className="h-10 w-32" />
    </div>
    {type === 'list' ? (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => <SkeletonLine key={i} className="h-16 w-full" />)}
      </div>
    ) : (
      <div className="grid grid-cols-2 gap-6">
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-32 col-span-2" />
      </div>
    )}
  </div>
);
