'use client';

import React from 'react';
import Link from 'next/link';
import { AlertCircle, RotateCcw } from 'lucide-react';

export default function ProjectResaleError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-red-500/10 text-red-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-display font-semibold text-[var(--color-foreground)]">
          Unable to Load Project Resale Inventory
        </h2>
        <p className="text-sm font-body text-[var(--color-foreground)]/70">
          We encountered a temporary issue while loading resale listings for this project.
        </p>
        <div className="pt-2 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-foreground)] text-[var(--color-background)] text-xs font-display font-semibold cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
          <Link
            href="/projects"
            className="inline-flex items-center px-4 py-2 rounded-lg border border-[var(--color-border)] text-xs font-display font-semibold text-[var(--color-foreground)]"
          >
            All Projects
          </Link>
        </div>
      </div>
    </div>
  );
}
