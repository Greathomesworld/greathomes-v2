'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AdminAuthProvider, useAdminAuth } from './AdminAuthProvider';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';
import { AdminLoadingState } from './AdminLoadingState';

function AdminShellContent({ children }: { children: React.ReactNode }) {
  const { loading, authenticated } = useAdminAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === '/admin/login';

  useEffect(() => {
    if (!loading && !authenticated && !isLoginPage) router.replace('/admin/login');
  }, [loading, authenticated, isLoginPage, router]);

  if (isLoginPage) return <>{children}</>;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center p-6">
        <AdminLoadingState message="Initializing Great Homes Admin Workspace..." />
      </div>
    );
  }

  if (!authenticated) {
    return <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center p-6"><AdminLoadingState message="Redirecting to secure staff sign-in..." /></div>;
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-neutral-900 flex flex-col font-body antialiased selection:bg-terracotta selection:text-white">
      <div className="flex flex-1 h-screen overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden md:block h-full">
          <AdminSidebar />
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative z-10 h-full w-64 max-w-xs bg-[#111111]">
              <AdminSidebar onCloseMobile={() => setMobileMenuOpen(false)} />
            </div>
          </div>
        )}

        {/* Main Operational Container */}
        <div className="flex-1 flex flex-col h-full overflow-hidden w-full min-w-0">
          <AdminTopbar onOpenMobileMenu={() => setMobileMenuOpen(true)} />
          <main className="flex-1 overflow-y-auto min-w-0 bg-[#FAFAF8]">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminShellContent>{children}</AdminShellContent>
    </AdminAuthProvider>
  );
}
