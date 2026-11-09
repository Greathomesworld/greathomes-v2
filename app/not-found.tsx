import React from 'react';
import Link from 'next/link';
import { Home, Search, Building2 } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16 bg-neutral-50/50">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-[#E85D3F]/10 text-[#E85D3F] mb-2">
          <Building2 className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold text-neutral-900 font-display tracking-tight">
            404 — Page Not Found
          </h1>
          <p className="text-sm text-neutral-600 font-body leading-relaxed">
            The property page or link you are looking for doesn&apos;t exist or may have been moved.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 text-white text-xs font-semibold font-display hover:bg-neutral-800 transition-colors shadow-2xs min-h-[44px]"
          >
            <Home className="h-4 w-4" />
            <span>Back to Home</span>
          </Link>

          <Link
            href="/projects"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-neutral-200 text-neutral-700 text-xs font-semibold font-display hover:bg-neutral-50 transition-colors min-h-[44px]"
          >
            <Search className="h-4 w-4" />
            <span>Browse Projects</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
