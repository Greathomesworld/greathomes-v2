import { DiscoverySkeleton } from '@/src/components/discovery/DiscoverySkeleton';

export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="h-12 w-full bg-neutral-100 rounded-lg mb-8 animate-pulse" />
      <DiscoverySkeleton count={9} />
    </div>
  );
}
