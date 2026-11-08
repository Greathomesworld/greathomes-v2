import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  if (!items || items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={`w-full overflow-hidden ${className}`}>
      <ol className="flex items-center gap-1 sm:gap-1.5 text-xs text-[var(--color-foreground)]/60 font-body overflow-x-auto no-scrollbar py-0.5 whitespace-nowrap sm:flex-wrap sm:whitespace-normal">
        {items.map((item, index) => {
          const isLast = index === items.length - 1 || Boolean(item.current);

          return (
            <React.Fragment key={`${item.label}-${index}`}>
              <li className="inline-flex items-center min-w-0 shrink-0 sm:shrink">
                {isLast ? (
                  <span
                    aria-current="page"
                    className="font-medium text-[var(--color-foreground)] truncate max-w-[200px] sm:max-w-md"
                  >
                    {item.label}
                  </span>
                ) : item.href ? (
                  <Link
                    href={item.href}
                    className="hover:text-[var(--color-foreground)] hover:underline transition-colors truncate max-w-[130px] sm:max-w-none focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F] rounded"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className="truncate max-w-[130px] sm:max-w-none">
                    {item.label}
                  </span>
                )}
              </li>

              {!isLast && (
                <li aria-hidden="true" className="shrink-0 flex items-center px-0.5">
                  <ChevronRight className="w-3 h-3 text-[var(--color-foreground)]/30" />
                </li>
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
