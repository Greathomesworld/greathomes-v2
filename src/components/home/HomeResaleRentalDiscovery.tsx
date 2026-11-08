'use client';

import React from 'react';
import Link from 'next/link';
import { Home, Key, ArrowRight, CheckCircle2 } from 'lucide-react';

export interface HomeListingCardData {
  id: string;
  title: string;
  slug: string;
  type: 'RESALE' | 'RENTAL';
  bhk: number;
  locationName: string;
  projectName?: string;
  priceDisplay: string;
  imageUrl?: string;
  isVerified?: boolean;
}

interface HomeResaleRentalDiscoveryProps {
  resaleListings: HomeListingCardData[];
  rentalListings: HomeListingCardData[];
}

export function HomeResaleRentalDiscovery({
  resaleListings = [],
  rentalListings = [],
}: HomeResaleRentalDiscoveryProps) {
  return (
    <section className="py-24 bg-[#FAFAF8] border-b border-[rgba(17,17,17,0.08)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-xs uppercase tracking-widest text-[#E85D3F] font-semibold font-display">
            Immediate Availability
          </span>
          <h2 className="text-3xl sm:text-4xl font-display font-extrabold text-[#111111] tracking-tight mt-1">
            Looking for something available now?
          </h2>
          <p className="text-sm text-slate-500 font-body mt-2">
            Explore ready-to-move resale homes from verified owners, or find curated rental apartments across premier Kolkata corridors.
          </p>
        </div>

        {/* 2 Main Columns - Split Editorial Layout with Rich Visual Background Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Column 1: Buy Resale */}
          <div className="relative rounded-2xl overflow-hidden min-h-[500px] border border-[rgba(17,17,17,0.06)] shadow-sm group flex flex-col justify-between">
            {/* Visual Photography Background */}
            <div className="absolute inset-0 z-0">
              <img
                src="https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80"
                alt="Verified Resale Homes in Kolkata"
                className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#111111] via-[#111111]/85 to-[#111111]/60" />
            </div>

            {/* Top Row: Title, Icon & Explore CTA */}
            <div className="relative z-10 p-8 flex items-center justify-between text-white border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#218C5A]/15 text-[#218C5A] border border-[#218C5A]/30 flex items-center justify-center">
                  <Home className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-display font-extrabold text-white">Buy Resale</h3>
                  <p className="text-xs text-white/60 font-body">Direct verified owner listings</p>
                </div>
              </div>

              <Link
                href="/buy"
                className="text-xs font-display font-bold uppercase tracking-wider text-[#218C5A] hover:text-white flex items-center gap-1 shrink-0 transition-colors"
              >
                <span>Explore Resale</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Middle Content: Mini List */}
            <div className="relative z-10 p-8 space-y-4">
              {resaleListings.length === 0 ? (
                <div className="p-6 text-center text-xs text-white/50 font-body bg-white/5 rounded-lg border border-white/5">
                  Resale listings are being verified. Browse all resale homes online.
                </div>
              ) : (
                <div className="space-y-3">
                  {resaleListings.slice(0, 3).map((item) => (
                    <Link
                      key={item.id}
                      href={`/buy/${item.slug}`}
                      className="p-4 bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 transition-all flex items-center justify-between gap-4 group/item block"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[10px] text-white/50 font-display font-bold uppercase mb-1">
                          <span>{item.bhk} BHK</span>
                          <span>•</span>
                          <span className="truncate">{item.locationName}</span>
                          {item.isVerified && (
                            <span className="text-[#218C5A] flex items-center gap-0.5 font-bold">
                              <CheckCircle2 className="w-3 h-3" />
                              Verified
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-display font-bold text-white group-hover/item:text-[#E85D3F] transition-colors truncate">
                          {item.title}
                        </h4>
                      </div>
                      <div className="text-sm font-display font-extrabold text-[#E85D3F] shrink-0">
                        {item.priceDisplay}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Rent */}
          <div className="relative rounded-2xl overflow-hidden min-h-[500px] border border-[rgba(17,17,17,0.06)] shadow-sm group flex flex-col justify-between">
            {/* Visual Photography Background */}
            <div className="absolute inset-0 z-0">
              <img
                src="https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80"
                alt="Verified Rentals in Kolkata"
                className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#111111] via-[#111111]/85 to-[#111111]/60" />
            </div>

            {/* Top Row: Title, Icon & Explore CTA */}
            <div className="relative z-10 p-8 flex items-center justify-between text-white border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#E85D3F]/15 text-[#E85D3F] border border-[#E85D3F]/30 flex items-center justify-center">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-display font-extrabold text-white">Rentals</h3>
                  <p className="text-xs text-white/60 font-body">Premium rental complexes</p>
                </div>
              </div>

              <Link
                href="/rent"
                className="text-xs font-display font-bold uppercase tracking-wider text-[#E85D3F] hover:text-white flex items-center gap-1 shrink-0 transition-colors"
              >
                <span>Explore Rent</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Middle Content: Mini List */}
            <div className="relative z-10 p-8 space-y-4">
              {rentalListings.length === 0 ? (
                <div className="p-6 text-center text-xs text-white/50 font-body bg-white/5 rounded-lg border border-white/5">
                  Rental listings are being verified. Browse all rentals online.
                </div>
              ) : (
                <div className="space-y-3">
                  {rentalListings.slice(0, 3).map((item) => (
                    <Link
                      key={item.id}
                      href={`/rent/${item.slug}`}
                      className="p-4 bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 transition-all flex items-center justify-between gap-4 group/item block"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[10px] text-white/50 font-display font-bold uppercase mb-1">
                          <span>{item.bhk} BHK</span>
                          <span>•</span>
                          <span className="truncate">{item.locationName}</span>
                          {item.isVerified && (
                            <span className="text-[#218C5A] flex items-center gap-0.5 font-bold">
                              <CheckCircle2 className="w-3 h-3" />
                              Verified
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-display font-bold text-white group-hover/item:text-[#E85D3F] transition-colors truncate">
                          {item.title}
                        </h4>
                      </div>
                      <div className="text-sm font-display font-extrabold text-[#E85D3F] shrink-0">
                        {item.priceDisplay}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
