'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from './AdminAuthProvider';
import type { StaffRole } from '@/src/domain/auth/roles';
import { Menu, Shield, ExternalLink, LogOut, User, ChevronDown, Sparkles } from 'lucide-react';

interface AdminTopbarProps { onOpenMobileMenu?: () => void; }
export function AdminTopbar({ onOpenMobileMenu }: AdminTopbarProps) {
  const router = useRouter();
  const { role, displayName, logout } = useAdminAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const roleLabels: Record<StaffRole, string> = {
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Operations Admin',
    SALES_MANAGER: 'Sales Manager',
    SALES_EXECUTIVE: 'Sales Executive',
    TELECALLER: 'Telecaller',
    CONTENT_MANAGER: 'Content Manager',
    PROPERTY_MANAGER: 'Property Manager',
    SALES: 'Sales Specialist',
    ANALYST: 'Intelligence Analyst',
  };
  const handleLogout = () => { setShowUserMenu(false); logout(); router.replace('/admin/login'); router.refresh(); };
  return (
    <header className="h-16 bg-white border-b border-neutral-200/80 px-4 md:px-6 flex items-center justify-between shrink-0 sticky top-0 z-30 shadow-2xs">
      <div className="flex items-center gap-3"><button onClick={onOpenMobileMenu} className="md:hidden p-2 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer" aria-label="Open mobile menu"><Menu className="h-5 w-5" /></button><div className="hidden sm:flex items-center gap-2"><span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-neutral-100 text-neutral-700 font-display uppercase tracking-wider">Operational Console</span></div></div>
      <div className="flex items-center gap-2.5 sm:gap-4">
        <div className="flex items-center gap-1.5 bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1" aria-label="Authenticated staff role"><Shield className="h-3.5 w-3.5 text-neutral-500 shrink-0" /><span className="text-xs font-medium text-neutral-800 font-display">{roleLabels[role]}</span></div>
        <Link href="/" target="_blank" className="hidden lg:inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900 px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors min-h-[38px]"><span>View Consumer Site</span><ExternalLink className="h-3.5 w-3.5" /></Link>
        <div className="relative"><button type="button" onClick={() => setShowUserMenu(!showUserMenu)} aria-expanded={showUserMenu} aria-label="Open staff account menu" className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer min-h-[44px]"><div className="h-8 w-8 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-xs font-display">{displayName.slice(0, 2).toUpperCase()}</div><div className="hidden md:flex flex-col text-left"><span className="text-xs font-semibold text-neutral-900 font-display leading-tight">{displayName}</span><span className="text-[10px] text-neutral-500 font-mono">{role}</span></div><ChevronDown className="h-3.5 w-3.5 text-neutral-400 hidden sm:block" /></button>
          {showUserMenu && <div className="absolute right-0 mt-2 w-56 bg-white border border-neutral-200 rounded-xl shadow-lg py-2 z-50 animate-in fade-in zoom-in-95 duration-150"><div className="px-4 py-2 border-b border-neutral-100"><p className="text-xs font-bold text-neutral-900 font-display">{displayName}</p><p className="text-[11px] text-neutral-500">{roleLabels[role]}</p></div><div className="py-1"><Link href="/admin" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2 px-4 py-2 text-xs text-neutral-700 hover:bg-neutral-50"><User className="h-3.5 w-3.5 text-neutral-400" /><span>Admin Dashboard</span></Link><Link href="/admin/login" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2 px-4 py-2 text-xs text-neutral-700 hover:bg-neutral-50"><Sparkles className="h-3.5 w-3.5 text-neutral-400" /><span>Staff Sign In</span></Link></div><div className="border-t border-neutral-100 pt-1"><button type="button" onClick={handleLogout} className="w-full flex items-center gap-2 px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 text-left font-medium cursor-pointer min-h-[44px]"><LogOut className="h-3.5 w-3.5" /><span>Sign Out</span></button></div></div>}
        </div>
      </div>
    </header>
  );
}