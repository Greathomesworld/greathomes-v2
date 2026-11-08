'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import type { StaffRole } from '@/src/domain/auth/roles';
import { hasCapability as checkCap, type StaffCapability, type StaffSessionContext } from '@/src/domain/auth/capabilityModel';
import { clearStaffSession, buildStaffContext } from '@/src/lib/adminAuth';

interface AdminAuthContextType {
  authenticated: boolean;
  role: StaffRole;
  displayName: string;
  capabilities: StaffCapability[];
  loading: boolean;
  hasCapability: (capability: StaffCapability) => boolean;
  login: (email: string, password: string, bootstrapToken?: string, bootstrap?: boolean, resetPassword?: boolean) => Promise<boolean | 'bootstrap-complete' | 'password-reset' | { error: string }>;
  logout: () => void;
}
const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StaffSessionContext>(buildStaffContext(null));
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    async function initAuth() {
      // Visiting the sign-in route is an explicit re-authentication boundary: revoke any
      // existing session instead of silently restoring it while the user is trying to sign in.
      if (pathname === '/admin/login') {
        try { await fetch('/api/admin/auth', { method: 'DELETE', credentials: 'same-origin', cache: 'no-store' }); }
        catch { /* The API still clears client cookies where reachable. */ }
        if (!cancelled) { clearStaffSession(); setSession(buildStaffContext(null)); setLoading(false); }
        return;
      }
      try {
        const res = await fetch('/api/admin/auth', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
        // Parse safe server error details even on non-2xx responses so the setup screen can
      // distinguish a bad token, disabled bootstrap, an already-initialized account, or DB issues.
      const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (data?.authenticated && data.context?.role) setSession(buildStaffContext(data.context.role, data.context.displayName));
        else { clearStaffSession(); setSession(buildStaffContext(null)); }
      } catch {
        if (!cancelled) { clearStaffSession(); setSession(buildStaffContext(null)); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void initAuth();
    return () => { cancelled = true; };
  }, [pathname]);

  const hasCapability = (capability: StaffCapability) => session.authenticated && checkCap(session.role, capability);

  const login = async (email: string, password: string, bootstrapToken?: string, bootstrap = false, resetPassword = false): Promise<boolean | 'bootstrap-complete' | 'password-reset' | { error: string }> => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ mode: resetPassword ? 'reset' : bootstrap ? 'bootstrap' : 'login', email, password, bootstrapToken }),
      });
      const data = await res.json().catch(() => null);
      if (resetPassword && data?.success && data?.passwordReset === true && data?.authenticated === false) {
        clearStaffSession(); setSession(buildStaffContext(null));
        return 'password-reset';
      }
      if (bootstrap && data?.success && data?.accountCreated === true && data?.authenticated === false) {
        clearStaffSession(); setSession(buildStaffContext(null));
        return 'bootstrap-complete';
      }
      if (!res.ok) {
        clearStaffSession(); setSession(buildStaffContext(null));
        return { error: typeof data?.error === 'string' ? data.error : `Authentication request failed (HTTP ${res.status}).` };
      }
      if (!data?.success || !data?.authenticated || !data?.context?.role) {
        clearStaffSession(); setSession(buildStaffContext(null));
        return { error: typeof data?.error === 'string' ? data.error : 'The server did not establish a valid staff session.' };
      }
      setSession(buildStaffContext(data.context.role, data.context.displayName));
      return true;
    } catch {
      clearStaffSession(); setSession(buildStaffContext(null)); return { error: 'Could not reach the staff authentication service. Check the Preview deployment and try again.' };
    } finally { setLoading(false); }
  };

  const logout = () => {
    clearStaffSession();
    setSession(buildStaffContext(null));
    void fetch('/api/admin/auth', { method: 'DELETE', credentials: 'same-origin', cache: 'no-store' }).catch(() => undefined);
  };

  return <AdminAuthContext.Provider value={{ authenticated: session.authenticated, role: session.role, displayName: session.displayName, capabilities: session.capabilities, loading, hasCapability, login, logout }}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return context;
}