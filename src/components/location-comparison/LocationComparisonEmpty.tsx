'use client';

import React from 'react';
import Link from 'next/link';
import { Scale, ArrowRight, MapPin } from 'lucide-react';

export function LocationComparisonEmpty() {
  const presets = [
    {
      title: 'Rajarhat vs New Town',
      subtitle: 'Northeast residential corridor vs IT township corridor',
      url: '/compare/locations?locations=rajarhat,new-town',
    },
    {
      title: 'New Town vs Salt Lake',
      subtitle: 'Modern planned expansion vs established satellite city',
      url: '/compare/locations?locations=new-town,salt-lake',
    },
    {
      title: 'Rajarhat vs EM Bypass',
      subtitle: 'Emerging high-rise hub vs arterial North-South corridor',
      url: '/compare/locations?locations=rajarhat,em-bypass',
    },
    {
      title: 'Compare All 4 Corridors',
      subtitle: 'Rajarhat, New Town, Salt Lake, and EM Bypass simultaneously',
      url: '/compare/locations?locations=rajarhat,new-town,salt-lake,em-bypass',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto mb-6 text-[#111111] dark:text-stone-100">
        <Scale className="w-8 h-8" />
      </div>

      <h1 className="text-3xl sm:text-4xl font-display font-bold text-[#111111] dark:text-stone-100 tracking-tight">
        Compare Kolkata Residential Corridors
      </h1>

      <p className="text-sm sm:text-base text-stone-600 dark:text-stone-400 font-body max-w-xl mx-auto mt-3 leading-relaxed">
        Evaluate factual supply, basis-isolated pricing, verified RERA coverage, and connectivity benchmarks across locations. No predictive rankings or investment scores.
      </p>

      {/* Preset Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left max-w-2xl mx-auto mt-10">
        {presets.map((p) => (
          <Link
            key={p.url}
            href={p.url}
            className="p-5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-[#111111] dark:hover:border-stone-100 transition-all group flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-display font-bold text-[#111111] dark:text-stone-100 group-hover:text-[#218C5A] transition-colors">
                  {p.title}
                </h2>
                <ArrowRight className="w-4 h-4 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 font-body mt-1">
                {p.subtitle}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8">
        <Link
          href="/locations"
          className="text-xs font-display font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 underline underline-offset-4"
        >
          Explore all individual locations →
        </Link>
      </div>
    </div>
  );
}
