'use client';

import React, { useState, useEffect } from 'react';
import { Bookmark, Loader2 } from 'lucide-react';
import { SavedItemResourceType } from '@/src/domain/customer/entities';
import { useCustomerAuth } from './CustomerAuthContext';
import { useVisitorTelemetry } from '../telemetry/VisitorTelemetryProvider';

interface SaveButtonProps {
  resourceType: SavedItemResourceType;
  resourceId: string;
  className?: string;
  showLabel?: boolean;
}

export function SaveButton({
  resourceType,
  resourceId,
  className = '',
  showLabel = false,
}: SaveButtonProps) {
  const { customer, openAuthModal } = useCustomerAuth();
  const { trackEvent } = useVisitorTelemetry();
  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check saved state when customer or resourceId changes
  useEffect(() => {
    let isMounted = true;
    if (!customer) {
      setIsSaved(false);
      return;
    }

    async function checkSaved() {
      try {
        const res = await fetch(
          `/api/customer/saved/check?resourceType=${encodeURIComponent(
            resourceType
          )}&resourceId=${encodeURIComponent(resourceId)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setIsSaved(Boolean(data.saved));
          }
        }
      } catch {
        // Silently ignore
      }
    }

    checkSaved();
    return () => {
      isMounted = false;
    };
  }, [customer, resourceType, resourceId]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!customer) {
      openAuthModal('login');
      return;
    }

    if (loading) return;
    setLoading(true);

    const nextState = !isSaved;
    setIsSaved(nextState); // Optimistic update

    try {
      if (nextState) {
        // Save
        const res = await fetch('/api/customer/saved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resourceType, resourceId }),
        });
        if (!res.ok) {
          setIsSaved(!nextState); // Revert on failure
        } else {
          trackEvent({
            eventType: 'ITEM_SAVED',
            entityType: resourceType,
            entityId: resourceId,
          }).catch(() => {});
        }
      } else {
        // Unsave
        const res = await fetch(
          `/api/customer/saved?resourceType=${encodeURIComponent(
            resourceType
          )}&resourceId=${encodeURIComponent(resourceId)}`,
          { method: 'DELETE' }
        );
        if (!res.ok) {
          setIsSaved(!nextState); // Revert on failure
        } else {
          trackEvent({
            eventType: 'ITEM_UNSAVED',
            entityType: resourceType,
            entityId: resourceId,
          }).catch(() => {});
        }
      }
    } catch {
      setIsSaved(!nextState); // Revert on failure
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={isSaved ? 'Remove from saved homes' : 'Save home'}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
        isSaved
          ? 'bg-slate-900 text-white hover:bg-slate-800'
          : 'bg-white/90 hover:bg-white text-slate-800 border border-slate-200 hover:border-slate-300'
      } ${className}`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current text-white' : 'text-slate-700'}`} />
      )}
      {showLabel && (
        <span className="font-display text-xs">
          {isSaved ? 'Saved' : 'Save'}
        </span>
      )}
    </button>
  );
}
