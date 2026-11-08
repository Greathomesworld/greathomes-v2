'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  Building2,
  MapPin,
  ShieldCheck,
  Sparkles,
  Images,
  ArrowRight,
  Calendar,
  Phone,
  Share2,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  HardHat,
  Clock,
  FileText,
  Video,
  Play,
  Headphones,
  CheckCircle2,
  TrendingUp,
  Layers,
  Users,
  X,
  Download,
} from 'lucide-react';
import { PublicProjectDto } from '@/src/domain/projects/dto/projectDto';
import {
  formatProjectLocationFullLabel,
  formatProjectLocationShortLabel,
} from '@/src/domain/projects/viewModels/projectLocationViewModel';
import { parseVideoUrl, getVideoThumbnail } from '@/src/lib/videoUtils';
import { selectHeroMedia } from './heroMediaSelection';
import { ProjectLightbox } from './ProjectLightbox';
import { GreatHomesAdvisoryCard } from './GreatHomesAdvisoryCard';
import { useProjectInteraction } from './ProjectInteractionContext';
import { useVisitorTelemetry } from '@/src/components/telemetry/VisitorTelemetryProvider';
import { prepareProjectConfigurations } from './typologies/typologyModel';
import { scrollToProjectSection } from './scrollToProjectSection';

export { GreatHomesAdvisoryCard };

interface ProjectHeroProps {
  project: PublicProjectDto;
}

export function ProjectHero({ project }: ProjectHeroProps) {
  const { openProjectViewer, openBrochureModal } = useProjectInteraction();
  const { trackEvent } = useVisitorTelemetry();
  const hasBrochure = Boolean(project.hasBrochure || project.brochure?.available);

  const handleOpenBrochure = () => {
    trackEvent({
      eventType: 'BROCHURE_CLICKED',
      entityType: 'PROJECT',
      entityId: project.id,
      entitySlug: project.slug,
      metadata: {
        placement: 'mobile_hero_cta',
        projectName: project.name,
      },
    }).catch(() => {});
    openBrochureModal();
  };

  const { heroMedia, suitableMediaList, heroIndex } = useMemo(
    () => selectHeroMedia(project.media),
    [project.media]
  );
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState<number>(heroIndex >= 0 ? heroIndex : 0);

  useEffect(() => {
    setActiveMediaIndex(heroIndex >= 0 ? heroIndex : 0);
  }, [project.id, heroIndex]);

  const totalSuitable = suitableMediaList.length;
  const safeActiveIndex =
    totalSuitable > 0 ? Math.min(Math.max(0, activeMediaIndex), totalSuitable - 1) : 0;
  const currentMedia = suitableMediaList[safeActiveIndex] || heroMedia;

  const handlePrevMedia = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (totalSuitable <= 1) return;
    setActiveMediaIndex((prev) => {
      const clamped = Math.min(Math.max(0, prev), totalSuitable - 1);
      return clamped > 0 ? clamped - 1 : totalSuitable - 1;
    });
  };

  const handleNextMedia = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (totalSuitable <= 1) return;
    setActiveMediaIndex((prev) => {
      const clamped = Math.min(Math.max(0, prev), totalSuitable - 1);
      return clamped < totalSuitable - 1 ? clamped + 1 : 0;
    });
  };

  const openLightboxAt = (idx: number) => {
    if (totalSuitable <= 0) return;
    const clamped = Math.min(Math.max(0, idx), totalSuitable - 1);
    setActiveMediaIndex(clamped);
    setLightboxOpen(true);
  };

  const scrollToSection = (sectionId: string) => {
    scrollToProjectSection(sectionId);
  };
  const amenitiesMedia = project.media?.find((m) => m.category === 'AMENITIES') || null;
  const floorPlanMedia = project.media?.find((m) => m.category === 'FLOOR_PLANS') || null;
  const hasAmenities = Boolean(project.amenities && project.amenities.length > 0);

  // Safely find valid video walkthrough without inventing fake URLs
  const videoMedia = useMemo(() => {
    if (!project.media || project.media.length === 0) return null;
    return (
      project.media.find((m) => {
        if (!m.url) return false;
        const cat = (m.category || '').toUpperCase();
        const type = (m.mediaType || '').toUpperCase();
        const parsed = parseVideoUrl(m.url);
        return cat === 'WALKTHROUGH' || type === 'VIDEO' || parsed.isValid;
      }) || null
    );
  }, [project.media]);

  const parsedHeroVideo = useMemo(() => {
    return parseVideoUrl(videoMedia?.url);
  }, [videoMedia]);

  const hasValidVideo = Boolean(parsedHeroVideo.isValid);

  // Curated fallbacks if specific categories don't exist
  const amenitiesImgUrl = amenitiesMedia?.url || 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=800&q=80';

  // Safely resolve real project floor plans without hardcoding or inventing fake media
  const heroFloorPlanConfig = useMemo(() => {
    const configs = prepareProjectConfigurations(project.configurations, project.media);
    return configs.find((c) => c.hasFloorPlans && c.floorPlans.length > 0);
  }, [project.configurations, project.media]);

  const hasFloorPlans = Boolean(heroFloorPlanConfig && heroFloorPlanConfig.floorPlans.length > 0);
  const floorPlanImgUrl = heroFloorPlanConfig?.floorPlans[0]?.url || floorPlanMedia?.url || null;
  const videoThumbnailUrl = getVideoThumbnail(parsedHeroVideo);
  const videoTourImgUrl =
    videoThumbnailUrl ||
    (heroMedia
      ? heroMedia.url
      : 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80');

  // Status badge icon and label
  const isReadyToMove = project.status === 'READY_TO_MOVE' || project.status === 'COMPLETED';
  const statusLabel = project.status ? project.status.replace(/_/g, ' ') : 'Available';

  const walkthroughVideoUrl = hasValidVideo ? (parsedHeroVideo.embedUrl || '') : '';

  return (
    <section className="w-full bg-[var(--color-background)]">
      {/* =========================================================================
          DESKTOP HERO (Bento Grid matching REF 1 with Controlled 365px Height)
          Composed of 6-col Main Hero Image + 3-col Teaser Cards Stack
          ========================================================================= */}
      <div className="hidden lg:grid grid-cols-9 gap-3.5 xl:gap-4 items-stretch h-[365px]">
        {/* 1. Large Main Hero Image Card (col-span-6 out of 9) */}
        <div
          onClick={() => totalSuitable > 0 && openLightboxAt(safeActiveIndex)}
          className="col-span-6 relative h-[365px] rounded-2xl overflow-hidden bg-[#111111] shadow-md border border-[var(--color-border)] group cursor-pointer select-none"
          role="button"
          tabIndex={0}
          aria-label={`View photos for ${project.name}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openLightboxAt(safeActiveIndex);
            }
          }}
        >
          {/* Background Image */}
          {currentMedia ? (
            <img
              src={currentMedia.url}
              alt={currentMedia.altText || `${project.name} Flagship Architectural Elevation`}
              className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 pointer-events-none"
              loading="eager"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#1C1C1A] to-[#111111] flex items-center justify-center text-white/40">
              <Building2 className="w-12 h-12 stroke-1" />
            </div>
          )}

          {/* Dark Gradient Overlay for optimal legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/35 pointer-events-none" />

          {/* Top Bar inside Image: Status Badge (Left) & RERA Badge (Right) */}
          <div className="absolute top-3 inset-x-3.5 flex items-center justify-between pointer-events-none z-10 gap-2">
            {/* Status Badge */}
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-md text-[#E85D3F] text-xs font-semibold shadow-xs pointer-events-auto font-display shrink-0">
              {isReadyToMove ? (
                <Clock className="w-3 h-3 text-[#218C5A]" />
              ) : (
                <HardHat className="w-3 h-3 text-[#E85D3F]" />
              )}
              <span className={isReadyToMove ? 'text-[#218C5A]' : 'text-[#E85D3F]'}>
                {statusLabel}
              </span>
            </div>

            {/* RERA Registration & Verified Status */}
            {project.rera.registrationNumber ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-white/90 text-[11px] font-mono shadow-xs pointer-events-auto min-w-0 max-w-[200px] xl:max-w-[240px]">
                {project.rera.hasVerifiedReraBadge && (
                  <ShieldCheck className="w-3 h-3 text-[#218C5A] shrink-0" />
                )}
                <span className="truncate">RERA No. {project.rera.registrationNumber}</span>
              </div>
            ) : project.rera.hasVerifiedReraBadge ? (
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#218C5A]/90 backdrop-blur-md text-white text-[11px] font-semibold shadow-xs pointer-events-auto font-display shrink-0">
                <ShieldCheck className="w-3 h-3 shrink-0" />
                <span>RERA Verified</span>
              </div>
            ) : null}
          </div>

          {/* Bottom Overlay: Project Info (Left) & Gallery Controls (Right) */}
          <div className="absolute bottom-3 inset-x-3.5 flex items-end justify-between gap-3 z-10">
            {/* Left Details */}
            <div className="max-w-[68%] min-w-0 space-y-1">
              <h1 className="text-2xl xl:text-3xl font-serif font-bold text-white tracking-tight drop-shadow-md leading-tight line-clamp-2">
                {project.name}
              </h1>

              <div className="flex items-center gap-1 text-xs text-white/90 drop-shadow-xs font-body min-w-0">
                <MapPin className="w-3 h-3 text-[#E85D3F] shrink-0" />
                <span className="truncate">
                  {formatProjectLocationFullLabel(project.location)}
                </span>
              </div>

              {/* Sub-Pills: Developer & Property Status/Type */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5" onClick={(e) => e.stopPropagation()}>
                <Link
                  href={`/developers/${project.developer.slug}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/50 hover:bg-black/80 backdrop-blur-md border border-white/20 text-[11px] text-white/90 font-display transition-colors max-w-[160px] min-w-0"
                >
                  <span className="truncate">By {project.developer.name}</span>
                </Link>

                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-md border border-white/20 text-[11px] text-white/90 font-display shrink-0">
                  {statusLabel}
                </span>
              </div>
            </div>

            {/* Right Controls: Interactive Counter & Gallery Button */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Image Navigation Counter with Prev/Next buttons */}
              {totalSuitable > 0 && (
                <div
                  className="inline-flex items-center bg-black/60 backdrop-blur-md border border-white/20 text-white rounded-lg px-1.5 py-0.5 text-xs font-mono shadow-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={handlePrevMedia}
                    disabled={totalSuitable <= 1}
                    aria-label="Previous photo"
                    className="p-0.5 hover:text-[#E85D3F] transition-colors disabled:opacity-30 disabled:hover:text-white"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <span className="px-1 text-[11px] font-medium select-none whitespace-nowrap">
                    {safeActiveIndex + 1} / {totalSuitable}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextMedia}
                    disabled={totalSuitable <= 1}
                    aria-label="Next photo"
                    className="p-0.5 hover:text-[#E85D3F] transition-colors disabled:opacity-30 disabled:hover:text-white"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Gallery Button */}
              <button
                type="button"
                disabled={totalSuitable === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  openLightboxAt(safeActiveIndex);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/60 hover:bg-black/85 backdrop-blur-md border border-white/20 text-white text-xs font-medium font-display transition-all shadow-xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Gallery</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. Middle Column: Feature Teaser Cards Stack (col-span-3 out of 9, h-[365px]) */}
        <div className="col-span-3 flex flex-col gap-2.5 h-[365px]">
          {/* Teaser 1: Clubhouse & Amenities */}
          <div
            onClick={() => hasAmenities && scrollToSection('amenities')}
            className={`flex-1 relative rounded-2xl overflow-hidden bg-[#111111] border border-[var(--color-border)] shadow-xs group transition-transform duration-300 flex flex-col justify-end p-2.5 xl:p-3 select-none ${
              hasAmenities
                ? 'cursor-pointer hover:scale-[1.015]'
                : 'opacity-75 cursor-default'
            }`}
            role="button"
            tabIndex={hasAmenities ? 0 : -1}
            aria-disabled={!hasAmenities}
            aria-label={hasAmenities ? 'Jump to Clubhouse and Amenities' : 'Amenities details on request'}
            onKeyDown={(e) => {
              if (hasAmenities && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                scrollToSection('amenities');
              }
            }}
          >
            <img
              src={amenitiesImgUrl}
              alt="Amenities & Clubhouse"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 pointer-events-none"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20 pointer-events-none" />

            <div className="relative z-10 flex items-end justify-between gap-2">
              <div className="space-y-0.5 min-w-0">
                <div className="w-5 h-5 rounded-full bg-[#E85D3F] flex items-center justify-center text-white mb-0.5 shadow-xs">
                  <Users className="w-2.5 h-2.5" />
                </div>
                <h2 className="text-xs font-semibold text-white leading-tight font-display truncate">
                  Clubhouse & Amenities
                </h2>
                <p className="text-[10px] text-white/75 leading-tight line-clamp-1 font-body">
                  {hasAmenities
                    ? `${project.amenities.length}+ curated lifestyle amenities`
                    : 'Amenity details on request'}
                </p>
              </div>

              {hasAmenities && (
                <div className="w-6 h-6 rounded-full bg-black/60 group-hover:bg-black/90 border border-white/20 text-white flex items-center justify-center shrink-0 transition-all group-hover:translate-x-0.5">
                  <ArrowRight className="w-3 h-3" />
                </div>
              )}
            </div>
          </div>

          {/* Teaser 2: Floor Plans */}
          <div
            onClick={() => hasFloorPlans && openProjectViewer()}
            className={`flex-1 relative rounded-2xl overflow-hidden bg-[#111111] border border-[var(--color-border)] shadow-xs group transition-transform duration-300 flex flex-col justify-end p-2.5 xl:p-3 select-none ${
              hasFloorPlans
                ? 'cursor-pointer hover:scale-[1.015]'
                : 'opacity-60 cursor-not-allowed'
            }`}
            role="button"
            tabIndex={hasFloorPlans ? 0 : -1}
            aria-disabled={!hasFloorPlans}
            aria-label={hasFloorPlans ? 'Open Floor Plan Viewer' : 'Floor plans on request'}
            onKeyDown={(e) => {
              if (hasFloorPlans && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                openProjectViewer();
              }
            }}
          >
            {floorPlanImgUrl ? (
              <img
                src={floorPlanImgUrl}
                alt={`${project.name} floor plans preview`}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 pointer-events-none"
                loading="lazy"
              />
            ) : (
              <div className="absolute inset-0 bg-neutral-900 pointer-events-none" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20 pointer-events-none" />

            <div className="relative z-10 flex items-end justify-between gap-2">
              <div className="space-y-0.5 min-w-0">
                <div className="w-5 h-5 rounded-full bg-[#E85D3F] flex items-center justify-center text-white mb-0.5 shadow-xs">
                  <FileText className="w-2.5 h-2.5" />
                </div>
                <h2 className="text-xs font-semibold text-white leading-tight font-display truncate">
                  Floor Plans
                </h2>
                <p className="text-[10px] text-white/75 leading-tight line-clamp-1 font-body">
                  {hasFloorPlans ? 'Explore unit plans and configurations' : 'Floor plans on request'}
                </p>
              </div>

              {hasFloorPlans && (
                <div className="w-6 h-6 rounded-full bg-black/60 group-hover:bg-black/90 border border-white/20 text-white flex items-center justify-center shrink-0 transition-all group-hover:translate-x-0.5">
                  <ArrowRight className="w-3 h-3" />
                </div>
              )}
            </div>
          </div>

          {/* Teaser 3: Video Tour / Walkthrough */}
          <div
            onClick={() => hasValidVideo && scrollToSection('walkthrough')}
            className={`flex-1 relative rounded-2xl overflow-hidden bg-[#111111] border border-[var(--color-border)] shadow-xs group transition-transform duration-300 flex flex-col justify-end p-2.5 xl:p-3 select-none ${
              hasValidVideo
                ? 'cursor-pointer hover:scale-[1.015]'
                : 'opacity-60 cursor-not-allowed'
            }`}
            role="button"
            tabIndex={hasValidVideo ? 0 : -1}
            aria-disabled={!hasValidVideo}
            aria-label={hasValidVideo ? 'Jump to Video Tour' : 'Video walkthrough on request'}
            onKeyDown={(e) => {
              if (hasValidVideo && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                scrollToSection('walkthrough');
              }
            }}
          >
            <img
              src={videoTourImgUrl}
              alt="Video Tour Walkthrough"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20 pointer-events-none" />

            {/* Play Icon in center */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-7 h-7 rounded-full bg-white/90 text-[#E85D3F] flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                <Play className="w-3 h-3 fill-current ml-0.5" />
              </div>
            </div>

            <div className="relative z-10 flex items-end justify-between gap-2">
              <div className="space-y-0.5 min-w-0">
                <div className="w-5 h-5 rounded-full bg-[#E85D3F] flex items-center justify-center text-white mb-0.5 shadow-xs">
                  <Video className="w-2.5 h-2.5" />
                </div>
                <h2 className="text-xs font-semibold text-white leading-tight font-display truncate">
                  Video Tour
                </h2>
                <p className="text-[10px] text-white/75 leading-tight line-clamp-1 font-body">
                  {hasValidVideo ? 'Take a virtual walkthrough' : 'Walkthrough on request'}
                </p>
              </div>

              {hasValidVideo && (
                <div className="w-6 h-6 rounded-full bg-black/60 group-hover:bg-black/90 border border-white/20 text-white flex items-center justify-center shrink-0 transition-all group-hover:translate-x-0.5">
                  <ArrowRight className="w-3 h-3" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MOBILE HERO (Matching REF 3) — Visible on <lg screens (Unchanged)
          ========================================================================= */}
      <div className="block lg:hidden">
          {/* Main Mobile Hero Card */}
          <div
            onClick={() => totalSuitable > 0 && openLightboxAt(safeActiveIndex)}
            className="relative w-full aspect-[4/3] sm:aspect-[16/10] rounded-2xl overflow-hidden bg-[#111111] shadow-sm border border-[var(--color-border)] group cursor-pointer mb-3 select-none"
            role="button"
            tabIndex={0}
            aria-label={`View photos for ${project.name}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openLightboxAt(safeActiveIndex);
              }
            }}
          >
            {/* Background Image */}
            {currentMedia ? (
              <img
                src={currentMedia.url}
                alt={currentMedia.altText || project.name}
                className="w-full h-full object-cover"
                loading="eager"
              />
            ) : (
              <div className="w-full h-full bg-[#1C1C1A] flex items-center justify-center text-white/40">
                <Building2 className="w-12 h-12 stroke-1" />
              </div>
            )}

            {/* Dark Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/30 pointer-events-none" />

            {/* Top Bar: Status Badge (Left) & Image Counter (Right) */}
            <div className="absolute top-3.5 inset-x-3.5 flex items-center justify-between pointer-events-none z-10 gap-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/95 text-[#E85D3F] text-xs font-semibold shadow-sm pointer-events-auto font-display shrink-0">
                {isReadyToMove ? (
                  <Clock className="w-3.5 h-3.5 text-[#218C5A]" />
                ) : (
                  <HardHat className="w-3.5 h-3.5 text-[#E85D3F]" />
                )}
                <span className={isReadyToMove ? 'text-[#218C5A]' : 'text-[#E85D3F]'}>
                  {statusLabel}
                </span>
              </div>

              {totalSuitable > 0 && (
                <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-xs font-mono font-medium shadow-xs pointer-events-auto shrink-0">
                  {safeActiveIndex + 1} / {totalSuitable}
                </div>
              )}
            </div>

            {/* Gallery Previous/Next Navigation Arrows (Circular white buttons with dark chevrons) */}
            {totalSuitable > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrevMedia}
                  aria-label="Previous photo"
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white hover:bg-white/95 text-stone-900 flex items-center justify-center shadow-md active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-[#E85D3F]"
                >
                  <ChevronLeft className="w-4 h-4 text-stone-900 stroke-[2.5]" />
                </button>
                <button
                  type="button"
                  onClick={handleNextMedia}
                  aria-label="Next photo"
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white hover:bg-white/95 text-stone-900 flex items-center justify-center shadow-md active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-[#E85D3F]"
                >
                  <ChevronRight className="w-4 h-4 text-stone-900 stroke-[2.5]" />
                </button>
              </>
            )}

            {/* Bottom Overlay: Title, Location & View Photos Button */}
            <div className="absolute bottom-3.5 inset-x-3.5 flex items-end justify-between gap-2 z-10">
              <div className="max-w-[65%] min-w-0 space-y-0.5">
                <h1 className="text-2xl sm:text-3xl font-serif font-bold text-white tracking-tight leading-tight drop-shadow-md line-clamp-2">
                  {project.name}
                </h1>
                <div className="flex items-center gap-1 text-xs text-white/90 drop-shadow-sm font-body min-w-0">
                  <MapPin className="w-3.5 h-3.5 text-[#E85D3F] shrink-0" />
                  <span className="truncate">
                    {formatProjectLocationShortLabel(project.location)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={totalSuitable === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  openLightboxAt(safeActiveIndex);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 text-white text-xs font-medium font-display transition-all shadow-sm shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>View Photos</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Quick Action Navigation Row with Separate Circular Video Button */}
          <div className="flex items-center gap-1.5 sm:gap-2 w-full">
            {/* 1. Gallery */}
            <button
              type="button"
              disabled={totalSuitable === 0}
              onClick={() => openLightboxAt(0)}
              className="flex-1 py-2.5 px-1.5 sm:px-2 rounded-xl bg-[#E85D3F] hover:bg-[#D44C2F] text-white text-[11px] sm:text-xs font-medium font-display flex items-center justify-center gap-1 sm:gap-1.5 shadow-xs transition-colors min-w-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Images className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Gallery ({totalSuitable})</span>
            </button>

            {/* 2. Floor Plans */}
            <button
              type="button"
              onClick={() => hasFloorPlans && openProjectViewer()}
              disabled={!hasFloorPlans}
              aria-disabled={!hasFloorPlans}
              aria-label={hasFloorPlans ? "Open Floor Plan Viewer" : "Floor plans on request"}
              className={`flex-1 py-2.5 px-1.5 sm:px-2 rounded-xl bg-white hover:bg-stone-50 border border-stone-200 dark:border-stone-700 text-[#111111] dark:text-stone-900 text-[11px] sm:text-xs font-medium font-display flex items-center justify-center shadow-xs transition-colors min-w-0 ${
                hasFloorPlans ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'
              }`}
            >
              <span className="truncate">Floor Plans</span>
            </button>

            {/* 3. Amenities */}
            <button
              type="button"
              onClick={() => hasAmenities && scrollToSection('amenities')}
              disabled={!hasAmenities}
              aria-disabled={!hasAmenities}
              aria-label={hasAmenities ? "Jump to Amenities" : "Amenities details on request"}
              className={`flex-1 py-2.5 px-1.5 sm:px-2 rounded-xl bg-white hover:bg-stone-50 border border-stone-200 dark:border-stone-700 text-[#111111] dark:text-stone-900 text-[11px] sm:text-xs font-medium font-display flex items-center justify-center shadow-xs transition-colors min-w-0 ${
                hasAmenities ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'
              }`}
            >
              <span className="truncate">Amenities</span>
            </button>

            {/* 4. Circular Video Button (Immediately to the right of quick-action controls) */}
            {hasValidVideo ? (
              <button
                type="button"
                onClick={() => setVideoModalOpen(true)}
                aria-label="Play project walkthrough"
                title="Play project walkthrough"
                className="relative w-10 h-10 rounded-full bg-[#E85D3F] hover:bg-[#D44C2F] text-white flex items-center justify-center shrink-0 shadow-md transition-all active:scale-95 group focus:outline-none focus:ring-2 focus:ring-[#E85D3F] focus:ring-offset-2"
              >
                <span className="absolute inset-0 rounded-full bg-[#E85D3F] animate-ping opacity-60 motion-reduce:hidden pointer-events-none" />
                <Play className="w-4 h-4 fill-white text-white ml-0.5 relative z-10" />
              </button>
            ) : (
              <button
                type="button"
                disabled
                aria-disabled="true"
                aria-label="Walkthrough video unavailable"
                title="Walkthrough video unavailable"
                className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-300 dark:text-stone-600 flex items-center justify-center shrink-0 cursor-not-allowed border border-stone-200 dark:border-stone-700 opacity-40"
              >
                <Play className="w-4 h-4 fill-current ml-0.5" />
              </button>
            )}
          </div>

          {/* Download Official Brochure Mobile Action (visible on <lg screens when project has brochure) */}
          {hasBrochure && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleOpenBrochure}
                data-testid="hero-mobile-download-brochure-button"
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl border border-[#E85D3F]/35 bg-white hover:bg-[#FAFAF8] active:bg-[#E85D3F]/5 text-[#111111] font-display font-semibold text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 shadow-2xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F] cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#E85D3F] shrink-0" aria-hidden="true" />
                <span>Download Official Project Brochure (PDF)</span>
              </button>
            </div>
          )}
        </div>

      {/* Lightbox Modal (reusing existing ProjectLightbox with suitableMediaList) */}
      {suitableMediaList.length > 0 && (
        <ProjectLightbox
          mediaList={suitableMediaList}
          initialIndex={safeActiveIndex}
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {/* Walkthrough Video Modal Popup */}
      {videoModalOpen && hasValidVideo && walkthroughVideoUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Walkthrough Video for ${project.name}`}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setVideoModalOpen(false)}
        >
          <div
            className="relative w-full max-w-3xl bg-[#111111] rounded-2xl overflow-hidden border border-white/15 shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-4 py-3 bg-[#1C1C1A] border-b border-white/10 flex items-center justify-between text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-[#E85D3F] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                </div>
                <div>
                  <h3 className="text-sm font-display font-semibold text-white">
                    Walkthrough Video
                  </h3>
                  <p className="text-xs text-white/70 truncate max-w-[220px] sm:max-w-md font-body">
                    {project.name}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setVideoModalOpen(false)}
                aria-label="Close walkthrough video"
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Frame */}
            <div className="relative aspect-video w-full bg-black">
              {parsedHeroVideo.provider === 'MP4' ? (
                <video
                  src={walkthroughVideoUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                />
              ) : (
                <iframe
                  src={walkthroughVideoUrl}
                  title={`${project.name} Walkthrough Video`}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
