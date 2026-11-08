'use client';

import React, { useState, useEffect } from 'react';
import { Scale, X, ArrowRight, Compass } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MAX_COMPARE_ITEMS } from './AddToCompareButton';

export type ComparisonTrayMode = 'projects' | 'resale' | 'rental';

export interface ComparisonTrayAction {
  type: 'BROWSE' | 'COMPARE';
  label: string;
  href: string;
}

export interface SelectedComparisonItem {
  id: string;
  name: string | null;
}

export interface ComparisonTrayModel {
  mode: ComparisonTrayMode;
  ids: string[];
  count: number;
  maxItems: number;
  heading: string;
  selectionCountText: string;
  instruction: string;
  primaryAction: ComparisonTrayAction | null;
  selectedItems: SelectedComparisonItem[];
  isProjectDetailPage: boolean;
  mobileBottomOffsetClass: string;
}

export function buildComparisonTrayModel(params: {
  mode: ComparisonTrayMode;
  ids: string[];
  namesMap?: Record<string, string>;
  pathname?: string | null;
}): ComparisonTrayModel {
  const { mode, ids, namesMap = {}, pathname = null } = params;
  const dedupedIds = Array.from(
    new Set((Array.isArray(ids) ? ids : []).map(i => String(i).trim()).filter(Boolean))
  ).slice(0, MAX_COMPARE_ITEMS);
  const count = dedupedIds.length;

  const isProjects = mode === 'projects';
  const entityLowerPlural = isProjects
    ? 'projects'
    : mode === 'resale'
    ? 'resale homes'
    : 'rental homes';
  const entityTitlePlural = isProjects
    ? 'Projects'
    : mode === 'resale'
    ? 'Resale Homes'
    : 'Rental Homes';

  const isProjectDetailPage = Boolean(pathname && /^\/projects\/[^/]+$/.test(pathname));
  const mobileBottomOffsetClass = isProjectDetailPage
    ? 'bottom-36 md:bottom-20 lg:bottom-4'
    : 'bottom-16 md:bottom-4';

  const selectionCountText = `${count} of ${MAX_COMPARE_ITEMS} ${entityLowerPlural} selected`;
  const selectedItems: SelectedComparisonItem[] = dedupedIds.map(id => ({
    id,
    name: namesMap[id] ? String(namesMap[id]).trim() : null,
  }));

  if (count === 0) {
    return {
      mode,
      ids: dedupedIds,
      count: 0,
      maxItems: MAX_COMPARE_ITEMS,
      heading: `Compare ${entityTitlePlural}`,
      selectionCountText,
      instruction: isProjects
        ? 'Add projects to compare them side-by-side.'
        : 'Add homes to compare them side-by-side.',
      primaryAction: null,
      selectedItems: [],
      isProjectDetailPage,
      mobileBottomOffsetClass,
    };
  }

  if (count === 1) {
    const browseHref = isProjects ? '/projects' : mode === 'resale' ? '/buy' : '/rent';
    const browseLabel = isProjects ? 'Browse Projects' : mode === 'resale' ? 'Browse Homes' : 'Browse Rentals';
    return {
      mode,
      ids: dedupedIds,
      count: 1,
      maxItems: MAX_COMPARE_ITEMS,
      heading: `Compare ${entityTitlePlural}`,
      selectionCountText,
      instruction: isProjects
        ? 'Add another project to compare side-by-side.'
        : 'Add another home to compare side-by-side.',
      primaryAction: {
        type: 'BROWSE',
        label: browseLabel,
        href: browseHref,
      },
      selectedItems,
      isProjectDetailPage,
      mobileBottomOffsetClass,
    };
  }

  return {
    mode,
    ids: dedupedIds,
    count,
    maxItems: MAX_COMPARE_ITEMS,
    heading: `Compare ${count} ${entityTitlePlural}`,
    selectionCountText,
    instruction: 'Ready for side-by-side comparison.',
    primaryAction: {
      type: 'COMPARE',
      label: 'Compare Now',
      href: `/compare/${mode}?ids=${dedupedIds.join(',')}`,
    },
    selectedItems,
    isProjectDetailPage,
    mobileBottomOffsetClass,
  };
}

interface ComparisonTrayProps {
  showWhenEmpty?: boolean;
}

export function ComparisonTray({ showWhenEmpty = false }: ComparisonTrayProps = {}) {
  const pathname = usePathname();
  const [activeMode, setActiveMode] = useState<ComparisonTrayMode | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [namesMap, setNamesMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const checkCompare = () => {
      try {
        const storedNames = localStorage.getItem('gh_compare_names');
        setNamesMap(storedNames ? JSON.parse(storedNames) : {});
      } catch {
        setNamesMap({});
      }

      const modes: ComparisonTrayMode[] = ['projects', 'resale', 'rental'];
      for (const m of modes) {
        try {
          const stored = localStorage.getItem(`gh_compare_${m}`);
          if (stored) {
            const parsed: string[] = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setActiveMode(m);
              setIds(parsed);
              return;
            }
          }
        } catch {
          // ignore
        }
      }
      setActiveMode(null);
      setIds([]);
    };

    checkCompare();
    window.addEventListener('gh_compare_updated', checkCompare);
    window.addEventListener('storage', checkCompare);
    return () => {
      window.removeEventListener('gh_compare_updated', checkCompare);
      window.removeEventListener('storage', checkCompare);
    };
  }, []);

  if ((!activeMode || ids.length === 0) && !showWhenEmpty) return null;

  const effectiveMode: ComparisonTrayMode = activeMode || 'projects';
  const model = buildComparisonTrayModel({
    mode: effectiveMode,
    ids,
    namesMap,
    pathname,
  });

  const removeSingleItem = (idToRemove: string) => {
    try {
      const storageKey = `gh_compare_${effectiveMode}`;
      const updated = model.ids.filter(itemId => itemId !== idToRemove);
      if (updated.length === 0) {
        localStorage.removeItem(storageKey);
        setIds([]);
        setActiveMode(null);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(updated));
        setIds(updated);
      }
      window.dispatchEvent(new Event('gh_compare_updated'));
    } catch {
      // ignore
    }
  };

  const clearCompare = () => {
    try {
      localStorage.removeItem(`gh_compare_${effectiveMode}`);
      setIds([]);
      setActiveMode(null);
      window.dispatchEvent(new Event('gh_compare_updated'));
    } catch {
      // ignore
    }
  };

  const itemsWithNames = model.selectedItems.filter(item => Boolean(item.name));

  return (
    <div
      role="region"
      aria-label="Project comparison tray"
      className={`fixed ${model.mobileBottomOffsetClass} left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-3 sm:px-4`}
    >
      <div className="bg-stone-900/95 backdrop-blur-md text-white px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl shadow-2xl border border-stone-800 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <Scale className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-sm font-display font-bold leading-tight">
                  {model.heading}
                </span>
                {model.count > 0 && (
                  <span className="text-[11px] font-display font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 rounded-md">
                    {model.selectionCountText}
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-300 font-body mt-0.5 leading-snug">
                {model.instruction}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {model.primaryAction?.type === 'BROWSE' && (
              <Link
                href={model.primaryAction.href}
                className="inline-flex items-center gap-1.5 px-3 py-2 sm:px-3.5 rounded-xl text-xs font-semibold font-display bg-stone-800 hover:bg-stone-700 text-white border border-stone-700 transition-colors whitespace-nowrap focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                <Compass className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{model.primaryAction.label}</span>
              </Link>
            )}

            {model.primaryAction?.type === 'COMPARE' && (
              <Link
                href={model.primaryAction.href}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 sm:px-4 rounded-xl text-xs font-semibold font-display bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all whitespace-nowrap focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-300"
              >
                <span>{model.primaryAction.label}</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </Link>
            )}

            {model.count > 0 && (
              <button
                type="button"
                onClick={clearCompare}
                className="p-2 text-stone-400 hover:text-white transition-colors rounded-lg hover:bg-stone-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-stone-500 cursor-pointer"
                title="Clear comparison"
                aria-label="Clear comparison"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {itemsWithNames.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-stone-800/90">
            {itemsWithNames.map(item => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-0.5 rounded-lg bg-stone-800/90 border border-stone-700/80 text-[11px] font-display text-stone-200 max-w-[170px] sm:max-w-[200px]"
              >
                <span className="truncate">{item.name}</span>
                <button
                  type="button"
                  onClick={() => removeSingleItem(item.id)}
                  aria-label={`Remove ${item.name} from comparison`}
                  title={`Remove ${item.name}`}
                  className="p-0.5 rounded hover:bg-stone-700 text-stone-400 hover:text-white transition-colors shrink-0 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

