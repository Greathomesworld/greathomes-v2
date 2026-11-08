'use client';

import React from 'react';

export interface ColumnDef<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (item: T) => React.ReactNode;
  className?: string;
}

interface AdminTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  onRowClick?: (item: T) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function AdminTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  isLoading,
  emptyMessage = 'No records found.',
}: AdminTableProps<T>) {
  if (isLoading) {
    return (
      <div className="w-full bg-white border border-neutral-200/80 rounded-xl overflow-hidden p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-neutral-200 rounded w-1/4"></div>
          <div className="h-10 bg-neutral-100 rounded w-full"></div>
          <div className="h-10 bg-neutral-100 rounded w-full"></div>
          <div className="h-10 bg-neutral-100 rounded w-full"></div>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full bg-white border border-neutral-200/80 rounded-xl p-12 text-center">
        <p className="text-sm text-neutral-500 font-body">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-white border border-neutral-200/80 rounded-xl overflow-hidden shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm font-body border-collapse">
          <thead>
            <tr className="bg-neutral-50/80 border-b border-neutral-200 text-neutral-600 text-xs font-semibold uppercase tracking-wider font-display">
              {columns.map((col, i) => (
                <th key={i} className={`px-6 py-3.5 ${col.className || ''}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 text-neutral-800">
            {data.map((item, index) => (
              <tr
                key={keyExtractor(item, index)}
                onClick={() => onRowClick?.(item)}
                className={`transition-colors ${
                  onRowClick ? 'hover:bg-neutral-50/80 cursor-pointer' : ''
                }`}
              >
                {columns.map((col, i) => (
                  <td key={i} className={`px-6 py-4 whitespace-nowrap ${col.className || ''}`}>
                    {col.cell
                      ? col.cell(item)
                      : col.accessorKey
                      ? String(item[col.accessorKey] ?? '—')
                      : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
