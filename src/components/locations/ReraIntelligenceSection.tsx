'use client';

import React from 'react';
import { ShieldCheck, FileText, AlertCircle } from 'lucide-react';
import { ReraIntelligenceDto } from '@/src/domain/marketIntelligence/dto/locationIntelligenceDto';

interface ReraIntelligenceSectionProps {
  locationName: string;
  rera: ReraIntelligenceDto;
}

export function ReraIntelligenceSection({
  locationName,
  rera,
}: ReraIntelligenceSectionProps) {
  return (
    <section id="rera" className="space-y-4 pt-8 border-t border-[rgba(17,17,17,0.08)]" aria-labelledby="rera-heading">
      <div>
        <h2
          id="rera-heading"
          className="text-xl sm:text-2xl font-display font-semibold text-[#111111] tracking-tight"
        >
          RERA status & regulatory coverage
        </h2>
        <p className="text-xs sm:text-sm font-body text-[#111111]/60 mt-0.5">
          Factual regulatory registration status across published projects in {locationName}.
        </p>
      </div>

      {rera.totalPublishedProjects === 0 ? (
        <div className="p-4 sm:p-5 rounded-xl border border-[rgba(17,17,17,0.08)] bg-white flex items-center gap-3 shadow-2xs">
          <div className="w-9 h-9 rounded-lg bg-[rgba(17,17,17,0.04)] flex items-center justify-center shrink-0 text-[#111111]/50">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-display font-semibold text-[#111111]">
              No published projects in this scope yet to evaluate RERA registration coverage
            </h3>
            <p className="text-xs font-body text-[#111111]/60 mt-0.5">
              RERA verification metrics will automatically populate when residential projects are published in {locationName}.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Verified */}
          <div className="bg-white border border-[#218C5A]/30 rounded-xl p-5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between text-[#218C5A]">
              <span className="text-xs font-display font-semibold uppercase tracking-wider">
                Verified
              </span>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="block text-2xl sm:text-3xl font-display font-bold text-[#111111]">
                {rera.verifiedReraProjects}
              </span>
              <span className="text-xs text-[#218C5A] font-body font-medium">
                Official RERA registration verified
              </span>
            </div>
          </div>

          {/* Provided */}
          <div className="bg-white border border-[rgba(17,17,17,0.08)] rounded-xl p-5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between text-[#111111]/70">
              <span className="text-xs font-display font-semibold uppercase tracking-wider">
                RERA Info Provided
              </span>
              <FileText className="w-5 h-5 text-[#111111]/40" />
            </div>
            <div>
              <span className="block text-2xl sm:text-3xl font-display font-bold text-[#111111]">
                {rera.providedReraProjects}
              </span>
              <span className="text-xs text-[#111111]/60 font-body">
                Number provided, pending full verification
              </span>
            </div>
          </div>

          {/* No RERA Data */}
          <div className="bg-white border border-[rgba(17,17,17,0.08)] rounded-xl p-5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between text-[#111111]/50">
              <span className="text-xs font-display font-semibold uppercase tracking-wider">
                No RERA Data
              </span>
              <AlertCircle className="w-5 h-5 text-neutral-400" />
            </div>
            <div>
              <span className="block text-2xl sm:text-3xl font-display font-bold text-[#111111]">
                {rera.projectsWithoutReraData}
              </span>
              <span className="text-xs text-[#111111]/60 font-body">
                Projects awaiting regulatory submission
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
