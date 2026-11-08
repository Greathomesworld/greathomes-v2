import React from 'react';
import Link from 'next/link';
import { Building2, ArrowRight } from 'lucide-react';

export interface HomeDeveloperCardData {
  id: string;
  name: string;
  slug: string;
  shortDescription?: string;
  logoUrl?: string;
  projectCount?: number;
}

interface HomeDevelopersProps {
  developers: HomeDeveloperCardData[];
}

export function HomeDevelopers({ developers = [] }: HomeDevelopersProps) {
  return (
    <section className="py-16 md:py-20 bg-[#FAFAF8] border-b border-[rgba(17,17,17,0.08)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500 font-semibold font-display mb-1">
              Builder Intelligence
            </p>
            <h2 className="text-3xl sm:text-4xl font-serif text-[#111111]">
              Explore Developers
            </h2>
            <p className="text-sm sm:text-base text-slate-600 font-body mt-1">
              Discover residential projects from leading developers across Kolkata.
            </p>
          </div>

          <Link
            href="/developers"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#111111] hover:text-[#E85D3F] font-display transition-colors"
          >
            <span>View All Developers</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Developer Grid */}
        {developers.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-12 text-center max-w-lg mx-auto">
            <Building2 className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <p className="text-base font-serif text-slate-800">
              Developer profiles are being indexed.
            </p>
            <Link
              href="/projects"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#111111] font-display hover:underline mt-3"
            >
              <span>Explore Projects</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {developers.slice(0, 8).map((dev) => {
              const initials = dev.name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();

              return (
                <Link
                  key={dev.id}
                  href={`/developers/${dev.slug}`}
                  className="group bg-white border border-[rgba(17,17,17,0.08)] rounded-xl p-5 hover:border-slate-400 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="w-12 h-12 rounded-lg bg-slate-100 text-slate-800 font-bold font-display flex items-center justify-center mb-4 overflow-hidden border border-slate-200/60">
                      {dev.logoUrl ? (
                        <img
                          src={dev.logoUrl}
                          alt={dev.name}
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <span>{initials}</span>
                      )}
                    </div>

                    <h3 className="text-lg font-serif font-bold text-[#111111] group-hover:text-[#E85D3F] transition-colors">
                      {dev.name}
                    </h3>

                    {dev.shortDescription && (
                      <p className="text-xs text-slate-500 font-body line-clamp-2 mt-1.5">
                        {dev.shortDescription}
                      </p>
                    )}
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-display">
                    {dev.projectCount !== undefined && dev.projectCount > 0 ? (
                      <span className="font-semibold text-slate-700">
                        {dev.projectCount} {dev.projectCount === 1 ? 'Project' : 'Projects'}
                      </span>
                    ) : (
                      <span className="text-slate-400">View Portfolio</span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[#111111] group-hover:text-[#E85D3F] font-semibold transition-colors">
                      <span>View</span>
                      <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
