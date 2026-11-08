'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  CheckCircle2,
  ShieldCheck,
  Building2,
  MapPin,
  Calendar,
  MessageSquare,
  Phone,
  Mail,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Sparkles,
  Lock,
  Clock,
  Check,
} from 'lucide-react';
import { useEnquiry } from './EnquiryContext';
import { PreferredContactMethod } from '@/src/domain/enquiry/entities/enquiryEntity';
import { useCustomerAuth } from '../customer/CustomerAuthContext';
import { useVisitorTelemetry } from '../telemetry/VisitorTelemetryProvider';

export function GreatHomesEnquiryDialog() {
  const { isOpen, contextData, closeEnquiry } = useEnquiry();
  const { customer } = useCustomerAuth();
  const { trackEvent } = useVisitorTelemetry();

  // Wizard Steps: 1 = Contact Info, 2 = Requirements, 3 = Site Visit, 4 = Confirmation
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Buyer Contact
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [preferredContact, setPreferredContact] = useState<PreferredContactMethod>('PHONE');
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);

  // Step 2: Buyer Requirements
  const [budgetMin, setBudgetMin] = useState<string>('');
  const [budgetMax, setBudgetMax] = useState<string>('');
  const [preferredBhk, setPreferredBhk] = useState<string>('2 BHK');
  const [propertyType, setPropertyType] = useState<string>('APARTMENT');
  const [purchaseTimeline, setPurchaseTimeline] = useState<string>('WITHIN_3_MONTHS');
  const [purpose, setPurpose] = useState<string>('FAMILY_USE');
  const [message, setMessage] = useState('');

  // Step 3: Site Visit Request
  const [requestSiteVisit, setRequestSiteVisit] = useState(true);
  const [preferredDate, setPreferredDate] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [preferredTimeWindow, setPreferredTimeWindow] = useState<string>('12:00–15:00');
  const [visitType, setVisitType] = useState<'IN_PERSON' | 'VIRTUAL'>('IN_PERSON');
  const [buyerNote, setBuyerNote] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submittedName, setSubmittedName] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Reset form when opened, prefilling from verified customer session when available
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setIsSuccess(false);
      setErrorMessage(null);
      setName(customer?.name || '');
      const cleanCustomerPhone = customer?.phone
        ? customer.phone.replace(/^\+?91/, '').replace(/\D/g, '').slice(-10)
        : '';
      setPhone(cleanCustomerPhone);
      setEmail(
        customer?.email && !customer.email.endsWith('@mobile.greathomes.local')
          ? customer.email
          : ''
      );
      const isSpecsRequest = contextData?.inquiryIntent === 'REQUEST_SPECS';
      setMessage(
        isSpecsRequest
          ? `Please share the detailed specification sheet, floor plan, and current availability for ${contextData?.title || contextData?.projectName || 'this unit'}.`
          : ''
      );
      setBuyerNote('');
      setRequestSiteVisit(isSpecsRequest ? false : (contextData?.requestSiteVisit ?? true));
      setPreferredContact(contextData?.preferredContact || 'PHONE');
      setWhatsappOptIn(false);
      if (contextData?.configuration) {
        const bhkMatch = contextData.configuration.match(/([1-4])\s*BHK/i);
        if (bhkMatch) {
          setPreferredBhk(`${bhkMatch[1]} BHK`);
        } else if (/[5-9]\s*BHK/i.test(contextData.configuration)) {
          setPreferredBhk('5+ BHK');
        }
      }
      document.body.style.overflow = 'hidden';

      if (contextData) {
        trackEvent({
          eventType: 'ENQUIRY_MODAL_OPENED',
          entityType:
            contextData.contextType === 'RESALE'
              ? 'RESALE_LISTING'
              : contextData.contextType === 'RENTAL'
              ? 'RENTAL_LISTING'
              : 'PROJECT',
          entitySlug: contextData.projectSlug || contextData.listingSlug || undefined,
          metadata: {
            contextType: contextData.contextType,
            title: contextData.title || null,
            inquiryIntent: contextData.inquiryIntent || 'STANDARD',
          },
        }).catch(() => {});
      }

      setTimeout(() => {
        firstInputRef.current?.focus();
      }, 50);
    } else {
      document.body.style.overflow = 'auto';
    }
  }, [isOpen, customer, contextData, trackEvent]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeEnquiry();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeEnquiry]);

  const handleNextStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }

    const cleanedPhone = phone.replace(/[\s\-().]/g, '');
    const phoneMatch = cleanedPhone.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
    if (!phoneMatch) {
      setErrorMessage('Please enter a valid 10-digit mobile number.');
      return;
    }

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setErrorMessage(null);
    setStep(2);
    trackEvent({
      eventType: 'ENQUIRY_STEP_COMPLETED',
      entityType: 'ENQUIRY',
      entitySlug: contextData?.projectSlug || contextData?.listingSlug || undefined,
      metadata: { step: 1 },
    }).catch(() => {});
  };

  const handleNextStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStep(3);
    trackEvent({
      eventType: 'ENQUIRY_STEP_COMPLETED',
      entityType: 'ENQUIRY',
      entitySlug: contextData?.projectSlug || contextData?.listingSlug || undefined,
      metadata: {
        step: 2,
        preferredBhk,
        propertyType,
        purchaseTimeline,
      },
    }).catch(() => {});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contextData || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const cleanedPhone = phone.replace(/[\s\-().]/g, '');
      const effectivePreferredContact: PreferredContactMethod =
        whatsappOptIn && preferredContact === 'PHONE' ? 'WHATSAPP' : preferredContact;
      const payload = {
        contextType: contextData.contextType,
        projectSlug: contextData.projectSlug,
        projectId: contextData.projectId,
        listingSlug: contextData.listingSlug,
        listingId: contextData.listingId,
        configurationId: contextData.configurationId,
        sourcePage:
          contextData.sourcePage ||
          (typeof window !== 'undefined' ? window.location.pathname : undefined),
        name: name.trim(),
        phone: cleanedPhone,
        email: email.trim() || undefined,
        preferredContact: effectivePreferredContact,
        marketingConsent: whatsappOptIn,
        requestSiteVisit,
        message: message.trim() || undefined,
        budgetMin: budgetMin ? parseInt(budgetMin, 10) : undefined,
        budgetMax: budgetMax ? parseInt(budgetMax, 10) : undefined,
        preferredBhk,
        propertyType,
        purchaseTimeline,
        purpose,
        preferredDate: requestSiteVisit ? preferredDate : undefined,
        preferredTimeWindow: requestSiteVisit ? preferredTimeWindow : undefined,
        visitType: requestSiteVisit ? visitType : undefined,
        buyerNote: requestSiteVisit ? buyerNote.trim() || message.trim() || undefined : undefined,
      };

      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit enquiry. Please try again.');
      }

      setSubmittedName(name.trim());
      setReferenceNumber(data.referenceNumber || 'GH-ENQ-SUCCESS');
      setIsSuccess(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error occurred. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !contextData) return null;

  const isSpecsIntent = contextData.inquiryIntent === 'REQUEST_SPECS';

  const contextBadge = isSpecsIntent
    ? 'Specification & Floor Plan Request'
    : contextData.contextType === 'PROJECT'
    ? 'Project Advisory'
    : contextData.contextType === 'RESALE'
    ? 'Resale Property Advisory'
    : 'Rental Concierge Service';

  const contextBadgeColor =
    contextData.contextType === 'RENTAL'
      ? 'bg-[#218C5A]/10 text-[#218C5A] border-[#218C5A]/20'
      : 'bg-[#E85D3F]/10 text-[#E85D3F] border-[#E85D3F]/20';

  const titleDisplay = contextData.title || contextData.projectName || 'Residential Property';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="enquiry-dialog-title"
      aria-describedby="enquiry-dialog-desc"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeEnquiry();
      }}
    >
      <div
        ref={dialogRef}
        className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-[var(--color-border)] shadow-2xl overflow-hidden max-h-[92vh] sm:max-h-[88vh] flex flex-col animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[#FAFAF8] shrink-0">
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded text-[11px] font-display font-semibold uppercase tracking-wider border ${contextBadgeColor}`}>
              {contextBadge}
            </span>
            {!isSuccess && (
              <span className="text-xs font-display font-medium text-[#111111]/50">
                Step {step} of 3
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={closeEnquiry}
            aria-label="Close enquiry dialog"
            className="p-1.5 rounded-lg text-[#111111]/50 hover:text-[#111111] hover:bg-black/5 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Interior Container */}
        <div className="p-6 sm:p-8 overflow-y-auto flex-1 space-y-6">
          {!isSuccess ? (
            <>
              {/* Context Summary Box */}
              <div className="p-4 rounded-xl bg-[#FAFAF8] border border-[var(--color-border)] space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-display uppercase tracking-wider text-[#111111]/50 font-semibold block">
                      Property
                    </span>
                    <h2
                      id="enquiry-dialog-title"
                      className="text-lg font-serif font-bold text-[#111111] leading-snug line-clamp-1"
                    >
                      {titleDisplay}
                    </h2>
                    {(contextData.locationName || contextData.projectName) && (
                      <div className="flex items-center gap-1 text-xs text-[#111111]/60 font-body">
                        <MapPin className="w-3.5 h-3.5 text-[#E85D3F] shrink-0" />
                        <span className="truncate">
                          {contextData.projectName ? `${contextData.projectName} · ` : ''}
                          {contextData.locationName || 'Kolkata'}
                        </span>
                      </div>
                    )}
                  </div>

                  {contextData.priceDisplay && (
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-display uppercase tracking-wider text-[#111111]/50 block">
                        Price
                      </span>
                      <span className="text-sm sm:text-base font-display font-bold text-[#111111]">
                        {contextData.priceDisplay}
                      </span>
                    </div>
                  )}
                </div>

                <p id="enquiry-dialog-desc" className="text-xs text-[#111111]/70 font-body border-t border-[var(--color-border)]/60 pt-2 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#218C5A] shrink-0" />
                  <span>Handled directly by Great Homes residential specialists.</span>
                </p>
              </div>

              {/* Error Notice */}
              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-body animate-in fade-in duration-150">
                  {errorMessage}
                </div>
              )}

              {/* STEP 1: CONTACT INFORMATION */}
              {step === 1 && (
                <form onSubmit={handleNextStep1} className="space-y-4 text-left animate-in fade-in duration-150">
                  <div className="space-y-1">
                    <h3 className="text-sm font-display font-bold text-[#111111]">1. Contact Details</h3>
                    <p className="text-xs text-[#111111]/60 font-body">Provide your contact info so Great Homes can assist you.</p>
                  </div>

                  {/* Full Name */}
                  <div className="space-y-1.5">
                    <label htmlFor="enquiry-name" className="text-xs font-display font-semibold text-[#111111] block">
                      Full Name <span className="text-[#E85D3F]">*</span>
                    </label>
                    <input
                      ref={firstInputRef}
                      id="enquiry-name"
                      type="text"
                      required
                      placeholder="e.g. Anirban Mukherjee"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[var(--color-border)] text-sm font-body text-[#111111] placeholder:text-[#111111]/30 focus:outline-hidden focus:border-[#111111] focus:ring-1 focus:ring-[#111111]"
                    />
                  </div>

                  {/* Mobile Phone */}
                  <div className="space-y-1.5">
                    <label htmlFor="enquiry-phone" className="text-xs font-display font-semibold text-[#111111] block">
                      Mobile Phone Number <span className="text-[#E85D3F]">*</span>
                    </label>
                    <div className="flex items-center rounded-xl border border-[var(--color-border)] bg-white overflow-hidden focus-within:border-[#111111] focus-within:ring-1 focus-within:ring-[#111111]">
                      <span className="px-3 py-2.5 bg-[#FAFAF8] border-r border-[var(--color-border)] text-xs font-display font-semibold text-[#111111]/70 select-none">
                        +91
                      </span>
                      <input
                        id="enquiry-phone"
                        type="tel"
                        required
                        placeholder="98300 12345"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-transparent text-sm font-body text-[#111111] placeholder:text-[#111111]/30 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label htmlFor="enquiry-email" className="text-xs font-display font-semibold text-[#111111] flex items-center justify-between">
                      <span>Email Address</span>
                      <span className="text-[11px] font-normal text-[#111111]/40">Optional</span>
                    </label>
                    <input
                      id="enquiry-email"
                      type="email"
                      placeholder="e.g. anirban@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[var(--color-border)] text-sm font-body text-[#111111] placeholder:text-[#111111]/30 focus:outline-hidden focus:border-[#111111] focus:ring-1 focus:ring-[#111111]"
                    />
                  </div>

                  {/* Preferred Contact Method */}
                  <div className="space-y-2 pt-1">
                    <span className="text-xs font-display font-semibold text-[#111111] block">
                      Preferred Channel
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setPreferredContact('PHONE')}
                        className={`h-10 px-3 rounded-xl text-xs font-display font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                          preferredContact === 'PHONE'
                            ? 'bg-[#111111] text-white border-[#111111] shadow-xs'
                            : 'bg-white text-[#111111]/70 border-[var(--color-border)] hover:bg-[#FAFAF8]'
                        }`}
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Phone Call</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPreferredContact('WHATSAPP');
                        }}
                        className={`h-10 px-3 rounded-xl text-xs font-display font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                          preferredContact === 'WHATSAPP'
                            ? 'bg-[#218C5A] text-white border-[#218C5A] shadow-xs'
                            : 'bg-white text-[#111111]/70 border-[var(--color-border)] hover:bg-[#FAFAF8]'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPreferredContact('EMAIL')}
                        className={`h-10 px-3 rounded-xl text-xs font-display font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                          preferredContact === 'EMAIL'
                            ? 'bg-[#111111] text-white border-[#111111] shadow-xs'
                            : 'bg-white text-[#111111]/70 border-[var(--color-border)] hover:bg-[#FAFAF8]'
                        }`}
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Email</span>
                      </button>
                    </div>

                    {/* Explicit Unchecked-by-Default WhatsApp Opt-In */}
                    <label className="flex items-start gap-2.5 pt-1.5 cursor-pointer select-none">
                      <input
                        id="enquiry-whatsapp-optin"
                        type="checkbox"
                        checked={whatsappOptIn}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setWhatsappOptIn(checked);
                          if (!checked && preferredContact === 'WHATSAPP') {
                            setPreferredContact('PHONE');
                          }
                        }}
                        className="mt-0.5 w-4 h-4 rounded border-[var(--color-border)] text-[#218C5A] focus:ring-[#218C5A] cursor-pointer"
                      />
                      <span className="text-xs font-body text-[#111111]/75 leading-snug">
                        Also send property updates and specification sheets via WhatsApp (Optional)
                      </span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="w-full h-11 px-6 rounded-xl bg-[#111111] hover:bg-black text-white font-display font-semibold text-sm flex items-center justify-center gap-2 shadow-xs transition-all mt-3 cursor-pointer"
                  >
                    <span>{isSpecsIntent ? 'Next: Specification Details' : 'Next: Requirements'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* STEP 2: BUYER REQUIREMENTS */}
              {step === 2 && (
                <form onSubmit={handleNextStep2} className="space-y-4 text-left animate-in fade-in duration-150">
                  <div className="space-y-1">
                    <h3 className="text-sm font-display font-bold text-[#111111]">2. Buyer Requirements</h3>
                    <p className="text-xs text-[#111111]/60 font-body">Help us match the right options for your budget & timeline.</p>
                  </div>

                  {/* BHK & Property Type */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-display font-semibold text-[#111111] block">
                        Preferred BHK
                      </label>
                      <select
                        value={preferredBhk}
                        onChange={(e) => setPreferredBhk(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-[var(--color-border)] text-xs font-body text-[#111111]"
                      >
                        <option value="1 BHK">1 BHK</option>
                        <option value="2 BHK">2 BHK</option>
                        <option value="3 BHK">3 BHK</option>
                        <option value="4 BHK">4 BHK</option>
                        <option value="5+ BHK">5+ BHK</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-display font-semibold text-[#111111] block">
                        Property Type
                      </label>
                      <select
                        value={propertyType}
                        onChange={(e) => setPropertyType(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-[var(--color-border)] text-xs font-body text-[#111111]"
                      >
                        <option value="APARTMENT">Apartment</option>
                        <option value="FLAT">Flat</option>
                        <option value="VILLA">Villa</option>
                        <option value="INDEPENDENT_HOUSE">Independent House</option>
                        <option value="PLOT">Plot</option>
                        <option value="DUPLEX">Duplex</option>
                        <option value="PENTHOUSE">Penthouse</option>
                      </select>
                    </div>
                  </div>

                  {/* Budget Min / Max */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-display font-semibold text-[#111111] block">
                        Budget Min (₹)
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 4000000"
                        value={budgetMin}
                        onChange={(e) => setBudgetMin(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-[var(--color-border)] text-xs font-body text-[#111111]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-display font-semibold text-[#111111] block">
                        Budget Max (₹)
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 8000000"
                        value={budgetMax}
                        onChange={(e) => setBudgetMax(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-[var(--color-border)] text-xs font-body text-[#111111]"
                      />
                    </div>
                  </div>

                  {/* Purchase Timeline & Purpose */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-display font-semibold text-[#111111] block">
                        Timeline
                      </label>
                      <select
                        value={purchaseTimeline}
                        onChange={(e) => setPurchaseTimeline(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-[var(--color-border)] text-xs font-body text-[#111111]"
                      >
                        <option value="IMMEDIATE">Immediate</option>
                        <option value="WITHIN_3_MONTHS">Within 3 Months</option>
                        <option value="3_TO_6_MONTHS">3 to 6 Months</option>
                        <option value="6_TO_12_MONTHS">6 to 12 Months</option>
                        <option value="MORE_THAN_12_MONTHS">&gt; 12 Months</option>
                        <option value="NOT_DECIDED">Not Decided</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-display font-semibold text-[#111111] block">
                        Purchase Purpose
                      </label>
                      <select
                        value={purpose}
                        onChange={(e) => setPurpose(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-[var(--color-border)] text-xs font-body text-[#111111]"
                      >
                        <option value="SELF_USE">Self Use</option>
                        <option value="FAMILY_USE">Family Use</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                  </div>

                  {/* Message */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-display font-semibold text-[#111111] block">
                      Specific Notes / Queries
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Preferred floor level, direction, or specific tower..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[var(--color-border)] text-xs font-body text-[#111111] resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="py-3 px-4 rounded-xl bg-white border border-[var(--color-border)] hover:bg-[#FAFAF8] text-[#111111] font-display font-semibold text-xs flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back</span>
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-3.5 px-6 rounded-xl bg-[#111111] hover:bg-black text-white font-display font-semibold text-xs flex items-center justify-center gap-2 shadow-xs"
                    >
                      <span>Next: Site Visit Option</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 3: SITE VISIT REQUEST */}
              {step === 3 && (
                <form onSubmit={handleSubmit} className="space-y-4 text-left animate-in fade-in duration-150">
                  <div className="space-y-1">
                    <h3 className="text-sm font-display font-bold text-[#111111]">3. Assisted Site Visit</h3>
                    <p className="text-xs text-[#111111]/60 font-body">Optionally request a guided property walkthrough.</p>
                  </div>

                  {/* Toggle Site Visit */}
                  <label className="flex items-start gap-3 p-3.5 rounded-xl bg-[#FAFAF8] border border-[var(--color-border)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={requestSiteVisit}
                      onChange={(e) => setRequestSiteVisit(e.target.checked)}
                      className="mt-0.5 rounded text-[#E85D3F] focus:ring-[#E85D3F] cursor-pointer"
                    />
                    <div className="text-xs font-body text-[#111111] space-y-0.5">
                      <span className="font-display font-semibold block">Schedule an Assisted Site Visit</span>
                      <span className="text-[#111111]/60 block text-[11px]">
                        A Great Homes specialist coordinates the viewing schedule.
                      </span>
                    </div>
                  </label>

                  {requestSiteVisit && (
                    <div className="space-y-3 p-4 rounded-xl bg-[#FAFAF8] border border-[var(--color-border)] animate-in fade-in duration-150">
                      {/* Preferred Date */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-display font-semibold text-[#111111] block flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-[#E85D3F]" />
                          <span>Preferred Date (Asia/Kolkata)</span>
                        </label>
                        <input
                          type="date"
                          required={requestSiteVisit}
                          value={preferredDate}
                          min={new Date().toISOString().split('T')[0]}
                          onChange={(e) => setPreferredDate(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[var(--color-border)] text-xs font-body text-[#111111]"
                        />
                      </div>

                      {/* Preferred Time Window */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-display font-semibold text-[#111111] block flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#218C5A]" />
                          <span>Preferred Time Window</span>
                        </label>
                        <select
                          value={preferredTimeWindow}
                          onChange={(e) => setPreferredTimeWindow(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[var(--color-border)] text-xs font-body text-[#111111]"
                        >
                          <option value="09:00–12:00">Morning (09:00 AM – 12:00 PM)</option>
                          <option value="12:00–15:00">Afternoon (12:00 PM – 03:00 PM)</option>
                          <option value="15:00–18:00">Late Afternoon (03:00 PM – 06:00 PM)</option>
                          <option value="18:00–20:00">Evening (06:00 PM – 08:00 PM)</option>
                        </select>
                      </div>

                      {/* Visit Type */}
                      <div className="space-y-1.5">
                        <span className="text-xs font-display font-semibold text-[#111111] block">
                          Inspection Mode
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setVisitType('IN_PERSON')}
                            className={`py-2 px-3 rounded-xl text-xs font-display font-semibold border transition-all ${
                              visitType === 'IN_PERSON'
                                ? 'bg-[#111111] text-white border-[#111111]'
                                : 'bg-white text-[#111111]/70 border-[var(--color-border)]'
                            }`}
                          >
                            In-Person Visit
                          </button>
                          <button
                            type="button"
                            onClick={() => setVisitType('VIRTUAL')}
                            className={`py-2 px-3 rounded-xl text-xs font-display font-semibold border transition-all ${
                              visitType === 'VIRTUAL'
                                ? 'bg-[#111111] text-white border-[#111111]'
                                : 'bg-white text-[#111111]/70 border-[var(--color-border)]'
                            }`}
                          >
                            Virtual Guided Tour
                          </button>
                        </div>
                      </div>

                      {/* Buyer Note */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-display font-semibold text-[#111111] block">
                          Additional Visit Notes
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Traveling with family, need cab assistance..."
                          value={buyerNote}
                          onChange={(e) => setBuyerNote(e.target.value)}
                          className="w-full px-3.5 py-2 rounded-xl bg-white border border-[var(--color-border)] text-xs font-body text-[#111111]"
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      disabled={isSubmitting}
                      className="py-3 px-4 rounded-xl bg-white border border-[var(--color-border)] hover:bg-[#FAFAF8] text-[#111111] font-display font-semibold text-xs flex items-center gap-1"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back</span>
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 py-3.5 px-6 rounded-xl bg-[#E85D3F] hover:bg-[#D44C2F] text-white font-display font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-all disabled:opacity-60"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <>
                          <span>Submit Request</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>

                  <p className="text-[10px] text-center text-[#111111]/50 font-body flex items-center justify-center gap-1">
                    <Lock className="w-3 h-3 text-[#218C5A]" />
                    <span>Confidential assistance · Managed by Great Homes Desk</span>
                  </p>
                </form>
              )}
            </>
          ) : (
            /* CONFIRMATION SCREEN */
            <div className="py-6 sm:py-8 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-14 h-14 rounded-full bg-[#218C5A]/10 border border-[#218C5A]/20 flex items-center justify-center mx-auto text-[#218C5A]">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <span className="inline-block px-3 py-1 rounded-full bg-[#FAFAF8] border border-[var(--color-border)] text-xs font-display font-bold text-[#111111]">
                  Ref: {referenceNumber}
                </span>
                <h3 className="text-2xl font-serif font-bold text-[#111111]">
                  Request Received, {submittedName}!
                </h3>
                <p className="text-sm font-body text-[#111111]/70 max-w-sm mx-auto leading-relaxed">
                  Your enquiry for <strong className="font-semibold text-[#111111]">{titleDisplay}</strong> has been logged under Great Homes Advisory.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#FAFAF8] border border-[var(--color-border)] text-xs text-[#111111]/80 font-body max-w-sm mx-auto text-left space-y-2">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-[#E85D3F] shrink-0 mt-0.5" />
                  <span>Great Homes receives the request → validates details → assists the buyer → coordinates next steps.</span>
                </div>
                {requestSiteVisit && (
                  <div className="flex items-start gap-2 border-t border-[var(--color-border)]/60 pt-2 mt-2">
                    <Calendar className="w-4 h-4 text-[#218C5A] shrink-0 mt-0.5" />
                    <div>
                      <span className="font-display font-semibold block text-[#111111]">Site Visit Request Received</span>
                      <span className="text-[#111111]/60 block">Preferred Date: {preferredDate} ({preferredTimeWindow})</span>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={closeEnquiry}
                className="py-3 px-8 rounded-xl bg-[#111111] hover:bg-black text-white font-display font-semibold text-xs transition-colors shadow-xs"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
