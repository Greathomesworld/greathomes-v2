import React from 'react';
import Link from 'next/link';
import { Home } from 'lucide-react';

export function NotFound() {
  return (
    <div className="min-h-[55vh] flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-3xl sm:text-4xl font-serif text-neutral-900 mb-2">
        Page Not Found
      </h1>
      <p className="text-sm font-body text-neutral-600 max-w-md mb-6">
        The requested property, project, or page could not be located.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold text-sm rounded-lg transition-colors font-display"
      >
        <Home className="w-4 h-4" />
        <span>Return to Homepage</span>
      </Link>
    </div>
  );
}

