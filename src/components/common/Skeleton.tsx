import React from 'react';

/**
 * Skeleton Primitive Components
 * 
 * Consistent Great Homes visual identity.
 * Soft neutral-grey pulse placeholders.
 */

export const SkeletonLine = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse bg-neutral-200 rounded-md ${className}`} />
);

export const SkeletonHeading = ({ className = "" }: { className?: string }) => (
  <SkeletonLine className={`h-6 ${className}`} />
);

export const SkeletonText = ({ className = "" }: { className?: string }) => (
  <SkeletonLine className={`h-4 ${className}`} />
);

export const SkeletonCard = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse bg-neutral-100 rounded-xl ${className}`} />
);

export const SkeletonImage = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse bg-neutral-200 rounded-lg ${className}`} />
);

export const SkeletonButton = ({ className = "" }: { className?: string }) => (
  <SkeletonLine className={`h-10 w-24 ${className}`} />
);

export const SkeletonInput = ({ className = "" }: { className?: string }) => (
  <SkeletonLine className={`h-10 w-full ${className}`} />
);

export const SkeletonTableRow = () => (
  <tr className="animate-pulse">
    {[1, 2, 3, 4].map((i) => (
      <td key={i} className="p-4">
        <SkeletonLine className="h-4 w-full" />
      </td>
    ))}
  </tr>
);
