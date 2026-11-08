'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Terminal,
  AlertTriangle,
  Search,
  Send,
  CheckCircle2,
  ShieldAlert,
  FileCode2,
  Info,
} from 'lucide-react';

export default function SearchConsoleAdminPage() {
  const [inspectUrlInput, setInspectUrlInput] = useState('https://greathomes.co.in/projects');
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectResult, setInspectResult] = useState<any | null>(null);

  const [sitemapFeedInput, setSitemapFeedInput] = useState('https://greathomes.co.in/sitemap.xml');
  const [sitemapLoading, setSitemapLoading] = useState(false);
  const [sitemapError, setSitemapError] = useState<string | null>(null);
  const [sitemapResult, setSitemapResult] = useState<any | null>(null);

  const handleInspectUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setInspectLoading(true);
    setInspectError(null);
    setInspectResult(null);
    try {
      const res = await fetch('/api/admin/google/search-console/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: inspectUrlInput,
          siteUrl: 'https://greathomes.co.in',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Request failed with HTTP ${res.status}`);
      }
      setInspectResult(data?.data || data);
    } catch (err: any) {
      setInspectError(err?.message || 'URL inspection preview failed');
    } finally {
      setInspectLoading(false);
    }
  };

  const handleSubmitSitemap = async (e: React.FormEvent) => {
    e.preventDefault();
    setSitemapLoading(true);
    setSitemapError(null);
    setSitemapResult(null);
    try {
      const res = await fetch('/api/admin/google/search-console/sitemap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedpath: sitemapFeedInput,
          siteUrl: 'https://greathomes.co.in',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Sitemap preview request failed with HTTP ${res.status}`);
      }
      setSitemapResult(data?.data || data);
    } catch (err: any) {
      setSitemapError(err?.message || 'Sitemap preview submission failed');
    } finally {
      setSitemapLoading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header with prominent SIMULATED / PREVIEW badge */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-neutral-500 font-display">
              <Terminal className="w-3.5 h-3.5 text-neutral-900" />
              SEO Governance • Google Search Console
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 font-display">
              <AlertTriangle className="w-3 h-3 text-amber-700" />
              SIMULATED / PREVIEW MODE
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight font-display">
            Search Console Integration (Simulated Preview)
          </h1>
          <p className="text-sm text-neutral-600 mt-1 font-sans">
            Local structural validator for canonical URL patterns, robots.txt rules, and Search Console API v1 payload contracts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/seo/overview"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-700 transition-colors font-display"
          >
            SEO Overview
          </Link>
          <Link
            href="/admin/seo/sitemap"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-700 transition-colors font-display"
          >
            <FileCode2 className="w-3.5 h-3.5" />
            Sitemap Governance
          </Link>
        </div>
      </div>

      {/* Mandatory Disclosure Banner */}
      <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 space-y-2">
        <div className="flex items-center gap-2 text-amber-900 font-bold text-sm font-display">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
          <span>SIMULATED / PREVIEW INTEGRATION — NO LIVE GOOGLE API CONNECTION</span>
        </div>
        <p className="text-xs text-amber-900/90 font-sans leading-relaxed">
          This module runs in <strong>Simulated / Preview Mode</strong>. No external Google OAuth 2.0 refresh token or Google Search Console service-account credentials are configured in this environment, so no live network requests are sent to <code className="font-mono">searchconsole.googleapis.com</code>. Any inspection verdict or sitemap submission response below is a deterministic local simulation based on Great Homes canonical URL and <code className="font-mono">robots.txt</code> rules, and <strong>must not be interpreted as live Google index verification</strong>.
        </p>
        <div className="pt-1 text-[11px] text-amber-800 font-sans flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>
            Production Requirements for Live Mode: Verified Domain Property (<code className="font-mono">sc-domain:greathomes.co.in</code>), Google Cloud OAuth 2.0 / Service Account with <code className="font-mono">https://www.googleapis.com/auth/webmasters</code> scope, and server-side token exchange.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* 1. Simulated URL Inspection Tool */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-5 shadow-xs">
          <div className="flex items-start justify-between gap-2 border-b border-neutral-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-neutral-900 font-display">
                URL Inspection Simulator
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5 font-sans">
                Tests canonical URL compliance and <code className="font-mono">/robots.txt</code> allowance locally.
              </p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-900 border border-amber-300 font-display">
              SIMULATED
            </span>
          </div>

          <form onSubmit={handleInspectUrl} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1 font-display">
                Target URL to Inspect (Local Simulation)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  required
                  value={inspectUrlInput}
                  onChange={e => setInspectUrlInput(e.target.value)}
                  placeholder="https://greathomes.co.in/projects/..."
                  className="flex-1 px-3.5 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 font-mono"
                />
                <button
                  type="submit"
                  disabled={inspectLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 font-display"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>{inspectLoading ? 'Simulating...' : 'Run Simulated Check'}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className="text-neutral-400 font-sans">Presets:</span>
              {[
                'https://greathomes.co.in/projects',
                'https://greathomes.co.in/developers',
                'https://greathomes.co.in/admin/seo/overview',
              ].map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setInspectUrlInput(preset)}
                  className="px-2 py-0.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-mono cursor-pointer"
                >
                  {preset.replace('https://greathomes.co.in', '')}
                </button>
              ))}
            </div>
          </form>

          {inspectError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-sans">
              {inspectError}
            </div>
          )}

          {inspectResult && (
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800 font-display">
                  Simulated Preview Output (Not Live Google Data)
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold font-display ${
                    inspectResult.inspectionResult?.indexStatusResult?.verdict === 'PASS'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}
                >
                  {inspectResult.inspectionResult?.indexStatusResult?.verdict === 'PASS' ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <ShieldAlert className="w-3.5 h-3.5" />
                  )}
                  Simulated Verdict: {inspectResult.inspectionResult?.indexStatusResult?.verdict}
                </span>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-sans">
                <div>
                  <dt className="text-neutral-500">Mode:</dt>
                  <dd className="font-mono font-semibold text-amber-800">
                    {inspectResult.mode || 'SIMULATED_PREVIEW'}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Robots.txt State:</dt>
                  <dd className="font-mono font-semibold text-neutral-900">
                    {inspectResult.inspectionResult?.indexStatusResult?.robotsTxtState}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-neutral-500">Simulated Coverage Evaluation:</dt>
                  <dd className="font-medium text-neutral-900">
                    {inspectResult.inspectionResult?.indexStatusResult?.coverageState}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-neutral-500">User Canonical:</dt>
                  <dd className="font-mono text-neutral-800 break-all">
                    {inspectResult.inspectionResult?.indexStatusResult?.userCanonical}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>

        {/* 2. Simulated Sitemap Submission Payload Tester */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-5 shadow-xs">
          <div className="flex items-start justify-between gap-2 border-b border-neutral-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-neutral-900 font-display">
                Sitemap Feed Payload Simulator
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5 font-sans">
                Validates sitemap feed URL format in local preview mode without external Google submission.
              </p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-900 border border-amber-300 font-display">
              SIMULATED
            </span>
          </div>

          <form onSubmit={handleSubmitSitemap} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1 font-display">
                Sitemap Feed URL (Local Simulation)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  required
                  value={sitemapFeedInput}
                  onChange={e => setSitemapFeedInput(e.target.value)}
                  className="flex-1 px-3.5 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 font-mono"
                />
                <button
                  type="submit"
                  disabled={sitemapLoading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 font-display"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sitemapLoading ? 'Simulating...' : 'Test Payload'}</span>
                </button>
              </div>
            </div>
          </form>

          {sitemapError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-sans">
              {sitemapError}
            </div>
          )}

          {sitemapResult && (
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2 text-xs font-sans">
              <div className="font-bold uppercase tracking-wider text-amber-800 font-display">
                Simulated Feed Submission Result (Preview Only)
              </div>
              <div className="text-neutral-700">{sitemapResult.notice}</div>
              <div className="font-mono text-[11px] text-neutral-800 pt-1">
                Feed: {sitemapResult.feedpath} • Property: {sitemapResult.siteUrl}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
