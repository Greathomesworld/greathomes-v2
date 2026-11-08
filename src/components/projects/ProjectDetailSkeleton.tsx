import { SkeletonLine, SkeletonHeading, SkeletonCard } from '../common/Skeleton';

export const ProjectDetailSkeleton = () => (
  <div className="space-y-8 animate-in fade-in duration-500">
    {/* Hero Section */}
    <div className="h-64 w-full bg-neutral-100 rounded-2xl animate-pulse" />
    
    <div className="space-y-4">
      <SkeletonHeading className="w-1/3" />
      <SkeletonLine className="w-full" />
      <SkeletonLine className="w-full" />
      <SkeletonLine className="w-2/3" />
    </div>

    {/* Snapshot Section */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <SkeletonCard key={i} className="h-24" />
      ))}
    </div>

    {/* Content Sections */}
    <div className="space-y-6">
      <SkeletonHeading className="w-1/4" />
      <SkeletonLine className="w-full" />
      <SkeletonLine className="w-full" />
    </div>
  </div>
);
