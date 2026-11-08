export function DiscoverySkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white border border-[rgba(17,17,17,0.08)] rounded-xl overflow-hidden animate-pulse"
        >
          <div className="aspect-[16/10] bg-neutral-200" />
          <div className="p-5 space-y-3">
            <div className="h-5 bg-neutral-200 rounded-md w-3/4" />
            <div className="h-3 bg-neutral-150 rounded-md w-1/2" />
            <div className="h-8 bg-neutral-100 rounded-lg w-full mt-2" />
            <div className="pt-3 border-t border-neutral-100 flex items-center justify-between">
              <div className="h-6 bg-neutral-200 rounded-md w-1/3" />
              <div className="h-8 bg-neutral-200 rounded-lg w-1/4" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
