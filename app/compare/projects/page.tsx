'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Scale, ArrowLeft, Trash2, ShieldCheck, MapPin, Building, ExternalLink } from 'lucide-react';
import { ProjectComparisonDto } from '@/src/domain/comparison/entities';

function CompareProjectsContent() {
  const searchParams = useSearchParams();
  const idsParam = searchParams.get('ids');

  const [items, setItems] = useState<ProjectComparisonDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!idsParam) {
      setLoading(false);
      setError('No project IDs provided for comparison.');
      return;
    }

    async function fetchComparison() {
      try {
        setLoading(true);
        const res = await fetch(`/api/compare/projects?ids=${encodeURIComponent(idsParam || '')}`);
        const data = await res.json();
        if (data.success) {
          setItems(data.items);
          try {
            const namesRaw = localStorage.getItem('gh_compare_names');
            const namesMap: Record<string, string> = namesRaw ? JSON.parse(namesRaw) : {};
            for (const item of data.items || []) {
              if (item?.id && item?.name) {
                namesMap[item.id] = item.name;
              }
            }
            localStorage.setItem('gh_compare_names', JSON.stringify(namesMap));
          } catch {
            // ignore optional name cache errors
          }
        } else {
          setError(data.error || 'Failed to load project comparison');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load project comparison');
      } finally {
        setLoading(false);
      }
    }

    fetchComparison();
  }, [idsParam]);

  const removeItem = (id: string) => {
    if (!idsParam) return;
    const currentIds = idsParam.split(',').map(i => i.trim()).filter(Boolean);
    const updated = currentIds.filter(i => i !== id);

    try {
      if (updated.length === 0) {
        localStorage.removeItem('gh_compare_projects');
      } else {
        localStorage.setItem('gh_compare_projects', JSON.stringify(updated));
      }
      const namesRaw = localStorage.getItem('gh_compare_names');
      if (namesRaw) {
        const namesMap: Record<string, string> = JSON.parse(namesRaw);
        delete namesMap[id];
        localStorage.setItem('gh_compare_names', JSON.stringify(namesMap));
      }
      window.dispatchEvent(new Event('gh_compare_updated'));
    } catch {
      // ignore localStorage errors
    }

    if (updated.length === 0) {
      window.location.href = '/projects';
    } else {
      window.location.href = `/compare/projects?ids=${updated.join(',')}`;
    }
  };

  return (
    <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Projects Discovery</span>
          </Link>
          <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">Compare Projects</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
            Compare the details that matter before you decide. Factual side-by-side breakdown.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-stone-500">Loading project comparison...</div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-6 rounded-2xl text-center text-red-700 dark:text-red-400">
          <p>{error}</p>
          <Link href="/projects" className="mt-4 inline-block px-4 py-2 bg-stone-900 text-white dark:bg-white dark:text-stone-900 rounded-xl text-xs font-medium">
            Explore Projects
          </Link>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-12 text-center max-w-lg mx-auto">
          <div className="w-12 h-12 bg-emerald-500/10 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Scale className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-display font-bold mb-2">No Projects to Compare</h2>
          <p className="text-sm text-stone-500 dark:text-stone-400 mb-6">Select 2 to 4 projects from discovery to compare side-by-side.</p>
          <Link href="/projects" className="px-5 py-2.5 bg-stone-900 text-white dark:bg-white dark:text-stone-900 rounded-xl text-xs font-medium">
            Explore Projects
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto pb-12">
          <div className="min-w-[800px] grid grid-cols-5 gap-4 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-6 shadow-sm">
            {/* Attribute Header Column */}
            <div className="col-span-1 space-y-6 pt-32 font-display font-bold text-sm text-stone-500 border-r border-stone-100 dark:border-stone-800 pr-4">
              <div className="h-10 flex items-center">Starting Price</div>
              <div className="h-10 flex items-center">Developer</div>
              <div className="h-10 flex items-center">Location</div>
              <div className="h-10 flex items-center">Project Status</div>
              <div className="h-10 flex items-center">Configurations</div>
              <div className="h-10 flex items-center">Project Area</div>
              <div className="h-10 flex items-center">Total Units</div>
              <div className="h-10 flex items-center">Possession</div>
              <div className="h-10 flex items-center">RERA Status</div>
              <div className="h-10 flex items-center">Amenities</div>
              <div className="h-12 flex items-center">Actions</div>
            </div>

            {/* Property Columns */}
            {items.map((item) => (
              <div key={item.id} className="col-span-1 flex flex-col space-y-6 bg-stone-50/50 dark:bg-stone-800/30 p-4 rounded-2xl border border-stone-100 dark:border-stone-800/80 relative">
                {/* Header / Thumbnail */}
                <div>
                  <div className="h-28 bg-stone-200 dark:bg-stone-800 rounded-xl overflow-hidden mb-3 relative flex items-center justify-center">
                    {item.thumbnailUrl ? (
                      <img src={item.thumbnailUrl} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <Building className="w-8 h-8 text-stone-400" />
                    )}
                    <button
                      onClick={() => removeItem(item.id)}
                      className="absolute top-2 right-2 p-1.5 bg-stone-900/70 hover:bg-red-600 text-white rounded-lg transition-colors"
                      title="Remove from comparison"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <h3 className="font-display font-bold text-base truncate" title={item.name}>{item.name}</h3>
                  {!item.isAvailable && (
                    <span className="inline-block mt-1 px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 text-[10px] font-semibold rounded-md">
                      No longer available
                    </span>
                  )}
                </div>

                {/* Attributes */}
                <div className="h-10 flex items-center font-semibold text-emerald-600 dark:text-emerald-400">
                  {item.startingPriceDisplay}
                </div>
                <div className="h-10 flex items-center text-sm truncate" title={item.developer.name}>
                  {item.developer.name}
                </div>
                <div className="h-10 flex items-center text-sm truncate" title={item.location.name}>
                  <MapPin className="w-3.5 h-3.5 text-stone-400 mr-1 shrink-0" />
                  <span className="truncate">{item.location.name}</span>
                </div>
                <div className="h-10 flex items-center text-xs font-medium">
                  <span className="px-2.5 py-1 bg-stone-200 dark:bg-stone-700 rounded-full">{item.status}</span>
                </div>
                <div className="h-10 flex items-center text-sm">{item.configurationsSummary || '—'}</div>
                <div className="h-10 flex items-center text-sm">{item.projectArea || '—'}</div>
                <div className="h-10 flex items-center text-sm">{item.totalUnits ? `${item.totalUnits} units` : '—'}</div>
                <div className="h-10 flex items-center text-sm">{item.possession || '—'}</div>
                <div className="h-10 flex items-center text-xs">
                  {item.hasVerifiedReraBadge ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" /> Verified
                    </span>
                  ) : (
                    <span className="text-stone-500">{item.reraStatus}</span>
                  )}
                </div>
                <div className="h-10 flex items-center text-xs text-stone-600 dark:text-stone-400 truncate">
                  {item.amenities.length > 0 ? item.amenities.map(a => a.name).join(', ') : '—'}
                </div>
                <div className="h-12 flex items-center pt-2">
                  <Link
                    href={`/projects/${item.slug}`}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-stone-900 text-white dark:bg-white dark:text-stone-900 rounded-xl text-xs font-medium font-display hover:opacity-90 transition-opacity"
                  >
                    <span>View Project</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

export default function CompareProjectsPage() {
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex flex-col font-sans">
      <Suspense fallback={<div className="py-20 text-center">Loading comparison...</div>}>
        <CompareProjectsContent />
      </Suspense>
    </div>
  );
}
