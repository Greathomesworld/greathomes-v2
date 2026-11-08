'use client';

import React from 'react';
import { AdminBreadcrumbs, BreadcrumbItem } from './AdminBreadcrumbs';

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  primaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
    icon?: React.ReactNode;
    disabled?: boolean;
  };
  secondaryActions?: Array<{
    label: string;
    onClick?: () => void;
    href?: string;
    icon?: React.ReactNode;
  }>;
}

export function AdminPageHeader({
  title,
  description,
  breadcrumbs,
  primaryAction,
  secondaryActions,
}: AdminPageHeaderProps) {
  return (
    <div className="border-b border-neutral-200/80 bg-white px-6 py-5 space-y-3">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <AdminBreadcrumbs items={breadcrumbs} />
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 font-display">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-neutral-600 max-w-3xl font-body">
              {description}
            </p>
          )}
        </div>
        {(primaryAction || (secondaryActions && secondaryActions.length > 0)) && (
          <div className="flex items-center gap-2.5 shrink-0 pt-1 sm:pt-0">
            {secondaryActions?.map((act, i) =>
              act.href ? (
                <a
                  key={i}
                  href={act.href}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors shadow-xs"
                >
                  {act.icon}
                  {act.label}
                </a>
              ) : (
                <button
                  key={i}
                  onClick={act.onClick}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors shadow-xs cursor-pointer"
                >
                  {act.icon}
                  {act.label}
                </button>
              )
            )}
            {primaryAction &&
              (primaryAction.href ? (
                <a
                  href={primaryAction.href}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-neutral-900 rounded-lg hover:bg-neutral-800 transition-colors shadow-xs"
                >
                  {primaryAction.icon}
                  {primaryAction.label}
                </a>
              ) : (
                <button
                  onClick={primaryAction.onClick}
                  disabled={primaryAction.disabled}
                  className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-neutral-900 rounded-lg hover:bg-neutral-800 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
                >
                  {primaryAction.icon}
                  {primaryAction.label}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
