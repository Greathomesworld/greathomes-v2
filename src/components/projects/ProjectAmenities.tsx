import React from 'react';
import { PublicProjectAmenityDto } from '@/src/domain/projects/dto/projectDto';
import {
  CheckCircle2,
  Dumbbell,
  Waves,
  Building,
  Trees,
  Shield,
  Zap,
  Wifi,
  Car,
  Gamepad2,
  Baby,
  Sun,
  Coffee,
  Sparkles,
  Star,
} from 'lucide-react';

interface ProjectAmenitiesProps {
  amenities: PublicProjectAmenityDto[];
}

function renderAmenityIcon(iconName?: string | null, className = 'w-4 h-4') {
  if (!iconName) return <CheckCircle2 className={className} />;
  const normalized = iconName.toLowerCase().trim();
  switch (normalized) {
    case 'dumbbell':
    case 'fitness':
    case 'gym':
      return <Dumbbell className={className} />;
    case 'waves':
    case 'swimming-pool':
    case 'pool':
      return <Waves className={className} />;
    case 'building':
    case 'clubhouse':
    case 'club':
      return <Building className={className} />;
    case 'trees':
    case 'gardens':
    case 'outdoor':
      return <Trees className={className} />;
    case 'shield':
    case 'security':
      return <Shield className={className} />;
    case 'zap':
    case 'power':
      return <Zap className={className} />;
    case 'wifi':
    case 'internet':
      return <Wifi className={className} />;
    case 'car':
    case 'parking':
      return <Car className={className} />;
    case 'gamepad-2':
    case 'indoor':
      return <Gamepad2 className={className} />;
    case 'baby':
    case 'play-area':
      return <Baby className={className} />;
    case 'sun':
    case 'solar':
    case 'eco':
      return <Sun className={className} />;
    case 'coffee':
    case 'lounge':
      return <Coffee className={className} />;
    case 'sparkles':
    case 'luxury':
      return <Sparkles className={className} />;
    default:
      return <CheckCircle2 className={className} />;
  }
}

import { getEligibleAmenities } from '@/src/domain/projects/viewModels/projectSectionEligibility';
export { getEligibleAmenities };

export function ProjectAmenities({ amenities }: ProjectAmenitiesProps) {
  const eligibleAmenities = getEligibleAmenities(amenities);
  if (eligibleAmenities.length === 0) return null;

  const featuredHighlights = eligibleAmenities.filter((a) => a.isFeatured);
  const standardAmenities =
    featuredHighlights.length > 0
      ? eligibleAmenities.filter((a) => !a.isFeatured)
      : eligibleAmenities;

  return (
    <section
      id="amenities"
      aria-labelledby="project-amenities-heading"
      className="space-y-8 pt-8 border-t border-[var(--color-border)]"
    >
      <div>
        <h2
          id="project-amenities-heading"
          className="text-2xl font-display font-semibold text-[var(--color-foreground)]"
        >
          Features & Curated Amenities
        </h2>
        <p className="text-xs text-[var(--color-foreground)]/65 mt-1">
          Lifestyle, wellness, and recreational amenities verified for this residential enclave.
        </p>
      </div>

      {/* SECTION 1: Key Project Highlights / Featured Amenities */}
      {featuredHighlights.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 font-display">
              Key Project Highlights ({featuredHighlights.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {featuredHighlights.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 p-4 rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/40 via-white to-neutral-50/20 shadow-2xs relative overflow-hidden"
              >
                <div className="p-2.5 rounded-lg bg-amber-100/80 text-amber-800 shrink-0">
                  {renderAmenityIcon(item.icon, 'w-5 h-5 text-amber-700')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-neutral-900 truncate font-display">
                      {item.name}
                    </span>
                  </div>
                  {item.category && (
                    <span className="text-[10px] uppercase font-mono font-semibold tracking-wider text-amber-700/80 block mt-1">
                      {item.category}
                    </span>
                  )}
                </div>
                <div className="absolute top-2.5 right-2.5">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 font-mono">
                    <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                    Featured
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 2: Remaining Verified Project Amenities */}
      {standardAmenities.length > 0 && (
        <div className="space-y-3">
          {featuredHighlights.length > 0 && (
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-display">
              All Verified Enclave Amenities ({standardAmenities.length})
            </h3>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {standardAmenities.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-foreground)]/[0.01] hover:border-neutral-300 transition-colors"
              >
                <div className="p-2 rounded-lg shrink-0 bg-neutral-100 text-neutral-800">
                  {renderAmenityIcon(item.icon, 'w-4 h-4 text-emerald-600')}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-[var(--color-foreground)]/90 truncate block font-display">
                    {item.name}
                  </span>
                  {item.category && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-400 block">
                        {item.category}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
