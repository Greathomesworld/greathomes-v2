'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface AdminBreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function AdminBreadcrumbs({ items }: AdminBreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center space-x-2 text-xs font-medium text-neutral-500 py-1">
      <Link
        href="/admin"
        className="flex items-center gap-1 hover:text-neutral-900 transition-colors py-1"
      >
        <Home className="h-3.5 w-3.5" />
        <span>Admin</span>
      </Link>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <React.Fragment key={idx}>
            <ChevronRight className="h-3 w-3 text-neutral-400 shrink-0" />
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="hover:text-neutral-900 transition-colors py-1 truncate max-w-[150px] sm:max-w-[200px]"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-neutral-900 font-semibold truncate max-w-[180px] sm:max-w-[260px]">
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
