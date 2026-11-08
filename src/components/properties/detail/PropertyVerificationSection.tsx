import React from 'react';
import {
  ShieldCheck,
  Lock,
  Award,
  FileText,
  Receipt,
  FileCheck,
  CheckCircle2,
} from 'lucide-react';
import { PropertyDetailViewModel } from '@/src/domain/projects/viewModels/listingDetailViewModel';

interface PropertyVerificationSectionProps {
  listing: PropertyDetailViewModel;
}

export function PropertyVerificationSection({
  listing,
}: PropertyVerificationSectionProps) {
  const isResale = listing.mode === 'RESALE';

  const pillars = isResale
    ? [
        {
          icon: ShieldCheck,
          iconColor: 'text-[#218C5A]',
          title: 'Verified Ownership',
          description:
            'Title documentation, ownership records, and society standing are reviewed before publication.',
        },
        {
          icon: Lock,
          iconColor: 'text-[#E85D3F]',
          title: 'Floor & Unit Privacy',
          description:
            'Specific door numbers and exact floor digits are protected until an assisted private viewing is scheduled.',
        },
        {
          icon: Award,
          iconColor: 'text-[#111111]',
          title: 'Direct Asking Price',
          description:
            'Transparent asking price published without fabricated per-sq.ft. estimates or hidden surprises.',
        },
        {
          icon: FileText,
          iconColor: 'text-[#111111]/75',
          title: 'Complete Documentation',
          description:
            'Great Homes advisors assist with agreement review, society NOC coordination, and registration steps.',
        },
      ]
    : [
        {
          icon: ShieldCheck,
          iconColor: 'text-[#218C5A]',
          title: 'Verified Landlord & Title',
          description:
            'Landlord identity, ownership authorization, and society letting rules are checked before publication.',
        },
        {
          icon: Lock,
          iconColor: 'text-[#E85D3F]',
          title: 'Floor & Unit Privacy',
          description:
            'Exact unit and floor numbers are protected for resident privacy until your assisted viewing is confirmed.',
        },
        {
          icon: Receipt,
          iconColor: 'text-[#111111]',
          title: 'Transparent Lease Terms',
          description:
            'Clear breakdown of monthly rent, society maintenance, and refundable security deposit.',
        },
        {
          icon: FileCheck,
          iconColor: 'text-[#111111]/75',
          title: 'Registered Agreement Support',
          description:
            'Assistance with standardized rental agreement drafting, police verification guidelines, and move-in checklist.',
        },
      ];

  return (
    <section id="verification" className="scroll-mt-32">
      <div className="bg-white rounded-2xl border border-[#E6E2DC] p-5 sm:p-6 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-display uppercase tracking-wider text-[#218C5A] font-semibold block">
              {isResale ? 'Buyer Assurance' : 'Tenant Assurance'}
            </span>
            <h2 className="text-base sm:text-lg font-display font-bold text-[#111111]">
              Verification & Great Homes Trust Standards
            </h2>
          </div>

          {listing.isVerified ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1E8E5A] text-white text-xs font-display font-semibold self-start sm:self-auto">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Verified Listing</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAFAF8] border border-[#E6E2DC] text-[#111111]/75 text-xs font-display font-semibold self-start sm:self-auto">
              <span>Verification Pending · Great Homes Assisted</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {pillars.map(pillar => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.title}
                className="p-4 rounded-xl bg-[#FAFAF8] border border-[#E6E2DC]/80 space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${pillar.iconColor} shrink-0`} />
                  <h3 className="text-xs sm:text-sm font-display font-bold text-[#111111]">
                    {pillar.title}
                  </h3>
                </div>
                <p className="text-xs text-[#111111]/70 font-body leading-relaxed">
                  {pillar.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
