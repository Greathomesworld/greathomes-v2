import { SkeletonCard } from '../common/Skeleton';

export const PropertyGridSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <SkeletonCard key={i} className="h-80" />
    ))}
  </div>
);
