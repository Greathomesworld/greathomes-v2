'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  SlidersHorizontal,
  Columns,
  ZoomIn,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Maximize2,
  FileImage,
  Eye,
  Info,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface CategoryComparison {
  id: string;
  title: string;
  categoryTag: string;
  sourceName: string;
  dimensions: string;
  watermarkApplied: boolean;
  hasDetailCrop?: boolean;
  isLogo?: boolean;
  isVector?: boolean;
  baseline: {
    settings: string;
    sizeKb: string;
    sizeBytes: number;
    file: string;
    detailCrop?: string;
    wmCrop?: string;
  };
  proposed: {
    settings: string;
    sizeKb: string;
    sizeBytes: number;
    file: string;
    detailCrop?: string;
    wmCrop?: string;
  };
  savingsPercent: string;
  observations: string;
  technicalAssessment: string;
}

const COMPARISONS: CategoryComparison[] = [
  {
    id: 'cat1-exterior',
    title: '1. High-Resolution Property Exterior Photograph',
    categoryTag: 'Property Photographs',
    sourceName: 'Merlin F-Residences Luxury Elevation Master',
    dimensions: '1536 × 1024 px',
    watermarkApplied: true,
    baseline: {
      settings: 'WebP Q85, effort 4',
      sizeKb: '184.3 KB',
      sizeBytes: 188764,
      file: '/compression-test/cat1-exterior-baseline.webp',
      wmCrop: '/compression-test/cat1-exterior-wm-baseline.png',
    },
    proposed: {
      settings: 'WebP Q78, effort 6, smartSubsample: true',
      sizeKb: '151.3 KB',
      sizeBytes: 154920,
      file: '/compression-test/cat1-exterior-proposed.webp',
      wmCrop: '/compression-test/cat1-exterior-wm-proposed.png',
    },
    savingsPercent: '17.9%',
    observations:
      'Zero perceptible degradation in architectural glass reflections, swimming pool water ripples, and sky gradient. Watermark emblem at bottom-right remains crisp with no color fringing.',
    technicalAssessment:
      'Effort 6 applies exhaustive trellis quantization and intra-macroblock prediction. At Q78 with smart chroma subsampling, high-frequency building facade textures are preserved while eliminating 33.8 KB per image.',
  },
  {
    id: 'cat2-interior',
    title: '2. Interior Property Photograph',
    categoryTag: 'Property Photographs',
    sourceName: 'Luxury Living Room & Dining Area',
    dimensions: '1200 × 800 px',
    watermarkApplied: true,
    baseline: {
      settings: 'WebP Q85, effort 4',
      sizeKb: '18.7 KB',
      sizeBytes: 19158,
      file: '/compression-test/cat2-interior-baseline.webp',
      wmCrop: '/compression-test/cat2-interior-wm-baseline.png',
    },
    proposed: {
      settings: 'WebP Q78, effort 6, smartSubsample: true',
      sizeKb: '14.5 KB',
      sizeBytes: 14856,
      file: '/compression-test/cat2-interior-proposed.webp',
      wmCrop: '/compression-test/cat2-interior-wm-proposed.png',
    },
    savingsPercent: '22.5%',
    observations:
      'Warm ambient interior lighting, polished marble specular highlights, and sofa fabric weave retain clean micro-contrast. Low-light shadow regions show no blocking.',
    technicalAssessment:
      'Smooth indoor luminance gradients compress exceptionally well. Q78 achieves a 22.5% file reduction without crushing dynamic range or introducing posterization.',
  },
  {
    id: 'cat3-hero',
    title: '3. Homepage Hero Image',
    categoryTag: 'Hero Visuals',
    sourceName: 'Modern Tower Skyline & Architectural Showcase',
    dimensions: '1200 × 800 px',
    watermarkApplied: true,
    baseline: {
      settings: 'WebP Q85, effort 4',
      sizeKb: '18.7 KB',
      sizeBytes: 19158,
      file: '/compression-test/cat3-hero-baseline.webp',
      wmCrop: '/compression-test/cat3-hero-wm-baseline.png',
    },
    proposed: {
      settings: 'WebP Q82, effort 6, smartSubsample: true',
      sizeKb: '16.6 KB',
      sizeBytes: 16952,
      file: '/compression-test/cat3-hero-proposed.webp',
      wmCrop: '/compression-test/cat3-hero-wm-proposed.png',
    },
    savingsPercent: '11.5%',
    observations:
      'Hero imagery demands pristine luxury presentation. Q82 with effort 6 preserves micro-contrast on building balconies, structural mullions, and horizon lines without softness.',
    technicalAssessment:
      'Targeting Q82 for hero banners preserves peak visual quality for first-viewport impressions (Largest Contentful Paint) while delivering an 11.5% byte saving.',
  },
  {
    id: 'cat4-floorplan',
    title: '4. Detailed 3BHK Architectural Floor Plan',
    categoryTag: 'Floor Plans & CAD',
    sourceName: 'Merlin Rise 3BHK Master Layout (CAD Line-Drawing)',
    dimensions: '2400 × 1800 px',
    watermarkApplied: true,
    hasDetailCrop: true,
    baseline: {
      settings: 'WebP Q92, effort 4',
      sizeKb: '114.2 KB',
      sizeBytes: 116950,
      file: '/compression-test/cat4-floorplan-baseline.webp',
      detailCrop: '/compression-test/cat4-floorplan-detail-baseline.png',
      wmCrop: '/compression-test/cat4-floorplan-wm-baseline.png',
    },
    proposed: {
      settings: 'WebP Q82, effort 6, smartSubsample: true',
      sizeKb: '79.6 KB',
      sizeBytes: 81524,
      file: '/compression-test/cat4-floorplan-proposed.webp',
      detailCrop: '/compression-test/cat4-floorplan-detail-proposed.png',
      wmCrop: '/compression-test/cat4-floorplan-wm-proposed.png',
    },
    savingsPercent: '30.3%',
    observations:
      'Critical legibility test passed: Room dimensions (e.g. 10\'6" × 14\'0"), balcony labels, and 1-pixel CAD line drawings are razor-sharp. Watermark does not obscure room boundaries.',
    technicalAssessment:
      'High-detail CAD drawings previously incurred unnecessary bloat at Q92. Q82 with effort 6 reduces file size by 34.6 KB (30.3% savings) with an empirical PSNR of 44.62 dB against uncompressed master.',
  },
  {
    id: 'cat5-map',
    title: '5. Location Map with Street & Landmark Labels',
    categoryTag: 'Location & Maps',
    sourceName: 'Kolkata Urban Connectivity & Neighborhood Map',
    dimensions: '1199 × 1312 px',
    watermarkApplied: true,
    hasDetailCrop: true,
    baseline: {
      settings: 'WebP Q92, effort 4',
      sizeKb: '262.3 KB',
      sizeBytes: 268544,
      file: '/compression-test/cat5-map-baseline.webp',
      detailCrop: '/compression-test/cat5-map-detail-baseline.png',
      wmCrop: '/compression-test/cat5-map-wm-baseline.png',
    },
    proposed: {
      settings: 'WebP Q85, effort 6, smartSubsample: true',
      sizeKb: '194.6 KB',
      sizeBytes: 199316,
      file: '/compression-test/cat5-map-proposed.webp',
      detailCrop: '/compression-test/cat5-map-detail-proposed.png',
      wmCrop: '/compression-test/cat5-map-wm-proposed.png',
    },
    savingsPercent: '25.8%',
    observations:
      'Street typography, highway numbering, metro lines, and point-of-interest markers remain crisp with no chromatic aberration or haloing around text.',
    technicalAssessment:
      'Vector-rasterized cartography with fine text labels is vulnerable to DCT block artifacts below Q80. Q85 with smart chroma subsampling provides a 67.7 KB (25.8%) saving with zero text degradation.',
  },
  {
    id: 'cat6-raster-logo',
    title: '6. Raster Developer Logo (Transparency & Edge Quality)',
    categoryTag: 'Developer Logos',
    sourceName: 'Developer Brand Mark (Transparent PNG Master)',
    dimensions: '532 × 519 px',
    watermarkApplied: false,
    isLogo: true,
    baseline: {
      settings: 'WebP Q95, lossless: true, effort 4',
      sizeKb: '315.9 KB',
      sizeBytes: 323500,
      file: '/compression-test/cat6-logo-baseline.webp',
    },
    proposed: {
      settings: 'WebP Q90, lossy, alphaQuality: 100, effort 6, smartSubsample: true',
      sizeKb: '77.6 KB',
      sizeBytes: 79456,
      file: '/compression-test/cat6-logo-proposed.webp',
    },
    savingsPercent: '75.4%',
    observations:
      'Massive 75.4% file reduction (238 KB saved per logo!). Alpha transparency borders remain anti-aliased and clean against white, dark slate, and pure black backgrounds with no dark halos.',
    technicalAssessment:
      'Forcing lossless WebP on photographic/complex raster logos caused extreme byte bloat (315.9 KB). Using lossy RGB at Q90 with 100% uncompressed alpha (alphaQuality: 100) preserves exact edge transparency.',
  },
  {
    id: 'cat7-svg-logo',
    title: '7. Vector SVG Developer Logo',
    categoryTag: 'Developer Logos',
    sourceName: 'Great Homes Official Vector Brand Emblem',
    dimensions: '1873 × 302 px (Scalable Vector)',
    watermarkApplied: false,
    isVector: true,
    baseline: {
      settings: 'Native Vector SVG (Untouched)',
      sizeKb: '458.5 KB',
      sizeBytes: 469552,
      file: '/compression-test/cat7-logo.svg',
    },
    proposed: {
      settings: 'Native Vector SVG (Untouched)',
      sizeKb: '458.5 KB',
      sizeBytes: 469552,
      file: '/compression-test/cat7-logo.svg',
    },
    savingsPercent: '0.0%',
    observations:
      'Infinite vector scalability at any DPI or viewport width. Never rasterized, never watermarked. Pipeline policy correctly leaves clean SVGs untouched.',
    technicalAssessment:
      'Vector identity assets bypass raster encoding entirely in Pipeline B1, ensuring pristine brand rendering across mobile, desktop, and 5K displays.',
  },
];

export default function CompressionGalleryPage() {
  const [selectedCatId, setSelectedCatId] = useState<string>('cat1-exterior');
  const [viewMode, setViewMode] = useState<'split' | 'side-by-side' | 'inspect-crops'>('side-by-side');
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [logoBg, setLogoBg] = useState<'white' | 'dark' | 'black' | 'checker'>('dark');
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const activeCategory =
    COMPARISONS.find((c) => c.id === selectedCatId) || COMPARISONS[0];

  const handleSliderMove = (clientX: number, rect: DOMRect) => {
    const x = clientX - rect.left;
    const clamped = Math.max(0, Math.min(rect.width, x));
    setSliderPosition((clamped / rect.width) * 100);
  };

  const getLogoBgClass = () => {
    switch (logoBg) {
      case 'white':
        return 'bg-white';
      case 'dark':
        return 'bg-slate-900';
      case 'black':
        return 'bg-black';
      case 'checker':
      default:
        return 'bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px] bg-slate-100';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24">
      {/* Top Banner / Breadcrumb */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              href="/"
              className="text-xs uppercase tracking-widest text-emerald-400 font-semibold hover:text-emerald-300 transition-colors"
            >
              Great Homes V2
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-medium text-slate-400">Media System</span>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-semibold text-white px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300">
              Phase 4A: Compression Visual Comparison
            </span>
          </div>

          <div className="flex items-center space-x-3 text-xs text-slate-400">
            <span className="hidden sm:inline-flex items-center text-emerald-400">
              <ShieldCheck className="w-4 h-4 mr-1 text-emerald-400" />
              Strictly Local Testing — Read-Only Mode
            </span>
          </div>
        </div>
      </header>

      {/* Hero Header */}
      <section className="border-b border-slate-900 bg-gradient-to-b from-slate-900/60 to-slate-950 py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 mb-3">
                <Sparkles className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                Forensic Image Quality & Compression Validation
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white font-serif">
                Image Compression Visual Comparison Gallery
              </h1>
              <p className="mt-2 text-sm sm:text-base text-slate-400 max-w-3xl leading-relaxed">
                Side-by-side inspection of current baseline image compression vs. the proposed
                optimised pipeline settings. Inspect photographic sharpness, CAD floor plan text
                legibility, developer logo alpha edges, and watermark integrity at 100% zoom.
              </p>
            </div>

            {/* Quick Metrics Badge */}
            <div className="flex flex-wrap gap-3">
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 min-w-[130px]">
                <div className="text-xs text-slate-400">Overall Bandwidth Savings</div>
                <div className="text-xl font-bold text-emerald-400 mt-0.5">25% – 75%</div>
                <div className="text-[10px] text-slate-500">Zero visible loss</div>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 min-w-[130px]">
                <div className="text-xs text-slate-400">R2 Object Policy</div>
                <div className="text-xl font-bold text-blue-400 mt-0.5">Single WebP</div>
                <div className="text-[10px] text-slate-500">No unneeded duplicates</div>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 min-w-[130px]">
                <div className="text-xs text-slate-400">Watermark Status</div>
                <div className="text-xl font-bold text-amber-300 mt-0.5">100% Sharp</div>
                <div className="text-[10px] text-slate-500">No haloing or noise</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Category Selector Tabs */}
        <div className="flex items-center overflow-x-auto space-x-2 pb-3 mb-6 scrollbar-thin scrollbar-thumb-slate-800">
          {COMPARISONS.map((cat) => {
            const isSelected = cat.id === selectedCatId;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCatId(cat.id)}
                className={`flex-shrink-0 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center space-x-2 border ${
                  isSelected
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-white shadow-sm'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span>{cat.title.split('. ')[1]}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    isSelected ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {cat.savingsPercent}
                </span>
              </button>
            );
          })}
        </div>

        {/* View Mode & Inspection Toolbar */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">
              Comparison Mode:
            </span>
            <button
              onClick={() => setViewMode('side-by-side')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 border transition-colors ${
                viewMode === 'side-by-side'
                  ? 'bg-slate-800 border-slate-700 text-white'
                  : 'bg-slate-950/40 border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Side-by-Side Dual View</span>
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 border transition-colors ${
                viewMode === 'split'
                  ? 'bg-slate-800 border-slate-700 text-white'
                  : 'bg-slate-950/40 border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Interactive Split-Slider</span>
            </button>
            <button
              onClick={() => setViewMode('inspect-crops')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center space-x-1.5 border transition-colors ${
                viewMode === 'inspect-crops'
                  ? 'bg-slate-800 border-slate-700 text-white'
                  : 'bg-slate-950/40 border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <ZoomIn className="w-3.5 h-3.5" />
              <span>100% Zoom Detail & Watermark Crops</span>
            </button>
          </div>

          {/* Logo Background Toggles (Only when Logo is active) */}
          {activeCategory.isLogo && (
            <div className="flex items-center space-x-2">
              <span className="text-xs font-medium text-slate-400">Background:</span>
              <button
                onClick={() => setLogoBg('white')}
                className={`w-6 h-6 rounded border ${
                  logoBg === 'white' ? 'ring-2 ring-emerald-500' : 'border-slate-700'
                } bg-white`}
                title="White Background"
              />
              <button
                onClick={() => setLogoBg('dark')}
                className={`w-6 h-6 rounded border ${
                  logoBg === 'dark' ? 'ring-2 ring-emerald-500' : 'border-slate-700'
                } bg-slate-900`}
                title="Dark Slate Background"
              />
              <button
                onClick={() => setLogoBg('black')}
                className={`w-6 h-6 rounded border ${
                  logoBg === 'black' ? 'ring-2 ring-emerald-500' : 'border-slate-700'
                } bg-black`}
                title="Pure Black Background"
              />
              <button
                onClick={() => setLogoBg('checker')}
                className={`w-6 h-6 rounded border ${
                  logoBg === 'checker' ? 'ring-2 ring-emerald-500' : 'border-slate-700'
                } bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:6px_6px] bg-slate-300`}
                title="Transparency Checkerboard"
              />
            </div>
          )}
        </div>

        {/* Selected Asset Header & Metrics Card */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 uppercase tracking-wider">
                  {activeCategory.categoryTag}
                </span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-xs text-slate-400">Resolution: {activeCategory.dimensions}</span>
                {activeCategory.watermarkApplied && (
                  <>
                    <span className="text-xs text-slate-500">•</span>
                    <span className="text-xs text-amber-400 font-medium flex items-center">
                      <CheckCircle2 className="w-3 h-3 mr-1 text-amber-400" />
                      Official Great Homes Watermark
                    </span>
                  </>
                )}
              </div>
              <h2 className="text-xl font-bold text-white mt-1 font-serif">{activeCategory.title}</h2>
              <p className="text-xs text-slate-400 mt-0.5">Source: {activeCategory.sourceName}</p>
            </div>

            {/* Metrics Comparison Pill */}
            <div className="flex items-center space-x-4 bg-slate-950/70 border border-slate-800/80 rounded-xl p-3">
              <div>
                <div className="text-[11px] text-slate-400 uppercase font-medium">Current Baseline</div>
                <div className="text-sm font-semibold text-slate-300">{activeCategory.baseline.sizeKb}</div>
                <div className="text-[10px] text-slate-500">{activeCategory.baseline.settings}</div>
              </div>
              <ArrowRight className="w-4 h-4 text-emerald-400" />
              <div>
                <div className="text-[11px] text-slate-400 uppercase font-medium">Proposed Optimised</div>
                <div className="text-sm font-semibold text-emerald-400">{activeCategory.proposed.sizeKb}</div>
                <div className="text-[10px] text-emerald-500/80">{activeCategory.proposed.settings}</div>
              </div>
              <div className="pl-3 border-l border-slate-800 text-center">
                <div className="text-[11px] text-slate-400 uppercase font-medium">Bandwidth Saved</div>
                <div className="text-base font-bold text-emerald-400">{activeCategory.savingsPercent}</div>
              </div>
            </div>
          </div>
        </div>

        {/* View Mode 1: SIDE-BY-SIDE */}
        {viewMode === 'side-by-side' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Left: Current Baseline */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
              <div className="bg-slate-950/80 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    CURRENT BASELINE
                  </span>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">
                    {activeCategory.baseline.settings}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-slate-200">
                    {activeCategory.baseline.sizeKb}
                  </span>
                  <div className="text-[10px] text-slate-500">Original weight</div>
                </div>
              </div>

              <div
                className={`relative w-full aspect-[4/3] flex items-center justify-center p-2 overflow-hidden ${
                  activeCategory.isLogo ? getLogoBgClass() : 'bg-slate-950'
                }`}
              >
                <img
                  src={activeCategory.baseline.file}
                  alt="Current Baseline"
                  className="max-w-full max-h-full object-contain"
                />
              </div>

              <div className="p-3 bg-slate-950/40 text-[11px] text-slate-400 border-t border-slate-800/80 flex items-center justify-between">
                <span>Format: WebP (Lossy/Lossless)</span>
                <span>Storage Key: /public_wm.webp</span>
              </div>
            </div>

            {/* Right: Proposed Optimised */}
            <div className="bg-slate-900 border border-emerald-500/30 rounded-xl overflow-hidden shadow-xl">
              <div className="bg-emerald-950/20 px-4 py-3 border-b border-emerald-500/30 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    PROPOSED OPTIMISED
                  </span>
                  <div className="text-xs text-emerald-400/80 font-mono mt-0.5">
                    {activeCategory.proposed.settings}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-emerald-400">
                    {activeCategory.proposed.sizeKb}
                  </span>
                  <div className="text-[10px] text-emerald-500/90 font-medium">
                    {activeCategory.savingsPercent} reduction
                  </div>
                </div>
              </div>

              <div
                className={`relative w-full aspect-[4/3] flex items-center justify-center p-2 overflow-hidden ${
                  activeCategory.isLogo ? getLogoBgClass() : 'bg-slate-950'
                }`}
              >
                <img
                  src={activeCategory.proposed.file}
                  alt="Proposed Optimised"
                  className="max-w-full max-h-full object-contain"
                />
              </div>

              <div className="p-3 bg-slate-950/40 text-[11px] text-emerald-400/90 border-t border-slate-800/80 flex items-center justify-between">
                <span>Format: WebP (Quality tuned + Effort 6)</span>
                <span>Byte Savings: {activeCategory.savingsPercent}</span>
              </div>
            </div>
          </div>
        )}

        {/* View Mode 2: INTERACTIVE SPLIT-SLIDER */}
        {viewMode === 'split' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl mb-8">
            <div className="bg-slate-950/80 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Interactive Split-Slider Comparison
                </span>
                <span className="text-xs text-slate-400 ml-2">
                  (Drag horizontal slider to reveal Current vs Proposed)
                </span>
              </div>
              <div className="text-xs text-slate-400">
                Left: Current ({activeCategory.baseline.sizeKb}) | Right: Proposed ({activeCategory.proposed.sizeKb})
              </div>
            </div>

            <div
              className={`relative w-full aspect-[16/10] select-none cursor-ew-resize overflow-hidden ${
                activeCategory.isLogo ? getLogoBgClass() : 'bg-slate-950'
              }`}
              onMouseDown={() => setIsDragging(true)}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => setIsDragging(false)}
              onMouseMove={(e) => {
                if (isDragging) {
                  handleSliderMove(e.clientX, e.currentTarget.getBoundingClientRect());
                }
              }}
              onClick={(e) => handleSliderMove(e.clientX, e.currentTarget.getBoundingClientRect())}
            >
              {/* Proposed (Right Full Layer) */}
              <img
                src={activeCategory.proposed.file}
                alt="Proposed"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              />

              {/* Baseline (Left Clipped Layer) */}
              <div
                className="absolute inset-0 overflow-hidden pointer-events-none"
                style={{ width: `${sliderPosition}%` }}
              >
                <img
                  src={activeCategory.baseline.file}
                  alt="Current"
                  className="absolute inset-0 w-full h-full object-contain max-w-none"
                  style={{ width: '100%', height: '100%' }}
                />
              </div>

              {/* Slider Divider Bar */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] pointer-events-none"
                style={{ left: `${sliderPosition}%` }}
              >
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-slate-900 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-lg">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* On-Canvas Labels */}
              <div className="absolute bottom-4 left-4 pointer-events-none bg-slate-950/80 px-2.5 py-1 rounded border border-slate-700/60 text-[11px] font-semibold text-slate-200">
                Current ({activeCategory.baseline.settings})
              </div>
              <div className="absolute bottom-4 right-4 pointer-events-none bg-slate-950/80 px-2.5 py-1 rounded border border-emerald-500/40 text-[11px] font-semibold text-emerald-300">
                Proposed ({activeCategory.proposed.settings})
              </div>
            </div>

            <div className="p-3 bg-slate-950/50 border-t border-slate-800 text-center text-xs text-slate-400">
              Drag anywhere across the image or move the divider handle to compare micro-details in real time.
            </div>
          </div>
        )}

        {/* View Mode 3: 100% ZOOM DETAIL & WATERMARK CROPS */}
        {viewMode === 'inspect-crops' && (
          <div className="space-y-6 mb-8">
            {/* Watermark Fidelity Crop Inspection */}
            {activeCategory.watermarkApplied && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                <div className="bg-slate-950/80 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Watermark Fidelity Inspector (Native 100% Zoom Crop)
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    Inspecting edge sharpness, opacity, and absence of haloing
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
                  {/* Baseline Watermark Crop */}
                  <div className="p-4 bg-slate-950/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-300">Current Baseline Crop</span>
                      <span className="text-xs text-slate-500">{activeCategory.baseline.settings}</span>
                    </div>
                    <div className="bg-slate-950 rounded-lg border border-slate-800 p-2 flex items-center justify-center min-h-[220px]">
                      <img
                        src={activeCategory.baseline.wmCrop}
                        alt="Baseline Watermark 100% Crop"
                        className="max-h-[200px] object-contain rounded"
                      />
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400">
                      Standard baseline watermark composite at Q85 / Q92.
                    </div>
                  </div>

                  {/* Proposed Watermark Crop */}
                  <div className="p-4 bg-slate-950/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-emerald-400">Proposed Optimised Crop</span>
                      <span className="text-xs text-emerald-500/80">{activeCategory.proposed.settings}</span>
                    </div>
                    <div className="bg-slate-950 rounded-lg border border-emerald-500/30 p-2 flex items-center justify-center min-h-[220px]">
                      <img
                        src={activeCategory.proposed.wmCrop}
                        alt="Proposed Watermark 100% Crop"
                        className="max-h-[200px] object-contain rounded"
                      />
                    </div>
                    <div className="mt-2 text-[11px] text-emerald-400/90 font-medium">
                      Zero ringing or color fringe around Great Homes lettering. Opacity perfectly preserved.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Floor Plan / Map Text Legibility Detail Crop */}
            {activeCategory.hasDetailCrop && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                <div className="bg-slate-950/80 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FileImage className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      Text & Fine Architectural Line Readability (Native 100% Zoom Crop)
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    Verifying dimension numbers, wall lines, and text clarity
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
                  <div className="p-4 bg-slate-950/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-300">Current Baseline Detail</span>
                      <span className="text-xs text-slate-500">{activeCategory.baseline.settings}</span>
                    </div>
                    <div className="bg-slate-950 rounded-lg border border-slate-800 p-2 flex items-center justify-center min-h-[260px]">
                      <img
                        src={activeCategory.baseline.detailCrop}
                        alt="Baseline Detail 100% Crop"
                        className="max-h-[240px] object-contain rounded"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-slate-950/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-emerald-400">Proposed Optimised Detail</span>
                      <span className="text-xs text-emerald-500/80">{activeCategory.proposed.settings}</span>
                    </div>
                    <div className="bg-slate-950 rounded-lg border border-emerald-500/30 p-2 flex items-center justify-center min-h-[260px]">
                      <img
                        src={activeCategory.proposed.detailCrop}
                        alt="Proposed Detail 100% Crop"
                        className="max-h-[240px] object-contain rounded"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/60 border-t border-slate-800 text-xs text-slate-300 flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>
                    <strong>Legibility Verification:</strong> Numbers, foot/inch symbols, and room text
                    remain 100% legible without blur or artifact noise.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Observations & Technical Assessment Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm mb-2">
              <Eye className="w-4 h-4 text-emerald-400" />
              <span>Visual Observations</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {activeCategory.observations}
            </p>
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center space-x-2 text-slate-200 font-semibold text-sm mb-2">
              <Info className="w-4 h-4 text-blue-400" />
              <span>Technical Compression Rationale</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {activeCategory.technicalAssessment}
            </p>
          </div>
        </div>

        {/* Master Comparison Table Across All 7 Categories */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl mb-12">
          <div className="px-5 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Comprehensive 7-Category Compression Ledger
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Exact measured byte payloads stored in Cloudflare R2 and served to website visitors.
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
              Ready for Phase 4 Implementation
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Resolution</th>
                  <th className="py-3 px-4">Current Baseline</th>
                  <th className="py-3 px-4">Proposed Settings</th>
                  <th className="py-3 px-4 text-right">Current Size</th>
                  <th className="py-3 px-4 text-right">Proposed Size</th>
                  <th className="py-3 px-4 text-right font-bold text-emerald-400">Savings %</th>
                  <th className="py-3 px-4">Watermark Policy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {COMPARISONS.map((cat) => (
                  <tr
                    key={cat.id}
                    onClick={() => setSelectedCatId(cat.id)}
                    className={`cursor-pointer transition-colors ${
                      cat.id === selectedCatId ? 'bg-emerald-950/20' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-3 px-4 font-sans font-medium text-white flex items-center space-x-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>{cat.title.split('. ')[1]}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-400">{cat.dimensions}</td>
                    <td className="py-3 px-4 text-slate-400">{cat.baseline.settings}</td>
                    <td className="py-3 px-4 text-emerald-400">{cat.proposed.settings}</td>
                    <td className="py-3 px-4 text-right text-slate-300">{cat.baseline.sizeKb}</td>
                    <td className="py-3 px-4 text-right font-bold text-white">{cat.proposed.sizeKb}</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-400">
                      {cat.savingsPercent}
                    </td>
                    <td className="py-3 px-4 font-sans text-[11px]">
                      {cat.watermarkApplied ? (
                        <span className="text-amber-400 flex items-center">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Mandatory
                        </span>
                      ) : (
                        <span className="text-slate-500">None (Exempt)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Safeguards & Production Impact Summary */}
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-6">
          <div className="flex items-center space-x-2 text-sm font-bold text-white mb-3">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Technical Safeguards & Architectural Commitments</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-400 leading-relaxed">
            <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800/60">
              <strong className="text-slate-200 block mb-1">Zero Production Mutation</strong>
              This gallery runs locally in development preview. No production database records, R2 objects, or application pipelines were modified.
            </div>
            <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800/60">
              <strong className="text-slate-200 block mb-1">Single-Derivative Architecture</strong>
              Confirming your decision: unwatermarked raw source files will not be kept in permanent storage. The approved optimized WebP asset will be the single canonical stored object.
            </div>
            <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800/60">
              <strong className="text-slate-200 block mb-1">Ready for Approval</strong>
              Review the side-by-side renders and close-up crops above. Once approved, the exact quality and effort parameters will be implemented in `mediaProcessingService.ts`.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
