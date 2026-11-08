'use client';

import React, { useState, useEffect } from 'react';
import { Eye, Bell, Check, Loader2 } from 'lucide-react';
import { useCustomerAuth } from './CustomerAuthContext';
import { useVisitorTelemetry } from '../telemetry/VisitorTelemetryProvider';

interface WatchLocationButtonProps {
  locationId: string;
  locationName: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function WatchLocationButton({
  locationId,
  locationName,
  className = '',
  variant = 'outline',
  size = 'md',
}: WatchLocationButtonProps) {
  const { customer, openAuthModal } = useCustomerAuth();
  const { trackEvent } = useVisitorTelemetry();
  const [isWatched, setIsWatched] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!customer || !locationId) {
      setIsWatched(false);
      return;
    }

    let isMounted = true;
    async function checkStatus() {
      try {
        const res = await fetch(`/api/customer/watchlist/locations/check?locationId=${locationId}`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.success) {
            setIsWatched(Boolean(data.isWatched));
          }
        }
      } catch {
        // Safe silent fail for status check
      }
    }

    checkStatus();
    return () => {
      isMounted = false;
    };
  }, [customer, locationId]);

  const handleToggleWatch = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!customer) {
      openAuthModal();
      return;
    }

    if (loading) return;
    setLoading(true);

    try {
      if (isWatched) {
        const res = await fetch(`/api/customer/watchlist/locations?locationId=${locationId}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setIsWatched(false);
          trackEvent({
            eventType: 'LOCATION_UNWATCHED',
            entityType: 'LOCATION',
            entityId: locationId,
            metadata: { locationName },
          }).catch(() => {});
        }
      } else {
        const res = await fetch(`/api/customer/watchlist/locations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locationId, enabled: true }),
        });
        if (res.ok) {
          setIsWatched(true);
          trackEvent({
            eventType: 'LOCATION_WATCHED',
            entityType: 'LOCATION',
            entityId: locationId,
            metadata: { locationName },
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Failed to toggle location watch:', err);
    } finally {
      setLoading(false);
    }
  };

  const baseStyles =
    'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2 min-h-[44px] cursor-pointer';

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };

  const variantStyles = {
    primary: isWatched
      ? 'bg-[#218C5A] text-white hover:bg-[#1b7547]'
      : 'bg-[#111111] text-white hover:bg-[#222222]',
    secondary: isWatched
      ? 'bg-[#218C5A]/10 text-[#218C5A] border border-[#218C5A]/30 hover:bg-[#218C5A]/20'
      : 'bg-[#FAFAF8] text-[#111111] border border-[rgba(17,17,17,0.12)] hover:bg-neutral-100',
    outline: isWatched
      ? 'bg-[#218C5A]/10 text-[#218C5A] border border-[#218C5A]/30 hover:bg-[#218C5A]/20'
      : 'bg-white text-[#111111] border border-[rgba(17,17,17,0.15)] hover:border-[#111111] hover:bg-[#FAFAF8]',
    ghost: isWatched
      ? 'text-[#218C5A] hover:bg-[#218C5A]/10'
      : 'text-[#111111] hover:bg-neutral-100',
  };

  return (
    <button
      type="button"
      onClick={handleToggleWatch}
      disabled={loading}
      aria-label={isWatched ? `Watching updates for ${locationName}` : `Watch updates for ${locationName}`}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : isWatched ? (
        <Check className="w-4 h-4 shrink-0 text-[#218C5A]" />
      ) : (
        <Bell className="w-4 h-4 shrink-0" />
      )}
      <span>{isWatched ? 'Watching Location' : 'Watch Location'}</span>
    </button>
  );
}
