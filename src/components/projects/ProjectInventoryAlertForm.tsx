'use client';

import React, { useState } from 'react';
import { BellRing, CheckCircle2, Loader2, Sparkles, AlertCircle, Phone, User, Check } from 'lucide-react';
import { PublicProjectDto } from '@/src/domain/projects/dto/projectDto';

interface ProjectInventoryAlertFormProps {
  project: PublicProjectDto;
  mode: 'RESALE' | 'RENTAL';
}

export function ProjectInventoryAlertForm({ project, mode }: ProjectInventoryAlertFormProps) {
  const isResale = mode === 'RESALE';

  // Extract master configurations if available to suggest BHKs
  const availableBhkNumbers = Array.from(
    new Set(
      (project.configurations || [])
        .map(c => c.bedroomCount)
        .filter((b): b is number => typeof b === 'number' && b > 0)
    )
  ).sort((a, b) => a - b);

  const defaultBhk = availableBhkNumbers.length > 0 ? `${availableBhkNumbers[0]} BHK` : '2 BHK';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredBhk, setPreferredBhk] = useState(defaultBhk);
  const [budgetRange, setBudgetRange] = useState('');
  const [notifyOnWhatsApp, setNotifyOnWhatsApp] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successReference, setSuccessReference] = useState<string | null>(null);

  const RESALE_BUDGETS = [
    { label: 'Any Budget', min: undefined, max: undefined },
    { label: 'Under ₹75 Lakh', min: undefined, max: 7500000 },
    { label: '₹75 Lakh – ₹1.5 Cr', min: 7500000, max: 15000000 },
    { label: '₹1.5 Cr – ₹3 Cr', min: 15000000, max: 30000000 },
    { label: 'Above ₹3 Cr', min: 30000000, max: undefined },
  ];

  const RENTAL_BUDGETS = [
    { label: 'Any Rent', min: undefined, max: undefined },
    { label: 'Under ₹25,000 / mo', min: undefined, max: 25000 },
    { label: '₹25,000 – ₹50,000 / mo', min: 25000, max: 50000 },
    { label: '₹50,000 – ₹1,00,000 / mo', min: 50000, max: 100000 },
    { label: 'Above ₹1,00,000 / mo', min: 100000, max: undefined },
  ];

  const budgetOptions = isResale ? RESALE_BUDGETS : RENTAL_BUDGETS;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);

    const cleanPhone = phone.replace(/[\s\-().]/g, '');
    const phoneMatch = cleanPhone.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
    if (!phoneMatch) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    if (!name.trim()) {
      setErrorMessage('Please enter your name.');
      return;
    }

    const selectedBudget = budgetOptions.find(b => b.label === budgetRange);

    setIsSubmitting(true);
    try {
      const payload = {
        contextType: mode,
        projectSlug: project.slug,
        projectName: project.name,
        name: name.trim(),
        phone: phoneMatch[1],
        preferredBhk,
        budgetMin: selectedBudget?.min,
        budgetMax: selectedBudget?.max,
        preferredContact: notifyOnWhatsApp ? 'WHATSAPP' : 'PHONE',
        marketingConsent: notifyOnWhatsApp,
        message: `Registered ${isResale ? 'resale availability requirement' : 'rental availability requirement'} for ${project.name} (${preferredBhk}${budgetRange && budgetRange !== 'Any Budget' && budgetRange !== 'Any Rent' ? `, Budget: ${budgetRange}` : ''}).`,
        source: 'PROJECT_INVENTORY_ALERT_FORM',
      };

      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to register availability alert. Please try again.');
      }

      setSuccessReference(data.referenceNumber || 'GH-ENQ-SUCCESS');
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to submit your alert request. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="priority-availability-alert"
      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 sm:p-8 md:p-10 shadow-xs max-w-3xl mx-auto my-6 space-y-6"
    >
      {successReference ? (
        <div className="text-center py-6 space-y-4 animate-in fade-in duration-300">
          <div className="w-14 h-14 rounded-full bg-[#218C5A]/10 border border-[#218C5A]/20 flex items-center justify-center mx-auto text-[#218C5A]">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-display font-bold text-[var(--color-foreground)]">
              Availability Alert Registered
            </h3>
            <p className="text-sm font-body text-[var(--color-foreground)]/75 max-w-lg mx-auto">
              You are on the priority alert list for{' '}
              <strong>{project.name}</strong>. Our residential advisory team will reach out via{' '}
              {notifyOnWhatsApp ? 'WhatsApp' : 'call'} as soon as matching {isResale ? 'resale' : 'rental'} units are verified.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-foreground)]/[0.04] border border-[var(--color-border)] text-xs font-display font-semibold text-[var(--color-foreground)]">
            <span>Reference Number:</span>
            <span className="font-mono text-[var(--color-accent)]">{successReference}</span>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Header */}
          <div className="space-y-2 text-center sm:text-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20 text-xs font-display font-semibold uppercase tracking-wider">
              <BellRing className="w-3.5 h-3.5" />
              <span>Priority Availability Alert</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-display font-bold text-[var(--color-foreground)] tracking-tight">
              Be the first to know when {isResale ? 'resale' : 'rental'} apartments become available in {project.name}.
            </h3>
            <p className="text-xs sm:text-sm font-body text-[var(--color-foreground)]/70 leading-relaxed">
              Share your preferred configuration and budget. Our advisory team will notify you as soon as matching {isResale ? 'resale' : 'rental'} apartments are listed in {project.name}.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center gap-2 font-display">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="alert-name" className="text-xs font-display font-semibold text-[var(--color-foreground)]/80 block">
                Your Full Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="alert-name"
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Subhojit Mukherjee"
                  className="w-full h-11 pl-9 pr-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-sm font-body text-[var(--color-foreground)] placeholder:text-[var(--color-foreground)]/40 focus:outline-hidden focus:border-[var(--color-foreground)] transition-colors"
                />
                <User className="w-4 h-4 text-[var(--color-foreground)]/40 absolute left-3 top-3.5 pointer-events-none" />
              </div>
            </div>

            {/* Mobile */}
            <div className="space-y-1.5">
              <label htmlFor="alert-phone" className="text-xs font-display font-semibold text-[var(--color-foreground)]/80 block">
                Mobile Number <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="alert-phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="10-digit mobile number"
                  maxLength={10}
                  className="w-full h-11 pl-9 pr-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-sm font-body text-[var(--color-foreground)] placeholder:text-[var(--color-foreground)]/40 focus:outline-hidden focus:border-[var(--color-foreground)] transition-colors"
                />
                <Phone className="w-4 h-4 text-[var(--color-foreground)]/40 absolute left-3 top-3.5 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Configuration & Budget Selection */}
          <div className="space-y-4 pt-1">
            <div>
              <label className="text-xs font-display font-semibold text-[var(--color-foreground)]/80 block mb-2">
                Preferred Configuration
              </label>
              <div className="flex flex-wrap gap-2">
                {(availableBhkNumbers.length > 0 ? availableBhkNumbers.map(b => `${b} BHK`) : ['1 BHK', '2 BHK', '3 BHK', '4+ BHK']).map(bhk => (
                  <button
                    key={bhk}
                    type="button"
                    onClick={() => setPreferredBhk(bhk)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-display font-semibold border transition-all cursor-pointer ${
                      preferredBhk === bhk
                        ? 'bg-[var(--color-foreground)] text-[var(--color-background)] border-[var(--color-foreground)] shadow-xs'
                        : 'border-[var(--color-border)] bg-[var(--color-foreground)]/[0.02] text-[var(--color-foreground)]/75 hover:border-[var(--color-foreground)]/40'
                    }`}
                  >
                    {bhk}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="alert-budget" className="text-xs font-display font-semibold text-[var(--color-foreground)]/80 block">
                  {isResale ? 'Target Purchase Budget' : 'Target Monthly Rent'}
                </label>
                <select
                  id="alert-budget"
                  value={budgetRange}
                  onChange={e => setBudgetRange(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-xs font-display font-medium text-[var(--color-foreground)] focus:outline-hidden focus:border-[var(--color-foreground)] transition-colors"
                >
                  <option value="">Select Target Budget</option>
                  {budgetOptions.map(b => (
                    <option key={b.label} value={b.label}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* WhatsApp Notification Preference */}
              <div className="flex items-end pb-1.5">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={notifyOnWhatsApp}
                    onChange={e => setNotifyOnWhatsApp(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-0 cursor-pointer"
                  />
                  <span className="text-xs font-body text-[var(--color-foreground)]/80">
                    I opt in to receive priority availability alerts via WhatsApp (Optional)
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
            <span className="text-[11px] font-body text-[var(--color-foreground)]/50">
              No spam. Direct residential advisory only.
            </span>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-foreground)] text-[var(--color-background)] hover:opacity-90 font-display font-semibold text-xs transition-all cursor-pointer shadow-xs disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Registering Alert...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Register Priority Alert</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
