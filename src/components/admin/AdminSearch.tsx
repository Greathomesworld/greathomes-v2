'use client';

import React, { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface AdminSearchProps {
  placeholder?: string;
  value?: string;
  onChange: (value: string) => void;
  className?: string;
}

export function AdminSearch({
  placeholder = 'Search operational records...',
  value = '',
  onChange,
  className = '',
}: AdminSearchProps) {
  const [query, setQuery] = useState(value);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const handleClear = () => {
    setQuery('');
    onChange('');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setQuery(newVal);
    onChange(newVal);
  };

  return (
    <div className={`relative flex items-center w-full max-w-sm ${className}`}>
      <Search className="absolute left-3.5 h-4 w-4 text-neutral-400 pointer-events-none" />
      <input
        type="text"
        value={query}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full pl-10 pr-9 py-2 text-sm bg-white border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-neutral-900 focus:border-transparent font-body text-neutral-900 placeholder:text-neutral-400 shadow-2xs min-h-[44px]"
      />
      {query && (
        <button
          onClick={handleClear}
          className="absolute right-3 text-neutral-400 hover:text-neutral-600 p-1"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
