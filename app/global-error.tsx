'use client';

import React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-neutral-50 px-4 py-16 text-neutral-900">
        <div className="max-w-md w-full text-center space-y-5">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-xs text-neutral-600">
            {error?.message || 'An unexpected application error occurred.'}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-[#E85D3F] text-white text-xs font-semibold cursor-pointer"
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
