'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Compass, Bookmark, User } from 'lucide-react';
import { useCustomerAuth } from '../customer/CustomerAuthContext';

export function MobileBottomNav() {
  const pathname = usePathname();
  const { customer, openAuthModal } = useCustomerAuth();

  if (pathname?.startsWith('/admin')) {
    return null;
  }

  const navItems: Array<{
    label: string;
    href: string | null;
    icon: typeof Home;
    isActive: boolean;
    onClick?: () => void;
  }> = [
    {
      label: 'Home',
      href: '/',
      icon: Home,
      isActive: pathname === '/',
    },
    {
      label: 'Explore',
      href: '/projects',
      icon: Compass,
      isActive: pathname.startsWith('/projects') || pathname.startsWith('/buy') || pathname.startsWith('/rent'),
    },
    {
      label: 'Saved',
      href: customer ? '/account/saved' : null,
      icon: Bookmark,
      isActive: pathname.startsWith('/account/saved'),
      onClick: !customer ? () => openAuthModal('login') : undefined,
    },
    {
      label: 'Account',
      href: customer ? '/account/profile' : null,
      icon: User,
      isActive: pathname.startsWith('/account') && !pathname.startsWith('/account/saved'),
      onClick: !customer ? () => openAuthModal('login') : undefined,
    },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-[calc(3.5rem+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)] bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 pt-1 flex items-center justify-around shadow-lg"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const itemClassName = `flex flex-col items-center justify-center min-w-[64px] min-h-[48px] py-1 px-2 rounded-md transition-colors ${
          item.isActive
            ? 'text-[#E85D3F] font-semibold'
            : 'text-slate-600 hover:text-slate-900'
        }`;

        if (!item.href) {
          return (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className={`${itemClassName} cursor-pointer`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] font-display">{item.label}</span>
            </button>
          );
        }

        return (
          <Link
            key={item.label}
            href={item.href}
            className={itemClassName}
          >
            <Icon className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] font-display">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
