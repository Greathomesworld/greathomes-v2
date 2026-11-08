'use client';

import React, { useState, useEffect } from 'react';
import { Scale, Check } from 'lucide-react';
import { useVisitorTelemetry } from '../telemetry/VisitorTelemetryProvider';

export const MAX_COMPARE_ITEMS = 4;

export function getAddToCompareButtonLabel(isComparing: boolean): string {
  return isComparing ? '✓ Added to Compare' : '+ Add to Compare';
}

export function computeNextCompareIds(
  currentIds: string[],
  id: string,
  maxItems: number = MAX_COMPARE_ITEMS
): {
  ids: string[];
  added: boolean;
  removed: boolean;
  blockedByLimit: boolean;
} {
  const deduped = Array.from(
    new Set((Array.isArray(currentIds) ? currentIds : []).map(i => String(i).trim()).filter(Boolean))
  );
  const cleanId = String(id).trim();
  if (!cleanId) {
    return { ids: deduped, added: false, removed: false, blockedByLimit: false };
  }

  if (deduped.includes(cleanId)) {
    return {
      ids: deduped.filter(i => i !== cleanId),
      added: false,
      removed: true,
      blockedByLimit: false,
    };
  }

  if (deduped.length >= maxItems) {
    return {
      ids: deduped,
      added: false,
      removed: false,
      blockedByLimit: true,
    };
  }

  return {
    ids: [...deduped, cleanId],
    added: true,
    removed: false,
    blockedByLimit: false,
  };
}

interface AddToCompareButtonProps {
  mode: 'PROJECTS' | 'RESALE' | 'RENTAL';
  id: string;
  name: string;
  className?: string;
}

export function AddToCompareButton({ mode, id, name, className = '' }: AddToCompareButtonProps) {
  const [isComparing, setIsComparing] = useState(false);
  const { trackEvent } = useVisitorTelemetry();

  useEffect(() => {
    const storageKey = `gh_compare_${mode.toLowerCase()}`;
    const syncCompareState = () => {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const ids: string[] = JSON.parse(stored);
          setIsComparing(Array.isArray(ids) && ids.includes(id));
        } else {
          setIsComparing(false);
        }
      } catch {
        setIsComparing(false);
      }
    };

    syncCompareState();
    window.addEventListener('gh_compare_updated', syncCompareState);
    window.addEventListener('storage', syncCompareState);
    return () => {
      window.removeEventListener('gh_compare_updated', syncCompareState);
      window.removeEventListener('storage', syncCompareState);
    };
  }, [mode, id]);

  const toggleCompare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const key = `gh_compare_${mode.toLowerCase()}`;
      const stored = localStorage.getItem(key);
      const parsed: string[] = stored ? JSON.parse(stored) : [];
      const next = computeNextCompareIds(parsed, id, MAX_COMPARE_ITEMS);

      if (next.blockedByLimit) {
        return;
      }

      const entityType =
        mode === 'PROJECTS'
          ? 'PROJECT'
          : mode === 'RESALE'
          ? 'RESALE_LISTING'
          : 'RENTAL_LISTING';

      if (next.removed) {
        setIsComparing(false);
        trackEvent({
          eventType: 'COMPARE_REMOVED',
          entityType,
          entityId: id,
          metadata: { mode, name },
        }).catch(() => {});
      } else if (next.added) {
        setIsComparing(true);
        trackEvent({
          eventType: 'COMPARE_ADDED',
          entityType,
          entityId: id,
          metadata: { mode, name },
        }).catch(() => {});
      }

      if (next.ids.length === 0) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(next.ids));
      }

      try {
        const namesRaw = localStorage.getItem('gh_compare_names');
        const namesMap: Record<string, string> = namesRaw ? JSON.parse(namesRaw) : {};
        if (next.added && name) {
          namesMap[id] = name;
        } else if (next.removed) {
          delete namesMap[id];
        }
        localStorage.setItem('gh_compare_names', JSON.stringify(namesMap));
      } catch {
        // ignore optional name metadata errors
      }

      window.dispatchEvent(new Event('gh_compare_updated'));
    } catch {
      // ignore
    }
  };

  const label = getAddToCompareButtonLabel(isComparing);

  return (
    <button
      type="button"
      onClick={toggleCompare}
      aria-pressed={isComparing}
      aria-label={isComparing ? `Remove ${name} from comparison` : `Add ${name} to comparison`}
      title={isComparing ? 'Remove from comparison' : 'Add to comparison'}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-medium transition-all focus:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 cursor-pointer ${
        isComparing
          ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700'
          : 'bg-stone-100 hover:bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'
      } ${className}`}
    >
      {isComparing ? <Check className="w-3.5 h-3.5 shrink-0" /> : <Scale className="w-3.5 h-3.5 shrink-0" />}
      <span>{label}</span>
    </button>
  );
}

