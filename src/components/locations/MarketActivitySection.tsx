'use client';

import React from 'react';
import Link from 'next/link';
import {
  Calendar,
  Activity,
  ShieldCheck,
  Building2,
  Layers,
  Tag,
  Clock,
  Home,
  KeyRound,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { RecentActivityDto, PublicMarketEventDto } from '@/src/domain/marketIntelligence/dto/locationIntelligenceDto';

interface MarketActivitySectionProps {
  locationName: string;
  activity: RecentActivityDto;
}

function getEventIcon(eventType: string) {
  switch (eventType) {
    case 'PROJECT_RERA_VERIFIED':
      return <ShieldCheck className="w-4 h-4 text-[#218C5A]" />;
    case 'PROJECT_RERA_STATUS_CHANGED':
      return <CheckCircle2 className="w-4 h-4 text-[#218C5A]" />;
    case 'PROJECT_PUBLISHED':
      return <Building2 className="w-4 h-4 text-[#E85D3F]" />;
    case 'PROJECT_STATUS_CHANGED':
      return <Activity className="w-4 h-4 text-[#111111]" />;
    case 'PROJECT_CONFIGURATION_ADDED':
    case 'PROJECT_CONFIGURATION_UPDATED':
      return <Layers className="w-4 h-4 text-[#111111]" />;
    case 'PROJECT_PRICE_CHANGED':
    case 'RESALE_PRICE_CHANGED':
    case 'RENTAL_PRICE_CHANGED':
      return <Tag className="w-4 h-4 text-[#111111]" />;
    case 'PROJECT_POSSESSION_UPDATED':
      return <Clock className="w-4 h-4 text-[#111111]" />;
    case 'RESALE_LISTING_PUBLISHED':
    case 'RESALE_STATUS_CHANGED':
      return <KeyRound className="w-4 h-4 text-[#111111]" />;
    case 'RENTAL_LISTING_PUBLISHED':
    case 'RENTAL_STATUS_CHANGED':
      return <Home className="w-4 h-4 text-[#111111]" />;
    default:
      return <Activity className="w-4 h-4 text-[#111111]" />;
  }
}

function getEventBadgeColor(eventType: string) {
  if (eventType.includes('RERA')) {
    return 'bg-[#218C5A]/10 text-[#218C5A] border-[#218C5A]/20';
  }
  if (eventType === 'PROJECT_PUBLISHED') {
    return 'bg-[#E85D3F]/10 text-[#E85D3F] border-[#E85D3F]/20';
  }
  return 'bg-[rgba(17,17,17,0.04)] text-[#111111]/80 border-[rgba(17,17,17,0.08)]';
}

function groupEventsByDate(events: PublicMarketEventDto[]) {
  const groups: { dateLabel: string; isoDate: string; items: PublicMarketEventDto[] }[] = [];
  const map = new Map<string, { dateLabel: string; isoDate: string; items: PublicMarketEventDto[] }>();

  for (const evt of events) {
    const d = new Date(evt.eventDate);
    const dateLabel = d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const key = d.toISOString().split('T')[0];

    if (!map.has(key)) {
      const g = { dateLabel, isoDate: key, items: [] };
      map.set(key, g);
      groups.push(g);
    }
    map.get(key)!.items.push(evt);
  }

  return groups;
}

export function MarketActivitySection({
  locationName,
  activity,
}: MarketActivitySectionProps) {
  const events = activity?.events || [];
  if (events.length === 0) {
    return null;
  }
  const totalCount = activity?.totalEvents || events.length;
  const groups = groupEventsByDate(events);

  return (
    <section
      id="activity"
      className="space-y-6 pt-10 border-t border-[rgba(17,17,17,0.08)]"
      aria-labelledby="activity-heading"
    >
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2
              id="activity-heading"
              className="text-xl sm:text-2xl font-display font-semibold text-[#111111] tracking-tight"
            >
              Market Activity
            </h2>
            {totalCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-[rgba(17,17,17,0.05)] text-[#111111]/70 border border-[rgba(17,17,17,0.08)]">
                {totalCount} updates
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm font-body text-[#111111]/60 mt-1">
            Recent changes and verified updates across {locationName}.
          </p>
        </div>

        {totalCount > 0 && (
          <div className="text-xs text-[#111111]/50 font-mono">
            Chronological • Factual records
          </div>
        )}
      </div>

      {events.length === 0 ? (
        <div className="bg-white border border-[rgba(17,17,17,0.08)] rounded-xl p-8 text-center shadow-2xs">
          <Activity className="w-8 h-8 text-[#111111]/30 mx-auto mb-3" />
          <p className="text-sm font-display font-medium text-[#111111]">
            No recent market activity has been recorded
          </p>
          <p className="text-xs text-[#111111]/60 font-body mt-1 max-w-md mx-auto">
            Market events such as project launches, RERA confirmations, and configuration additions will appear here as they are verified.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[rgba(17,17,17,0.08)] rounded-xl p-6 sm:p-8 shadow-2xs">
          <div className="relative border-l border-[rgba(17,17,17,0.12)] ml-3 sm:ml-4 space-y-8">
            {groups.map((group) => (
              <div key={group.isoDate} className="relative pl-6 sm:pl-8 space-y-4">
                {/* Date marker */}
                <div className="absolute -left-1.5 top-0 w-3 h-3 rounded-full bg-[#111111] border-2 border-white" />
                
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-[#111111]/40" />
                  <time
                    dateTime={group.isoDate}
                    className="text-xs font-mono font-semibold tracking-wide uppercase text-[#111111]/60"
                  >
                    {group.dateLabel}
                  </time>
                </div>

                {/* Events on this date */}
                <div className="space-y-3">
                  {group.items.map((evt) => (
                    <div
                      key={evt.id}
                      className="p-4 rounded-lg bg-[#FAFAF8] border border-[rgba(17,17,17,0.06)] hover:border-[rgba(17,17,17,0.12)] transition-colors space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="p-1 rounded bg-white shadow-2xs shrink-0">
                            {getEventIcon(evt.eventType)}
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-display font-medium border ${getEventBadgeColor(
                              evt.eventType
                            )}`}
                          >
                            {evt.title}
                          </span>
                        </div>

                        {evt.project && (
                          <Link
                            href={evt.project.canonicalPath}
                            className="inline-flex items-center gap-1 text-xs font-display font-semibold text-[#E85D3F] hover:text-[#E85D3F]/80 transition-colors"
                          >
                            <span>{evt.project.name}</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}
                      </div>

                      <p className="text-xs sm:text-sm text-[#111111]/80 font-body leading-relaxed">
                        {evt.summary}
                      </p>

                      {/* Safe metadata tags if present */}
                      {evt.metadata && Object.keys(evt.metadata).length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {evt.metadata.bhkType && (
                            <span className="px-2 py-0.5 rounded bg-white text-[11px] font-mono text-[#111111]/70 border border-[rgba(17,17,17,0.08)]">
                              {evt.metadata.bhkType}
                            </span>
                          )}
                          {evt.metadata.newStatus && (
                            <span className="px-2 py-0.5 rounded bg-white text-[11px] font-mono text-[#111111]/70 border border-[rgba(17,17,17,0.08)]">
                              Status: {evt.metadata.newStatus.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
