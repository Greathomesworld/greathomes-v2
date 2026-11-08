'use client';

import React from 'react';

interface AdminStatCardProps {
  title: string;
  value?: number | string | null;
  subtext?: string;
  badgeText?: string;
  badgeVariant?: 'success' | 'amber' | 'neutral';
  icon?: React.ReactNode;
}

export function AdminStatCard({
  title,
  value,
  subtext,
  badgeText,
  badgeVariant = 'neutral',
  icon,
}: AdminStatCardProps) {
  const displayValue = value === undefined || value === null || value === '' ? '—' : value;

  let badgeStyle = 'bg-neutral-100 text-neutral-700';
  if (badgeVariant === 'success') {
    badgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';
  } else if (badgeVariant === 'amber') {
    badgeStyle = 'bg-amber-50 text-amber-800 border-amber-200';
  }

  return (
    <div className="bg-white border border-neutral-200/80 rounded-xl p-5 shadow-xs flex flex-col justify-between">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider font-display">
          {title}
        </span>
        {icon && <div className="text-neutral-400 p-1.5 rounded-lg bg-neutral-50">{icon}</div>}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="text-3xl font-bold tracking-tight text-neutral-900 font-display">
          {displayValue}
        </div>
        {badgeText && (
          <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium ${badgeStyle}`}>
            {badgeText}
          </span>
        )}
      </div>

      {subtext && (
        <p className="mt-2 text-xs text-neutral-500 font-body">
          {subtext}
        </p>
      )}
    </div>
  );
}
