import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Building2, MapPin, ShieldCheck, CheckCircle2, Sparkles } from 'lucide-react';
import { PublicProjectDto } from '@/src/domain/projects/dto/projectDto';
import {
  deriveProjectCarpetAreaRangeText,
  formatInventoryListingCountPhrase,
} from '@/src/domain/projects/viewModels/projectInventoryViewModel';
import { formatIndianPrice } from '@/src/components/discovery/formatters';
import { EnquiryTriggerButton } from '@/src/components/enquiry/EnquiryTriggerButton';

interface ProjectInventoryHeaderProps {
  project: PublicProjectDto;
  mode: 'RESALE' | 'RENTAL';
  totalEligibleCount: number;
  siblingEligibleCount?: number;
  verifiedCount: number;
  minValue: number | null;
  maxValue: number | null;
  availableBhkCounts: number[];
}

export function ProjectInventoryHeader({
  project,
  mode,
  totalEligibleCount,
  siblingEligibleCount = 0,
  verifiedCount,
  minValue,
  maxValue,
  availableBhkCounts,
}: ProjectInventoryHeaderProps) {
  const isResale = mode === 'RESALE';
  const resaleEligibleCount = isResale ? totalEligibleCount : siblingEligibleCount;
  const rentalEligibleCount = !isResale ? totalEligibleCount : siblingEligibleCount;

  const categoryLabel = isResale ? 'Resale Apartments' : 'Apartments for Rent';
  const statusLabel = project.status ? project.status.replace(/_/g, ' ') : 'Published';

  const localityName = project.location?.name?.trim() || 'Kolkata';
  const locationDisplay =
    localityName.toLowerCase() !== 'kolkata' ? `${localityName}, Kolkata` : 'Kolkata';
  const developerName = project.developer?.name?.trim() || null;
  const projectConfigSummary =
    project.configurationsSummary?.trim() || project.snapshot?.configurations?.trim() || null;
  const carpetAreaRangeText = deriveProjectCarpetAreaRangeText(project);
  const verifiedReraNumber =
    project.hasVerifiedReraBadge && project.rera?.registrationNumber
      ? project.rera.registrationNumber.trim()
      : null;

  const formatRangeSummary = () => {
    if (minValue === null || minValue <= 0) return 'On Request';
    if (isResale) {
      if (maxValue && maxValue > minValue) {
        return `${formatIndianPrice(minValue)} – ${formatIndianPrice(maxValue)}`;
      }
      return formatIndianPrice(minValue);
    } else {
      if (maxValue && maxValue > minValue) {
        return `₹${minValue.toLocaleString('en-IN')} – ₹${maxValue.toLocaleString('en-IN')} / mo`;
      }
      return `₹${minValue.toLocaleString('en-IN')} / mo`;
    }
  };

  const activeListingBhkSummary =
    totalEligibleCount > 0
      ? availableBhkCounts.length > 0
        ? `${availableBhkCounts.join(', ')} BHK`
        : projectConfigSummary || 'All Configurations'
      : 'None Listed';

  const configurationBoxLabel = 'Available Configurations';

  const buildCustomerFirstIntro = () => {
    if (totalEligibleCount === 0) {
      if (isResale) {
        return `Looking to buy an apartment in ${project.name}? There are currently no resale apartments listed in this project. Register your requirement and we'll help you explore suitable options.`;
      }
      return `Looking to rent an apartment in ${project.name}? There are currently no rental apartments listed in this project. Register your requirement to receive updates when suitable options become available.`;
    }

    const bhkText =
      availableBhkCounts.length > 0
        ? `${availableBhkCounts.join(' & ')} BHK ${
            availableBhkCounts.length === 1 && totalEligibleCount === 1 ? 'option' : 'options'
          }`
        : null;

    if (isResale) {
      const devPhrase = developerName
        ? `this ${developerName} development`
        : 'this residential development';
      const countSentence =
        totalEligibleCount === 1
          ? 'There is currently 1 apartment listed for resale'
          : `There are currently ${totalEligibleCount} apartments listed for resale`;

      let pricePhrase: string | null = null;
      if (minValue && minValue > 0) {
        if (maxValue && maxValue > minValue) {
          pricePhrase = `prices ranging from ${formatIndianPrice(minValue)} to ${formatIndianPrice(maxValue)}`;
        } else {
          pricePhrase = `prices starting at ${formatIndianPrice(minValue)}`;
        }
      }

      const detailsClause =
        bhkText && pricePhrase
          ? `, with ${bhkText} and ${pricePhrase}`
          : bhkText
          ? `, with ${bhkText}`
          : pricePhrase
          ? `, with ${pricePhrase}`
          : '';

      return `Looking to buy an apartment in ${project.name}? Explore resale apartments in ${devPhrase} in ${locationDisplay}. ${countSentence}${detailsClause}.`;
    } else {
      const countSentence =
        totalEligibleCount === 1
          ? 'There is currently 1 apartment listed for rent'
          : `There are currently ${totalEligibleCount} apartments listed for rent`;

      let rentPhrase: string | null = null;
      if (minValue && minValue > 0) {
        if (maxValue && maxValue > minValue) {
          rentPhrase = `monthly rents starting at ₹${minValue.toLocaleString('en-IN')}`;
        } else {
          rentPhrase = `monthly rents starting at ₹${minValue.toLocaleString('en-IN')}`;
        }
      }

      const detailsClause =
        bhkText && rentPhrase
          ? `, with ${bhkText} and ${rentPhrase}`
          : bhkText
          ? `, with ${bhkText}`
          : rentPhrase
          ? `, with ${rentPhrase}`
          : '';

      return `Looking to rent an apartment in ${project.name}? Explore available rental homes in ${locationDisplay}. ${countSentence}${detailsClause}.`;
    }
  };

  return (
    <header className="bg-[var(--color-background)] border-b border-[var(--color-border)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Back to Project Link & Status Badges */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/projects/${project.slug}`}
            className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-[var(--color-foreground)]/75 hover:text-[var(--color-accent)] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to {project.name} Overview</span>
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-display font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md bg-[var(--color-foreground)]/[0.05] text-[var(--color-foreground)] border border-[var(--color-border)]">
              {statusLabel}
            </span>
            {project.hasVerifiedReraBadge && (
              <span className="inline-flex items-center gap-1 text-[11px] font-display font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md bg-[#218C5A]/10 text-[#218C5A] border border-[#218C5A]/25">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  {verifiedReraNumber ? `RERA Verified · ${verifiedReraNumber}` : 'RERA Verified'}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Main Editorial Heading & Project Context */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="text-xs uppercase font-display font-semibold tracking-wider text-[var(--color-accent)]">
              {project.name} · {categoryLabel}
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-editorial font-normal tracking-tight text-[var(--color-foreground)] leading-[1.1]">
              {isResale
                ? `Resale Apartments in ${project.name}`
                : `Apartments for Rent in ${project.name}`}
            </h1>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-body text-[var(--color-foreground)]/75 pt-1">
              {developerName && (
                <div className="inline-flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-[var(--color-foreground)]/50" />
                  <span>By </span>
                  {project.developer.slug ? (
                    <Link
                      href={`/developers/${project.developer.slug}`}
                      className="font-medium text-[var(--color-foreground)] underline underline-offset-4 hover:text-[var(--color-accent)]"
                    >
                      {developerName}
                    </Link>
                  ) : (
                    <span className="font-medium text-[var(--color-foreground)]">{developerName}</span>
                  )}
                </div>
              )}

              {project.location?.name && (
                <div className="inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-[var(--color-foreground)]/50" />
                  {project.location.slug ? (
                    <Link
                      href={`/locations/${project.location.slug}`}
                      className="font-medium text-[var(--color-foreground)] underline underline-offset-4 hover:text-[var(--color-accent)]"
                    >
                      {locationDisplay}
                    </Link>
                  ) : (
                    <span className="font-medium text-[var(--color-foreground)]">
                      {locationDisplay}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Customer-First Intro Paragraph Below H1 */}
            <p className="text-sm font-body text-[var(--color-foreground)]/75 leading-relaxed pt-1">
              {buildCustomerFirstIntro()}
            </p>
          </div>

          {/* Project-Contextual Enquiry CTA */}
          <div className="shrink-0 flex flex-wrap items-center gap-3">
            <EnquiryTriggerButton
              contextData={{
                contextType: isResale ? 'RESALE' : 'RENTAL',
                projectName: project.name,
                projectSlug: project.slug,
                locationName: project.location?.name,
                title: isResale
                  ? `${project.name} — Resale Advisory`
                  : `${project.name} — Rental Concierge`,
                subtitle: isResale
                  ? `Request resale availability alerts, price guidance & site visit in ${project.name}`
                  : `Schedule a rental viewing & lease assistance in ${project.name}`,
              }}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[var(--color-foreground)] text-[var(--color-background)] hover:opacity-90 font-display font-semibold text-sm transition-all cursor-pointer shadow-xs"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isResale ? 'Enquire for Resale Apartments' : 'Enquire for Rental Apartments'}</span>
            </EnquiryTriggerButton>
          </div>
        </div>

        {/* KPI Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-foreground)]/[0.015]">
            <div className="text-[11px] font-display uppercase tracking-wider text-[var(--color-foreground)]/55">
              Available Apartments
            </div>
            <div className="text-xl font-display font-bold text-[var(--color-foreground)] mt-0.5">
              {totalEligibleCount} {totalEligibleCount === 1 ? 'Apartment' : 'Apartments'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-foreground)]/[0.015]">
            <div className="text-[11px] font-display uppercase tracking-wider text-[var(--color-foreground)]/55">
              Verified Apartments
            </div>
            <div className="text-xl font-display font-bold text-[#218C5A] mt-0.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{verifiedCount} Verified</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-foreground)]/[0.015]">
            <div className="text-[11px] font-display uppercase tracking-wider text-[var(--color-foreground)]/55">
              {isResale ? 'Asking Price Range' : 'Monthly Rent Range'}
            </div>
            <div className="text-lg font-display font-bold text-[var(--color-foreground)] mt-0.5 truncate">
              {formatRangeSummary()}
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-foreground)]/[0.015]">
            <div className="text-[11px] font-display uppercase tracking-wider text-[var(--color-foreground)]/55">
              {configurationBoxLabel}
            </div>
            <div className="text-lg font-display font-bold text-[var(--color-foreground)] mt-0.5 truncate">
              {activeListingBhkSummary}
            </div>
          </div>
        </div>

        {/* Project Navigation Tabs (Overview / Resale / Rent — Both sibling routes always exposed) */}
        <nav aria-label="Project inventory sections" className="flex items-center gap-2 pt-2 overflow-x-auto">
          <Link
            href={`/projects/${project.slug}`}
            className="px-4 py-2 rounded-lg text-xs font-display font-semibold border border-[var(--color-border)] text-[var(--color-foreground)]/75 hover:text-[var(--color-foreground)] hover:border-[var(--color-foreground)]/30 transition-colors shrink-0"
          >
            Project Overview
          </Link>

          <Link
            href={`/projects/${project.slug}/resale`}
            aria-current={isResale ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-display font-semibold border transition-colors shrink-0 ${
              isResale
                ? 'bg-[var(--color-foreground)] text-[var(--color-background)] border-[var(--color-foreground)]'
                : 'border-[var(--color-border)] text-[var(--color-foreground)]/75 hover:text-[var(--color-foreground)] hover:border-[var(--color-foreground)]/30'
            }`}
          >
            <span>Resale Apartments</span>
            {resaleEligibleCount > 0 && (
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded ${
                  isResale
                    ? 'bg-[var(--color-background)]/20 text-[var(--color-background)]'
                    : 'bg-[var(--color-foreground)]/10 text-[var(--color-foreground)]'
                }`}
              >
                {resaleEligibleCount}
              </span>
            )}
          </Link>

          <Link
            href={`/projects/${project.slug}/rent`}
            aria-current={!isResale ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-display font-semibold border transition-colors shrink-0 ${
              !isResale
                ? 'bg-[var(--color-foreground)] text-[var(--color-background)] border-[var(--color-foreground)]'
                : 'border-[var(--color-border)] text-[var(--color-foreground)]/75 hover:text-[var(--color-foreground)] hover:border-[var(--color-foreground)]/30'
            }`}
          >
            <span>Apartments for Rent</span>
            {rentalEligibleCount > 0 && (
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded ${
                  !isResale
                    ? 'bg-[var(--color-background)]/20 text-[var(--color-background)]'
                    : 'bg-[var(--color-foreground)]/10 text-[var(--color-foreground)]'
                }`}
              >
                {rentalEligibleCount}
              </span>
            )}
          </Link>
        </nav>
      </div>
    </header>
  );
}

