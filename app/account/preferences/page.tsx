'use client';

import React, { useState, useEffect } from 'react';
import { Sliders, Bell, Check, Loader2, Shield } from 'lucide-react';
import { CustomerPreferencesDto } from '@/src/domain/customer/entities';
import { useVisitorTelemetry } from '@/src/components/telemetry/VisitorTelemetryProvider';

const POPULAR_LOCATIONS = [
  'Rajarhat',
  'New Town',
  'EM Bypass',
  'Alipore',
  'Ballygunge',
  'South Kolkata',
  'North Kolkata',
  'Garia',
  'Behala',
  'Howrah',
];

const BHK_OPTIONS = [1, 2, 3, 4, 5];

const PROPERTY_TYPES = [
  { value: 'APARTMENT', label: 'Apartment / Flat' },
  { value: 'VILLA', label: 'Villa' },
  { value: 'PENTHOUSE', label: 'Penthouse' },
  { value: 'DUPLEX', label: 'Duplex' },
  { value: 'PLOT', label: 'Plot / Land' },
];

export default function PreferencesPage() {
  const { optedOut, setOptOut } = useVisitorTelemetry();
  const [preferences, setPreferences] = useState<CustomerPreferencesDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [mode, setMode] = useState<'ALL' | 'PROJECTS' | 'BUY' | 'RENT'>('ALL');
  const [locations, setLocations] = useState<string[]>([]);
  const [bhk, setBhk] = useState<number[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const [budgetMin, setBudgetMin] = useState<string>('');
  const [budgetMax, setBudgetMax] = useState<string>('');
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [newLaunchAlerts, setNewLaunchAlerts] = useState(true);
  const [priceDropAlerts, setPriceDropAlerts] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetch('/api/customer/preferences');
        if (res.ok) {
          const data = await res.json();
          if (data.preferences) {
            const p = data.preferences as CustomerPreferencesDto;
            setPreferences(p);
            setMode(p.preferredMode || 'ALL');
            setLocations(p.preferredLocations || []);
            setBhk(p.preferredBhk || []);
            setPropertyTypes(p.preferredPropertyTypes || []);
            setBudgetMin(p.budgetMin ? (p.budgetMin / 100000).toString() : '');
            setBudgetMax(p.budgetMax ? (p.budgetMax / 100000).toString() : '');
            setEmailAlerts(p.emailAlertsEnabled ?? true);
            setNewLaunchAlerts(p.newLaunchAlerts ?? true);
            setPriceDropAlerts(p.priceDropAlerts ?? true);
          }
        }
      } catch {
        // Fallback
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const toggleLocation = (loc: string) => {
    setLocations((prev) =>
      prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc]
    );
  };

  const toggleBhk = (num: number) => {
    setBhk((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num].sort()
    );
  };

  const togglePropertyType = (type: string) => {
    setPropertyTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    setSavedSuccess(false);

    try {
      const minVal = budgetMin ? Math.round(parseFloat(budgetMin) * 100000) : null;
      const maxVal = budgetMax ? Math.round(parseFloat(budgetMax) * 100000) : null;

      if (minVal !== null && maxVal !== null && minVal > maxVal) {
        throw new Error('Minimum budget cannot exceed maximum budget.');
      }

      const res = await fetch('/api/customer/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferredMode: mode,
          preferredLocations: locations,
          preferredBhk: bhk,
          preferredPropertyTypes: propertyTypes,
          budgetMin: minVal,
          budgetMax: maxVal,
          emailAlertsEnabled: emailAlerts,
          newLaunchAlerts,
          priceDropAlerts,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save preferences');
      }

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Error saving preferences');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-serif text-slate-900">Search Preferences & Alert Settings</h2>
        <p className="text-xs text-slate-500 font-body mt-0.5">
          Customizing your preferences fine-tunes your universal search discovery and prepares your
          curated home alerts.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 text-sm font-body rounded-md">
          {error}
        </div>
      )}

      {savedSuccess && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-body rounded-md flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>Your preferences and alert settings have been successfully updated.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8 bg-white border border-slate-200 rounded-lg p-6 sm:p-8 shadow-xs">
        {/* Preferred Search Mode */}
        <div>
          <label className="block text-xs font-semibold text-slate-900 uppercase tracking-wider mb-2 font-display">
            Preferred Discovery Focus
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'ALL', label: 'All Residential' },
              { id: 'PROJECTS', label: 'New Projects' },
              { id: 'BUY', label: 'Resale Homes' },
              { id: 'RENT', label: 'Rental Homes' },
            ].map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => setMode(item.id as any)}
                className={`py-2 px-3 text-xs font-semibold rounded-md border text-center transition-colors font-display cursor-pointer ${
                  mode === item.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Preferred Locations */}
        <div>
          <label className="block text-xs font-semibold text-slate-900 uppercase tracking-wider mb-2 font-display">
            Preferred Kolkata Neighborhoods
          </label>
          <div className="flex flex-wrap gap-2">
            {POPULAR_LOCATIONS.map((loc) => {
              const selected = locations.includes(loc);
              return (
                <button
                  type="button"
                  key={loc}
                  onClick={() => toggleLocation(loc)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors font-display cursor-pointer ${
                    selected
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {loc}
                </button>
              );
            })}
          </div>
        </div>

        {/* Preferred BHK */}
        <div>
          <label className="block text-xs font-semibold text-slate-900 uppercase tracking-wider mb-2 font-display">
            Preferred BHK Configurations
          </label>
          <div className="flex flex-wrap gap-2">
            {BHK_OPTIONS.map((num) => {
              const selected = bhk.includes(num);
              return (
                <button
                  type="button"
                  key={num}
                  onClick={() => toggleBhk(num)}
                  className={`w-12 h-10 text-xs font-semibold rounded-md border flex items-center justify-center transition-colors font-display cursor-pointer ${
                    selected
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {num} BHK
                </button>
              );
            })}
          </div>
        </div>

        {/* Preferred Property Types */}
        <div>
          <label className="block text-xs font-semibold text-slate-900 uppercase tracking-wider mb-2 font-display">
            Preferred Property Types
          </label>
          <div className="flex flex-wrap gap-2">
            {PROPERTY_TYPES.map((pt) => {
              const selected = propertyTypes.includes(pt.value);
              return (
                <button
                  type="button"
                  key={pt.value}
                  onClick={() => togglePropertyType(pt.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors font-display cursor-pointer ${
                    selected
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {pt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Budget Range (in Lakhs) */}
        <div>
          <label className="block text-xs font-semibold text-slate-900 uppercase tracking-wider mb-2 font-display">
            Budget Range (in ₹ Lakhs)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-slate-500 font-body block mb-1">Minimum (₹ Lakhs)</span>
              <input
                type="number"
                min="0"
                step="5"
                placeholder="e.g. 50 (for ₹50 Lakh)"
                value={budgetMin}
                onChange={(e) => setBudgetMin(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 font-body"
              />
            </div>
            <div>
              <span className="text-xs text-slate-500 font-body block mb-1">Maximum (₹ Lakhs)</span>
              <input
                type="number"
                min="0"
                step="5"
                placeholder="e.g. 150 (for ₹1.5 Crore)"
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 font-body"
              />
            </div>
          </div>
        </div>

        {/* Alerts Foundation */}
        <div className="pt-6 border-t border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-4 h-4 text-slate-800" />
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider font-display">
              Alerts & Notification Foundation
            </h3>
          </div>

          <div className="space-y-4 font-body">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={emailAlerts}
                onChange={(e) => setEmailAlerts(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <div>
                <span className="text-sm font-medium text-slate-900 block">Email Alerts</span>
                <span className="text-xs text-slate-500">
                  Receive curated notifications about matching properties and editorial updates.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={newLaunchAlerts}
                onChange={(e) => setNewLaunchAlerts(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <div>
                <span className="text-sm font-medium text-slate-900 block">
                  New Launch Announcements
                </span>
                <span className="text-xs text-slate-500">
                  Be the first to know when premier developers launch new projects in your
                  preferred neighborhoods.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={priceDropAlerts}
                onChange={(e) => setPriceDropAlerts(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <div>
                <span className="text-sm font-medium text-slate-900 block">
                  Price Updates & Curated Drops
                </span>
                <span className="text-xs text-slate-500">
                  Get notified when verified resale or rental listings adjust their pricing.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Privacy & Discovery Telemetry */}
        <div className="pt-6 border-t border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-slate-800" />
            <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider font-display">
              Privacy & Discovery Analytics
            </h3>
          </div>

          <div className="flex items-start justify-between gap-4 p-4 rounded-md bg-slate-50 border border-slate-200 font-body">
            <div>
              <span className="text-sm font-medium text-slate-900 block">
                First-Party Property Discovery Telemetry
              </span>
              <span className="text-xs text-slate-500 block mt-0.5">
                Helps remember your recently explored neighborhoods, configurations, and area-basis preferences. Turning this off clears unlinked anonymous browsing cookies and stops new telemetry collection.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOptOut(!optedOut)}
              data-testid="telemetry-opt-out-toggle"
              className={`px-3 py-1.5 text-xs font-semibold rounded-md border shrink-0 transition-colors font-display cursor-pointer ${
                optedOut
                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
              }`}
            >
              {optedOut ? 'Opted Out (Off)' : 'Enabled (Opt Out)'}
            </button>
          </div>
        </div>

        {/* Submit */}
        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-md transition-colors flex items-center gap-2 font-display cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Preferences</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
