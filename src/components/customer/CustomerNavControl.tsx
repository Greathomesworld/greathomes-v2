'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { User, Bookmark, History, Sliders, LogOut, ChevronDown } from 'lucide-react';
import { useCustomerAuth } from './CustomerAuthContext';

export function CustomerNavControl() {
  const { customer, loading, openAuthModal, logout } = useCustomerAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  if (loading) {
    return (
      <div className="h-9 w-20 bg-slate-100 animate-pulse rounded-xl" />
    );
  }

  if (!customer) {
    return (
      <button
        onClick={() => openAuthModal('login')}
        className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-slate-800 hover:text-slate-950 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-xl transition-all shadow-2xs font-display shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
      >
        <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-600" />
        <span>Sign In</span>
      </button>
    );
  }

  const initials = customer.name
    ? customer.name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  const firstName = customer.name ? customer.name.split(' ')[0] : 'My Account';

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 sm:p-1.5 rounded-xl border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F] cursor-pointer"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Customer account menu"
      >
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-semibold font-display shadow-2xs">
          {initials}
        </div>
        <span className="text-xs sm:text-sm font-semibold text-slate-800 hidden sm:inline-block font-display max-w-[100px] truncate">
          {firstName}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 shadow-2xl rounded-2xl py-2 z-50 animate-fade-in"
        >
          <div className="px-4 py-2.5 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900 font-display truncate">
              {customer.name || 'Valued Customer'}
            </p>
            <p className="text-xs text-slate-500 font-body truncate mt-0.5">
              {customer.email || 'Verified Kolkata Explorer'}
            </p>
          </div>

          <div className="py-1">
            <Link
              href="/account/saved"
              onClick={() => setIsOpen(false)}
              role="menuitem"
              className="flex items-center gap-3 px-4 py-2.5 text-xs sm:text-sm text-slate-700 hover:text-[#E85D3F] hover:bg-slate-50 transition-colors font-body"
            >
              <Bookmark className="w-4 h-4 text-slate-400" />
              <span>Saved Homes & Projects</span>
            </Link>

            <Link
              href="/account/recently-viewed"
              onClick={() => setIsOpen(false)}
              role="menuitem"
              className="flex items-center gap-3 px-4 py-2.5 text-xs sm:text-sm text-slate-700 hover:text-[#E85D3F] hover:bg-slate-50 transition-colors font-body"
            >
              <History className="w-4 h-4 text-slate-400" />
              <span>Recently Viewed</span>
            </Link>

            <Link
              href="/account/preferences"
              onClick={() => setIsOpen(false)}
              role="menuitem"
              className="flex items-center gap-3 px-4 py-2.5 text-xs sm:text-sm text-slate-700 hover:text-[#E85D3F] hover:bg-slate-50 transition-colors font-body"
            >
              <Sliders className="w-4 h-4 text-slate-400" />
              <span>Search Preferences & Alerts</span>
            </Link>

            <Link
              href="/account/profile"
              onClick={() => setIsOpen(false)}
              role="menuitem"
              className="flex items-center gap-3 px-4 py-2.5 text-xs sm:text-sm text-slate-700 hover:text-[#E85D3F] hover:bg-slate-50 transition-colors font-body"
            >
              <User className="w-4 h-4 text-slate-400" />
              <span>Profile Settings</span>
            </Link>
          </div>

          <div className="border-t border-slate-100 pt-1 mt-1">
            <button
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
              role="menuitem"
              className="flex items-center gap-3 w-full px-4 py-2.5 text-xs sm:text-sm text-red-600 hover:bg-red-50 transition-colors font-body cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
