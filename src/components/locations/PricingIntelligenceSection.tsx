'use client';

import React from 'react';
import { Info, AlertCircle, Building2, Home, Key } from 'lucide-react';
import {
  PriceIntelligenceDto,
  PriceMetricBasisSummaryDto,
  RentalPriceSummaryDto,
} from '@/src/domain/marketIntelligence/dto/locationIntelligenceDto';

interface PricingIntelligenceSectionProps {
  locationName: string;
  pricing: PriceIntelligenceDto;
}

function PriceCard({
  title,
  subtitle,
  summary,
}: {
  title: string;
  subtitle: string;
  summary?: PriceMetricBasisSummaryDto | 'NO_DATA';
}) {
  if (!summary || summary === 'NO_DATA' || summary.sampleCount === 0) {
    return null;
  }

  const isSingleSample = summary.sampleCount === 1 || summary.minRatePerSqft === summary.maxRatePerSqft;

  return (
    <div className="bg-white border border-[rgba(17,17,17,0.08)] rounded-xl p-4 sm:p-5 space-y-2.5 hover:border-[rgba(17,17,17,0.18)] transition-all shadow-2xs">
      <div className="flex items-center justify-between border-b border-[rgba(17,17,17,0.06)] pb-2 gap-2">
        <div>
          <span className="block text-xs font-display font-semibold uppercase tracking-wider text-[#111111]">
            {title}
          </span>
          <span className="block text-[11px] font-body text-[#111111]/55">
            {subtitle}
          </span>
        </div>
        <span className="text-[11px] font-mono text-[#111111]/60 bg-[#FAFAF8] px-2 py-0.5 rounded border border-[rgba(17,17,17,0.06)] shrink-0">
          {summary.sampleCount === 1 ? 'Indicative (1 sample)' : `${summary.sampleCount} samples`}
        </span>
      </div>

      <div className="space-y-1 pt-0.5">
        {isSingleSample ? (
          <>
            <div className="text-xl sm:text-2xl font-display font-bold text-[#111111]">
              ₹{summary.minRatePerSqft.toLocaleString('en-IN')}
              <span className="text-xs font-body font-normal text-[#111111]/60"> / sq.ft.</span>
            </div>
            <div className="text-xs text-[#111111]/60 font-body pt-0.5">
              Indicative rate from 1 verified configuration
            </div>
          </>
        ) : (
          <>
            <div className="text-xl sm:text-2xl font-display font-bold text-[#111111]">
              ₹{summary.minRatePerSqft.toLocaleString('en-IN')} – ₹{summary.maxRatePerSqft.toLocaleString('en-IN')}
              <span className="text-xs font-body font-normal text-[#111111]/60"> / sq.ft.</span>
            </div>
            <div className="text-xs text-[#111111]/70 font-body flex items-center justify-between pt-1">
              <span>Median Rate:</span>
              <span className="font-semibold text-[#111111]">
                ₹{summary.medianRatePerSqft.toLocaleString('en-IN')} / sq.ft.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RentalPriceCard({
  rental,
}: {
  rental?: RentalPriceSummaryDto | 'NO_DATA';
}) {
  if (!rental || rental === 'NO_DATA' || rental.sampleCount === 0 || !rental.minMonthlyRent) {
    return null;
  }

  const isSingleSample = rental.sampleCount === 1 || rental.minMonthlyRent === rental.maxMonthlyRent;

  return (
    <div className="bg-white border border-[rgba(17,17,17,0.08)] rounded-xl p-4 sm:p-5 space-y-2.5 hover:border-[rgba(17,17,17,0.18)] transition-all shadow-2xs">
      <div className="flex items-center justify-between border-b border-[rgba(17,17,17,0.06)] pb-2 gap-2">
        <div>
          <span className="block text-xs font-display font-semibold uppercase tracking-wider text-[#111111]">
            Monthly Rental Rate
          </span>
          <span className="block text-[11px] font-body text-[#111111]/55">
            Verified residential lease listings
          </span>
        </div>
        <span className="text-[11px] font-mono text-[#111111]/60 bg-[#FAFAF8] px-2 py-0.5 rounded border border-[rgba(17,17,17,0.06)] shrink-0">
          {rental.sampleCount === 1 ? 'Indicative (1 sample)' : `${rental.sampleCount} samples`}
        </span>
      </div>

      <div className="space-y-1 pt-0.5">
        {isSingleSample ? (
          <>
            <div className="text-xl sm:text-2xl font-display font-bold text-[#111111]">
              ₹{rental.minMonthlyRent.toLocaleString('en-IN')}
              <span className="text-xs font-body font-normal text-[#111111]/60"> / month</span>
            </div>
            <div className="text-xs text-[#111111]/60 font-body pt-0.5">
              Indicative monthly rent from 1 verified rental home
            </div>
          </>
        ) : (
          <>
            <div className="text-xl sm:text-2xl font-display font-bold text-[#111111]">
              ₹{rental.minMonthlyRent.toLocaleString('en-IN')} – ₹{(rental.maxMonthlyRent || rental.minMonthlyRent).toLocaleString('en-IN')}
              <span className="text-xs font-body font-normal text-[#111111]/60"> / month</span>
            </div>
            {rental.medianMonthlyRent && (
              <div className="text-xs text-[#111111]/70 font-body flex items-center justify-between pt-1">
                <span>Median Monthly Rent:</span>
                <span className="font-semibold text-[#111111]">
                  ₹{rental.medianMonthlyRent.toLocaleString('en-IN')} / month
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function PricingIntelligenceSection({
  locationName,
  pricing,
}: PricingIntelligenceSectionProps) {
  const hasNewBooking = Boolean(
    pricing.newBooking &&
      ((pricing.newBooking.carpetArea && pricing.newBooking.carpetArea !== 'NO_DATA' && pricing.newBooking.carpetArea.sampleCount > 0) ||
        (pricing.newBooking.builtUpArea && pricing.newBooking.builtUpArea !== 'NO_DATA' && pricing.newBooking.builtUpArea.sampleCount > 0) ||
        (pricing.newBooking.superBuiltUpArea && pricing.newBooking.superBuiltUpArea !== 'NO_DATA' && pricing.newBooking.superBuiltUpArea.sampleCount > 0))
  );

  const resaleObj = pricing.resale && pricing.resale !== 'NO_DATA' ? pricing.resale : null;
  const hasResale = Boolean(
    resaleObj &&
      ((resaleObj.carpetArea && resaleObj.carpetArea !== 'NO_DATA' && resaleObj.carpetArea.sampleCount > 0) ||
        (resaleObj.builtUpArea && resaleObj.builtUpArea !== 'NO_DATA' && resaleObj.builtUpArea.sampleCount > 0) ||
        (resaleObj.superBuiltUpArea && resaleObj.superBuiltUpArea !== 'NO_DATA' && resaleObj.superBuiltUpArea.sampleCount > 0))
  );

  const rentalObj = pricing.rental && pricing.rental !== 'NO_DATA' ? pricing.rental : null;
  const hasRental = Boolean(rentalObj && rentalObj.sampleCount > 0 && rentalObj.minMonthlyRent);

  const hasAnyData = hasNewBooking || hasResale || hasRental;

  return (
    <section id="pricing" className="space-y-5 pt-8 border-t border-[rgba(17,17,17,0.08)]" aria-labelledby="pricing-heading">
      <div>
        <h2
          id="pricing-heading"
          className="text-xl sm:text-2xl font-display font-semibold text-[#111111] tracking-tight"
        >
          Property pricing in {locationName}
        </h2>
        <p className="text-xs sm:text-sm font-body text-[#111111]/60 mt-0.5">
          Factual price metrics isolated strictly by transaction type and area measurement basis.
        </p>
      </div>

      {!hasAnyData ? (
        <div className="p-4 sm:p-5 rounded-xl border border-[rgba(17,17,17,0.08)] bg-white flex items-center gap-3.5 shadow-2xs">
          <AlertCircle className="w-5 h-5 text-neutral-400 shrink-0" />
          <div>
            <h3 className="text-sm font-display font-semibold text-[#111111]">
              Price benchmarks unavailable for {locationName}
            </h3>
            <p className="text-xs text-[#111111]/60 font-body mt-0.5">
              Not enough verified pricing configurations exist in this location scope yet to compute statistical benchmarks.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* New Project Pricing */}
          {hasNewBooking && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-display font-semibold uppercase tracking-wider text-[#111111]/70">
                <Building2 className="w-3.5 h-3.5 text-[#E85D3F]" />
                <span>New Project Pricing (Per Sq.Ft.)</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <PriceCard
                  title="Carpet Area Basis"
                  subtitle="Net usable floor space"
                  summary={pricing.newBooking?.carpetArea}
                />
                <PriceCard
                  title="Built-Up Area Basis"
                  subtitle="Carpet area + wall thickness"
                  summary={pricing.newBooking?.builtUpArea}
                />
                <PriceCard
                  title="Super Built-Up Area Basis"
                  subtitle="Includes proportional common area"
                  summary={pricing.newBooking?.superBuiltUpArea}
                />
              </div>
            </div>
          )}

          {/* Verified Resale & Rental Pricing */}
          {(hasResale || hasRental) && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-display font-semibold uppercase tracking-wider text-[#111111]/70">
                <Home className="w-3.5 h-3.5 text-[#218C5A]" />
                <span>Verified Resale & Rental Benchmarks</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {resaleObj?.carpetArea && (
                  <PriceCard
                    title="Resale • Carpet Area"
                    subtitle="Verified resale homes (net area)"
                    summary={resaleObj.carpetArea}
                  />
                )}
                {resaleObj?.builtUpArea && (
                  <PriceCard
                    title="Resale • Built-Up Area"
                    subtitle="Verified resale homes (built-up)"
                    summary={resaleObj.builtUpArea}
                  />
                )}
                {resaleObj?.superBuiltUpArea && (
                  <PriceCard
                    title="Resale • Super Built-Up"
                    subtitle="Verified resale homes (super built-up)"
                    summary={resaleObj.superBuiltUpArea}
                  />
                )}
                {hasRental && <RentalPriceCard rental={rentalObj || undefined} />}
              </div>
            </div>
          )}

          {/* Pricing Disclaimer */}
          <div className="flex items-start gap-2 p-3.5 rounded-xl bg-[#FAFAF8] border border-[rgba(17,17,17,0.06)] text-xs text-[#111111]/70 font-body">
            <Info className="w-4 h-4 text-[#111111]/50 shrink-0 mt-0.5" />
            <span>
              Pricing shown is computed from verified Great Homes project configurations and verified listings, strictly separated by area basis.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
