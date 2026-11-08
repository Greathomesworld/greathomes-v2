'use client';

import React from 'react';

type BadgeVariant =
  | 'PUBLISHED'
  | 'APPROVED'
  | 'VERIFIED'
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'UNVERIFIED'
  | 'PAUSED'
  | 'SOLD_RENTED'
  | 'ARCHIVED'
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'CONTENT_MANAGER'
  | 'PROPERTY_MANAGER'
  | 'SALES'
  | 'NEW'
  | 'RECEIVED'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'IN_REVIEW'
  | 'SITE_VISIT_SCHEDULED'
  | 'SITE_VISIT_COMPLETED'
  | 'NEGOTIATION'
  | 'CONVERTED'
  | 'LOST'
  | 'CLOSED'
  | 'URGENT'
  | 'HIGH'
  | 'NORMAL'
  | 'LOW'
  | 'COMING_SOON'
  | 'DEFAULT';

interface AdminBadgeProps {
  label?: string;
  variant?: BadgeVariant | string;
  size?: 'sm' | 'md';
}

export function AdminBadge({ label, variant = 'DEFAULT', size = 'sm' }: AdminBadgeProps) {
  const normalizedVariant = (variant || 'DEFAULT').toUpperCase();
  const text = label || normalizedVariant.replace(/_/g, ' ');

  let style = 'bg-neutral-100 text-neutral-800 border-neutral-200';

  switch (normalizedVariant) {
    case 'PUBLISHED':
    case 'APPROVED':
    case 'VERIFIED':
    case 'CONVERTED':
    case 'SITE_VISIT_COMPLETED':
    case 'SUPER_ADMIN':
      style = 'bg-emerald-50 text-emerald-800 border-emerald-200/80 font-medium';
      break;
    case 'DRAFT':
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
    case 'IN_REVIEW':
    case 'UNVERIFIED':
    case 'SITE_VISIT_SCHEDULED':
      style = 'bg-amber-50 text-amber-800 border-amber-200/80 font-medium';
      break;
    case 'PAUSED':
    case 'SOLD_RENTED':
    case 'CLOSED':
    case 'LOST':
      style = 'bg-slate-100 text-slate-700 border-slate-200 font-medium';
      break;
    case 'ARCHIVED':
    case 'URGENT':
      style = 'bg-rose-50 text-rose-700 border-rose-200 font-semibold';
      break;
    case 'HIGH':
    case 'NEGOTIATION':
      style = 'bg-amber-100/70 text-amber-900 border-amber-300 font-medium';
      break;
    case 'NEW':
    case 'RECEIVED':
      style = 'bg-terracotta/10 text-terracotta border-terracotta/20 font-semibold';
      break;
    case 'CONTACTED':
      style = 'bg-sky-50 text-sky-800 border-sky-200 font-medium';
      break;
    case 'QUALIFIED':
      style = 'bg-purple-50 text-purple-800 border-purple-200 font-medium';
      break;
    case 'COMING_SOON':
      style = 'bg-indigo-50 text-indigo-700 border-indigo-200 font-medium';
      break;
    case 'ADMIN':
    case 'CONTENT_MANAGER':
    case 'PROPERTY_MANAGER':
    case 'SALES':
      style = 'bg-blue-50 text-blue-800 border-blue-200 font-medium';
      break;
    case 'NORMAL':
      style = 'bg-neutral-100 text-neutral-700 border-neutral-200 font-normal';
      break;
    case 'LOW':
      style = 'bg-neutral-50 text-neutral-500 border-neutral-200 font-normal';
      break;
  }

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center rounded-full border tracking-wide uppercase font-display ${sizeClasses} ${style}`}
    >
      {text}
    </span>
  );
}
