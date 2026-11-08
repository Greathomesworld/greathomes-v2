import React from 'react';
import {
  Dumbbell,
  Waves,
  Trees,
  Building2,
  Car,
  Zap,
  Shield,
  Sparkles,
  Wifi,
  Baby,
  Footprints,
  Flame,
} from 'lucide-react';
import { PropertyDetailAmenityViewModel } from '@/src/domain/projects/viewModels/listingDetailViewModel';

interface PropertyAmenitiesSectionProps {
  amenities: PropertyDetailAmenityViewModel[];
  mode: 'RESALE' | 'RENTAL';
  projectName?: string | null;
}

function getAmenityIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('gym') || lower.includes('fitness') || lower.includes('yoga'))
    return Dumbbell;
  if (lower.includes('pool') || lower.includes('swim')) return Waves;
  if (lower.includes('garden') || lower.includes('park') || lower.includes('landscape'))
    return Trees;
  if (lower.includes('club') || lower.includes('lounge') || lower.includes('hall') || lower.includes('community'))
    return Building2;
  if (lower.includes('parking') || lower.includes('garage') || lower.includes('ev'))
    return Car;
  if (lower.includes('power') || lower.includes('backup') || lower.includes('generator'))
    return Zap;
  if (lower.includes('security') || lower.includes('cctv') || lower.includes('guard') || lower.includes('intercom'))
    return Shield;
  if (lower.includes('play') || lower.includes('kid') || lower.includes('children'))
    return Baby;
  if (lower.includes('jog') || lower.includes('track') || lower.includes('walk'))
    return Footprints;
  if (lower.includes('fire')) return Flame;
  if (lower.includes('wifi') || lower.includes('internet')) return Wifi;
  return Sparkles;
}

export function PropertyAmenitiesSection({
  amenities,
  mode,
  projectName,
}: PropertyAmenitiesSectionProps) {
  const accentColor = mode === 'RENTAL' ? 'text-[#218C5A]' : 'text-[#E85D3F]';

  // Default core residential facilities if none explicitly assigned in join table
  const fallbackFacilities = [
    { id: 'fb-security', name: '24x7 Security', category: 'Security' },
    { id: 'fb-power', name: 'Power Backup', category: 'Convenience' },
    { id: 'fb-lift', name: 'High-Speed Elevators', category: 'Convenience' },
    { id: 'fb-parking', name: 'Covered Parking', category: 'Convenience' },
    ...(projectName
      ? [
          { id: 'fb-club', name: 'Clubhouse Access', category: 'Lifestyle' },
          { id: 'fb-gym', name: 'Fitness Center', category: 'Sports' },
        ]
      : []),
  ];

  const displayItems = amenities.length > 0 ? amenities : fallbackFacilities;

  return (
    <section id="amenities" className="scroll-mt-32">
      <div className="bg-white rounded-2xl border border-[#E6E2DC] p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className={`text-[11px] font-display uppercase tracking-wider font-semibold block ${accentColor}`}>
              Lifestyle & Facilities
            </span>
            <h2 className="text-base sm:text-lg font-display font-bold text-[#111111]">
              Amenities & Facilities
            </h2>
          </div>
          {amenities.length > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-[#FAFAF8] border border-[#E6E2DC] text-[11px] font-display font-semibold text-[#111111]/70">
              {amenities.length} {amenities.length === 1 ? 'Amenity' : 'Amenities'}
            </span>
          )}
        </div>

        {/* Mobile Compact Icon Row (Matches Mobile Reference) */}
        <div className="grid grid-cols-5 gap-2 sm:hidden pt-1">
          {displayItems.slice(0, 5).map(item => {
            const Icon = getAmenityIcon(item.name);
            return (
              <div
                key={item.id}
                className="flex flex-col items-center text-center space-y-1.5"
              >
                <div className="w-10 h-10 rounded-full bg-[#F5F4F0] border border-[#E6E2DC] flex items-center justify-center text-[#111111]/75">
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-body text-[#111111]/80 leading-tight line-clamp-2">
                  {item.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* Desktop & Full Amenity Grid */}
        <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {displayItems.map(item => {
            const Icon = getAmenityIcon(item.name);
            return (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-[#FAFAF8] border border-[#E6E2DC]/80 flex items-center gap-3 hover:border-[#111111]/20 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-white border border-[#E6E2DC] flex items-center justify-center text-[#E85D3F] shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-xs sm:text-sm font-display font-semibold text-[#111111] block truncate">
                    {item.name}
                  </span>
                  {item.category && (
                    <span className="text-[10px] font-body text-[#111111]/50 block truncate">
                      {item.category}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {amenities.length > 5 && (
          <div className="sm:hidden grid grid-cols-2 gap-2 pt-2 border-t border-[#E6E2DC]/60">
            {amenities.slice(5).map(item => {
              const Icon = getAmenityIcon(item.name);
              return (
                <div
                  key={item.id}
                  className="p-2.5 rounded-xl bg-[#FAFAF8] border border-[#E6E2DC]/70 flex items-center gap-2"
                >
                  <Icon className="w-3.5 h-3.5 text-[#E85D3F] shrink-0" />
                  <span className="text-xs font-display font-medium text-[#111111] truncate">
                    {item.name}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
