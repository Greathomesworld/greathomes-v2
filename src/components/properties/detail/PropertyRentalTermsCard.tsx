import React from 'react';
import { Receipt, ShieldCheck, Calendar, Clock } from 'lucide-react';
import { RentalListingDetailViewModel } from '@/src/domain/projects/viewModels/listingDetailViewModel';

interface PropertyRentalTermsCardProps {
  listing: RentalListingDetailViewModel;
}

export function PropertyRentalTermsCard({ listing }: PropertyRentalTermsCardProps) {
  const formattedAvailableDate = listing.availabilityDate
    ? new Date(listing.availabilityDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  const terms = [
    {
      label: 'Monthly Rent',
      value: listing.formattedMonthlyRent,
      highlight: true,
    },
    ...(listing.formattedSecurityDeposit
      ? [
          {
            label: 'Security Deposit',
            value: `${listing.formattedSecurityDeposit} (Refundable)`,
            highlight: false,
          },
        ]
      : []),
    ...(listing.formattedMaintenance
      ? [
          {
            label: 'Monthly Maintenance',
            value: listing.formattedMaintenance,
            highlight: false,
          },
        ]
      : []),
    ...(listing.leaseDuration
      ? [
          {
            label: 'Lease Duration',
            value: listing.leaseDuration,
            highlight: false,
          },
        ]
      : []),
    ...(listing.noticePeriod
      ? [
          {
            label: 'Notice Period',
            value: listing.noticePeriod,
            highlight: false,
          },
        ]
      : []),
    {
      label: 'Move-in Status',
      value: listing.possessionDisplay,
      highlight: false,
    },
    ...(formattedAvailableDate
      ? [
          {
            label: 'Available From',
            value: formattedAvailableDate,
            highlight: false,
          },
        ]
      : []),
  ];

  return (
    <div className="bg-white rounded-2xl border border-[#E6E2DC] p-5 sm:p-6 shadow-2xs space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-[11px] font-display uppercase tracking-wider text-[#218C5A] font-semibold block">
            Commercial Lease Terms
          </span>
          <h2 className="text-base sm:text-lg font-display font-bold text-[#111111]">
            Rental Terms & Financial Breakdown
          </h2>
        </div>
        <div className="w-9 h-9 rounded-xl bg-[#218C5A]/10 text-[#218C5A] flex items-center justify-center shrink-0">
          <Receipt className="w-4 h-4" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-8 text-xs sm:text-sm divide-y sm:divide-y-0 divide-[#E6E2DC]/60">
        {terms.map(item => (
          <div
            key={item.label}
            className="flex items-center justify-between py-2 sm:border-b sm:border-[#E6E2DC]/60"
          >
            <span className="text-[#111111]/60 font-body">{item.label}</span>
            <span
              className={`font-display ${
                item.highlight
                  ? 'font-bold text-[#218C5A] text-sm sm:text-base'
                  : 'font-semibold text-[#111111]'
              }`}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
